"use client";

import type { ItcDetailBundle } from "./itc-service";
import {
  DEFAULT_ITC_FORM_STEPS,
  formatConduitConfig,
  ITC_PHOTO_SLOTS,
  ITC_STATUS_LABELS,
} from "./itc-templates";

const PAGE_MARGIN = 14;
const CONTENT_WIDTH = 182;

type JsPdfInstance = import("jspdf").jsPDF;

function ensureSpace(doc: JsPdfInstance, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN + 8;
  }
  return y;
}

function formatTimestamp(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export async function generateItcCertificatePdf(
  bundle: ItcDetailBundle,
  projectName: string
): Promise<Blob> {
  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { itc, photos, signoffs } = bundle;

  let y = PAGE_MARGIN + 4;
  doc.setFontSize(16);
  doc.setTextColor(234, 88, 12);
  doc.text("Inspection Test Certificate", PAGE_MARGIN, y);
  y += 8;
  doc.setFontSize(10);
  doc.setTextColor(30, 41, 59);
  doc.text(`Project: ${projectName}`, PAGE_MARGIN, y);
  y += 5;
  doc.text(`ITC Number: ${itc.itc_number}`, PAGE_MARGIN, y);
  y += 5;
  doc.text(`Zone: ${itc.zone_code ?? "—"}  |  Building: ${itc.building ?? "—"}`, PAGE_MARGIN, y);
  y += 5;
  doc.text(`Discipline: ${itc.service_discipline}`, PAGE_MARGIN, y);
  y += 5;
  doc.text(
    `Run: ${itc.start_location ?? "—"} → ${itc.end_location ?? "—"}  |  Length: ${itc.length_m ?? "—"} m`,
    PAGE_MARGIN,
    y
  );
  y += 5;
  doc.text(`Conduits: ${formatConduitConfig(itc.conduits)}`, PAGE_MARGIN, y);
  y += 5;
  doc.text(
    `Status: ${ITC_STATUS_LABELS[itc.status]}  |  Progress: ${itc.progress_percent}%`,
    PAGE_MARGIN,
    y
  );
  y += 8;

  autoTable(doc, {
    startY: y,
    head: [["Step", "Requirement", "Status", "Signed By", "Submitted"]],
    body: DEFAULT_ITC_FORM_STEPS.map((step) => {
      const signoff = signoffs.find(
        (row) => row.step_index === step.step_index && row.status === "submitted"
      );
      return [
        String(step.step_index + 1),
        step.title,
        signoff ? "Complete" : "Pending",
        signoff?.author_name ?? "—",
        formatTimestamp(signoff?.submitted_at),
      ];
    }),
    styles: { fontSize: 8, cellPadding: 2 },
    headStyles: { fillColor: [251, 146, 60] },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y = ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ??
    y + 40) + 10;

  y = ensureSpace(doc, y, 20);
  doc.setFontSize(12);
  doc.setTextColor(234, 88, 12);
  doc.text("Summary Signatures", PAGE_MARGIN, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);
  for (const signoff of signoffs.filter((row) => row.status === "submitted").slice(0, 6)) {
    y = ensureSpace(doc, y, 8);
    doc.text(
      `${signoff.author_name} — Step ${signoff.step_index + 1} — ${formatTimestamp(signoff.submitted_at)}`,
      PAGE_MARGIN,
      y
    );
    y += 5;
  }

  doc.addPage();
  y = PAGE_MARGIN + 4;
  doc.setFontSize(14);
  doc.setTextColor(234, 88, 12);
  doc.text("Detailed Evidence (Option B)", PAGE_MARGIN, y);
  y += 8;

  for (const step of DEFAULT_ITC_FORM_STEPS) {
    const signoff = signoffs.find((row) => row.step_index === step.step_index);
    y = ensureSpace(doc, y, 24);
    doc.setFontSize(11);
    doc.setTextColor(30, 41, 59);
    doc.text(`${step.step_index + 1}. ${step.title}`, PAGE_MARGIN, y);
    y += 5;
    doc.setFontSize(9);
    doc.text(`Comments: ${signoff?.comments?.trim() || "—"}`, PAGE_MARGIN, y);
    y += 4;
    doc.text(`Status: ${signoff?.status ?? "pending"}`, PAGE_MARGIN, y);
    y += 4;
    if (signoff?.field_data && Object.keys(signoff.field_data).length > 0) {
      doc.text(`Fields: ${JSON.stringify(signoff.field_data)}`, PAGE_MARGIN, y);
      y += 4;
    }
    if (signoff?.verified_by_name) {
      doc.text(
        `Verified by ${signoff.verified_by_name} at ${formatTimestamp(signoff.verified_at)}`,
        PAGE_MARGIN,
        y
      );
      y += 4;
    }
    y += 3;
  }

  y = ensureSpace(doc, y, 16);
  doc.setFontSize(12);
  doc.setTextColor(234, 88, 12);
  doc.text("Photo Record", PAGE_MARGIN, y);
  y += 6;
  doc.setFontSize(9);
  doc.setTextColor(30, 41, 59);

  for (const slot of ITC_PHOTO_SLOTS) {
    const photo = photos.find((row) => row.slot_key === slot.key);
    y = ensureSpace(doc, y, 8);
    const caption = photo?.not_required
      ? `N/A — ${photo.not_required_reason ?? "Not required"}`
      : photo?.photo_url
        ? "Captured"
        : "Missing";
    const meta = photo
      ? `GPS ${photo.gps_lat ?? "—"}, ${photo.gps_lng ?? "—"} | ${formatTimestamp(photo.captured_at)}`
      : "—";
    doc.text(`${slot.label}: ${caption}`, PAGE_MARGIN, y);
    y += 4;
    doc.text(meta, PAGE_MARGIN + 4, y);
    y += 5;
  }

  return doc.output("blob");
}

export function downloadItcPdf(blob: Blob, fileName: string): void {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = fileName;
  anchor.click();
  URL.revokeObjectURL(url);
}
