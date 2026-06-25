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
import { prepareExtractionPayload } from "../lib/prepareExtractionPayload.js";
import { researchExtractedItems } from "../lib/productResearch.js";
// import { researchSingleItemSuppliers } from "../lib/supplierResearch.js";

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

//! old extract route pre timer implementation
// router.post("/extract", requireInternalToken, async (req, res) => {
// 	try {
// 		// Normalize upstream payloads so the extraction layer always sees the same shape.
// 		const payload = normalizeNetSuitePayload(req.body);

// 		if (!payload.email.subject && !payload.email.body_text) {
// 			return res.status(400).json({
// 				error: "Missing email content.",
// 			});
// 		}

// 		const preparedPayload = await prepareExtractionPayload(payload);
// 		const result = await extractQuoteRequest(preparedPayload);
// 		const researchedItems = await researchExtractedItems(result.items || []);

// 		return res.status(200).json({
// 			...result,
// 			items: researchedItems,
// 			attachment_processing: preparedPayload.attachment_processing,
// 		});
// 	} catch (error) {
// 		console.error("Quote builder extract failed:", error);

// 		return res.status(500).json({
// 			error: "Quote extraction failed",
// 			message: error?.message || "Unknown error",
// 		});
// 	}
// });

//! /extract with just timer + pm2 logs only
// router.post("/extract", requireInternalToken, async (req, res) => {
// 	const startedAt = Date.now();

// 	function mark(label, extra = {}) {
// 		console.log(
// 			JSON.stringify({
// 				event: "qb_timing",
// 				label,
// 				elapsed_ms: Date.now() - startedAt,
// 				...extra,
// 			}),
// 		);
// 	}

// 	try {
// 		mark("start");

// 		const payload = normalizeNetSuitePayload(req.body);

// 		mark("normalized", {
// 			attachment_count: Array.isArray(payload.attachments)
// 				? payload.attachments.length
// 				: 0,
// 			case_internalid: payload?.source?.case_internalid || null,
// 			message_internalid: payload?.source?.message_internalid || null,
// 		});

// 		if (!payload.email.subject && !payload.email.body_text) {
// 			return res.status(400).json({
// 				error: "Missing email content.",
// 			});
// 		}

// 		const preparedPayload = await prepareExtractionPayload(payload);

// 		mark("prepared_payload", {
// 			processed_attachments:
// 				preparedPayload?.attachment_processing?.processed_count,
// 			skipped_attachments:
// 				preparedPayload?.attachment_processing?.skipped_count,
// 			details: preparedPayload?.attachment_processing?.details || [],
// 		});

// 		const result = await extractQuoteRequest(preparedPayload);

// 		mark("extraction_complete", {
// 			is_quote: result?.quote_assessment?.is_quote_request,
// 			classification: result?.quote_assessment?.classification,
// 			item_count: Array.isArray(result?.items) ? result.items.length : 0,
// 		});

// 		const researchedItems = await researchExtractedItems(result.items || []);

// 		mark("ai_research_complete", {
// 			item_count: researchedItems.length,
// 			researched_count: researchedItems.filter((item) => item.ai_item_research)
// 				.length,
// 		});

// 		const responseBody = {
// 			...result,
// 			items: researchedItems,
// 			attachment_processing: preparedPayload.attachment_processing,
// 		};

// 		mark("response_ready", {
// 			total_ms: Date.now() - startedAt,
// 		});

// 		return res.status(200).json(responseBody);
// 	} catch (error) {
// 		console.error(
// 			JSON.stringify({
// 				event: "qb_extract_failed",
// 				elapsed_ms: Date.now() - startedAt,
// 				message: error?.message || String(error),
// 				stack: error?.stack || null,
// 			}),
// 		);

// 		return res.status(500).json({
// 			error: "Quote extraction failed",
// 			message: error?.message || "Unknown error",
// 		});
// 	}
// });

router.post("/extract", requireInternalToken, async (req, res) => {
	const startedAt = Date.now();

	function mark(label, extra = {}) {
		console.log(
			JSON.stringify({
				event: "qb_timing",
				label,
				elapsed_ms: Date.now() - startedAt,
				...extra,
			}),
		);
	}

	try {
		mark("start");

		const payload = normalizeNetSuitePayload(req.body);

		mark("normalized", {
			attachment_count: Array.isArray(payload.attachments)
				? payload.attachments.length
				: 0,
			case_internalid: payload?.source?.case_internalid || null,
			message_internalid: payload?.source?.message_internalid || null,
		});

		if (!payload.email.subject && !payload.email.body_text) {
			return res.status(400).json({
				error: "Missing email content.",
			});
		}

		const preparedPayload = await prepareExtractionPayload(payload);

		mark("prepared_payload", {
			processed_attachments:
				preparedPayload?.attachment_processing?.processed_count,
			skipped_attachments:
				preparedPayload?.attachment_processing?.skipped_count,
			details: preparedPayload?.attachment_processing?.details || [],
		});

		const result = await extractQuoteRequest(preparedPayload);

		mark("extraction_complete", {
			is_quote: result?.quote_assessment?.is_quote_request,
			classification: result?.quote_assessment?.classification,
			item_count: Array.isArray(result?.items) ? result.items.length : 0,
		});

		//!new

		const ENABLE_SYNC_AI_RESEARCH =
			String(
				process.env.QB_ENABLE_SYNC_AI_RESEARCH || "false",
			).toLowerCase() === "true";

		const MAX_SYNC_RESEARCH_ITEMS = Number(
			process.env.QB_MAX_SYNC_RESEARCH_ITEMS || 0,
		);

		let researchedItems = result.items || [];

		if (ENABLE_SYNC_AI_RESEARCH && MAX_SYNC_RESEARCH_ITEMS > 0) {
			const itemsForResearch = researchedItems.slice(
				0,
				MAX_SYNC_RESEARCH_ITEMS,
			);

			mark("ai_research_start", {
				item_count: researchedItems.length,
				sync_research_count: itemsForResearch.length,
			});

			const researchedSubset = await researchExtractedItems(itemsForResearch);

			researchedItems = researchedItems.map((item, index) => {
				if (index < researchedSubset.length) {
					return researchedSubset[index];
				}

				return {
					...item,
					ai_item_research: {
						status: "deferred",
						summary:
							"AI item research deferred to avoid NetSuite request timeout.",
						warnings: [
							"AI item research was not run during synchronous extraction.",
						],
					},
				};
			});

			mark("ai_research_complete", {
				item_count: researchedItems.length,
				researched_count: researchedItems.filter(
					(item) => item.ai_item_research,
				).length,
			});
		} else {
			researchedItems = researchedItems.map((item) => ({
				...item,
				ai_item_research: {
					status: "deferred",
					summary: "AI item research deferred to background processing.",
					warnings: [
						"AI item research was not run during synchronous extraction.",
					],
				},
			}));

			mark("ai_research_deferred", {
				item_count: researchedItems.length,
			});
		}
		//!end

		const responseBody = {
			...result,
			items: researchedItems,
			attachment_processing: preparedPayload.attachment_processing,
		};

		mark("response_ready", {
			total_ms: Date.now() - startedAt,
		});

		return res.status(200).json(responseBody);
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "qb_extract_failed",
				elapsed_ms: Date.now() - startedAt,
				message: error?.message || String(error),
				stack: error?.stack || null,
			}),
		);

		return res.status(500).json({
			error: "Quote extraction failed",
			message: error?.message || "Unknown error",
		});
	}
});

//!new Research item route
router.post("/research-items", requireInternalToken, async (req, res) => {
	const startedAt = Date.now();

	function mark(label, extra = {}) {
		console.log(
			JSON.stringify({
				event: "qb_research_timing",
				label,
				elapsed_ms: Date.now() - startedAt,
				...extra,
			}),
		);
	}

	try {
		const items = Array.isArray(req.body.items) ? req.body.items : [];

		mark("start", {
			intake_id: req.body.intake_id || null,
			item_count: items.length,
		});

		if (!items.length) {
			return res.status(400).json({
				error: "No items supplied for research.",
			});
		}

		const researchedItems = await researchExtractedItems(items);

		mark("research_complete", {
			item_count: researchedItems.length,
			total_ms: Date.now() - startedAt,
		});

		return res.status(200).json({
			intake_id: req.body.intake_id || null,
			items: researchedItems,
		});
	} catch (error) {
		console.error(
			JSON.stringify({
				event: "qb_research_failed",
				elapsed_ms: Date.now() - startedAt,
				message: error?.message || String(error),
				stack: error?.stack || null,
			}),
		);

		return res.status(500).json({
			error: "AI item research failed",
			message: error?.message || "Unknown error",
		});
	}
});

// router.post("/supplier-research", async (req, res) => {
// 	try {
// 		const token = req.headers.authorization || "";
// 		const expectedToken =
// 			process.env.QB_MIDDLEWARE_TOKEN ||
// 			process.env.QB_TOKEN ||
// 			process.env.MIDDLEWARE_TOKEN ||
// 			"KUJI329JISHNS&D&DKnedhwe_";

// 		const expected = "Bearer " + expectedToken;

// 		if (token !== expected) {
// 			console.error("Supplier research unauthorized", {
// 				received: token,
// 				expectedStartsWith: expected.substring(0, 15),
// 			});
// 			return res.status(401).json({
// 				error: "Unauthorized",
// 			});
// 		}

// 		const item = req.body?.item || null;

// 		if (!item) {
// 			return res.status(400).json({
// 				error: "Missing item payload.",
// 			});
// 		}

// 		const supplierResearch = await researchSingleItemSuppliers(item);

// 		return res.status(200).json({
// 			success: true,
// 			supplier_research: supplierResearch,
// 		});
// 	} catch (e) {
// 		console.error("Supplier research failed", e);

// 		return res.status(500).json({
// 			success: false,
// 			error: e.message || String(e),
// 		});
// 	}
// });

export default router;
