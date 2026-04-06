export async function parseCsvAttachment(attachment) {
	const text = Buffer.from(attachment.content_base64, "base64").toString(
		"utf8",
	);

	const summary = summarizeCsv(text);

	return {
		status: summary ? "processed" : "skipped",
		reason: summary ? null : "empty_csv",
		method: summary ? "csv_parse" : null,
		text: summary || "",
	};
}

function summarizeCsv(text) {
	const raw = String(text || "").trim();
	if (!raw) return "";

	const lines = raw.split(/\r?\n/).filter(Boolean);
	if (!lines.length) return "";

	const previewLines = lines.slice(0, 25);
	return previewLines.join("\n");
}
