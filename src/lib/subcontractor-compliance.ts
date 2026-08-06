import type { Worker, WorkerVoc } from "./supabase";
import {
  getWorkerSilicaCertDocUrl,
  getWorkerWhiteCardDocUrl,
  parseVocDetails,
} from "./subcontractor-worker-payload";
import {
  getTicketBadgeLabel,
  getTicketStatus,
  type TicketStatus,
} from "./worker-utils";

export interface SubcontractorWorkerTickets {
  white_card_expiry?: string | null;
  licence_expiry?: string | null;
}

export type SubcontractorWorkerDocumentStatus = "valid" | "missing_documents";

export interface SubcontractorWorkerDocumentCompliance {
  status: SubcontractorWorkerDocumentStatus;
  label: string;
  missing: string[];
}

function hasDocument(url: string | null | undefined): boolean {
  return Boolean(url?.trim());
}

function getWorkerVocEntries(worker: Worker, tableVocs: WorkerVoc[] = []) {
  const fromDetails = parseVocDetails(worker.voc_details);
  if (fromDetails.length > 0) return fromDetails;
  return tableVocs
    .filter((voc) => voc.title?.trim())
    .map((voc) => ({
      title: voc.title.trim(),
      issuing_org: voc.issuing_org ?? null,
      document_url: voc.document_url ?? null,
      issue_date: voc.issue_date ?? null,
      expiry_date: voc.expiry_date ?? null,
    }));
}

/** Document upload compliance for subbie workers linked to the workers table. */
export function getSubcontractorWorkerDocumentCompliance(
  worker: Worker,
  tableVocs: WorkerVoc[] = []
): SubcontractorWorkerDocumentCompliance {
  const missing: string[] = [];

  if (!hasDocument(getWorkerWhiteCardDocUrl(worker))) {
    missing.push("White card document");
  }
  if (!hasDocument(getWorkerSilicaCertDocUrl(worker))) {
    missing.push("Silica certificate document");
  }

  for (const voc of getWorkerVocEntries(worker, tableVocs)) {
    if (voc.title?.trim() && !hasDocument(voc.document_url)) {
      missing.push(`VOC: ${voc.title.trim()}`);
    }
  }

  if (worker.voc_title?.trim() && !hasDocument(worker.voc_document_url)) {
    missing.push(`VOC: ${worker.voc_title.trim()}`);
  }

  if (missing.length === 0) {
    return { status: "valid", label: "Valid", missing: [] };
  }

  return {
    status: "missing_documents",
    label: "Missing Documents",
    missing,
  };
}

export function getSubcontractorWorkerDocumentWarnings(
  worker: Worker,
  tableVocs: WorkerVoc[] = []
): string[] {
  const { missing } = getSubcontractorWorkerDocumentCompliance(worker, tableVocs);
  const name = worker.full_name?.trim() || "Worker";
  return missing.map((item) => `${name}: ${item}`);
}

export function isSubcontractorWorkerMissingDocuments(
  worker: Worker,
  tableVocs: WorkerVoc[] = []
): boolean {
  return (
    getSubcontractorWorkerDocumentCompliance(worker, tableVocs).status ===
    "missing_documents"
  );
}

export function getSubcontractorWorkerTicketStatus(
  worker: SubcontractorWorkerTickets
): TicketStatus {
  const statuses = [
    getTicketStatus(worker.white_card_expiry),
    getTicketStatus(worker.licence_expiry),
  ];

  if (statuses.includes("expired")) return "expired";
  if (statuses.includes("expires_soon")) return "expires_soon";
  if (statuses.every((s) => s === "unknown")) return "unknown";
  return "valid";
}

export function getSubcontractorWorkerWarnings(
  worker: SubcontractorWorkerTickets & { full_name?: string }
): string[] {
  const warnings: string[] = [];
  const name = worker.full_name?.trim() || "Worker";

  const whiteStatus = getTicketStatus(worker.white_card_expiry);
  if (whiteStatus === "expired") {
    warnings.push(`${name}: White card expired`);
  } else if (whiteStatus === "expires_soon") {
    warnings.push(`${name}: White card expiring soon`);
  }

  const licenceStatus = getTicketStatus(worker.licence_expiry);
  if (licenceStatus === "expired") {
    warnings.push(`${name}: Licence expired`);
  } else if (licenceStatus === "expires_soon") {
    warnings.push(`${name}: Licence expiring soon`);
  }

  return warnings;
}

export function isSubcontractorWorkerNonCompliant(
  worker: SubcontractorWorkerTickets
): boolean {
  return getSubcontractorWorkerTicketStatus(worker) === "expired";
}

export { getTicketBadgeLabel };
