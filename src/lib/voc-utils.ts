import type { WorkerVoc } from "./supabase";
import type { TicketStatus } from "./worker-utils";
import { getTicketStatus, daysUntil, WARNING_DAYS } from "./worker-utils";

export const VOC_TYPE_OPTIONS = [
  "Asbestos Awareness",
  "Asbestos Removal",
  "Butt Welding",
  "Confined Space",
  "Dogman Licence",
  "C6 Licence to Operate a Slewing Mobile Crane (up to 60 tonnes)",
  "Drainers Licence",
  "EWP",
  "First Aid",
  "Forklift Licence (LF)",
  "Gold Card (Telehandler)",
  "HC Truck License",
  "HR Truck License",
  "HSR 5 Day Course",
  "Journeypersons Licence",
  "Manual Handling",
  "MR Truck Licence",
  "NSW Plumbers Licence",
  "Plumbers Licence",
  "Safe Slinging Technique (SS)",
  "Scaffolding",
  "Traffic Control",
  "Telescopic Handler (TSH)",
  "VOC - Articulated Haul/Dump truck (AHT/ADT)",
  "VOC - Backhoe (LB)",
  "VOC - Boom Lift (BL)",
  "VOC - Excavator (LE)",
  "VOC - Front Load Dump Truck (FLD)",
  "VOC - Front End Loader (LL)",
  "VOC - On Site Tipper (OST)",
  "VOC - Roller (LR)",
  "VOC - Scissor Lift (SL)",
  "VOC - Site Dumper (SD)",
  "VOC - Skid Steer (LS)",
  "VOC - Trailer Lift (TL)",
  "VOC - Vertical Lift (VL)",
  "Working Safely with Asbestos Containing Materials",
  "Work Safely at Heights",
  "WP - High Risk Work License over 11m",
] as const;

export type VocTypeOption = (typeof VOC_TYPE_OPTIONS)[number];

export const VOC_OTHER_OPTION = { id: "other", label: "Other" } as const;
export const VOC_OTHER_LABEL = VOC_OTHER_OPTION.label;
export const VOC_OTHER_UNSPECIFIED_ERROR = "Please specify the VOC type";
export const VOC_SELECT_OPTIONS = [...VOC_TYPE_OPTIONS, VOC_OTHER_LABEL] as const;

export function getVocStoredType(input: {
  title?: string | null;
  voc_type?: string | null;
  name?: string | null;
  ticket_name?: string | null;
}): string {
  return String(
    input.voc_type ?? input.title ?? input.name ?? input.ticket_name ?? ""
  ).trim();
}

export function isVocOtherType(value: string | null | undefined): boolean {
  const trimmed = String(value ?? "").trim();
  if (!trimmed) return false;
  return (
    trimmed.toLowerCase() === VOC_OTHER_LABEL.toLowerCase() ||
    trimmed.toLowerCase().startsWith("other:")
  );
}

export function parseVocOtherCustomName(value: string | null | undefined): string {
  const trimmed = String(value ?? "").trim();
  const match = trimmed.match(/^other\s*:\s*(.*)$/i);
  return match ? match[1].trim() : "";
}

export function formatVocOtherStoredValue(customName: string): string {
  const name = customName.trim();
  return name ? `${VOC_OTHER_LABEL}: ${name}` : VOC_OTHER_LABEL;
}

export function getVocSelectValue(stored: string | null | undefined): string {
  const trimmed = String(stored ?? "").trim();
  if (!trimmed) return "";
  if (isVocOtherType(trimmed)) return VOC_OTHER_LABEL;
  return trimmed;
}

export function formatVocDisplayLabel(stored: string | null | undefined): string {
  const trimmed = String(stored ?? "").trim();
  if (!trimmed) return "";
  const custom = parseVocOtherCustomName(trimmed);
  if (custom) return `${VOC_OTHER_LABEL} (${custom})`;
  return trimmed;
}

export function isVocTypeComplete(value: string | null | undefined): boolean {
  const stored = String(value ?? "").trim();
  if (!stored) return false;
  if (isVocOtherType(stored) && !parseVocOtherCustomName(stored)) return false;
  return true;
}

export function getVocDisplayTitle(input: {
  title?: string | null;
  voc_type?: string | null;
  name?: string | null;
  ticket_name?: string | null;
}): string {
  return formatVocDisplayLabel(getVocStoredType(input));
}

export function vocDraftHasContent(voc: {
  voc_type?: string;
  title?: string;
  issuing_org?: string;
  issue_date?: string;
  expiry_date?: string;
  document_url?: string | null;
  file?: File | null;
}): boolean {
  return Boolean(
    voc.voc_type?.trim() ||
      voc.title?.trim() ||
      voc.issuing_org?.trim() ||
      voc.issue_date?.trim() ||
      voc.expiry_date?.trim() ||
      voc.document_url ||
      voc.file
  );
}

export function validateVocDrafts(
  vocs: Array<{
    voc_type?: string;
    title?: string;
    issuing_org?: string;
    issue_date?: string;
    expiry_date?: string;
    document_url?: string | null;
    file?: File | null;
  }>
): string | null {
  for (const voc of vocs) {
    if (!vocDraftHasContent(voc)) continue;
    const stored = getVocStoredType(voc);
    if (!isVocTypeComplete(stored)) {
      return isVocOtherType(stored)
        ? VOC_OTHER_UNSPECIFIED_ERROR
        : "Each VOC row must include a licence or competency type.";
    }
  }
  return null;
}

export interface VocDraft {
  clientId: string;
  id?: string;
  voc_type: string;
  title: string;
  issuing_org: string;
  issue_date: string;
  expiry_date: string;
  document_url: string | null;
  file: File | null;
}

export function createEmptyVoc(): VocDraft {
  return {
    clientId: crypto.randomUUID(),
    voc_type: "",
    title: "",
    issuing_org: "",
    issue_date: "",
    expiry_date: "",
    document_url: null,
    file: null,
  };
}

export function vocFromRecord(v: WorkerVoc): VocDraft {
  const vocType = getVocStoredType(v);
  return {
    clientId: v.id,
    id: v.id,
    voc_type: vocType,
    title: vocType,
    issuing_org: v.issuing_org ?? "",
    issue_date: v.issue_date ?? "",
    expiry_date: v.expiry_date ?? "",
    document_url: v.document_url,
    file: null,
  };
}

export function getAllExpiryDates(
  worker: { drivers_licence_expiry?: string | null },
  vocs: WorkerVoc[] | VocDraft[]
): (string | null | undefined)[] {
  const vocExpiries = vocs.map((v) => v.expiry_date);
  return [worker.drivers_licence_expiry, ...vocExpiries];
}

export function getWorstTicketStatus(
  expiries: (string | null | undefined)[]
): TicketStatus {
  const statuses = expiries.map(getTicketStatus);
  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("expires_soon")) return "expires_soon";
  if (statuses.some((s) => s === "valid")) return "valid";
  return "unknown";
}

export function getComplianceWarnings(
  worker: { drivers_licence_expiry?: string | null; full_name?: string },
  vocs: { title: string; expiry_date: string | null }[]
): string[] {
  const warnings: string[] = [];

  const licenceDays = daysUntil(worker.drivers_licence_expiry);
  if (licenceDays !== null) {
    if (licenceDays < 0) warnings.push("Driver's licence expired");
    else if (licenceDays <= WARNING_DAYS)
      warnings.push(`Driver's licence expires in ${licenceDays} day${licenceDays === 1 ? "" : "s"}`);
  }

  for (const voc of vocs) {
    if (!voc.expiry_date) continue;
    const days = daysUntil(voc.expiry_date);
    if (days === null) continue;
    if (days < 0) warnings.push(`VOC expired: ${voc.title}`);
    else if (days <= WARNING_DAYS)
      warnings.push(`VOC expiring soon: ${voc.title} (${days}d)`);
  }

  return warnings;
}

export function groupVocsByWorker(
  vocs: WorkerVoc[]
): Record<string, WorkerVoc[]> {
  const map: Record<string, WorkerVoc[]> = {};
  for (const voc of vocs) {
    if (!map[voc.worker_id]) map[voc.worker_id] = [];
    map[voc.worker_id].push(voc);
  }
  return map;
}
