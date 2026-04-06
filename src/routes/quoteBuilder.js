/**
 * Route handler for quote extraction requests.
 *
 * This file exposes the middleware endpoint that trusted internal systems call
 * when they want an inbound NetSuite email or case payload analyzed. The route:
 * - checks the internal bearer token
 * - normalizes the incoming request into a stable application shape
 * - sends the cleaned payload to the OpenAI extraction layer
 * - returns structured JSON for downstream review or automation
 *
 * The goal is to keep HTTP concerns here and leave model-specific logic in the
 * library layer.
 */
import express from "express";
import { extractQuoteRequest } from "../lib/openaiClient.js";
import { normalizeNetSuitePayload } from "../lib/normalize.js";

const router = express.Router();

function requireInternalToken(req, res, next) {
	// This endpoint is intended for trusted internal callers only.
	const auth = req.headers.authorization || "";
	const expected = `Bearer ${process.env.INTERNAL_API_TOKEN}`;

	if (!process.env.INTERNAL_API_TOKEN) {
		return res
			.status(500)
			.json({ error: "Middleware is missing INTERNAL_API_TOKEN." });
	}

	if (auth !== expected) {
		return res.status(401).json({ error: "Unauthorized" });
	}

	next();
}

router.post("/extract", requireInternalToken, async (req, res) => {
	try {
		// Normalize upstream payloads so the extraction layer always sees the same shape.
		const payload = normalizeNetSuitePayload(req.body);

		if (!payload.email.subject && !payload.email.body_text) {
			return res.status(400).json({
				error: "Missing email content.",
			});
		}

		const preparedPayload = await prepareExtractionPayload(payload);
		const result = await extractQuoteRequest(preparedPayload);
		return res.status(200).json(result);
	} catch (error) {
		console.error("Quote builder extract failed:", error);

		return res.status(500).json({
			error: "Quote extraction failed",
			message: error?.message || "Unknown error",
		});
	}
});

export default router;
