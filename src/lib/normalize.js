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
	return {
		request_version: body?.request_version || "1.0",
		source: {
			system: body?.source?.system || "netsuite",
			workflow: body?.source?.workflow || "quote_builder",
			case_internalid: Number(body?.source?.case_internalid) || null,
			message_internalid: Number(body?.source?.message_internalid) || null,
			subsidiary_internalid:
				Number(body?.source?.subsidiary_internalid) || null,
			profile_internalid: Number(body?.source?.profile_internalid) || null,
		},
		email: {
			subject: body?.email?.subject || "",
			body_text: body?.email?.body_text || "",
			sender_email: body?.email?.sender_email || null,
			sender_name: body?.email?.sender_name || null,
		},
		// Preserve attachments as-is so later stages can decide whether manual review is needed.
		attachments: Array.isArray(body?.attachments) ? body.attachments : [],
		instructions: {
			// Default to the safest workflow unless the caller explicitly relaxes it.
			no_auto_create_items: true,
			no_auto_create_quotes: true,
			use_placeholder_for_missing_items: true,
			always_require_review_if_any_item_missing: true,
			...(body?.instructions || {}),
		},
	};
}
