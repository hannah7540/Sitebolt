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

export function getVocDisplayTitle(input: {
  title?: string | null;
  voc_type?: string | null;
  name?: string | null;
}): string {
  return String(input.voc_type ?? input.title ?? input.name ?? "").trim();
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
  const vocType = getVocDisplayTitle(v);
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
