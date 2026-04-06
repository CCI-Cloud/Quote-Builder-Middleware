export async function parseImageAttachment(attachment, options = {}) {
	if (!options.ocr_images) {
		return {
			status: "skipped",
			reason: "ocr_disabled",
			method: null,
			text: "",
		};
	}

	return {
		status: "skipped",
		reason: "image_ocr_not_implemented",
		method: null,
		text: "",
	};
}
