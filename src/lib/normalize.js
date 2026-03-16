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
		attachments: Array.isArray(body?.attachments) ? body.attachments : [],
		instructions: {
			no_auto_create_items: true,
			no_auto_create_quotes: true,
			use_placeholder_for_missing_items: true,
			always_require_review_if_any_item_missing: true,
			...(body?.instructions || {}),
		},
	};
}
