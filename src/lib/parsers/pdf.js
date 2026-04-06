import pdfParse from "pdf-parse";

export async function parsePdfAttachment(attachment, options = {}) {
	const buffer = Buffer.from(attachment.content_base64, "base64");

	const text = await extractPdfText(buffer);

	if (text && text.trim().length >= 50) {
		return {
			status: "processed",
			reason: null,
			method: "pdf_text",
			text: text.trim(),
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
	const result = await pdfParse(buffer);
	return String(result?.text || "").trim();
}
