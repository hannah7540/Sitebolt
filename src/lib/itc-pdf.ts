"use client";

import type { ItcDetailBundle, ItcSignoff, ItcStepPhoto, ProjectItc } from "./itc-service";
import type { ItcInspectionActivity } from "./itc-batch-templates";
import { ITC_FIELD_PHOTO_STEP_KEY, ITC_MAX_FINAL_PHOTOS } from "./itc-naming";
import { formatConduitConfig } from "./itc-templates";

const PAGE_MARGIN = 12;
const CONTENT_WIDTH = 186;
const HEADER_FILL: [number, number, number] = [241, 245, 249];
const ACCENT: [number, number, number] = [234, 88, 12];

type JsPdfInstance = import("jspdf").jsPDF;

export interface ItcPdfOptions {
  projectName: string;
  projectNo?: string;
  subcontractorName?: string;
  packageName?: string;
  clientName?: string;
}

interface ResolvedItcSpecs {
  material_and_size: string | null;
  upstream_pit_number: string | null;
  downstream_pit_number: string | null;
  number_of_conduits: number | null;
  min_horizontal_sep_mm: number | null;
  min_vertical_sep_mm: number | null;
  min_bedding_mm: number | null;
  min_side_mm: number | null;
  min_overlay_mm: number | null;
  min_cover_mm: number | null;
  bedding_and_overlay_material: string | null;
  cover_material: string | null;
}

interface SignOffBlock {
  role: string;
  name: string;
  position: string;
  signatureUrl: string | null;
  date: string;
}

function ensureSpace(doc: JsPdfInstance, y: number, needed: number): number {
  const pageHeight = doc.internal.pageSize.getHeight();
  if (y + needed > pageHeight - PAGE_MARGIN) {
    doc.addPage();
    return PAGE_MARGIN + 6;
  }
  return y;
}

function formatDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleDateString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

function displayValue(value: unknown): string {
  if (value == null || value === "") return "—";
  return String(value);
}

function resolveItcSpecs(itc: ProjectItc): ResolvedItcSpecs {
  const form = itc.form_data ?? {};
  return {
    material_and_size:
      itc.material_and_size ??
      (form.material_and_size ? String(form.material_and_size) : null),
    upstream_pit_number:
      itc.upstream_pit_number ??
      (form.upstream_pit_number ? String(form.upstream_pit_number) : null) ??
      itc.start_location,
    downstream_pit_number:
      itc.downstream_pit_number ??
      (form.downstream_pit_number ? String(form.downstream_pit_number) : null) ??
      itc.end_location,
    number_of_conduits:
      itc.number_of_conduits ??
      (form.number_of_conduits != null ? Number(form.number_of_conduits) : null),
    min_horizontal_sep_mm:
      itc.min_horizontal_sep_mm ??
      (form.min_horizontal_sep_mm != null ? Number(form.min_horizontal_sep_mm) : null),
    min_vertical_sep_mm:
      itc.min_vertical_sep_mm ??
      (form.min_vertical_sep_mm != null ? Number(form.min_vertical_sep_mm) : null),
    min_bedding_mm:
      itc.min_bedding_mm ?? (form.min_bedding_mm != null ? Number(form.min_bedding_mm) : null),
    min_side_mm:
      itc.min_side_mm ?? (form.min_side_mm != null ? Number(form.min_side_mm) : null),
    min_overlay_mm:
      itc.min_overlay_mm ?? (form.min_overlay_mm != null ? Number(form.min_overlay_mm) : null),
    min_cover_mm:
      itc.min_cover_mm ?? (form.min_cover_mm != null ? Number(form.min_cover_mm) : null),
    bedding_and_overlay_material:
      itc.bedding_and_overlay_material ??
      (form.bedding_and_overlay_material
        ? String(form.bedding_and_overlay_material)
        : null),
    cover_material:
      itc.cover_material ?? (form.cover_material ? String(form.cover_material) : null),
  };
}

function deriveCheckResult(activity: ItcInspectionActivity): string {
  if (activity.check_result?.trim()) return activity.check_result.trim();
  if (activity.comments?.trim().toUpperCase().startsWith("N/A")) return "NA";
  if (activity.check_by?.trim()) return "Yes";
  return "—";
}

async function loadImageDataUrl(url: string): Promise<{ dataUrl: string; format: string } | null> {
  try {
    const response = await fetch(url);
    if (!response.ok) return null;
    const blob = await response.blob();
    const dataUrl = await new Promise<string>((resolve, reject) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result));
      reader.onerror = () => reject(reader.error);
      reader.readAsDataURL(blob);
    });
    const format = blob.type.includes("png") ? "PNG" : "JPEG";
    return { dataUrl, format };
  } catch {
    return null;
  }
}

async function resolveGpsAddress(lat: number | null, lng: number | null): Promise<string> {
  if (lat == null || lng == null) return "—";
  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}`,
      { headers: { Accept: "application/json" } }
    );
    if (!response.ok) return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
    const payload = (await response.json()) as { display_name?: string };
    return payload.display_name ?? `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  } catch {
    return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
  }
}

function drawMetadataGrid(
  doc: JsPdfInstance,
  autoTable: (doc: JsPdfInstance, options: Record<string, unknown>) => void,
  startY: number,
  rows: Array<[string, string, string, string]>
): number {
  autoTable(doc, {
    startY,
    body: rows,
    theme: "grid",
    styles: { fontSize: 8, cellPadding: 2, lineColor: [203, 213, 225], lineWidth: 0.2 },
    columnStyles: {
      0: { fontStyle: "bold", fillColor: HEADER_FILL, cellWidth: 34 },
      1: { cellWidth: 59 },
      2: { fontStyle: "bold", fillColor: HEADER_FILL, cellWidth: 34 },
      3: { cellWidth: 59 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });
  return (
    (doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? startY + 20
  );
}

function buildSignOffBlocks(signoffs: ItcSignoff[], itc: ProjectItc): SignOffBlock[] {
  const submitted = signoffs.filter((row) => row.status === "submitted");
  const subcontractor =
    submitted.find((row) => row.step_key !== "final_signoff") ?? submitted[0];
  const managing =
    submitted.find((row) => row.verified_by_name) ??
    submitted.find((row) => row.step_key === "final_signoff");
  const client = submitted.find((row) => row.step_key === "final_signoff") ?? managing;

  return [
    {
      role: "Subcontractor",
      name: subcontractor?.author_name ?? itc.assigned_name ?? "—",
      position: String(subcontractor?.field_data?.position ?? "Leading Hand"),
      signatureUrl: subcontractor?.signature_url ?? null,
      date: formatDate(subcontractor?.signed_at ?? subcontractor?.submitted_at),
    },
    {
      role: "Managing Contractor",
      name: managing?.verified_by_name ?? managing?.author_name ?? "—",
      position: String(managing?.field_data?.position ?? "Site Supervisor"),
      signatureUrl: managing?.signature_url ?? null,
      date: formatDate(managing?.verified_at ?? managing?.signed_at ?? managing?.submitted_at),
    },
    {
      role: "Client",
      name: String(client?.field_data?.client_representative ?? "—"),
      position: String(client?.field_data?.client_position ?? "Representative"),
      signatureUrl: client?.signature_url ?? null,
      date: formatDate(client?.signed_at ?? client?.submitted_at),
    },
  ];
}

async function drawStampedPhoto(
  doc: JsPdfInstance,
  photo: ItcStepPhoto,
  x: number,
  y: number,
  width: number,
  height: number,
  address: string
): Promise<void> {
  const image = await loadImageDataUrl(photo.photo_url);
  if (image) {
    doc.addImage(image.dataUrl, image.format, x, y, width, height - 18);
  } else {
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, width, height - 18);
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("Photo unavailable", x + 4, y + (height - 18) / 2);
  }

  doc.setFillColor(15, 23, 42);
  doc.rect(x, y + height - 18, width, 18, "F");
  doc.setFontSize(6);
  doc.setTextColor(255, 255, 255);
  const lines = [
    `Date/Time: ${formatDateTime(photo.captured_at)}`,
    `GPS: ${address}`,
    `Heading: —`,
    `Notes: ${photo.uploaded_by_name ?? photo.uploaded_by ?? "Field photo"}`,
  ];
  lines.forEach((line, index) => {
    doc.text(line, x + 2, y + height - 14 + index * 3.5);
  });
}

export async function generateItcCertificatePdf(
  bundle: ItcDetailBundle,
  options: ItcPdfOptions | string
): Promise<Blob> {
  const pdfOptions: ItcPdfOptions =
    typeof options === "string" ? { projectName: options } : options;

  const { jsPDF } = await import("jspdf");
  const autoTableModule = await import("jspdf-autotable");
  const autoTable = autoTableModule.default;

  const doc = new jsPDF({ unit: "mm", format: "a4" });
  const { itc, stepPhotos, signoffs, inspectionActivities } = bundle;
  const specs = resolveItcSpecs(itc);

  let y = PAGE_MARGIN;
  doc.setFontSize(15);
  doc.setTextColor(...ACCENT);
  doc.text("Inspection Test Certificate", PAGE_MARGIN, y);
  y += 8;

  y = drawMetadataGrid(doc, autoTable, y, [
    [
      "Project No",
      displayValue(pdfOptions.projectNo ?? itc.project_id),
      "Package",
      displayValue(pdfOptions.packageName ?? itc.package_name ?? pdfOptions.projectName),
    ],
    [
      "Subcontractor",
      displayValue(pdfOptions.subcontractorName ?? itc.subcontractor_name ?? itc.assigned_name),
      "Client",
      displayValue(pdfOptions.clientName ?? itc.client_name),
    ],
    [
      "ITC No",
      displayValue(itc.itc_number),
      "Service",
      displayValue(itc.service_type ?? itc.service_discipline),
    ],
    [
      "Zone",
      displayValue(itc.zone_code),
      "Plan Rev",
      displayValue(itc.drawing_rev),
    ],
    [
      "Material & Size",
      displayValue(specs.material_and_size),
      "Length (m)",
      displayValue(itc.length_m ?? itc.length_of_run_m),
    ],
    [
      "Upstream Pit",
      displayValue(specs.upstream_pit_number),
      "Downstream Pit",
      displayValue(specs.downstream_pit_number),
    ],
    [
      "Conduits",
      displayValue(formatConduitConfig(itc.conduits)),
      "No. Conduits",
      displayValue(specs.number_of_conduits),
    ],
  ]);

  y += 4;
  y = drawMetadataGrid(doc, autoTable, y, [
    [
      "Min H-Sep (mm)",
      displayValue(specs.min_horizontal_sep_mm),
      "Min V-Sep (mm)",
      displayValue(specs.min_vertical_sep_mm),
    ],
    [
      "Min Bedding (mm)",
      displayValue(specs.min_bedding_mm),
      "Min Side (mm)",
      displayValue(specs.min_side_mm),
    ],
    [
      "Min Overlay (mm)",
      displayValue(specs.min_overlay_mm),
      "Min Cover (mm)",
      displayValue(specs.min_cover_mm),
    ],
    [
      "Bedding / Overlay",
      displayValue(specs.bedding_and_overlay_material),
      "Cover Material",
      displayValue(specs.cover_material),
    ],
  ]);

  const redlineUrl = itc.redline_markup_url;
  if (redlineUrl) {
    y = ensureSpace(doc, y + 6, 70);
    doc.setFontSize(11);
    doc.setTextColor(...ACCENT);
    doc.text("Redline Shop Drawing", PAGE_MARGIN, y);
    y += 4;
    const drawing = await loadImageDataUrl(redlineUrl);
    if (drawing) {
      const maxWidth = CONTENT_WIDTH;
      const maxHeight = 58;
      doc.addImage(drawing.dataUrl, drawing.format, PAGE_MARGIN, y, maxWidth, maxHeight);
      y += maxHeight + 4;
    } else {
      doc.setFontSize(8);
      doc.setTextColor(100, 116, 139);
      doc.text("Shop drawing attached — preview unavailable in export.", PAGE_MARGIN, y + 4);
      y += 10;
    }
  }

  y = ensureSpace(doc, y + 4, 24);
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text("Sequential Inspection Steps", PAGE_MARGIN, y);
  y += 2;

  autoTable(doc, {
    startY: y + 2,
    head: [
      [
        "No.",
        "Activity",
        "Inspection Criteria",
        "Checked",
        "Checked By Name",
        "Date",
        "Comments",
      ],
    ],
    body: inspectionActivities.map((activity) => [
      String(activity.activity_number),
      activity.title,
      activity.inspection_criteria ?? "—",
      deriveCheckResult(activity),
      activity.check_by ?? "—",
      activity.checked_date ? formatDate(activity.checked_date) : "—",
      activity.comments ?? "—",
    ]),
    styles: { fontSize: 7, cellPadding: 1.5, overflow: "linebreak" },
    headStyles: { fillColor: ACCENT, textColor: 255, fontSize: 7 },
    columnStyles: {
      0: { cellWidth: 8 },
      1: { cellWidth: 24 },
      2: { cellWidth: 52 },
      3: { cellWidth: 12 },
      4: { cellWidth: 24 },
      5: { cellWidth: 16 },
      6: { cellWidth: 40 },
    },
    margin: { left: PAGE_MARGIN, right: PAGE_MARGIN },
  });

  y =
    ((doc as unknown as { lastAutoTable?: { finalY: number } }).lastAutoTable?.finalY ?? y + 40) +
    8;

  const finalPhotos = stepPhotos
    .filter((row) => row.step_key === ITC_FIELD_PHOTO_STEP_KEY && row.is_approved_for_export)
    .slice(0, ITC_MAX_FINAL_PHOTOS);

  y = ensureSpace(doc, y, 20);
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text("Stamped Photo Appendix", PAGE_MARGIN, y);
  y += 6;

  if (finalPhotos.length === 0) {
    doc.setFontSize(8);
    doc.setTextColor(100, 116, 139);
    doc.text("No final field photos selected for export.", PAGE_MARGIN, y);
    y += 8;
  } else {
    const cellWidth = (CONTENT_WIDTH - 8) / 3;
    const cellHeight = 52;
    const addresses = await Promise.all(
      finalPhotos.map((photo) => resolveGpsAddress(photo.gps_lat, photo.gps_lng))
    );

    let photoY = y;
    const rowCount = Math.ceil(finalPhotos.length / 3);
    for (let row = 0; row < rowCount; row += 1) {
      photoY = ensureSpace(doc, photoY, cellHeight + 4);
      for (let col = 0; col < 3; col += 1) {
        const index = row * 3 + col;
        if (index >= finalPhotos.length) break;
        await drawStampedPhoto(
          doc,
          finalPhotos[index]!,
          PAGE_MARGIN + col * (cellWidth + 4),
          photoY,
          cellWidth,
          cellHeight,
          addresses[index] ?? "—"
        );
      }
      photoY += cellHeight + 4;
    }
    y = photoY;
  }

  y = ensureSpace(doc, y + 6, 42);
  doc.setFontSize(11);
  doc.setTextColor(...ACCENT);
  doc.text("Sign-Off", PAGE_MARGIN, y);
  y += 6;

  const signOffBlocks = buildSignOffBlocks(signoffs, itc);
  const blockWidth = (CONTENT_WIDTH - 8) / 3;

  for (let index = 0; index < signOffBlocks.length; index += 1) {
    const block = signOffBlocks[index]!;
    const x = PAGE_MARGIN + index * (blockWidth + 4);
    doc.setDrawColor(203, 213, 225);
    doc.rect(x, y, blockWidth, 34);
    doc.setFontSize(8);
    doc.setTextColor(15, 23, 42);
    doc.setFont("helvetica", "bold");
    doc.text(block.role, x + 3, y + 5);
    doc.setFont("helvetica", "normal");
    doc.text(`Name: ${block.name}`, x + 3, y + 11);
    doc.text(`Position: ${block.position}`, x + 3, y + 16);
    doc.text(`Date: ${block.date}`, x + 3, y + 21);

    if (block.signatureUrl) {
      const signature = await loadImageDataUrl(block.signatureUrl);
      if (signature) {
        doc.addImage(signature.dataUrl, signature.format, x + 3, y + 23, blockWidth - 6, 9);
      }
    } else {
      doc.setFontSize(7);
      doc.setTextColor(148, 163, 184);
      doc.text("Signature", x + 3, y + 29);
    }
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
