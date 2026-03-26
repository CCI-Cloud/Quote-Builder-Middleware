/**
 * JSON schema for structured quote extraction results.
 *
 * This schema is passed directly to the OpenAI Responses API so the model
 * returns a predictable, machine-friendly result. It describes the information
 * the business cares about most:
 * - whether the message is truly a quote request
 * - who the customer appears to be
 * - any special pricing or handling instructions
 * - the requested items and how confident the extraction is
 * - review flags that help a human quickly spot uncertain cases
 *
 * Keeping the schema in its own file makes it easier to evolve the extraction
 * contract without mixing it into route or transport logic.
 */
// This schema is shared directly with the OpenAI Responses API so every extraction
// comes back in a predictable shape for downstream review and automation.
export const quoteBuilderSchema = {
	name: "quote_builder_extraction",
	strict: true,
	schema: {
		type: "object",
		additionalProperties: false,
		properties: {
			request_version: { type: "string" },
			quote_assessment: {
				type: "object",
				additionalProperties: false,
				properties: {
					is_quote_request: { type: "boolean" },
					confidence: { type: "number" },
					classification: {
						type: "string",
						enum: ["quote_candidate", "needs_review", "not_quote"],
					},
					reasoning_summary: { type: "string" },
				},
				required: [
					"is_quote_request",
					"confidence",
					"classification",
					"reasoning_summary",
				],
			},
			customer_hints: {
				type: "object",
				additionalProperties: false,
				properties: {
					organization_name: { type: ["string", "null"] },
					contact_name: { type: ["string", "null"] },
					contact_email: { type: ["string", "null"] },
				},
				required: ["organization_name", "contact_name", "contact_email"],
			},
			special_instructions: {
				type: "object",
				additionalProperties: false,
				properties: {
					markup_requested: { type: "boolean" },
					tax_exempt_possible: { type: "boolean" },
					breakout_requested: { type: "boolean" },
					notes: {
						type: "array",
						items: { type: "string" },
					},
				},
				required: [
					"markup_requested",
					"tax_exempt_possible",
					"breakout_requested",
					"notes",
				],
			},
			items: {
				type: "array",
				items: {
					type: "object",
					additionalProperties: false,
					properties: {
						line_number: { type: "integer" },
						requested_text: { type: "string" },
						normalized_name: { type: ["string", "null"] },
						quantity: { type: ["number", "null"] },
						quantity_confidence: { type: ["number", "null"] },
						unit_of_measure: { type: ["string", "null"] },
						sku_or_mpn: { type: ["string", "null"] },
						brand: { type: ["string", "null"] },
						manufacturer_part_number: { type: ["string", "null"] },
						category_hint: { type: ["string", "null"] },
						product_description: { type: ["string", "null"] },
						// Search terms give downstream systems something usable even when the match is fuzzy.
						search_terms: {
							type: "array",
							items: { type: "string" },
						},
						requires_review: { type: "boolean" },
						extraction_confidence: { type: ["number", "null"] },
						review_reason: { type: ["string", "null"] },
						requested_line_no: { type: ["integer", "null"] },
					},
					required: [
						"line_number",
						"requested_text",
						"normalized_name",
						"quantity",
						"quantity_confidence",
						"unit_of_measure",
						"sku_or_mpn",
						"brand",
						"manufacturer_part_number",
						"category_hint",
						"product_description",
						"search_terms",
						"requires_review",
						"extraction_confidence",
						"review_reason",
						"requested_line_no",
					],
				},
			},
			review_flags: {
				type: "object",
				additionalProperties: false,
				properties: {
					requires_review: { type: "boolean" },
					missing_or_uncertain_items: { type: "boolean" },
					attachment_review_recommended: { type: "boolean" },
				},
				required: [
					"requires_review",
					"missing_or_uncertain_items",
					"attachment_review_recommended",
				],
			},
		},
		required: [
			"request_version",
			"quote_assessment",
			"customer_hints",
			"special_instructions",
			"items",
			"review_flags",
		],
	},
};
