export async function parseCsvAttachment(attachment) {
	const text = Buffer.from(attachment.content_base64, "base64").toString(
		"utf8",
	);

	const summary = summarizeCsv(text);

	return {
		status: "processed",
		reason: null,
		method: "csv_parse",
		text: summary,
	};
}
