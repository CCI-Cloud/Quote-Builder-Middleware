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
						text: JSON.stringify(payload),
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
