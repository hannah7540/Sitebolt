"use client";

import Papa from "papaparse";
import {
  DOCUMENT_PACK_CSV_COLUMNS,
  type DocumentPackCsvRow,
} from "./document-pack-service";

export function buildDocumentPackCsvFileName(exportDate?: string): string {
  const dateStamp = (exportDate ?? new Date().toISOString()).slice(0, 10);
  return `Document_Pack_${dateStamp}.csv`;
}

export function downloadDocumentPackCsv(
  rows: DocumentPackCsvRow[],
  fileName: string
): void {
  const csv = Papa.unparse({
    fields: [...DOCUMENT_PACK_CSV_COLUMNS],
    data: rows.map((row) =>
      DOCUMENT_PACK_CSV_COLUMNS.map((column) => row[column] ?? "")
    ),
  });
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.style.display = "none";
  document.body.appendChild(link);
  link.click();
  link.remove();
  URL.revokeObjectURL(url);
}
