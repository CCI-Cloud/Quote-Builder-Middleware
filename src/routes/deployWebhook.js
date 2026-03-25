import crypto from "node:crypto";
import fs from "node:fs";
import path from "node:path";
import { fileURLToPath } from "node:url";

import express from "express";

const router = express.Router();
const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

const API_URL = "https://api.cloudways.com/api/v2";
const SERVER_ID = 1156790;
const APP_ID = 6283574;
const GIT_URL = "git@github.com:CCI-Cloud/Quote-Builder-Middleware.git";
const BRANCH_NAME = "main";
const EXPECTED_REF = "refs/heads/main";
const EXPECTED_REPO = "CCI-Cloud/Quote-Builder-Middleware";
const LOG_FILE = path.resolve(__dirname, "../../deploywebhook.log");
const DEBUG_ERRORS = process.env.DEBUG_DEPLOY_WEBHOOK === "true";

function logEvent(level, message, context = {}) {
	const entry = {
		time: new Date().toISOString(),
		level,
		message,
		context,
	};

	const line = `${JSON.stringify(entry)}\n`;

	try {
		fs.appendFileSync(LOG_FILE, line, "utf8");
	} catch (error) {
		console.error("Failed to write deploy webhook log:", error);
	}

	console.log(JSON.stringify(entry));
}

function getRequiredEnv(name) {
	const value = process.env[name]?.trim();

	if (!value) {
		throw new Error(`Missing required environment variable: ${name}`);
	}

	return value;
}

function safeCompareSignature(payloadBuffer, signatureHeader, secret) {
	if (!signatureHeader?.startsWith("sha256=")) {
		return false;
	}

	const provided = signatureHeader.slice(7);
	const expected = crypto
		.createHmac("sha256", secret)
		.update(payloadBuffer)
		.digest("hex");

	const providedBuffer = Buffer.from(provided, "hex");
	const expectedBuffer = Buffer.from(expected, "hex");

	if (providedBuffer.length !== expectedBuffer.length) {
		return false;
	}

	return crypto.timingSafeEqual(expectedBuffer, providedBuffer);
}

async function callCloudwaysApi(path, accessToken, postFields) {
	const response = await fetch(`${API_URL}${path}`, {
		method: "POST",
		headers: {
			Accept: "application/json",
			...(accessToken ? { Authorization: `Bearer ${accessToken}` } : {}),
			"Content-Type": "application/x-www-form-urlencoded",
		},
		body: new URLSearchParams(postFields),
	});

	const text = await response.text();

	if (!response.ok) {
		throw new Error(
			`Cloudways API returned HTTP ${response.status}: ${text.slice(0, 2000)}`,
		);
	}

	let data;

	try {
		data = JSON.parse(text);
	} catch (error) {
		throw new Error(`Cloudways API returned invalid JSON: ${error.message}`);
	}

	return data;
}

async function fetchAccessToken() {
	const email = getRequiredEnv("CLOUDWAYS_EMAIL");
	const apiKey = getRequiredEnv("CLOUDWAYS_API_KEY");

	const tokenResponse = await callCloudwaysApi("/oauth/access_token", null, {
		email,
		api_key: apiKey,
	});

	if (!tokenResponse?.access_token) {
		throw new Error("Cloudways token missing from response");
	}

	return tokenResponse.access_token;
}

async function triggerGitPull(accessToken) {
	return callCloudwaysApi("/git/pull", accessToken, {
		server_id: String(SERVER_ID),
		app_id: String(APP_ID),
		git_url: GIT_URL,
		branch_name: BRANCH_NAME,
	});
}

router.post("/", async (req, res) => {
	try {
		const secret = getRequiredEnv("WEBHOOK_SECRET");
		const signatureHeader = req.get("X-Hub-Signature-256") || "";
		const event = req.get("X-GitHub-Event") || "";
		const deliveryId = req.get("X-GitHub-Delivery") || null;
		const payloadBuffer = Buffer.isBuffer(req.body)
			? req.body
			: Buffer.from(req.body || "");

		if (!safeCompareSignature(payloadBuffer, signatureHeader, secret)) {
			logEvent("warning", "GitHub signature verification failed", {
				deliveryId,
			});
			return res.status(403).json({ ok: false, error: "Invalid signature" });
		}

		if (event !== "push") {
			logEvent("info", "Ignoring non-push event", { event, deliveryId });
			return res
				.status(202)
				.json({ ok: true, message: "Ignored non-push event" });
		}

		let payload;

		try {
			payload = JSON.parse(payloadBuffer.toString("utf8"));
		} catch {
			return res.status(400).json({ ok: false, error: "Invalid JSON payload" });
		}

		if (payload?.repository?.full_name !== EXPECTED_REPO) {
			logEvent("warning", "Unexpected repository", {
				deliveryId,
				repository: payload?.repository?.full_name || null,
			});
			return res
				.status(403)
				.json({ ok: false, error: "Unexpected repository" });
		}

		if (payload?.ref !== EXPECTED_REF) {
			logEvent("info", "Ignoring push to non-target branch", {
				deliveryId,
				ref: payload?.ref || null,
			});
			return res.status(202).json({
				ok: true,
				message: "Ignored non-target push",
				ref: payload?.ref || null,
			});
		}

		logEvent("info", "Valid target push received", {
			deliveryId,
			commit: payload?.after || null,
			pusher: payload?.pusher?.name || null,
			ref: payload?.ref || null,
		});

		const accessToken = await fetchAccessToken();
		const cloudways = await triggerGitPull(accessToken);

		logEvent("info", "Cloudways git pull triggered successfully", {
			deliveryId,
			commit: payload?.after || null,
		});

		return res.status(200).json({
			ok: true,
			message: "Deployment triggered",
			delivery_id: deliveryId,
			commit: payload?.after || null,
			branch: BRANCH_NAME,
			cloudways,
		});
	} catch (error) {
		const errorMessage =
			error instanceof Error ? error.message : "Unknown error";
		const errorStack = error instanceof Error ? error.stack : undefined;

		logEvent("error", "Deployment failed", {
			error: errorMessage,
			stack: errorStack,
		});

		return res.status(500).json({
			ok: false,
			error: "Deployment failed",
			...(DEBUG_ERRORS ? { detail: errorMessage } : {}),
		});
	}
});

export default router;
