export async function parseSpreadsheetAttachment(attachment, options = {}) {
	const buffer = Buffer.from(attachment.content_base64, "base64");

	const workbookSummary = await extractWorkbookSummary(buffer);

	return {
		status: "processed",
		reason: null,
		method: "xlsx_parse",
		text: workbookSummary,
	};
}
