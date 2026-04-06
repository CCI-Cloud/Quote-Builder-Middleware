import XLSX from "xlsx";

export async function parseSpreadsheetAttachment(attachment, options = {}) {
	const buffer = Buffer.from(attachment.content_base64, "base64");
	const workbookSummary = extractWorkbookSummary(buffer);

	return {
		status: workbookSummary ? "processed" : "skipped",
		reason: workbookSummary ? null : "empty_spreadsheet",
		method: workbookSummary ? "xlsx_parse" : null,
		text: workbookSummary || "",
	};
}

function extractWorkbookSummary(buffer) {
	const workbook = XLSX.read(buffer, { type: "buffer" });
	const maxSheets = 3;
	const maxRowsPerSheet = 25;
	const parts = [];

	for (const sheetName of workbook.SheetNames.slice(0, maxSheets)) {
		const sheet = workbook.Sheets[sheetName];
		const rows = XLSX.utils.sheet_to_json(sheet, {
			header: 1,
			defval: "",
			raw: false,
		});

		if (!rows.length) continue;

		parts.push(`Sheet: ${sheetName}`);

		for (const row of rows.slice(0, maxRowsPerSheet)) {
			const cleaned = row.map((cell) => String(cell || "").trim());
			if (cleaned.some(Boolean)) {
				parts.push(cleaned.join(" | "));
			}
		}

		parts.push("");
	}

	return parts.join("\n").trim();
}
