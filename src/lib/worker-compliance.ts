import type { Worker, WorkerVoc } from "./supabase";
import type { TicketStatus } from "./worker-utils";
import {
  getTicketStatus,
  getTicketBadgeLabel,
  daysUntil,
  WARNING_DAYS,
  computeWorkerStatusFromExpiries,
} from "./worker-utils";
import {
  getAllExpiryDates,
  getWorstTicketStatus,
  getComplianceWarnings,
} from "./voc-utils";

export type { TicketStatus };
export { getTicketBadgeLabel, WARNING_DAYS };

export function getWorkerTicketStatus(
  worker: Worker,
  vocs: WorkerVoc[] = []
): TicketStatus {
  return getWorstTicketStatus(getAllExpiryDates(worker, vocs));
}

export function computeWorkerStatus(
  worker: Worker,
  vocs: WorkerVoc[] = []
): "active" | "pending_induction" | "expired_ticket" {
  return computeWorkerStatusFromExpiries(getAllExpiryDates(worker, vocs));
}

export function getExpiryWarningText(
  worker: Worker,
  vocs: WorkerVoc[] = []
): string | null {
  const warnings = getComplianceWarnings(worker, vocs);
  if (warnings.length === 0) return null;
  return warnings[0];
}

export function getAllExpiryWarnings(
  worker: Worker,
  vocs: WorkerVoc[] = []
): string[] {
  return getComplianceWarnings(worker, vocs);
}

export function isNonCompliant(worker: Worker, vocs: WorkerVoc[] = []): boolean {
  return getWorkerTicketStatus(worker, vocs) === "expired";
}

// Legacy single-field helpers (licence only)
export { getTicketStatus, daysUntil };
