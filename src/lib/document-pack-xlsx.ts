"use client";

import {
  buildDocumentPackExcelSheets,
  type DocumentPackData,
} from "./document-pack-service";

export function buildDocumentPackExcelFileName(exportDate?: string): string {
  const dateStamp = (exportDate ?? new Date().toISOString()).slice(0, 10);
  return `Document_Pack_${dateStamp}.xlsx`;
}

export async function downloadDocumentPackExcel(
  data: DocumentPackData,
  fileName: string
): Promise<void> {
  const XLSX = await import("xlsx");
  const sheets = buildDocumentPackExcelSheets(data);

  const sheetFromRows = (
    headers: string[],
    rows: Array<Record<string, string>>
  ) => {
    const table = [
      headers,
      ...rows.map((row) => headers.map((header) => row[header] ?? "")),
    ];
    const sheet = XLSX.utils.aoa_to_sheet(table);
    sheet["!cols"] = headers.map((header) => ({
      wch: Math.min(
        48,
        Math.max(
          header.length + 2,
          ...rows.map((row) => String(row[header] ?? "").length + 2)
        )
      ),
    }));
    return sheet;
  };

  const workbook = XLSX.utils.book_new();
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        "Plant Name",
        "Make",
        "Model",
        "Current Hours",
        "Next Service Due Hours",
        "Last Service Date",
        "Last Maintenance Date",
        "Last Pre-start Date",
        "Current Project Assignment",
      ],
      sheets.plant
    ),
    "Plant"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      [
        "SWMS Name",
        "Scope",
        "Project Name",
        "Signed Workers",
        "Unsigned Workers",
      ],
      sheets.swms
    ),
    "SWMS"
  );
  XLSX.utils.book_append_sheet(
    workbook,
    sheetFromRows(
      ["ITP Name", "Project/Site", "ITC Name/Identifier", "Stage"],
      sheets.itpItc
    ),
    "ITP-ITC"
  );
  XLSX.writeFile(workbook, fileName);
}
