import { processAttachment } from "./processAttachment.js";

export async function prepareExtractionPayload(payload) {
	const attachments = Array.isArray(payload.attachments)
		? payload.attachments
		: [];
	const blocks = [];
	const details = [];

	for (const attachment of attachments) {
		const result = await processAttachment(
			attachment,
			payload.processing_options || {},
		);

		details.push({
			attachment_id: attachment.attachment_id || null,
			file_name: attachment.file_name || null,
			status: result.status,
			method: result.method || null,
			reason: result.reason || null,
		});

		if (result.status === "processed" && result.text) {
			blocks.push({
				attachment_id: attachment.attachment_id || null,
				file_name: attachment.file_name || "",
				file_ext: attachment.file_ext || "",
				extraction_method: result.method,
				text: result.text,
			});
		}
	}

	return {
		...payload,
		prepared_context: {
			email_subject: payload.email?.subject || "",
			email_body_text: payload.email?.body_text || "",
			attachment_text_blocks: blocks,
			combined_text: buildCombinedText(payload.email, blocks),
		},
		attachment_processing: {
			processed_count: details.filter((d) => d.status === "processed").length,
			skipped_count: details.filter((d) => d.status !== "processed").length,
			details,
		},
	};
}

function buildCombinedText(email, blocks) {
	const parts = [];

	if (email?.subject) parts.push(`Email Subject:\n${email.subject}`);
	if (email?.body_text) parts.push(`Email Body:\n${email.body_text}`);

	for (const block of blocks) {
		parts.push(
			`Attachment: ${block.file_name} (${block.extraction_method})\n${block.text}`,
		);
	}

	return parts.join("\n\n---\n\n");
}
