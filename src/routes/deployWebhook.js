/**
 * GitHub deployment webhook route.
 *
 * This file handles signed webhook requests from GitHub and turns a valid push
 * to the production branch into a Cloudways `git pull` action. It is responsible
 * for:
 * - validating the GitHub signature against the raw request body
 * - checking that the event, repository, and branch are the expected ones
 * - requesting a Cloudways access token
 * - triggering the Cloudways pull for the configured app
 * - recording webhook activity to a local log file for troubleshooting
 *
 * Keeping this logic in its own route makes deployment automation independent
 * from the quote-extraction workflow.
 */
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
	// GitHub signs the exact raw payload bytes, so we compare against the untouched body.
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

function getPayloadBuffer(body) {
	// Express may hand us a Buffer, string, or parsed object depending on middleware behavior.
	if (Buffer.isBuffer(body)) {
		return body;
	}

	if (typeof body === "string") {
		return Buffer.from(body, "utf8");
	}

	if (body && typeof body === "object") {
		return Buffer.from(JSON.stringify(body), "utf8");
	}

	return Buffer.from("", "utf8");
}

function parseGitHubPayload(payloadBuffer, contentType) {
	const rawText = payloadBuffer.toString("utf8");

	// Some GitHub/webhook setups still send the JSON payload inside a form field.
	if (contentType.includes("application/x-www-form-urlencoded")) {
		const params = new URLSearchParams(rawText);
		const payload = params.get("payload");

		if (!payload) {
			throw new Error("Missing payload field in form-encoded GitHub request");
		}

		return JSON.parse(payload);
	}

	return JSON.parse(rawText);
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
	// Cloudways handles the actual repository pull on the target app.
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
		const contentType = req.get("Content-Type") || "";
		const deliveryId = req.get("X-GitHub-Delivery") || null;
		const payloadBuffer = getPayloadBuffer(req.body);

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
			payload = parseGitHubPayload(payloadBuffer, contentType);
		} catch (error) {
			logEvent("warning", "Invalid GitHub payload", {
				deliveryId,
				contentType,
				error: error instanceof Error ? error.message : "Unknown error",
			});
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

		// Only after the webhook is fully validated do we call Cloudways to pull `main`.
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
