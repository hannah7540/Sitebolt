"use client";

import { fetchCompanyProfile, supabase } from "@/lib/supabase";
import {
  extractStorageObjectRef,
  formatAuditDate,
  formatAuditDateTime,
  formatAuditHours,
  formatHoursAllowancesPreview,
  formatSubmissionMethodLabel,
  hydrateTimesheetSignatureUrl,
  type TimesheetAuditReport,
  type TimesheetAuditRow,
} from "@/lib/timesheet-audit-report";

const PAGE_MARGIN = 12;
const NAVY: [number, number, number] = [30, 41, 59];
const SLATE: [number, number, number] = [51, 65, 85];
const ORANGE: [number, number, number] = [234, 88, 12];
const FOOTER_NOTE =
  "Official Fair Work Australia compliance record. Stored electronically for 7 years.";

type JsPdfInstance = import("jspdf").jsPDF;

function sanitizeFilePart(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Worker";
}

function formatFileDate(value: string): string {
  return formatAuditDate(value).replace(/\//g, "-");
}

export function buildTimesheetAuditPdfFileName(
  lastName: string,
  startDate: string,
  endDate: string
): string {
  return `Timesheet_Audit_${sanitizeFilePart(lastName)}_${formatFileDate(startDate)}_${formatFileDate(endDate)}.pdf`;
}

function lastTableY(doc: JsPdfInstance, fallback: number): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable
      ?.finalY ?? fallback
  );
}

function resolveEmbeddedImage(
  src: string
): { dataUrl: string; format: "PNG" | "JPEG" } | null {
  const trimmed = src.trim();
  if (!trimmed) return null;
  if (trimmed.startsWith("data:image/png")) return { dataUrl: trimmed, format: "PNG" };
  if (trimmed.startsWith("data:image/jpeg") || trimmed.startsWith("data:image/jpg")) {
    return { dataUrl: trimmed, format: "JPEG" };
  }
  if (trimmed.startsWith("data:image/")) return { dataUrl: trimmed, format: "PNG" };
  return null;
}

async function rasterizeImage(
  src: string
): Promise<{ dataUrl: string; format: "PNG" } | null> {
  if (typeof document === "undefined") return null;

  return new Promise((resolve) => {
    const image = new Image();
    image.crossOrigin = "anonymous";
    image.onload = () => {
      try {
        const canvas = document.createElement("canvas");
        const width = Math.max(1, image.naturalWidth || 400);
        const height = Math.max(1, image.naturalHeight || 140);
        canvas.width = width;
        canvas.height = height;
        const context = canvas.getContext("2d");
        if (!context) {
          resolve(null);
          return;
        }
        context.fillStyle = "#ffffff";
        context.fillRect(0, 0, width, height);
        context.drawImage(image, 0, 0, width, height);
        resolve({ dataUrl: canvas.toDataURL("image/png"), format: "PNG" });
      } catch {
        resolve(null);
      }
    };
    image.onerror = () => resolve(null);
    image.src = src;
  });
}

async function blobToDataUrl(blob: Blob): Promise<string> {
  return new Promise((resolve, reject) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => reject(reader.error);
    reader.readAsDataURL(blob);
  });
}

async function downloadStorageSignature(
  src: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  const ref = extractStorageObjectRef(src);
  if (!ref?.path) return null;

  const buckets = [...new Set([ref.bucket, "worker-docs", "signatures"])];
  for (const bucket of buckets) {
    try {
      const { data, error } = await supabase.storage.from(bucket).download(ref.path);
      if (error || !data) continue;
      const dataUrl = await blobToDataUrl(data);
      if (data.type.includes("svg") || dataUrl.startsWith("data:image/svg")) {
        return rasterizeImage(dataUrl);
      }
      const format: "PNG" | "JPEG" = data.type.includes("jpeg") ? "JPEG" : "PNG";
      return { dataUrl, format };
    } catch {
      /* try next bucket */
    }
  }
  return null;
}

async function loadSignatureImage(
  src: string | null
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  if (!src?.trim()) return null;
  const trimmed = src.trim();

  if (trimmed.startsWith("data:image/svg")) {
    return rasterizeImage(trimmed);
  }

  const embedded = resolveEmbeddedImage(trimmed);
  if (embedded && !trimmed.includes("svg")) return embedded;

  const fromStorage = await downloadStorageSignature(trimmed);
  if (fromStorage) return fromStorage;

  const hydrated = (await hydrateTimesheetSignatureUrl(trimmed)) ?? trimmed;
  const rasterized = await rasterizeImage(hydrated);
  if (rasterized) return rasterized;

  try {
    const response = await fetch(hydrated);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await blobToDataUrl(blob);
    if (blob.type.includes("svg") || dataUrl.startsWith("data:image/svg")) {
      return rasterizeImage(dataUrl);
    }
    const format: "PNG" | "JPEG" = blob.type.includes("jpeg") ? "JPEG" : "PNG";
    return { dataUrl, format };
  } catch {
    return null;
  }
}

export async function generateTimesheetAuditPdf(
  report: TimesheetAuditReport
): Promise<{ blob: Blob; fileName: string }> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "landscape" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const contentWidth = pageWidth - PAGE_MARGIN * 2;
  const fileName = buildTimesheetAuditPdfFileName(
    report.worker.lastName,
    report.startDate,
    report.endDate
  );

  const signatureImages = new Map<
    string,
    { dataUrl: string; format: "PNG" | "JPEG" }
  >();
  await Promise.all(
    report.rows.map(async (row) => {
      if (!row.signatureUrl || signatureImages.has(row.id)) return;
      const image = await loadSignatureImage(row.signatureUrl);
      if (image) signatureImages.set(row.id, image);
    })
  );

  let y = PAGE_MARGIN;
  const profile = await fetchCompanyProfile().catch(() => null);
  const logoUrl = profile?.logo_url?.trim() ?? "";
  if (logoUrl) {
    const logo = await loadSignatureImage(logoUrl);
    if (logo) {
      try {
        doc.addImage(logo.dataUrl, logo.format, pageWidth - PAGE_MARGIN - 42, y, 42, 16);
      } catch {
        /* logo optional */
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...ORANGE);
  doc.text("EMPLOYEE TIMESHEET SUBMISSION AUDIT REPORT", PAGE_MARGIN, y + 8);
  y += 16;

  if (profile?.company_name) {
    doc.setFont("helvetica", "normal");
    doc.setFontSize(9);
    doc.setTextColor(100, 116, 139);
    doc.text(profile.company_name, PAGE_MARGIN, y);
    y += 6;
  }

  autoTable(doc, {
    startY: y,
    theme: "grid",
    styles: {
      font: "helvetica",
      fontSize: 9,
      cellPadding: 3,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
      textColor: SLATE,
      overflow: "linebreak",
    },
    columnStyles: {
      0: {
        fontStyle: "bold",
        fillColor: [241, 245, 249],
        cellWidth: 48,
        textColor: NAVY,
      },
      1: { cellWidth: contentWidth - 48 },
    },
    body: [
      ["Employee Name", report.worker.name],
      ["Employee ID / Card Number", report.worker.employeeId || "—"],
      [
        "Selected Period",
        `${formatAuditDate(report.startDate)} to ${formatAuditDate(report.endDate)}`,
      ],
      ["Generated Date & Time", formatAuditDateTime(report.generatedAt)],
      [
        "Total Hours in Period",
        `Base ${formatAuditHours(report.totals.baseHours)}  ·  Overtime ${formatAuditHours(report.totals.overtimeHours)}  ·  Total ${formatAuditHours(report.totals.totalHours)}`,
      ],
    ],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    tableWidth: contentWidth,
  });
  y = lastTableY(doc, y) + 8;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Submission History", PAGE_MARGIN, y);
  y += 3;

  const body = report.rows.map((row) => [
    formatAuditDate(row.workDate),
    formatAuditDateTime(row.submittedAt ?? row.createdAt),
    formatSubmissionMethodLabel(row),
    row.projectName,
    row.role,
    formatHoursAllowancesPreview(row),
    row.signatureUrl ? "" : row.signatureLabel,
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [
      [
        "Shift Date",
        "Submission Date & Timestamp",
        "Submission Method",
        "Site / Project",
        "Role",
        "Hours & Allowances",
        "Signature",
      ],
    ],
    body:
      body.length > 0
        ? body
        : [["—", "—", "No submitted timesheets in this period.", "—", "—", "—", "—"]],
    styles: {
      font: "helvetica",
      fontSize: 7.5,
      cellPadding: 2,
      overflow: "linebreak",
      valign: "middle",
      textColor: SLATE,
      lineColor: [203, 213, 225],
      minCellHeight: 16,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      fontSize: 8,
      valign: "middle",
    },
    columnStyles: {
      0: { cellWidth: 24 },
      1: { cellWidth: 36 },
      2: { cellWidth: 42 },
      3: { cellWidth: 42 },
      4: { cellWidth: 28 },
      5: { cellWidth: 58 },
      6: { cellWidth: 43, halign: "center" },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN, bottom: 16 },
    tableWidth: contentWidth,
    didDrawCell: (data) => {
      if (data.section !== "body" || data.column.index !== 6) return;
      const row = report.rows[data.row.index] as TimesheetAuditRow | undefined;
      if (!row?.signatureUrl) return;
      const image = signatureImages.get(row.id);
      if (!image) {
        doc.setFont("helvetica", "normal");
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text(
          row.signatureLabel,
          data.cell.x + 2,
          data.cell.y + data.cell.height / 2,
          { baseline: "middle" }
        );
        return;
      }
      const padding = 1.5;
      const maxWidth = Math.max(4, data.cell.width - padding * 2);
      const maxHeight = Math.max(4, data.cell.height - padding * 2);
      try {
        doc.addImage(
          image.dataUrl,
          image.format,
          data.cell.x + padding,
          data.cell.y + padding,
          maxWidth,
          maxHeight,
          undefined,
          "FAST"
        );
      } catch {
        doc.setFontSize(7);
        doc.setTextColor(148, 163, 184);
        doc.text("Signature", data.cell.x + 2, data.cell.y + data.cell.height / 2, {
          baseline: "middle",
        });
      }
    },
  });

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    const pageHeight = doc.internal.pageSize.getHeight();
    doc.setDrawColor(226, 232, 240);
    doc.line(PAGE_MARGIN, pageHeight - 12, pageWidth - PAGE_MARGIN, pageHeight - 12);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(7.5);
    doc.setTextColor(100, 116, 139);
    doc.text(FOOTER_NOTE, PAGE_MARGIN, pageHeight - 7);
    doc.text(
      `Page ${page} of ${pageCount}`,
      pageWidth - PAGE_MARGIN,
      pageHeight - 7,
      { align: "right" }
    );
  }

  return { blob: doc.output("blob"), fileName };
}

export function downloadTimesheetAuditPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
