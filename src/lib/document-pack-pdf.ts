"use client";

import type { DocumentPackData, DocumentPackSection } from "./document-pack-service";
import {
  buildDocumentPackFileName,
  formatItpItemStatus,
  formatItpPointType,
  formatItpStatusLabel,
  formatSignedWorkersCell,
  formatSwmsVersionLabel,
  formatUnsignedWorkersCell,
  resolveProjectLabel,
} from "./document-pack-service";
import {
  downloadExternalSwmsPdf,
  getExternalSwmsDocumentUrl,
} from "@/app/actions/swms-external";
import { appendItcCertificateToPdf } from "./itc-pdf";
import {
  mergeExternalPdfsIntoPack,
  stampPdfPageNumbers,
  type ExternalPdfInsertion,
} from "./pdf-merge-external-swms";
import { getSwmsDocumentUrl, resolveSwmsScope } from "./swms";
import {
  formatExternalCompanyName,
  isExternalSwms,
} from "./swms-external";

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

function writeFieldGrid(
  doc: JsPdfInstance,
  fields: Array<[string, string]>,
  y: number
): number {
  let cursorY = y;
  for (const [label, value] of fields) {
    cursorY = ensureSpace(doc, cursorY, 10);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(71, 85, 105);
    doc.text(label, PAGE_MARGIN, cursorY);
    doc.setFont("helvetica", "normal");
    doc.setTextColor(15, 23, 42);
    const lines = doc.splitTextToSize(value || "—", CONTENT_WIDTH - 62);
    doc.text(lines, PAGE_MARGIN + 62, cursorY);
    cursorY += Math.max(8, lines.length * 5 + 2);
  }
  return cursorY + 4;
}

async function embedPdfOrImage(
  doc: JsPdfInstance,
  sourceUrl: string
): Promise<void> {
  if (!sourceUrl.trim()) return;
  try {
    const response = await fetch(sourceUrl);
    if (!response.ok) return;
    const blob = await response.blob();
    const pageWidth = doc.internal.pageSize.getWidth();
    const pageHeight = doc.internal.pageSize.getHeight();
    const usableWidth = pageWidth - PAGE_MARGIN * 2;
    const usableHeight = pageHeight - PAGE_MARGIN * 2;

    if (blob.type.includes("pdf") || sourceUrl.toLowerCase().includes(".pdf")) {
      const { pdfjs } = await import("react-pdf");
      if (typeof window !== "undefined") {
        pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";
      }
      const buffer = await blob.arrayBuffer();
      const pdf = await pdfjs.getDocument({ data: buffer }).promise;
      const maxPages = Math.min(pdf.numPages, 12);
      for (let pageNumber = 1; pageNumber <= maxPages; pageNumber += 1) {
        const page = await pdf.getPage(pageNumber);
        const viewport = page.getViewport({ scale: 1.35 });
        const canvas = document.createElement("canvas");
        canvas.width = viewport.width;
        canvas.height = viewport.height;
        const context = canvas.getContext("2d");
        if (!context) continue;
        await page.render({
          canvasContext: context,
          viewport,
        } as Parameters<typeof page.render>[0]).promise;
        const image = canvas.toDataURL("image/jpeg", 0.72);
        doc.addPage();
        const ratio = Math.min(
          usableWidth / (viewport.width * 0.264583),
          usableHeight / (viewport.height * 0.264583)
        );
        const drawWidth = viewport.width * 0.264583 * ratio;
        const drawHeight = viewport.height * 0.264583 * ratio;
        doc.addImage(
          image,
          "JPEG",
          PAGE_MARGIN,
          PAGE_MARGIN,
          drawWidth,
          drawHeight
        );
      }
      return;
    }

    if (blob.type.startsWith("image/")) {
      const image = await loadImageDataUrl(sourceUrl);
      if (!image?.dataUrl) return;
      doc.addPage();
      doc.addImage(
        image.dataUrl,
        image.format,
        PAGE_MARGIN,
        PAGE_MARGIN,
        usableWidth,
        usableHeight * 0.7
      );
    }
  } catch {
    /* optional document embed */
  }
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

  if (data.itps.length === 0 && data.itcs.length === 0) {
    writeParagraph(doc, "No ITPs or ITCs found for this project and date range.", y);
    return;
  }

  const itcsByItp = new Map<string, typeof data.itcs>();
  const unlinked: typeof data.itcs = [];
  for (const itc of data.itcs) {
    if (itc.itp_id) {
      const list = itcsByItp.get(itc.itp_id) ?? [];
      list.push(itc);
      itcsByItp.set(itc.itp_id, list);
    } else {
      unlinked.push(itc);
    }
  }

  const renderItc = async (itc: (typeof data.itcs)[number]) => {
    doc.addPage();
    if (itc.detail) {
      await appendItcCertificateToPdf(doc, autoTable, itc.detail, {
        projectName: resolveProjectLabel(
          itc.project_id,
          data.projectNamesById,
          data.projectName
        ),
      });
      return;
    }

    let cursor = writeParagraph(
      doc,
      `${itc.itc_number} — ${itc.title}`,
      PAGE_MARGIN + 8,
      { bold: true, fontSize: 12 }
    );
    cursor = writeParagraph(
      doc,
      `Stage: ${itc.stage} · Status: ${itc.status} · Discipline: ${itc.service_discipline}`,
      cursor,
      { fontSize: 9 }
    );
    const entries = Object.entries(itc.form_data ?? {});
    if (entries.length === 0) {
      writeParagraph(doc, "No additional field data captured for this ITC.", cursor, {
        fontSize: 9,
      });
      return;
    }
    autoTable(doc, {
      startY: cursor,
      head: [["Field", "Value"]],
      body: entries.map(([key, value]) => [
        key.replace(/_/g, " "),
        typeof value === "boolean"
          ? value
            ? "Yes"
            : "No"
          : value == null
            ? "—"
            : String(value),
      ]),
      styles: { fontSize: 8, cellPadding: 2, overflow: "linebreak" },
      headStyles: { fillColor: [51, 65, 85], textColor: 255 },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
  };

  for (const itp of data.itps) {
    y = writeParagraph(
      doc,
      `${itp.itp_number} — ${itp.title}`,
      y,
      { bold: true, fontSize: 13 }
    );
    y = writeParagraph(
      doc,
      [
        `Project/Site: ${resolveProjectLabel(itp.project_id, data.projectNamesById, data.projectName)}`,
        `Revision ${itp.revision}`,
        `Trade: ${itp.trade_category}`,
        `Status: ${formatItpStatusLabel(itp.status)}`,
        itp.location_area ? `Location: ${itp.location_area}` : null,
        itp.subcontractor_name ? `Subcontractor: ${itp.subcontractor_name}` : null,
      ]
        .filter(Boolean)
        .join(" · "),
      y,
      { fontSize: 9 }
    );

    if ((itp.items ?? []).length > 0) {
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
        margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
      });
      y =
        (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable
          ?.finalY ?? y + 20;
      y += 8;
    }

    const linked = itcsByItp.get(itp.id) ?? [];
    if (linked.length === 0) {
      y = writeParagraph(doc, "No ITCs linked to this ITP.", y, { fontSize: 9 });
    }
    for (const itc of linked) {
      await renderItc(itc);
    }
    if (itp !== data.itps[data.itps.length - 1] || unlinked.length > 0) {
      doc.addPage();
      y = PAGE_MARGIN + 8;
    }
  }

  if (unlinked.length > 0) {
    y = writeParagraph(doc, "Unlinked ITCs", y, { bold: true, fontSize: 12 });
    for (const itc of unlinked) {
      await renderItc(itc);
    }
  }
}

function base64ToUint8Array(base64: string): Uint8Array {
  const binary = atob(base64);
  const bytes = new Uint8Array(binary.length);
  for (let index = 0; index < binary.length; index += 1) {
    bytes[index] = binary.charCodeAt(index);
  }
  return bytes;
}

async function fetchExternalSwmsPdfBytes(
  storagePath: string
): Promise<Uint8Array | null> {
  const { url } = await getExternalSwmsDocumentUrl(storagePath);
  if (url) {
    try {
      const response = await fetch(url);
      if (response.ok) {
        return new Uint8Array(await response.arrayBuffer());
      }
    } catch {
      /* fall through to admin download */
    }
  }

  const downloaded = await downloadExternalSwmsPdf(storagePath);
  if (downloaded.bytesBase64) {
    return base64ToUint8Array(downloaded.bytesBase64);
  }
  return null;
}

async function drawSwmsSection(
  doc: JsPdfInstance,
  data: DocumentPackData,
  autoTable: typeof import("jspdf-autotable").default,
  externalInsertions: ExternalPdfInsertion[]
): Promise<void> {
  doc.addPage();
  let y = writeSectionHeading(doc, "Section 2 — SWMS & Signature Log", PAGE_MARGIN + 8);

  if (data.swms.length === 0) {
    writeParagraph(doc, "No SWMS records found for this scope.", y);
    return;
  }

  for (const block of data.swmsMatrices) {
    const swms = block.swms;
    const scope =
      resolveSwmsScope(swms) === "site_specific" ? "Site Specific" : "Company";
    y = writeParagraph(doc, swms.title || "SWMS", y, { bold: true, fontSize: 13 });
    const builderName = formatExternalCompanyName(swms.external_company_name);
    y = writeParagraph(
      doc,
      [
        `Scope: ${scope}`,
        scope === "Site Specific"
          ? `Project: ${resolveProjectLabel(swms.project_id, data.projectNamesById, data.projectName)}`
          : null,
        `Version: ${formatSwmsVersionLabel(swms.version)}`,
        `Date: ${formatDisplayDate(swms.document_date || swms.created_at?.slice(0, 10) || "")}`,
        isExternalSwms(swms)
          ? `External SWMS${builderName ? ` · ${builderName}` : ""}`
          : null,
      ]
        .filter(Boolean)
        .join(" · "),
      y,
      { fontSize: 9 }
    );

    const storagePath = String(swms.storage_path ?? "").trim();
    const fileUrl = getSwmsDocumentUrl(swms);
    if (isExternalSwms(swms) && storagePath) {
      const pdfBytes = await fetchExternalSwmsPdfBytes(storagePath);
      if (pdfBytes) {
        externalInsertions.push({
          at: doc.getNumberOfPages(),
          pdfBytes,
        });
      } else {
        y = writeParagraph(
          doc,
          "Could not attach the original builder SWMS PDF from storage.",
          y,
          { fontSize: 9 }
        );
      }
    } else if (fileUrl) {
      await embedPdfOrImage(doc, fileUrl);
      y = PAGE_MARGIN + 8;
    } else {
      y = writeParagraph(doc, "No SWMS file is attached to this record.", y, {
        fontSize: 9,
      });
    }

    doc.addPage();
    y = writeSectionHeading(
      doc,
      `Signature log — ${swms.title || "SWMS"}`,
      PAGE_MARGIN + 8
    );
    y = writeParagraph(
      doc,
      `Signed: ${formatSignedWorkersCell(block.rows) || "None"}`,
      y,
      { fontSize: 9 }
    );
    y = writeParagraph(
      doc,
      `Unsigned: ${formatUnsignedWorkersCell(block.rows) || "None"}`,
      y,
      { fontSize: 9 }
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
      (doc as JsPdfInstance & { lastAutoTable?: { finalY: number } }).lastAutoTable
        ?.finalY ?? y + 20;
    y += 12;
    if (block !== data.swmsMatrices[data.swmsMatrices.length - 1]) {
      doc.addPage();
      y = PAGE_MARGIN + 8;
    }
  }
}

async function drawPlantSection(
  doc: JsPdfInstance,
  data: DocumentPackData
): Promise<void> {
  if (data.plantRecords.length === 0) {
    doc.addPage();
    const emptyY = writeSectionHeading(doc, "Section 3 — Plant", PAGE_MARGIN + 8);
    writeParagraph(doc, "No plant equipment found for this scope.", emptyY);
    return;
  }

  for (const plant of data.plantRecords) {
    doc.addPage();
    let y = writeSectionHeading(doc, "Plant record", PAGE_MARGIN + 8);
    y = writeParagraph(doc, plant.plantName || plant.unitNumber, y, {
      bold: true,
      fontSize: 16,
    });
    y = writeFieldGrid(
      doc,
      [
        ["Plant Name", plant.plantName || plant.unitNumber],
        ["Make", plant.make ?? "—"],
        ["Model", plant.model ?? "—"],
        [
          "Current Hours",
          plant.currentHours != null ? String(plant.currentHours) : "—",
        ],
        [
          "Next Service Due Hours",
          plant.nextServiceHours != null ? String(plant.nextServiceHours) : "—",
        ],
        [
          "Last Service Date",
          plant.lastServiceDate ? formatDisplayDate(plant.lastServiceDate) : "—",
        ],
        [
          "Last Maintenance Date",
          plant.lastMaintenanceDate ? formatDisplayDate(plant.lastMaintenanceDate) : "—",
        ],
        [
          "Last Pre-start Date",
          plant.lastPrestartDate ? formatDisplayDate(plant.lastPrestartDate) : "—",
        ],
        [
          "Current Project Assignment",
          plant.projectLabel || data.projectName || "—",
        ],
      ],
      y
    );

    if (plant.photoUrl) {
      const image = await loadImageDataUrl(plant.photoUrl);
      if (image?.dataUrl) {
        y = ensureSpace(doc, y, 40);
        try {
          doc.addImage(image.dataUrl, image.format, PAGE_MARGIN, y, 48, 32);
        } catch {
          /* optional */
        }
      }
    }
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
  const externalInsertions: ExternalPdfInsertion[] = [];

  await drawCoverPage(doc, data);

  if (data.sections.includes("itps")) {
    await drawItpSection(doc, data, autoTable);
  }
  if (data.sections.includes("swms")) {
    await drawSwmsSection(doc, data, autoTable, externalInsertions);
  }
  if (data.sections.includes("plant")) {
    await drawPlantSection(doc, data);
  }

  const fileName = buildDocumentPackFileName(data.projectName, data.exportTimestamp);

  if (externalInsertions.length > 0) {
    const merged = await mergeExternalPdfsIntoPack(
      doc.output("arraybuffer"),
      externalInsertions
    );
    const numbered = await stampPdfPageNumbers(merged);
    const blob = new Blob([new Uint8Array(numbered)], { type: "application/pdf" });
    return { fileName, blob };
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
