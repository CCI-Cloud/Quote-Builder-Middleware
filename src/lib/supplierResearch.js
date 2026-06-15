import OpenAI from "openai";

const PREFERRED_SUPPLIERS = [
	"Ferguson",
	"Graybar",
	"Zoro",
	"Essendant",
	"Walmart",
	"Home Depot",
];

function getClient() {
	if (!process.env.OPENAI_API_KEY) {
		throw new Error("OPENAI_API_KEY environment variable is missing.");
	}

	return new OpenAI({
		apiKey: process.env.OPENAI_API_KEY,
	});
}

export async function researchSupplierAvailability(items = []) {
	const researched = [];

	for (const item of items) {
		const supplierResearch = await researchSingleItemSuppliers(item);

		researched.push({
			...item,
			supplier_research: supplierResearch,
		});
	}

	return researched;
}

export async function researchSingleItemSuppliers(item) {
	const client = getClient();

	const searchText = [
		item?.sku_or_mpn,
		item?.normalized_name,
		item?.brand,
		item?.ai_item_research?.probable_manufacturer,
		item?.ai_item_research?.probable_model,
		item?.ai_item_research?.probable_item_type,
	]
		.filter(Boolean)
		.join(" ");

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
		input: `
Research supplier availability and pricing for this product.

Preferred suppliers:
${PREFERRED_SUPPLIERS.join(", ")}

Product search text:
${searchText}

Extracted item:
${JSON.stringify(item, null, 2)}

Rules:
- Only report supplier information found from web results.
- Do not guess prices.
- Do not invent availability.
- If no reliable match is found for a supplier, mark status as "not_found".
- Prefer exact SKU/model matches.
- Include source URLs.
`,
	});

	const researchText = researchResponse.output_text || "";

	const jsonResponse = await client.responses.create({
		model: process.env.OPENAI_MODEL || "gpt-5.4",
		input: `
Convert this supplier research into JSON only.

Product:
${JSON.stringify(item, null, 2)}

Supplier research text:
${researchText}

Return JSON only:

{
  "status": "researched",
  "preferred_suppliers_checked": [],
  "best_supplier_match": null,
  "results": [
    {
      "supplier": "",
      "status": "found",
      "product_title": "",
      "price": null,
      "availability": null,
      "url": "",
      "confidence": 0,
      "notes": ""
    }
  ],
  "warnings": []
}
`,
		text: {
			format: {
				type: "json_object",
			},
		},
	});

	return JSON.parse(jsonResponse.output_text);
}
