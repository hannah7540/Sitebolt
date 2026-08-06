"use client";

import type { DocumentPackData, DocumentPackSection } from "./document-pack-service";
import {
  buildDocumentPackFileName,
  formatItpItemStatus,
  formatItpPointType,
  formatItpStatusLabel,
  formatSwmsVersionLabel,
} from "./document-pack-service";

const PAGE_MARGIN = 14;
const CONTENT_WIDTH = 182;

type JsPdfInstance = import("jspdf").jsPDF;

async function loadImageDataUrl(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  if (!url.trim()) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const format: "PNG" | "JPEG" = blob.type.includes("png") ? "PNG" : "JPEG";

    return await new Promise((resolve) => {
      const reader = new FileReader();
      reader.onload = () => {
        resolve({
          dataUrl: String(reader.result ?? ""),
          format,
        });
      };
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(blob);
    });
  } catch {
    return null;
  }
}

function formatDisplayDate(value: string): string {
  if (!value) return "—";
  const date = new Date(`${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

function formatTimestamp(value: string): string {
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

function ensureSpace(doc: JsPdfInstance, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN + 8;
  }
  return y;
}

function writeSectionHeading(doc: JsPdfInstance, title: string, y: number): number {
  let cursorY = ensureSpace(doc, y, 18);
  doc.setFillColor(255, 247, 237);
  doc.setDrawColor(251, 146, 60);
  doc.roundedRect(PAGE_MARGIN, cursorY - 6, CONTENT_WIDTH, 12, 2, 2, "FD");
  doc.setFont("helvetica", "bold");
  doc.setFontSize(12);
  doc.setTextColor(30, 41, 59);
  doc.text(title, PAGE_MARGIN + 4, cursorY + 2);
  return cursorY + 14;
}

function writeParagraph(
  doc: JsPdfInstance,
  text: string,
  y: number,
  options?: { fontSize?: number; bold?: boolean }
): number {
  doc.setFont("helvetica", options?.bold ? "bold" : "normal");
  doc.setFontSize(options?.fontSize ?? 10);
  doc.setTextColor(51, 65, 85);
  const lines = doc.splitTextToSize(text, CONTENT_WIDTH);
  let cursorY = ensureSpace(doc, y, lines.length * 5 + 4);
  doc.text(lines, PAGE_MARGIN, cursorY);
  return cursorY + lines.length * 5 + 4;
}

async function drawCoverPage(doc: JsPdfInstance, data: DocumentPackData): Promise<void> {
  const pageWidth = doc.internal.pageSize.getWidth();
  let y = 24;

  const logoUrl = data.organization?.logo_url ?? "";
  if (logoUrl) {
    const image = await loadImageDataUrl(logoUrl);
    if (image?.dataUrl) {
      try {
        doc.addImage(image.dataUrl, image.format, PAGE_MARGIN, y, 42, 18);
        y += 24;
      } catch {
        y += 4;
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(22);
  doc.setTextColor(15, 23, 42);
  doc.text("1-Click Document Pack", pageWidth / 2, y, { align: "center" });
  y += 12;

  doc.setFont("helvetica", "normal");
  doc.setFontSize(12);
  doc.setTextColor(71, 85, 105);
  doc.text(data.organization?.company_name ?? "Organisation", pageWidth / 2, y, {
    align: "center",
  });
  y += 18;

  doc.setDrawColor(226, 232, 240);
  doc.line(PAGE_MARGIN, y, pageWidth - PAGE_MARGIN, y);
  y += 12;

  const details = [
    ["Project", data.projectName],
    ["Date Range", `${formatDisplayDate(data.dateFrom)} — ${formatDisplayDate(data.dateTo)}`],
    ["Export Timestamp", formatTimestamp(data.exportTimestamp)],
    [
      "Included Sections",
      data.sections
        .map((section) => SECTION_LABELS[section])
        .join(", ") || "None",
    ],
  ];

  doc.setFontSize(11);
  for (const [label, value] of details) {
    doc.setFont("helvetica", "bold");
    doc.setTextColor(51, 65, 85);
    doc.text(`${label}:`, PAGE_MARGIN, y);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(30, 41, 59);
    const lines = doc.splitTextToSize(String(value), CONTENT_WIDTH - 42);
    doc.text(lines, PAGE_MARGIN + 42, y);
    y += Math.max(8, lines.length * 5 + 2);
  }
}

const SECTION_LABELS: Record<DocumentPackSection, string> = {
  itps: "ITPs & ITCs",
  swms: "SWMS",
  plant: "Plant Equipment",
};

async function drawItpSection(
  doc: JsPdfInstance,
  data: DocumentPackData,
  autoTable: typeof import("jspdf-autotable").default
): Promise<void> {
  doc.addPage();
  let y = writeSectionHeading(doc, "Section 1 — ITPs & ITCs", PAGE_MARGIN + 8);

  if (data.itps.length === 0) {
    y = writeParagraph(doc, "No completed or signed-off ITPs/ITCs found for this period.", y);
    return;
  }

  autoTable(doc, {
    startY: y,
    head: [["ITP #", "Title", "Revision", "Trade", "Status", "Items"]],
    body: data.itps.map((itp) => [
      itp.itp_number,
      itp.title,
      itp.revision,
      itp.trade_category,
      formatItpStatusLabel(itp.status),
      String(itp.items?.length ?? 0),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y = (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
    ? ((doc as JsPdfInstance & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10)
    : y + 20;

  for (const itp of data.itps) {
    y = ensureSpace(doc, y, 30);
    y = writeParagraph(
      doc,
      `${itp.itp_number} — ${itp.title} (Rev ${itp.revision})`,
      y,
      { bold: true, fontSize: 11 }
    );

    const meta = [
      `Trade: ${itp.trade_category}`,
      itp.subcontractor_name ? `Subcontractor: ${itp.subcontractor_name}` : null,
      itp.location_area ? `Location: ${itp.location_area}` : null,
      `Status: ${formatItpStatusLabel(itp.status)}`,
    ]
      .filter(Boolean)
      .join(" · ");
    y = writeParagraph(doc, meta, y, { fontSize: 9 });

    autoTable(doc, {
      startY: y,
      head: [["#", "Description", "Type", "Status", "Inspector", "Signed Off"]],
      body: (itp.items ?? []).map((item) => [
        String(item.item_number),
        item.description,
        formatItpPointType(item.point_type),
        formatItpItemStatus(item.status),
        item.inspector_name ?? "—",
        item.signed_off_at ? formatTimestamp(item.signed_off_at) : "—",
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      columnStyles: {
        0: { cellWidth: 10 },
        1: { cellWidth: 62 },
        2: { cellWidth: 18 },
        3: { cellWidth: 22 },
        4: { cellWidth: 28 },
        5: { cellWidth: 32 },
      },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y =
      (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      y + 20;
    y += 12;
  }
}

async function drawSwmsSection(
  doc: JsPdfInstance,
  data: DocumentPackData,
  autoTable: typeof import("jspdf-autotable").default
): Promise<void> {
  doc.addPage();
  let y = writeSectionHeading(doc, "Section 2 — Site SWMS & Worker Sign-Off", PAGE_MARGIN + 8);

  if (data.swms.length === 0) {
    y = writeParagraph(doc, "No site-specific SWMS records found for this project.", y);
    return;
  }

  autoTable(doc, {
    startY: y,
    head: [["Title", "Version", "Date", "Assigned", "Signed", "Pending"]],
    body: data.swms.map((docRow) => [
      docRow.title,
      formatSwmsVersionLabel(docRow.version),
      formatDisplayDate(
        docRow.document_date || docRow.created_at?.slice(0, 10) || ""
      ),
      String(docRow.totalAssigned),
      String(docRow.signedCount),
      String(docRow.pendingCount),
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y = (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
    ? ((doc as JsPdfInstance & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10)
    : y + 20;

  for (const block of data.swmsMatrices) {
    y = ensureSpace(doc, y, 24);
    y = writeParagraph(
      doc,
      `${block.swms.title} — Sign-Off Matrix (${formatSwmsVersionLabel(block.swms.version)})`,
      y,
      { bold: true, fontSize: 11 }
    );

    autoTable(doc, {
      startY: y,
      head: [["Worker", "Status", "Signed At"]],
      body: block.rows.map((row) => [
        row.workerName,
        row.status === "Signed"
          ? "Signed"
          : row.status === "Pending"
            ? "Not Signed"
            : row.status,
        row.signedAt ? formatTimestamp(row.signedAt) : "—",
      ]),
      styles: { fontSize: 9, cellPadding: 2.5 },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y =
      (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      y + 20;
    y += 10;
  }
}

async function drawPlantSection(
  doc: JsPdfInstance,
  data: DocumentPackData,
  autoTable: typeof import("jspdf-autotable").default
): Promise<void> {
  doc.addPage();
  let y = writeSectionHeading(doc, "Section 3 — Plant Asset Register", PAGE_MARGIN + 8);

  if (data.plantRecords.length === 0) {
    y = writeParagraph(doc, "No plant equipment assigned to this project.", y);
    return;
  }

  autoTable(doc, {
    startY: y,
    head: [
      ["Unit #", "Make / Model", "Current Hrs", "Next Service Hrs", "Last Service"],
    ],
    body: data.plantRecords.map((plant) => [
      plant.unitNumber,
      [plant.make, plant.model].filter(Boolean).join(" ") || "—",
      plant.currentHours != null ? String(plant.currentHours) : "—",
      plant.nextServiceHours != null ? String(plant.nextServiceHours) : "—",
      plant.lastServiceDate ? formatDisplayDate(plant.lastServiceDate) : "—",
    ]),
    styles: { fontSize: 9, cellPadding: 2.5 },
    headStyles: { fillColor: [249, 115, 22], textColor: 255 },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y = (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable
    ?.finalY
    ? ((doc as JsPdfInstance & { lastAutoTable: { finalY: number } }).lastAutoTable.finalY + 10)
    : y + 20;

  for (const plant of data.plantRecords) {
    y = ensureSpace(doc, y, 28);
    y = writeParagraph(
      doc,
      `Unit ${plant.unitNumber}${plant.name ? ` — ${plant.name}` : ""}`,
      y,
      { bold: true, fontSize: 11 }
    );

    if (plant.photoUrl) {
      const image = await loadImageDataUrl(plant.photoUrl);
      if (image?.dataUrl) {
        const imageY = ensureSpace(doc, y, 34);
        try {
          doc.addImage(image.dataUrl, image.format, PAGE_MARGIN, imageY, 36, 24);
          y = imageY + 28;
        } catch {
          y += 2;
        }
      }
    }

    const summary = [
      `Make / Model: ${[plant.make, plant.model].filter(Boolean).join(" ") || "—"}`,
      `Current Hours: ${plant.currentHours ?? "—"}`,
      `Hours for Next Service: ${plant.nextServiceHours ?? "—"}`,
      `Last Service Date: ${plant.lastServiceDate ? formatDisplayDate(plant.lastServiceDate) : "—"}`,
    ].join(" · ");
    y = writeParagraph(doc, summary, y, { fontSize: 9 });

    autoTable(doc, {
      startY: y,
      head: [["Date", "Maintenance / Service Record", "Source"]],
      body:
        plant.maintenanceHistory.length > 0
          ? plant.maintenanceHistory.map((entry) => [
              formatDisplayDate(entry.date),
              entry.description,
              entry.source,
            ])
          : [["—", "No maintenance history in selected date range.", "—"]],
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });

    y =
      (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
      y + 20;
    y += 10;
  }
}

export async function generateDocumentPackPdf(
  data: DocumentPackData
): Promise<{ fileName: string; blob: Blob }> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });

  await drawCoverPage(doc, data);

  if (data.sections.includes("itps")) {
    await drawItpSection(doc, data, autoTable);
  }
  if (data.sections.includes("swms")) {
    await drawSwmsSection(doc, data, autoTable);
  }
  if (data.sections.includes("plant")) {
    await drawPlantSection(doc, data, autoTable);
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `Page ${page} of ${pageCount}`,
      doc.internal.pageSize.getWidth() - PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8,
      { align: "right" }
    );
  }

  const fileName = buildDocumentPackFileName(data.projectName, data.exportTimestamp);
  const blob = doc.output("blob");
  return { fileName, blob };
}

export function downloadDocumentPackBlob(fileName: string, blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.rel = "noopener";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  URL.revokeObjectURL(url);
}

export async function generateAndDownloadDocumentPack(
  data: DocumentPackData
): Promise<{ fileName: string; blob: Blob }> {
  const result = await generateDocumentPackPdf(data);
  downloadDocumentPackBlob(result.fileName, result.blob);
  return result;
}
