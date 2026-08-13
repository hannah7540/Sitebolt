export type TicketStatus = "valid" | "expires_soon" | "expired" | "unknown";

export const WARNING_DAYS = 30;

/** Build a display full name from first and last name parts. */
export function buildWorkerFullName(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): string {
  return [firstName?.trim(), lastName?.trim()].filter(Boolean).join(" ");
}

/** Persisted worker name columns derived from first/last name inputs. */
export function buildWorkerNameFields(
  firstName: string | null | undefined,
  lastName: string | null | undefined
): {
  first_name: string | null;
  last_name: string | null;
  full_name: string;
  worker_name: string;
} {
  const first_name = firstName?.trim() || null;
  const last_name = lastName?.trim() || null;
  const full_name = buildWorkerFullName(first_name, last_name);
  return {
    first_name,
    last_name,
    full_name,
    worker_name: full_name,
  };
}

export function splitWorkerFullName(fullName: string): {
  firstName: string;
  lastName: string;
} {
  const parts = fullName.trim().split(/\s+/).filter(Boolean);
  if (parts.length === 0) return { firstName: "", lastName: "" };
  if (parts.length === 1) return { firstName: parts[0], lastName: "" };
  return {
    firstName: parts[0],
    lastName: parts.slice(1).join(" "),
  };
}

/** Name fields that may exist across worker schema variants. */
export type WorkerNameFields = {
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  worker_name?: string | null;
  name?: string | null;
  email?: string | null;
};

/** Resolve a display name from whichever worker name columns exist. */
export function getWorkerDisplayName(
  worker: WorkerNameFields,
  fallback = "Admin Worker"
): string {
  const firstName = worker.first_name?.trim();
  if (firstName) {
    const lastName = worker.last_name?.trim();
    return lastName ? `${firstName} ${lastName}` : firstName;
  }

  for (const candidate of [
    worker.full_name,
    worker.worker_name,
    worker.name,
    worker.email,
  ]) {
    const value = candidate?.trim();
    if (value) return value;
  }

  return fallback;
}

export function daysUntil(dateIso: string | null | undefined): number | null {
  if (!dateIso) return null;
  const target = new Date(dateIso);
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function getTicketStatus(
  expiryDate: string | null | undefined
): TicketStatus {
  const days = daysUntil(expiryDate);
  if (days === null) return "unknown";
  if (days < 0) return "expired";
  if (days <= WARNING_DAYS) return "expires_soon";
  return "valid";
}

export function getTicketBadgeLabel(status: TicketStatus): string {
  switch (status) {
    case "valid":
      return "Valid";
    case "expires_soon":
      return "Expires Soon";
    case "expired":
      return "Expired";
    default:
      return "No Expiry Set";
  }
}

export function computeWorkerStatusFromExpiries(
  expiries: (string | null | undefined)[]
): "active" | "pending_induction" | "expired_ticket" {
  const hasAnyExpiry = expiries.some(Boolean);
  if (!hasAnyExpiry) return "pending_induction";
  const worst = expiries.map(getTicketStatus);
  if (worst.includes("expired")) return "expired_ticket";
  return "active";
}

export type WorkerEmploymentSource = {
  worker_type?: string | null;
  is_subcontractor?: boolean | null;
  subcontractor_id?: string | null;
};

/** True when a worker belongs to a subcontractor company, not internal staff. */
export function isSubcontractorWorker(worker: WorkerEmploymentSource): boolean {
  const workerType = worker.worker_type?.trim();
  if (workerType === "Subcontractor") return true;
  if (worker.is_subcontractor === true || String(worker.is_subcontractor) === "true") {
    return true;
  }
  return Boolean(worker.subcontractor_id?.trim());
}

/** Organisation master list: company employees only. */
export function isCompanyEmployeeWorker(worker: WorkerEmploymentSource): boolean {
  return !isSubcontractorWorker(worker);
}

/** Convert blank date inputs to null for Postgres date columns. */
export function nullIfBlankWorkerDate(
  value: string | null | undefined
): string | null {
  if (value == null) return null;
  const trimmed = value.trim();
  return trimmed ? trimmed : null;
}

export const WORKER_DATE_FIELD_KEYS = [
  "dob",
  "white_card_issue_date",
  "drivers_licence_expiry",
  "silica_cert_issue_date",
  "induction_completed_at",
] as const;

export function sanitizeWorkerDateFields(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const next = { ...payload };

  for (const key of WORKER_DATE_FIELD_KEYS) {
    if (!(key in next)) continue;
    const value = next[key];
    if (typeof value === "string" || value == null) {
      next[key] = nullIfBlankWorkerDate(value);
    }
  }

  return next;
}
