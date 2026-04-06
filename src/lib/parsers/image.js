export async function parseImageAttachment(attachment, options = {}) {
	if (!options.ocr_images) {
		return {
			status: "skipped",
			reason: "ocr_disabled",
			method: null,
			text: "",
		};
	}

	const buffer = Buffer.from(attachment.content_base64, "base64");
	const text = await runImageOcr(buffer);

	return {
		status: "processed",
		reason: null,
		method: "image_ocr",
		text: (text || "").trim(),
	};
}
