export async function parsePdfAttachment(attachment, options = {}) {
	const buffer = Buffer.from(attachment.content_base64, "base64");

	const text = await extractPdfText(buffer); // your chosen library

	if (text && text.trim().length >= 50) {
		return {
			status: "processed",
			reason: null,
			method: "pdf_text",
			text: text.trim(),
		};
	}

	if (options.ocr_scanned_pdfs) {
		const ocrText = await runPdfOcr(buffer);
		return {
			status: "processed",
			reason: null,
			method: "pdf_ocr",
			text: (ocrText || "").trim(),
		};
	}

	return {
		status: "skipped",
		reason: "no_extractable_text",
		method: null,
		text: "",
	};
}
