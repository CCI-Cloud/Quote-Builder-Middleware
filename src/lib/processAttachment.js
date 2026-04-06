import { parsePdfAttachment } from "./parsers/pdf.js";
import { parseSpreadsheetAttachment } from "./parsers/spreadsheet.js";
import { parseCsvAttachment } from "./parsers/csv.js";
import { parseImageAttachment } from "./parsers/image.js";

export async function processAttachment(attachment, options = {}) {
	try {
		if (!attachment?.content_base64) {
			return {
				status: "skipped",
				reason: "missing_content",
				method: null,
				text: "",
			};
		}

		const ext = String(attachment.file_ext || "").toLowerCase();
		const mime = String(attachment.mime_type || "").toLowerCase();

		if (["pdf"].includes(ext) || mime === "application/pdf") {
			return await parsePdfAttachment(attachment, options);
		}

		if (["xlsx", "xls"].includes(ext)) {
			return await parseSpreadsheetAttachment(attachment, options);
		}

		if (["csv"].includes(ext) || mime === "text/csv") {
			return await parseCsvAttachment(attachment, options);
		}

		if (["png", "jpg", "jpeg"].includes(ext) || mime.startsWith("image/")) {
			return await parseImageAttachment(attachment, options);
		}

		return {
			status: "skipped",
			reason: "unsupported_type",
			method: null,
			text: "",
		};
	} catch (error) {
		return {
			status: "error",
			reason: error?.message || "attachment_processing_failed",
			method: null,
			text: "",
		};
	}
}
