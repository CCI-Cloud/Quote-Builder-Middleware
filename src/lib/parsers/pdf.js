import { PDFParse } from "pdf-parse";

export async function parsePdfAttachment(attachment, options = {}) {
	// Ensure we have valid base64 content
	const base64Data = attachment.content_base64 || "";
	const buffer = Buffer.from(base64Data, "base64");

	const text = await extractPdfText(buffer);

	if (text && text.length >= 50) {
		return {
			status: "processed",
			reason: null,
			method: "pdf_text",
			text: text,
		};
	}

	if (options.ocr_scanned_pdfs) {
		return {
			status: "skipped",
			reason: "pdf_ocr_not_implemented",
			method: null,
			text: "",
		};
	}

	return {
		status: "skipped",
		reason: "no_extractable_text",
		method: null,
		text: "",
	};
}

async function extractPdfText(buffer) {
	let parser;

	try {
		parser = new PDFParse({ data: buffer });
		const result = await parser.getText();
		return String(result?.text || "").trim();
	} catch (error) {
		console.error("PDF Parsing Error:", error);
		return "";
	} finally {
		await parser?.destroy();
	}
}
