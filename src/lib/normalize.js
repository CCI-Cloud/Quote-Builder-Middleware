/**
 * Payload normalization helpers for quote extraction.
 *
 * Upstream systems do not always send perfectly consistent data, so this file
 * reshapes inbound NetSuite payloads into a predictable structure before the
 * extraction prompt is built. It also applies safe defaults that reflect the
 * business workflow, such as avoiding automatic item or quote creation when
 * important details are missing.
 */
export function normalizeNetSuitePayload(body) {
	const rawAttachments = Array.isArray(body?.attachments)
		? body.attachments
		: [];

	return {
		request_version: body?.request_version || "2.0",

		source: {
			system: body?.source?.system || "netsuite",
			workflow: body?.source?.workflow || "quote_builder",
			case_internalid: toNumberOrNull(body?.source?.case_internalid),
			message_internalid: toNumberOrNull(body?.source?.message_internalid),
			subsidiary_internalid: toNumberOrNull(
				body?.source?.subsidiary_internalid,
			),
			profile_internalid: toNumberOrNull(body?.source?.profile_internalid),
			intake_internalid: toNumberOrNull(body?.source?.intake_internalid),
			trigger: body?.source?.trigger || "initial_extraction",
		},

		email: {
			subject: body?.email?.subject || "",
			body_text: body?.email?.body_text || "",
			sender_email: body?.email?.sender_email || null,
			sender_name: body?.email?.sender_name || null,
		},

		attachments: rawAttachments.map(normalizeAttachment),

		instructions: {
			// Default to the safest workflow unless the caller explicitly relaxes it.
			no_auto_create_items: true,
			no_auto_create_quotes: true,
			use_placeholder_for_missing_items: true,
			always_require_review_if_any_item_missing: true,
			...(body?.instructions || {}),
		},

		processing_options: {
			use_attachments: true,
			ocr_images: true,
			ocr_scanned_pdfs: true,
			parse_spreadsheets: true,
			max_attachments: 5,
			max_file_size_bytes: 10 * 1024 * 1024, // 10 MB
			...(body?.processing_options || {}),
		},

		// These are intentionally included now so downstream prep logic has
		// a stable place to write enriched context later.
		prepared_context: {
			email_subject: body?.prepared_context?.email_subject || "",
			email_body_text: body?.prepared_context?.email_body_text || "",
			attachment_text_blocks: Array.isArray(
				body?.prepared_context?.attachment_text_blocks,
			)
				? body.prepared_context.attachment_text_blocks.map((block) => ({
						attachment_id: block?.attachment_id
							? String(block.attachment_id)
							: null,
						file_name: block?.file_name || "",
						file_ext: block?.file_ext || null,
						extraction_method: block?.extraction_method || null,
						text: block?.text || "",
					}))
				: [],
			combined_text: body?.prepared_context?.combined_text || "",
		},

		attachment_processing: {
			processed_count: toNumberOrZero(
				body?.attachment_processing?.processed_count,
			),
			skipped_count: toNumberOrZero(body?.attachment_processing?.skipped_count),
			details: Array.isArray(body?.attachment_processing?.details)
				? body.attachment_processing.details.map((detail) => ({
						attachment_id: detail?.attachment_id
							? String(detail.attachment_id)
							: null,
						file_name: detail?.file_name || "",
						status: detail?.status || "unknown",
						method: detail?.method || null,
						reason: detail?.reason || null,
					}))
				: [],
		},
	};
}

function normalizeAttachment(attachment) {
	return {
		attachment_id: attachment?.attachment_id
			? String(attachment.attachment_id)
			: null,
		source_record_type: attachment?.source_record_type || null,
		source_record_id: toNumberOrNull(attachment?.source_record_id),
		file_name: attachment?.file_name || "",
		file_ext: normalizeExtension(attachment?.file_ext, attachment?.file_name),
		mime_type: attachment?.mime_type || "application/octet-stream",
		file_size_bytes: toNumberOrZero(attachment?.file_size_bytes),
		encoding: attachment?.encoding || "base64",
		content_base64: attachment?.content_base64 || "",
	};
}

function normalizeExtension(fileExt, fileName) {
	if (fileExt && String(fileExt).trim()) {
		return String(fileExt).trim().toLowerCase();
	}

	const name = String(fileName || "");
	const parts = name.split(".");
	return parts.length > 1 ? parts.pop().toLowerCase() : null;
}

function toNumberOrNull(value) {
	if (value === null || value === undefined || value === "") return null;
	const n = Number(value);
	return Number.isFinite(n) ? n : null;
}

function toNumberOrZero(value) {
	const n = Number(value);
	return Number.isFinite(n) ? n : 0;
}
