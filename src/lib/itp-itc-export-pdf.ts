"use client";

import { fetchCompanyProfile } from "@/lib/supabase";
import type { AdminChecklistItem, AdminItcRecord, AdminItpRecord } from "@/components/itc/admin/itp-itc-admin-api";
import type { ProjectItp } from "@/lib/itp-service";
import type { WorkerItcChecklistEntryRow } from "@/lib/worker-itc-admin-mutations";

const PAGE_MARGIN = 14;
const CONTENT_WIDTH = 182;
const NAVY: [number, number, number] = [30, 41, 59];
const ACCENT: [number, number, number] = [234, 88, 12];
const SLATE: [number, number, number] = [71, 85, 105];

type JsPdfInstance = import("jspdf").jsPDF;

export interface ItpItcExportSignature {
  role: string;
  name: string;
  date?: string | null;
  url?: string | null;
}

export interface ItpItcExportInput {
  documentTitle: string;
  referenceNumber: string;
  projectName: string;
  status: string;
  date?: string | null;
  subtitle?: string | null;
  meta: Array<[string, string]>;
  checklist: Array<{ item: string; result: string; notes: string }>;
  photoUrls: string[];
  planUrl?: string | null;
  pinX?: number | null;
  pinY?: number | null;
  signatures: ItpItcExportSignature[];
  fileName: string;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString("en-AU");
}

function sanitizeFilePart(value: string): string {
  return value.replace(/[^\w]+/g, "_").replace(/^_+|_+$/g, "") || "Export";
}

function ensureSpace(doc: JsPdfInstance, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN;
  }
  return y;
}

async function loadImage(
  url: string | null | undefined
): Promise<{ dataUrl: string; format: "PNG" | "JPEG" } | null> {
  if (!url?.trim()) return null;
  const trimmed = url.trim();
  if (trimmed.startsWith("data:image/png")) return { dataUrl: trimmed, format: "PNG" };
  if (trimmed.startsWith("data:image/jpeg") || trimmed.startsWith("data:image/jpg")) {
    return { dataUrl: trimmed, format: "JPEG" };
  }
  try {
    const response = await fetch(trimmed);
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

function checklistResultLabel(result: string): string {
  const value = result.trim().toLowerCase();
  if (value === "yes" || value === "pass" || value === "conforming" || value === "true") {
    return "Pass";
  }
  if (value === "no" || value === "fail" || value === "non_conforming") return "Fail";
  if (value === "na" || value === "n/a" || value === "n_a") return "NA";
  return result.trim() || "—";
}

function collectSlotPhotos(itc: AdminItcRecord): string[] {
  const urls: string[] = [];
  for (const photo of itc.photos ?? []) {
    if (photo.url) urls.push(photo.url);
  }
  for (const slot of Object.values(itc.photo_slots ?? {})) {
    if (slot.not_required) continue;
    const extra = Array.isArray(slot.urls) ? slot.urls : [];
    if (extra.length) urls.push(...extra.filter(Boolean));
    else if (slot.url) urls.push(slot.url);
  }
  return Array.from(new Set(urls)).slice(0, 10);
}

export async function generateItpItcExportPdf(input: ItpItcExportInput): Promise<Blob> {
  const [{ jsPDF }, autoTableModule] = await Promise.all([
    import("jspdf"),
    import("jspdf-autotable"),
  ]);
  const autoTable = autoTableModule.default;
  const doc = new jsPDF({ unit: "mm", format: "a4", orientation: "portrait" });
  const pageWidth = doc.internal.pageSize.getWidth();
  const profile = await fetchCompanyProfile().catch(() => null);
  const logo = await loadImage(profile?.logo_url ?? null);

  let y = PAGE_MARGIN;
  if (logo) {
    try {
      doc.addImage(logo.dataUrl, logo.format, PAGE_MARGIN, y, 32, 12);
    } catch {
      /* optional */
    }
  }
  doc.setFont("helvetica", "bold");
  doc.setFontSize(16);
  doc.setTextColor(...NAVY);
  doc.text(input.documentTitle, logo ? PAGE_MARGIN + 36 : PAGE_MARGIN, y + 8);
  y += 18;

  doc.setFontSize(9);
  doc.setFont("helvetica", "normal");
  doc.setTextColor(...SLATE);
  if (profile?.company_name) {
    doc.text(profile.company_name, PAGE_MARGIN, y);
    y += 5;
  }

  autoTable(doc, {
    startY: y,
    body: [
      ["Project", input.projectName, "Reference", input.referenceNumber],
      ["Date", formatDate(input.date), "Status", input.status],
      ...(input.subtitle
        ? [["Description", input.subtitle, "", ""]]
        : []),
      ...input.meta.reduce<Array<[string, string, string, string]>>((rows, [label, value], index) => {
        if (index % 2 === 0) {
          rows.push([label, value, input.meta[index + 1]?.[0] ?? "", input.meta[index + 1]?.[1] ?? ""]);
        }
        return rows;
      }, []),
    ],
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.2 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: [241, 245, 249], cellWidth: 32 },
      1: { cellWidth: 59 },
      2: { fontStyle: "bold", fillColor: [241, 245, 249], cellWidth: 32 },
      3: { cellWidth: 59 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 24;

  if (input.checklist.length) {
    y = ensureSpace(doc, y + 8, 24);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text("Inspection Checklist", PAGE_MARGIN, y);
    autoTable(doc, {
      startY: y + 3,
      head: [["Item", "Result", "Notes"]],
      body: input.checklist.map((row) => [row.item, checklistResultLabel(row.result), row.notes || "—"]),
      styles: { fontSize: 8, cellPadding: 1.8, overflow: "linebreak" },
      headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 8 },
      columnStyles: { 0: { cellWidth: 86 }, 1: { cellWidth: 22 }, 2: { cellWidth: 74 } },
      margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
    });
    y = (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 20;
  }

  if (input.planUrl) {
    y = ensureSpace(doc, y + 8, 78);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text("Plan Markup — Pin Location", PAGE_MARGIN, y);
    y += 4;
    const plan = await loadImage(input.planUrl);
    if (plan) {
      const width = CONTENT_WIDTH;
      const height = 70;
      doc.addImage(plan.dataUrl, plan.format, PAGE_MARGIN, y, width, height);
      if (input.pinX != null && input.pinY != null && Number.isFinite(input.pinX) && Number.isFinite(input.pinY)) {
        const pinX = PAGE_MARGIN + input.pinX * width;
        const pinY = y + input.pinY * height;
        doc.setFillColor(...ACCENT);
        doc.triangle(pinX, pinY, pinX - 1.6, pinY - 5.2, pinX + 1.6, pinY - 5.2, "F");
        doc.circle(pinX, pinY - 6.2, 1.7, "F");
      }
      y += height + 4;
    } else {
      doc.setFont("helvetica", "normal");
      doc.setFontSize(8);
      doc.setTextColor(...SLATE);
      doc.text("Plan drawing attached — preview unavailable in this export.", PAGE_MARGIN, y + 4);
      y += 10;
    }
  }

  if (input.photoUrls.length) {
    y = ensureSpace(doc, y + 6, 28);
    doc.setFont("helvetica", "bold");
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text("Site Photos", PAGE_MARGIN, y);
    y += 4;
    const cell = 42;
    const gap = 4;
    const cols = 4;
    for (let index = 0; index < input.photoUrls.length; index += 1) {
      if (index % cols === 0) y = ensureSpace(doc, y, cell + gap);
      const col = index % cols;
      const image = await loadImage(input.photoUrls[index]);
      const x = PAGE_MARGIN + col * (cell + gap);
      doc.setDrawColor(226, 232, 240);
      doc.rect(x, y, cell, cell);
      if (image) {
        try {
          doc.addImage(image.dataUrl, image.format, x + 1, y + 1, cell - 2, cell - 2);
        } catch {
          /* skip broken photo */
        }
      }
      if (col === cols - 1 || index === input.photoUrls.length - 1) {
        y += cell + gap;
      }
    }
  }

  y = ensureSpace(doc, y + 6, 42);
  doc.setFont("helvetica", "bold");
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text("Sign-Off", PAGE_MARGIN, y);
  y += 5;
  const blockWidth = (CONTENT_WIDTH - 8) / Math.max(1, Math.min(3, input.signatures.length || 1));
  const blocks = input.signatures.length ? input.signatures : [{ role: "Inspector", name: "—", date: null, url: null }];
  for (let index = 0; index < blocks.length; index += 1) {
    const block = blocks[index]!;
    const x = PAGE_MARGIN + (index % 3) * (blockWidth + 4);
    if (index > 0 && index % 3 === 0) y += 40;
    y = ensureSpace(doc, y, 38);
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, blockWidth, 36);
    doc.setFontSize(8);
    doc.setTextColor(...NAVY);
    doc.setFont("helvetica", "bold");
    doc.text(block.role, x + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${block.name || "—"}`, x + 3, y + 11);
    doc.text(`Date: ${formatDate(block.date)}`, x + 3, y + 16);
    if (block.url) {
      const signature = await loadImage(block.url);
      if (signature) {
        try {
          doc.addImage(signature.dataUrl, signature.format, x + 3, y + 19, blockWidth - 6, 14);
        } catch {
          /* skip */
        }
      }
    }
  }

  const pageCount = doc.getNumberOfPages();
  for (let page = 1; page <= pageCount; page += 1) {
    doc.setPage(page);
    doc.setFontSize(8);
    doc.setTextColor(148, 163, 184);
    doc.text(
      `${input.referenceNumber}  ·  Page ${page} of ${pageCount}`,
      pageWidth / 2,
      doc.internal.pageSize.getHeight() - 8,
      { align: "center" }
    );
  }

  return doc.output("blob");
}

export function downloadItpItcPdf(blob: Blob, fileName: string) {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
}

export async function generateAdminItpPdf(input: {
  itp: AdminItpRecord;
  projectName: string;
  itcs: AdminItcRecord[];
}): Promise<{ blob: Blob; fileName: string }> {
  const fileName = `${sanitizeFilePart(input.itp.number)}_ITP.pdf`;
  const blob = await generateItpItcExportPdf({
    documentTitle: "Inspection Test Plan",
    referenceNumber: input.itp.number,
    projectName: input.projectName,
    status: input.itp.status === "completed" ? "Completed / Signed-off" : input.itp.status,
    date: input.itp.created_at,
    subtitle: input.itp.title,
    meta: [
      ["Area", input.itp.area ?? "—"],
      ["Client", input.itp.client ?? "—"],
      ["Contractor", input.itp.managing_contractor ?? "—"],
      ["Subcontractor", input.itp.subcontractor ?? "—"],
      ["Drawing", input.itp.drawing_name ?? input.itp.drawing_ref ?? "—"],
      ["Associated ITCs", String(input.itcs.length)],
    ],
    checklist: input.itcs.map((itc) => ({
      item: itc.number,
      result: itc.status,
      notes: [itc.service, itc.area, itc.run_number].filter(Boolean).join(" · "),
    })),
    photoUrls: [],
    planUrl: input.itp.plan_url,
    signatures: [
      {
        role: "ITP Owner",
        name: input.itp.subcontractor ?? input.itp.managing_contractor ?? "—",
        date: input.itp.created_at,
      },
    ],
    fileName,
  });
  return { blob, fileName };
}

export async function generateProjectItpPdf(input: {
  itp: ProjectItp;
  projectName: string;
}): Promise<{ blob: Blob; fileName: string }> {
  const fileName = `${sanitizeFilePart(input.itp.itp_number)}_ITP.pdf`;
  const blob = await generateItpItcExportPdf({
    documentTitle: "Inspection Test Plan",
    referenceNumber: input.itp.itp_number,
    projectName: input.projectName,
    status:
      input.itp.status === "approved" || input.itp.status === "completed" || input.itp.status === "submitted"
        ? "Completed / Signed-off"
        : input.itp.status,
    date: input.itp.updated_at ?? input.itp.created_at,
    subtitle: input.itp.title,
    meta: [
      ["Revision", input.itp.revision],
      ["Trade", input.itp.trade_category],
      ["Subcontractor", input.itp.subcontractor_name ?? "—"],
      ["Location", input.itp.location_area ?? "—"],
    ],
    checklist: (input.itp.items ?? []).map((item) => ({
      item: `${item.item_number}. ${item.description}`,
      result: item.status,
      notes: item.acceptance_criteria ?? "",
    })),
    photoUrls: (input.itp.items ?? []).flatMap((item) => item.photo_urls).slice(0, 10),
    signatures: (input.itp.items ?? [])
      .filter((item) => item.signature_url || item.inspector_name)
      .map((item) => ({
        role: "Inspector",
        name: item.inspector_name ?? "—",
        date: item.signed_off_at,
        url: item.signature_url,
      }))
      .slice(0, 3),
    fileName,
  });
  return { blob, fileName };
}

function adminChecklistRows(items: AdminChecklistItem[]) {
  return items.map((item) => ({
    item: item.text,
    result: item.result,
    notes: item.remarks,
  }));
}

export async function generateAdminItcPdf(input: {
  itc: AdminItcRecord;
  projectName: string;
  planUrl?: string | null;
}): Promise<{ blob: Blob; fileName: string }> {
  const fileName = `${sanitizeFilePart(input.itc.number)}_ITC.pdf`;
  const blob = await generateItpItcExportPdf({
    documentTitle: "Inspection Test Checklist",
    referenceNumber: input.itc.number,
    projectName: input.projectName,
    status: input.itc.status === "completed" ? "Completed / Signed-off" : input.itc.status,
    date: input.itc.completed_at ?? input.itc.created_at,
    subtitle: [input.itc.service, input.itc.area].filter(Boolean).join(" · "),
    meta: [
      ["Service", input.itc.service ?? "—"],
      ["Run / Lines", input.itc.run_number ?? String(input.itc.lines_count ?? "—")],
      ["Pipe", [input.itc.pipe_size, input.itc.pipe_material].filter(Boolean).join(" ") || "—"],
      ["Drawing", input.itc.drawing_name ?? input.itc.drawing_ref ?? "—"],
      ["Completed by", input.itc.completed_by_name ?? "—"],
      ["Reviewed by", input.itc.reviewed_by_name ?? "—"],
    ],
    checklist: adminChecklistRows(input.itc.checklist ?? []),
    photoUrls: collectSlotPhotos(input.itc),
    planUrl: input.planUrl ?? null,
    pinX: input.itc.pin_x,
    pinY: input.itc.pin_y,
    signatures: [
      {
        role: "Subcontractor",
        name: input.itc.subcontractor_sign?.full_name ?? input.itc.completed_by_name ?? "—",
        date: input.itc.subcontractor_sign?.signed_at ?? input.itc.completed_at,
        url: input.itc.subcontractor_sign?.signature_url ?? input.itc.completed_by_signature,
      },
      {
        role: "Contractor",
        name: input.itc.contractor_sign?.full_name ?? input.itc.reviewed_by_name ?? "—",
        date: input.itc.contractor_sign?.signed_at ?? input.itc.reviewed_at,
        url: input.itc.contractor_sign?.signature_url ?? input.itc.reviewed_by_signature,
      },
      {
        role: "Client",
        name: input.itc.client_sign?.full_name ?? "—",
        date: input.itc.client_sign?.signed_at,
        url: input.itc.client_sign?.signature_url,
      },
    ],
    fileName,
  });
  return { blob, fileName };
}

export async function generateWorkerItcPdf(input: {
  itcNumber: string;
  projectName: string;
  status: string;
  completedAt?: string | null;
  workerName: string;
  entries: WorkerItcChecklistEntryRow[];
  planUrl?: string | null;
  pinX?: number | null;
  pinY?: number | null;
}): Promise<{ blob: Blob; fileName: string }> {
  const fileName = `${sanitizeFilePart(input.itcNumber)}_ITC.pdf`;
  const blob = await generateItpItcExportPdf({
    documentTitle: "Inspection Test Checklist",
    referenceNumber: input.itcNumber,
    projectName: input.projectName,
    status: input.status,
    date: input.completedAt,
    meta: [
      ["Inspector", input.workerName],
      ["Items", String(input.entries.length)],
    ],
    checklist: input.entries.map((entry) => ({
      item: entry.item_label,
      result: entry.is_checked ? "Pass" : "—",
      notes: entry.notes ?? "",
    })),
    photoUrls: input.entries
      .flatMap((entry) => (entry.photos?.length ? entry.photos : entry.photo_url ? [entry.photo_url] : []))
      .filter(Boolean)
      .slice(0, 10),
    planUrl: input.planUrl,
    pinX: input.pinX,
    pinY: input.pinY,
    signatures: [
      {
        role: "Inspector / Worker",
        name: input.workerName,
        date: input.completedAt,
      },
    ],
    fileName,
  });
  return { blob, fileName };
}
