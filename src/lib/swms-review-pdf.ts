"use client";

import { fetchCompanyProfile } from "@/lib/supabase";
import type { ProjectSwmsReview, SwmsReviewItem } from "@/lib/swms-review";

const PAGE_MARGIN = 15;
const CONTENT_WIDTH = 180;
const NAVY: [number, number, number] = [30, 41, 59];
const SLATE: [number, number, number] = [51, 65, 85];
const ACCEPTED: [number, number, number] = [6, 95, 70];
const REQUIRES_UPDATE: [number, number, number] = [146, 64, 14];

type JsPdfInstance = import("jspdf").jsPDF;

export interface SwmsReviewPdfInput {
  review: ProjectSwmsReview;
  projectName: string;
  reviewingManagerName: string;
  consultedWorkerName: string;
}

function formatAuDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value.includes("T") ? value : `${value.slice(0, 10)}T12:00:00`);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Project";
}

export function buildSwmsReviewPdfFileName(projectName: string, reviewDate: string): string {
  const datePart = formatAuDate(reviewDate).replace(/\//g, "-");
  return `SWMS_Review_${sanitizeFilePart(projectName)}_${datePart}.pdf`;
}

function outcomeLabel(status: SwmsReviewItem["status"]): string {
  return status === "requires_update" ? "Requires Update" : "Reviewed and Accepted";
}

function commentText(item: SwmsReviewItem): string {
  const notes = item.notes.trim();
  if (item.status === "requires_update") return notes || "Action required";
  return notes || "None - Compliant";
}

function ensureSpace(doc: JsPdfInstance, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

function lastTableY(doc: JsPdfInstance, fallback: number): number {
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? fallback
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

async function loadRemoteImage(
  url: string
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  const embedded = resolveEmbeddedImage(url);
  if (embedded) return embedded;
  if (!url.trim()) return null;

  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const format: "PNG" | "JPEG" = blob.type.includes("png") ? "PNG" : "JPEG";
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result ?? ""));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    return dataUrl ? { dataUrl, format } : null;
  } catch {
    return null;
  }
}

export async function generateSwmsReviewPdf(input: SwmsReviewPdfInput): Promise<{
  blob: Blob;
  fileName: string;
}> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const fileName = buildSwmsReviewPdfFileName(input.projectName, input.review.review_date);
  const reviewDate = formatAuDate(input.review.review_date);

  let y = PAGE_MARGIN;
  const profile = await fetchCompanyProfile().catch(() => null);
  const logoUrl = profile?.logo_url?.trim() ?? "";
  if (logoUrl) {
    const logo = await loadRemoteImage(logoUrl);
    if (logo) {
      try {
        doc.addImage(logo.dataUrl, logo.format, pageWidth - PAGE_MARGIN - 36, y, 36, 14);
      } catch {
        /* logo optional */
      }
    }
  }

  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  const title = `SWMS Periodic Review - ${input.projectName}`;
  const titleLines = doc.splitTextToSize(title, CONTENT_WIDTH - 40);
  doc.text(titleLines, PAGE_MARGIN, y + 6);
  y += Math.max(18, titleLines.length * 7 + 8);

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
      0: { fontStyle: "bold", fillColor: [241, 245, 249], cellWidth: 42, textColor: NAVY },
      1: { cellWidth: 138 },
    },
    body: [
      ["Project", input.projectName],
      ["Date of Review", reviewDate],
      ["Reviewing Manager", input.reviewingManagerName],
      ["Consulted Worker", input.consultedWorkerName],
    ],
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    tableWidth: CONTENT_WIDTH,
  });
  y = lastTableY(doc, y) + 10;

  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  y = ensureSpace(doc, y, 10);
  doc.text("SWMS Review Register", PAGE_MARGIN, y);
  y += 4;

  const rows = input.review.items.map((item, index) => [
    String(index + 1),
    item.title || "SWMS",
    outcomeLabel(item.status),
    commentText(item),
  ]);

  autoTable(doc, {
    startY: y,
    theme: "grid",
    head: [["#", "SWMS Document / Activity Title", "Outcome / Status", "Comments / Action Required"]],
    body: rows.length > 0 ? rows : [["—", "No active SWMS were recorded.", "—", "—"]],
    styles: {
      font: "helvetica",
      fontSize: 8,
      cellPadding: 2.5,
      overflow: "linebreak",
      valign: "top",
      textColor: SLATE,
      lineColor: [203, 213, 225],
      lineWidth: 0.2,
    },
    headStyles: {
      fillColor: NAVY,
      textColor: [255, 255, 255],
      fontStyle: "bold",
      valign: "middle",
    },
    alternateRowStyles: { fillColor: [248, 250, 252] },
    columnStyles: {
      0: { cellWidth: 10, halign: "center" },
      1: { cellWidth: 68 },
      2: { cellWidth: 42 },
      3: { cellWidth: 60 },
    },
    didParseCell: (data) => {
      if (data.section !== "body" || data.column.index !== 2) return;
      const status = String(data.cell.raw ?? "");
      if (status === "Reviewed and Accepted") {
        data.cell.styles.textColor = ACCEPTED;
        data.cell.styles.fontStyle = "bold";
      } else if (status === "Requires Update") {
        data.cell.styles.textColor = REQUIRES_UPDATE;
        data.cell.styles.fontStyle = "bold";
      }
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    tableWidth: CONTENT_WIDTH,
  });
  y = lastTableY(doc, y) + 12;

  const declaration =
    "We confirm that the Safe Work Method Statements listed above have been systematically reviewed in consultation with site workers, are suitable for current site conditions, and all identified controls remain effective.";

  y = ensureSpace(doc, y, 52);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...NAVY);
  doc.text("Sign-Off & Declarations", PAGE_MARGIN, y);
  y += 6;
  doc.setFont("helvetica", "normal");
  doc.setFontSize(8);
  doc.setTextColor(...SLATE);
  const declarationLines = doc.splitTextToSize(declaration, CONTENT_WIDTH);
  doc.text(declarationLines, PAGE_MARGIN, y);
  y += declarationLines.length * 3.8 + 8;

  y = ensureSpace(doc, y, 46);
  const blockWidth = (CONTENT_WIDTH - 8) / 2;
  const blocks = [
    {
      title: "Reviewing Manager",
      name: input.reviewingManagerName,
      signature: input.review.reviewing_manager_signature,
    },
    {
      title: "Consulted Worker",
      name: input.consultedWorkerName,
      signature: input.review.consulted_worker_signature,
    },
  ] as const;

  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const x = PAGE_MARGIN + index * (blockWidth + 8);
    doc.setDrawColor(203, 213, 225);
    doc.setFillColor(255, 255, 255);
    doc.roundedRect(x, y, blockWidth, 42, 1.5, 1.5, "S");
    doc.setFont("helvetica", "bold");
    doc.setFontSize(9);
    doc.setTextColor(...NAVY);
    doc.text(block.title, x + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(...SLATE);
    doc.text(`Name: ${block.name}`, x + 3, y + 11);
    doc.text(`Date: ${reviewDate}`, x + 3, y + 16);

    const image = await loadRemoteImage(block.signature);
    if (image) {
      try {
        doc.addImage(image.dataUrl, image.format, x + 3, y + 19, blockWidth - 6, 20);
      } catch {
        doc.setTextColor(148, 163, 184);
        doc.text("Signature unavailable", x + 3, y + 32);
      }
    } else {
      doc.setDrawColor(226, 232, 240);
      doc.rect(x + 3, y + 19, blockWidth - 6, 20);
      doc.setTextColor(148, 163, 184);
      doc.text("Signature", x + 6, y + 31);
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFont("helvetica", "normal");
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${title}  ·  Page ${page} of ${pageCount}`,
      PAGE_MARGIN,
      doc.internal.pageSize.getHeight() - 8
    );
  }

  return { blob: doc.output("blob"), fileName };
}

export function downloadSwmsReviewPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
