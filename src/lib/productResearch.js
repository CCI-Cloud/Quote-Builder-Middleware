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

		const aiItemResearch = await researchSingleItem(item);

		researched.push({
			...item,
			ai_item_research: aiItemResearch,
		});
	}

	return researched;
}

async function researchSingleItem(item) {
	const client = getClient();

	const prompt = `
You are helping a CSR identify an unknown product from a quote request.

Use the provided extracted item data.
Do not invent facts.
If the product is uncertain, say so clearly.
Return decision-support information only.
This should help a CSR create a NetSuite item manually if needed.

Extracted item:
${JSON.stringify(item, null, 2)}

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
  "notes_for_csr": []
}
`;

	const response = await client.responses.create({
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
						text: "Return valid JSON only. Use web search when the extracted item is not identifiable from the provided OCR text. Include source URLs in the sources array.",
					},
				],
			},
			{
				role: "user",
				content: [
					{
						type: "input_text",
						text: prompt,
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

	return JSON.parse(response.output_text);
}
