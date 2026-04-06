/**
 * OpenAI integration for quote request extraction.
 *
 * This file builds the OpenAI client, defines the high-level extraction rules,
 * and sends normalized quote request payloads to the Responses API. The model
 * is asked to return data that matches the shared JSON schema so the rest of
 * the application can rely on a consistent output shape.
 */
import OpenAI from "openai";
import { quoteBuilderSchema } from "./schema.js";

function getClient() {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error("OPENAI_API_KEY environment variable is missing.");
	}

	return new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});
}

function buildDeveloperInstruction() {
	// Keep the extraction prompt compact and rule-driven so the schema can do the heavy lifting.
	return [
		"You extract quote requests from NetSuite support case emails.",
		"Return only schema-compliant JSON.",
		"Do not invent products or product facts.",
		"If a requested item is uncertain, preserve the original requested text and set requires_review to true.",
		"If the email appears to request pricing, a quote, estimate, sourcing, or product acquisition, classify accordingly.",
		"Do not auto-create items or quotes.",
		"Assume missing or uncertain items require review.",
	].join(" ");
}

function buildExtractionInput(payload) {
	const email = payload?.email || {};
	const ctx = payload?.prepared_context || {};

	const subject = ctx.email_subject || email.subject || "";
	const body = ctx.email_body_text || email.body_text || "";

	const attachmentBlocks = Array.isArray(ctx.attachment_text_blocks)
		? ctx.attachment_text_blocks
		: [];

	const parts = [];

	// -------------------------
	// Email content
	// -------------------------
	if (subject) {
		parts.push(`EMAIL SUBJECT:\n${subject}`);
	}

	if (body) {
		parts.push(`EMAIL BODY:\n${body}`);
	}

	// -------------------------
	// Attachments
	// -------------------------
	if (attachmentBlocks.length) {
		parts.push(`ATTACHMENTS:`);

		for (const block of attachmentBlocks) {
			parts.push(
				`---\nFILE: ${block.file_name || "unknown"}\nTYPE: ${
					block.extraction_method || "unknown"
				}\n\n${block.text || ""}`,
			);
		}
	}

	// -------------------------
	// Instructions to model
	// -------------------------
	parts.push(`
INSTRUCTIONS:

- The email and attachments together represent a potential quote request.
- Attachments may contain more accurate or complete line item details than the email body.
- Prefer attachment data when it is more specific than the email.
- Do NOT duplicate items found in both email and attachments.
- Merge overlapping information into a single clean item.
- Preserve original wording when uncertain.
- Do NOT invent SKUs, quantities, or product details.
- If uncertain, mark requires_review = true.
- If attachments contain tabular data, interpret rows as potential line items.
`);

	// -------------------------
	// Optional debug context
	// -------------------------
	parts.push(`
DEBUG_CONTEXT (do not rely on this for extraction, informational only):
${JSON.stringify(
	{
		attachment_count: attachmentBlocks.length,
		request_version: payload.request_version,
	},
	null,
	2,
)}
`);

	return parts.join("\n\n");
}

export async function extractQuoteRequest(payload) {
	const client = getClient();
	const response = await client.responses.create({
		model: process.env.OPENAI_MODEL || "gpt-5.4",
		input: [
			{
				role: "developer",
				content: [
					{
						type: "input_text",
						text: buildDeveloperInstruction(),
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: buildExtractionInput(payload),
					},
				],
			},
		],
		text: {
			format: {
				// Structured outputs keep the downstream route from having to guess at model shape.
				type: "json_schema",
				...quoteBuilderSchema,
			},
		},
	});

	const text = response.output_text;
	return JSON.parse(text);
}
