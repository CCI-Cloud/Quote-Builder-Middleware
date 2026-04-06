import { createWorker } from "tesseract.js";

export async function parseImageAttachment(attachment, options = {}) {
	if (!options.ocr_images) {
		return {
			status: "skipped",
			reason: "ocr_disabled",
			method: null,
			text: "",
		};
	}

	try {
		const base64Data = attachment?.content_base64 || "";
		if (!base64Data) {
			return {
				status: "skipped",
				reason: "missing_content",
				method: null,
				text: "",
			};
		}

		const buffer = Buffer.from(base64Data, "base64");
		if (!buffer.length) {
			return {
				status: "skipped",
				reason: "empty_image_buffer",
				method: null,
				text: "",
			};
		}

		const text = await runImageOcr(buffer);

		if (!text) {
			return {
				status: "skipped",
				reason: "no_ocr_text_found",
				method: null,
				text: "",
			};
		}

		return {
			status: "processed",
			reason: null,
			method: "image_ocr",
			text,
		};
	} catch (error) {
		return {
			status: "error",
			reason: error?.message || "image_ocr_failed",
			method: null,
			text: "",
		};
	}
}

async function runImageOcr(buffer) {
	const worker = await createWorker("eng");

	try {
		const result = await worker.recognize(buffer);
		return String(result?.data?.text || "").trim();
	} finally {
		await worker.terminate();
	}
}
