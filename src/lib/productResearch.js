import OpenAI from "openai";

function getClient() {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error("OPENAI_API_KEY environment variable is missing.");
	}

	return new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});
}

export async function researchExtractedItems(items = []) {
	const researched = [];

	for (const item of items) {
		const shouldResearch =
			item?.requires_review ||
			!item?.normalized_name ||
			!item?.brand ||
			(item?.extraction_confidence !== null &&
				Number(item.extraction_confidence) < 0.7);

		if (!shouldResearch) {
			researched.push({
				...item,
				ai_item_research: null,
			});
			continue;
		}

		console.log(
			JSON.stringify({
				event: "qb_item_research_timing",
				label: "item_start",
				index,
				normalized_name: item.normalized_name || null,
				sku_or_mpn: item.sku_or_mpn || null,
			}),
		);

		const aiItemResearch = await researchSingleItem(item);

		console.log(
			JSON.stringify({
				event: "qb_item_research_timing",
				label: "item_complete",
				index,
				elapsed_ms: Date.now() - itemStartedAt,
			}),
		);

		researched.push({
			...item,
			ai_item_research: aiItemResearch,
		});
	}

	return researched;
}

async function researchSingleItem(item) {
	const client = getClient();

	// CALL 1: Web research only, no JSON mode
	const researchResponse = await client.responses.create({
		model:
			process.env.OPENAI_RESEARCH_MODEL ||
			process.env.OPENAI_MODEL ||
			"gpt-5.4",
		tools: [
			{
				type: "web_search",
				search_context_size: "medium",
			},
		],
		input: [
			{
				role: "developer",
				content: [
					{
						type: "input_text",
						text: "You research products for CSR quote review. Use web search when useful. Be careful with OCR uncertainty. Do not invent facts.",
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: `
Research this extracted quote item.

Extracted item:
${JSON.stringify(item, null, 2)}

Find:
- probable manufacturer
- probable brand
- probable model
- probable item type
- product category
- useful CSR description
- possible source URLs
- warnings about uncertainty

Return a concise research summary with source URLs if found.
`,
					},
				],
			},
		],
	});

	const researchText = researchResponse.output_text || "";

	// CALL 2: Convert research text into JSON, no web search
	const jsonResponse = await client.responses.create({
		model: process.env.OPENAI_MODEL || "gpt-5.4",
		input: [
			{
				role: "developer",
				content: [
					{
						type: "input_text",
						text: "Return valid JSON only. Convert product research into the requested JSON shape.",
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: `
Convert this product research into JSON.

Extracted item:
${JSON.stringify(item, null, 2)}

Research summary:
${researchText}

Return JSON only:

{
  "status": "researched",
  "probable_manufacturer": null,
  "probable_brand": null,
  "probable_model": null,
  "probable_item_type": null,
  "category": null,
  "suggested_display_name": null,
  "suggested_vendor_name": null,
  "suggested_mpn": null,
  "suggested_description": null,
  "suggested_search_terms": [],
  "confidence": 0,
  "warnings": [],
  "notes_for_csr": [],
  "sources": [
    {
      "title": "",
      "url": "",
      "summary": ""
    }
  ]
}
`,
					},
				],
			},
		],
		text: {
			format: {
				type: "json_object",
			},
		},
	});

	return JSON.parse(jsonResponse.output_text);
}
