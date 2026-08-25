import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import {
  isSupabaseRelationMissingError,
  isSupabaseMissingColumnError,
  toSupabaseRequestError,
} from "@/lib/supabase-errors";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { fetchUserProfile, fetchWorkerIdForAuthUser } from "@/lib/auth-profile";

export const INCIDENT_REPORTS_TABLE = "incident_reports";

/** Dispatched after incident submit/update so lists and badges refresh. */
export const INCIDENT_REPORTS_REFRESH_EVENT = "sitebolt:incident-reports-refresh";

export function dispatchIncidentReportsRefresh(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(INCIDENT_REPORTS_REFRESH_EVENT));
}

/**
 * Bypass strict generated Database / PostgREST table-name type locks.
 * Prefer this over `client.from("incident_reports")` so TS does not reject
 * the table before generated types are regenerated.
 */
export function fromIncidentReports(client: {
  from: (relation: string) => unknown;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as { from: (relation: any) => any }).from(
    "incident_reports" as any
  );
}

/** Canonical public.incident_reports column keys used by inserts/selects. */
export const INCIDENT_REPORT_SCHEMA_COLUMNS = [
  "reference_number",
  "submitted_by_id",
  "submitted_by_name",
  "incident_date_time",
  "project_id",
  "project_name",
  "injured_worker_id",
  "injured_worker_name",
  "injury_details",
  "treatment_details",
  "treating_person_id",
  "treating_person_name",
  "offsite_treatment_location",
  "what_occurred",
  "incident_location_details",
  "treatment_given",
  "witness_ids",
  "witness_names",
  "immediate_corrective_action_required",
  "is_notifiable_under_whs",
  "what_caused_to_go_wrong",
  "what_could_have_prevented",
  "recommendations_to_prevent",
  "medical_certificate_urls",
  "submitter_signature_url",
  "status",
  "is_read_admin",
] as const;

/**
 * Columns sent on INSERT. Omits created_at/updated_at (DB defaults).
 * Includes ID + denormalized name columns for register display without joins.
 */
export const INCIDENT_REPORT_INSERT_COLUMNS = INCIDENT_REPORT_SCHEMA_COLUMNS;

const INCIDENT_INSERT_COLUMN_SET = new Set<string>(INCIDENT_REPORT_INSERT_COLUMNS);

/** Shown only when Postgres reports the relation is truly missing. */
export const INCIDENT_TABLE_MISSING_MESSAGE =
  "Could not reach the `incident_reports` table. Confirm it exists in Supabase and is exposed to the API, then retry.";

export const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

export function isValidIncidentUuid(value: unknown): value is string {
  return typeof value === "string" && UUID_RE.test(value.trim());
}

/** Force strict boolean; anything other than explicit true becomes false. */
export function forceIncidentBoolean(value: unknown): boolean {
  return value === true || value === "true" || value === 1 || value === "1";
}

export function nullIfBlankUuid(value: unknown): string | null {
  if (typeof value !== "string") return null;
  const trimmed = value.trim();
  if (!trimmed || !UUID_RE.test(trimmed)) return null;
  return trimmed;
}

/**
 * Resolve the submitter worker UUID from the active Supabase auth session.
 * Prefers profiles.worker_id / workers.auth_user_id mapping; falls back to
 * auth user id only when it is a valid UUID. Never returns "".
 */
export async function resolveIncidentSubmitterId(
  fallbackWorkerId?: string | null
): Promise<string | null> {
  try {
    const { data, error } = await supabase.auth.getUser();
    if (error) {
      console.warn("[incident-reports] auth.getUser failed:", error.message);
    }
    const authUser = data?.user ?? null;
    if (authUser?.id) {
      const profile = await fetchUserProfile(authUser.id);
      const fromProfile = nullIfBlankUuid(profile?.worker_id);
      if (fromProfile) return fromProfile;

      const fromWorkers = await fetchWorkerIdForAuthUser(
        authUser.id,
        authUser.email
      );
      const workerId = nullIfBlankUuid(fromWorkers.workerId);
      if (workerId) return workerId;

      // Last resort: auth uid itself (nullable FK-safe if no workers FK exists).
      const authId = nullIfBlankUuid(authUser.id);
      if (authId) return authId;
    }
  } catch (cause) {
    console.warn("[incident-reports] resolveIncidentSubmitterId failed:", cause);
  }

  return nullIfBlankUuid(fallbackWorkerId);
}

function parseForeignKeyColumnFromError(message: string): string | null {
  const keyMatch = message.match(
    /Key \(([a-zA-Z0-9_]+)\)=\([^)]+\) is not present/i
  );
  if (keyMatch?.[1]) return keyMatch[1];
  const constraintMatch = message.match(
    /foreign key constraint .*? on column "?([a-zA-Z0-9_]+)"?/i
  );
  if (constraintMatch?.[1]) return constraintMatch[1];
  return null;
}

function isForeignKeyViolation(error: {
  code?: string;
  message?: string;
} | null): boolean {
  if (!error) return false;
  if (String(error.code ?? "") === "23503") return true;
  const lower = String(error.message ?? "").toLowerCase();
  return (
    lower.includes("foreign key") ||
    lower.includes("violates foreign key constraint")
  );
}

export const INCIDENT_TREATMENT_OPTIONS = [
  "None",
  "First Aid",
  "Doctor or Clinic",
  "Hospital",
] as const;

export type IncidentTreatmentDetails = (typeof INCIDENT_TREATMENT_OPTIONS)[number];

export const INCIDENT_STATUS_OPTIONS = [
  "new",
  "under_investigation",
  "closed",
] as const;

export type IncidentStatus = (typeof INCIDENT_STATUS_OPTIONS)[number];

export type IncidentReportRecord = {
  id: string;
  reference_number: string;
  submitted_by_id: string | null;
  submitted_by_name: string | null;
  incident_date_time: string;
  project_id: string | null;
  project_name: string | null;
  injured_worker_id: string | null;
  injured_worker_name: string | null;
  injury_details: string | null;
  treatment_details: IncidentTreatmentDetails;
  treating_person_id: string | null;
  treating_person_name: string | null;
  offsite_treatment_location: string | null;
  what_occurred: string;
  incident_location_details: string;
  treatment_given: string | null;
  witness_ids: string[];
  witness_names: string[];
  immediate_corrective_action_required: boolean;
  is_notifiable_under_whs: boolean;
  what_caused_to_go_wrong: string | null;
  what_could_have_prevented: string | null;
  recommendations_to_prevent: string | null;
  medical_certificate_urls: string[];
  submitter_signature_url: string | null;
  status: IncidentStatus;
  is_read_admin: boolean;
  created_at: string;
  updated_at: string;
};

export type IncidentReportSubmitInput = {
  submittedById: string;
  submittedByName: string;
  incidentDateTime: string;
  projectId: string;
  projectName: string;
  injuredWorkerId?: string | null;
  injuredWorkerName?: string | null;
  injuryDetails?: string | null;
  treatmentDetails: IncidentTreatmentDetails;
  treatingPersonId?: string | null;
  treatingPersonName?: string | null;
  offsiteTreatmentLocation?: string | null;
  whatOccurred: string;
  incidentLocationDetails: string;
  treatmentGiven?: string | null;
  witnessIds: string[];
  witnessNames: string[];
  immediateCorrectiveActionRequired: boolean;
  isNotifiableUnderWhs: boolean;
  whatCausedToGoWrong?: string | null;
  whatCouldHavePrevented?: string | null;
  recommendationsToPrevent?: string | null;
  medicalCertificateUrls: string[];
  submitterSignatureUrl: string;
};

export type IncidentProjectOption = { id: string; name: string };

function asStringArray(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value.map((item) => String(item).trim()).filter(Boolean);
  }
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed) return [];
    try {
      const parsed = JSON.parse(trimmed) as unknown;
      if (Array.isArray(parsed)) {
        return parsed.map((item) => String(item).trim()).filter(Boolean);
      }
    } catch {
      // Postgres array literal: {a,b,c}
      if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
        return trimmed
          .slice(1, -1)
          .split(",")
          .map((part) => part.trim().replace(/^"|"$/g, ""))
          .filter(Boolean);
      }
    }
  }
  return [];
}

export function sanitizeUuidArray(values: unknown): string[] {
  return asStringArray(values).filter((value) => UUID_RE.test(value));
}

export function sanitizeTextArray(values: unknown): string[] {
  return asStringArray(values);
}

export function formatIncidentTableError(error: unknown): string {
  const normalized = toSupabaseRequestError(
    typeof error === "string"
      ? error
      : error && typeof error === "object" && "message" in error
        ? {
            message: String((error as { message?: unknown }).message ?? ""),
            code:
              "code" in error
                ? String((error as { code?: unknown }).code ?? "")
                : "",
            details:
              "details" in error
                ? String((error as { details?: unknown }).details ?? "")
                : "",
            hint:
              "hint" in error
                ? String((error as { hint?: unknown }).hint ?? "")
                : "",
          }
        : null
  );
  if (!normalized) return "Failed to access incident_reports.";

  if (isSupabaseRelationMissingError(normalized)) {
    return INCIDENT_TABLE_MISSING_MESSAGE;
  }

  const parts = [normalized.message || "Failed to access incident_reports."];
  if (normalized.code) parts.push(`code=${normalized.code}`);
  if (normalized.details) parts.push(`details=${normalized.details}`);
  if (normalized.hint) parts.push(`hint=${normalized.hint}`);
  const message = parts.join(" | ");
  if (message.toLowerCase().includes("incident_reports")) {
    return message;
  }
  return `${message} (table: incident_reports)`;
}

/** Log the raw Supabase/PostgREST error before any UI formatting. */
export function logIncidentSupabaseError(context: string, error: unknown): void {
  console.error(`[incident-reports] ${context}:`, error);
}

function normalizeTreatment(value: unknown): IncidentTreatmentDetails {
  const text = String(value ?? "None").trim();
  return (INCIDENT_TREATMENT_OPTIONS as readonly string[]).includes(text)
    ? (text as IncidentTreatmentDetails)
    : "None";
}

export { normalizeTreatment as sanitizeIncidentTreatment };

function normalizeStatus(value: unknown): IncidentStatus {
  const text = String(value ?? "new");
  return (INCIDENT_STATUS_OPTIONS as readonly string[]).includes(text)
    ? (text as IncidentStatus)
    : "new";
}

export function normalizeIncidentReport(
  row: Record<string, unknown> | null | undefined
): IncidentReportRecord {
  const safe = row && typeof row === "object" ? row : {};
  return {
    id: String(safe.id ?? ""),
    reference_number: String(safe.reference_number ?? "—"),
    submitted_by_id: nullIfBlankUuid(safe.submitted_by_id),
    submitted_by_name: safe.submitted_by_name ? String(safe.submitted_by_name) : null,
    incident_date_time: String(safe.incident_date_time ?? ""),
    project_id: nullIfBlankUuid(safe.project_id),
    project_name: safe.project_name ? String(safe.project_name) : null,
    injured_worker_id: nullIfBlankUuid(safe.injured_worker_id),
    injured_worker_name: safe.injured_worker_name
      ? String(safe.injured_worker_name)
      : null,
    injury_details: safe.injury_details ? String(safe.injury_details) : null,
    treatment_details: normalizeTreatment(safe.treatment_details),
    treating_person_id: nullIfBlankUuid(safe.treating_person_id),
    treating_person_name: safe.treating_person_name
      ? String(safe.treating_person_name)
      : null,
    offsite_treatment_location: safe.offsite_treatment_location
      ? String(safe.offsite_treatment_location)
      : null,
    what_occurred: String(safe.what_occurred ?? ""),
    incident_location_details: String(safe.incident_location_details ?? ""),
    treatment_given: safe.treatment_given ? String(safe.treatment_given) : null,
    witness_ids: sanitizeUuidArray(safe.witness_ids),
    witness_names: sanitizeTextArray(safe.witness_names),
    immediate_corrective_action_required: forceIncidentBoolean(
      safe.immediate_corrective_action_required
    ),
    is_notifiable_under_whs: forceIncidentBoolean(safe.is_notifiable_under_whs),
    what_caused_to_go_wrong: safe.what_caused_to_go_wrong
      ? String(safe.what_caused_to_go_wrong)
      : null,
    what_could_have_prevented: safe.what_could_have_prevented
      ? String(safe.what_could_have_prevented)
      : null,
    recommendations_to_prevent: safe.recommendations_to_prevent
      ? String(safe.recommendations_to_prevent)
      : null,
    medical_certificate_urls: sanitizeTextArray(safe.medical_certificate_urls),
    submitter_signature_url: safe.submitter_signature_url
      ? String(safe.submitter_signature_url)
      : null,
    status: normalizeStatus(safe.status),
    is_read_admin: forceIncidentBoolean(safe.is_read_admin),
    created_at: String(safe.created_at ?? ""),
    updated_at: String(safe.updated_at ?? ""),
  };
}

export function formatIncidentDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export function incidentStatusLabel(status: IncidentStatus): string {
  switch (status) {
    case "under_investigation":
      return "Under Investigation";
    case "closed":
      return "Closed";
    default:
      return "New";
  }
}

export function incidentStatusBadgeClass(status: IncidentStatus): string {
  switch (status) {
    case "closed":
      return "bg-emerald-100 text-emerald-800";
    case "under_investigation":
      return "bg-amber-100 text-amber-900";
    default:
      return "bg-red-100 text-red-800";
  }
}

/** Unread = admin has not reviewed (`is_read_admin = false`). */
export function isIncidentUnread(row: Pick<IncidentReportRecord, "is_read_admin" | "status">): boolean {
  return row.is_read_admin === false;
}

export async function generateIncidentReferenceNumber(
  _client?: unknown
): Promise<string> {
  const stamp = new Date();
  const yyyymmdd = [
    stamp.getFullYear(),
    String(stamp.getMonth() + 1).padStart(2, "0"),
    String(stamp.getDate()).padStart(2, "0"),
  ].join("");
  const suffix = `${String(Date.now()).slice(-4)}${Math.floor(Math.random() * 90 + 10)}`.slice(
    -4
  );
  return `INC-${yyyymmdd}-${suffix}`;
}

export function buildIncidentInsertPayload(
  input: IncidentReportSubmitInput,
  referenceNumber: string
): Record<string, unknown> {
  const witnessIds = sanitizeUuidArray(input.witnessIds ?? []);
  const witnessNames = sanitizeTextArray(input.witnessNames ?? []);
  const medicalUrls = sanitizeTextArray(input.medicalCertificateUrls ?? []);

  // Keys must match public.incident_reports exactly (no camelCase / UI state).
  const payload: Record<string, unknown> = {
    reference_number: referenceNumber,
    submitted_by_id: nullIfBlankUuid(input.submittedById),
    submitted_by_name: input.submittedByName?.trim() || null,
    incident_date_time: input.incidentDateTime,
    project_id: nullIfBlankUuid(input.projectId),
    project_name: input.projectName?.trim() || null,
    injured_worker_id: nullIfBlankUuid(input.injuredWorkerId),
    injured_worker_name: input.injuredWorkerName?.trim() || null,
    injury_details: input.injuryDetails?.trim() || null,
    treatment_details: normalizeTreatment(input.treatmentDetails),
    treating_person_id: nullIfBlankUuid(input.treatingPersonId),
    treating_person_name: input.treatingPersonName?.trim() || null,
    offsite_treatment_location: input.offsiteTreatmentLocation?.trim() || null,
    what_occurred: (input.whatOccurred ?? "").trim(),
    incident_location_details: (input.incidentLocationDetails ?? "").trim(),
    treatment_given: input.treatmentGiven?.trim() || null,
    witness_ids: witnessIds,
    witness_names: witnessNames,
    immediate_corrective_action_required: forceIncidentBoolean(
      input.immediateCorrectiveActionRequired
    ),
    is_notifiable_under_whs: forceIncidentBoolean(input.isNotifiableUnderWhs),
    what_caused_to_go_wrong: input.whatCausedToGoWrong?.trim() || null,
    what_could_have_prevented: input.whatCouldHavePrevented?.trim() || null,
    recommendations_to_prevent: input.recommendationsToPrevent?.trim() || null,
    medical_certificate_urls: medicalUrls,
    submitter_signature_url: input.submitterSignatureUrl?.trim() || null,
    status: "new",
    is_read_admin: false,
  };

  return sanitizeIncidentInsertPayload(payload);
}

/**
 * Strip non-database keys (UI state, previews, camelCase leftovers) and
 * normalize UUID / array / boolean fields so PostgREST never gets "".
 */
export function sanitizeIncidentInsertPayload(
  payload: Record<string, unknown>
): Record<string, unknown> {
  const cleaned: Record<string, unknown> = {};

  for (const key of INCIDENT_REPORT_INSERT_COLUMNS) {
    if (!Object.prototype.hasOwnProperty.call(payload, key)) continue;
    const value = payload[key];

    if (
      key === "witness_ids" ||
      key === "witness_names" ||
      key === "medical_certificate_urls"
    ) {
      cleaned[key] =
        key === "witness_ids"
          ? sanitizeUuidArray(value ?? [])
          : sanitizeTextArray(value ?? []);
      continue;
    }

    if (
      key === "immediate_corrective_action_required" ||
      key === "is_notifiable_under_whs" ||
      key === "is_read_admin"
    ) {
      cleaned[key] = forceIncidentBoolean(value);
      continue;
    }

    if (
      key === "submitted_by_id" ||
      key === "project_id" ||
      key === "injured_worker_id" ||
      key === "treating_person_id"
    ) {
      cleaned[key] = nullIfBlankUuid(value);
      continue;
    }

    if (key === "treatment_details") {
      cleaned[key] = normalizeTreatment(value);
      continue;
    }

    if (key === "status") {
      cleaned[key] = "new";
      continue;
    }

    if (typeof value === "string") {
      const trimmed = value.trim();
      cleaned[key] = trimmed.length > 0 ? trimmed : null;
      continue;
    }

    if (value === undefined) continue;
    cleaned[key] = value;
  }

  // Drop any accidental non-schema keys that slipped onto the object.
  for (const key of Object.keys(payload)) {
    if (!INCIDENT_INSERT_COLUMN_SET.has(key)) {
      // intentionally omitted
    }
  }

  return cleaned;
}

/** Keep only known `incident_reports` insert columns — drop any stray client keys. */
export function pickIncidentReportColumns(
  payload: Record<string, unknown>
): Record<string, unknown> {
  return sanitizeIncidentInsertPayload(payload);
}

/**
 * Insert a row directly into public.incident_reports via the given Supabase client.
 * On PGRST204 (unknown column) or FK 23503, strip/null the offending field and retry
 * so schema drift or foreign-key blocks never hard-fail the worker submission.
 */
export async function insertIncidentReportRow(
  client: { from: (relation: string) => unknown },
  payload: Record<string, unknown>
): Promise<{ report: IncidentReportRecord | null; error: string | null }> {
  let row = sanitizeIncidentInsertPayload(payload);
  const stripped: string[] = [];

  for (let attempt = 0; attempt < 12; attempt += 1) {
    const { data, error } = await fromIncidentReports(client)
      .insert([row])
      .select("*")
      .single();

    if (!error) {
      if (stripped.length > 0) {
        console.warn(
          "[incident-reports] insert succeeded after adjusting columns:",
          stripped
        );
      }
      return {
        report: normalizeIncidentReport(data as Record<string, unknown>),
        error: null,
      };
    }

    logIncidentSupabaseError(
      `insert into incident_reports failed (attempt ${attempt + 1})`,
      error
    );

    const normalized = toSupabaseRequestError(error);
    if (!normalized) {
      return { report: null, error: formatIncidentTableError(error) };
    }

    if (isSupabaseMissingColumnError(normalized)) {
      const missing =
        parseMissingColumnFromError(normalized.message) ||
        parseMissingColumnFromError(normalized.details || "");
      if (!missing || !(missing in row)) {
        return { report: null, error: formatIncidentTableError(error) };
      }
      console.warn(
        `[incident-reports] PGRST204 missing column "${missing}" — stripping and retrying insert`
      );
      stripped.push(missing);
      row = stripMissingColumn(row, missing);
      continue;
    }

    if (isForeignKeyViolation(normalized)) {
      const fkColumn =
        parseForeignKeyColumnFromError(normalized.message) ||
        parseForeignKeyColumnFromError(normalized.details || "");
      if (
        fkColumn &&
        (fkColumn === "submitted_by_id" ||
          fkColumn === "injured_worker_id" ||
          fkColumn === "treating_person_id" ||
          fkColumn === "project_id") &&
        fkColumn in row
      ) {
        console.warn(
          `[incident-reports] FK violation on "${fkColumn}" — setting null and retrying insert`
        );
        stripped.push(`${fkColumn}->null`);
        row = { ...row, [fkColumn]: null };
        continue;
      }
    }

    return { report: null, error: formatIncidentTableError(error) };
  }

  return {
    report: null,
    error: "Failed to insert incident report after stripping unknown columns.",
  };
}

export async function submitIncidentReport(
  input: IncidentReportSubmitInput
): Promise<{ report: IncidentReportRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { report: null, error: "Supabase is not configured." };
  }

  const sessionSubmitterId = await resolveIncidentSubmitterId(input.submittedById);
  const referenceNumber = await generateIncidentReferenceNumber();
  const payload = buildIncidentInsertPayload(
    {
      ...input,
      submittedById: sessionSubmitterId ?? "",
      // Sanitizer turns invalid/empty into null for all UUID fields.
      projectId: nullIfBlankUuid(input.projectId) ?? "",
      injuredWorkerId: nullIfBlankUuid(input.injuredWorkerId),
      treatingPersonId: nullIfBlankUuid(input.treatingPersonId),
    },
    referenceNumber
  );
  return insertIncidentReportRow(supabase, payload);
}

export async function fetchIncidentReports(options?: {
  status?: IncidentStatus | "all";
  unreadOnly?: boolean;
}): Promise<{ reports: IncidentReportRecord[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { reports: [], error: "Supabase is not configured." };
  }

  let query = fromIncidentReports(supabase)
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }
  if (options?.unreadOnly) {
    query = query.eq("is_read_admin", false);
  }

  const { data, error } = await query;
  if (error) {
    logIncidentSupabaseError("fetch incident_reports failed", error);
    return { reports: [], error: formatIncidentTableError(error) };
  }

  const reports = ((data ?? []) as Record<string, unknown>[]).map(normalizeIncidentReport);
  return { reports, error: null };
}

export async function countUnreadIncidentReports(): Promise<number> {
  if (!isSupabaseConfigured()) return 0;

  const { count, error } = await fromIncidentReports(supabase)
    .select("id", { count: "exact", head: true })
    .eq("is_read_admin", false);

  if (error) {
    console.warn("[incident-reports] unread count failed:", formatIncidentTableError(error));
    return 0;
  }

  return count ?? 0;
}

export async function updateIncidentReportAdmin(
  id: string,
  updates: {
    status?: IncidentStatus;
    is_read_admin?: boolean;
  }
): Promise<{ report: IncidentReportRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { report: null, error: "Supabase is not configured." };
  }

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.is_read_admin !== undefined) payload.is_read_admin = updates.is_read_admin;

  const { data, error } = await fromIncidentReports(supabase)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    logIncidentSupabaseError("update incident_reports failed", error);
    return { report: null, error: formatIncidentTableError(error) };
  }

  return {
    report: normalizeIncidentReport(data as Record<string, unknown>),
    error: null,
  };
}

export async function fetchIncidentProjectOptions(
  seedProjects: DbProject[] = []
): Promise<IncidentProjectOption[]> {
  const byId = new Map<string, IncidentProjectOption>();
  for (const project of seedProjects) {
    if (!project.id) continue;
    byId.set(project.id, {
      id: project.id,
      name: project.name || project.project_name || "Project",
    });
  }

  try {
    const projects = await fetchProjects();
    for (const project of projects) {
      if (!project.id || project.is_archived) continue;
      byId.set(project.id, {
        id: project.id,
        name: project.name || project.project_name || "Project",
      });
    }
  } catch {
    // Keep seed projects.
  }

  return [...byId.values()].sort((a, b) => a.name.localeCompare(b.name));
}

export function workerOptionLabel(worker: {
  id?: string | null;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  worker_name?: string | null;
} | null | undefined): string {
  if (!worker) return "Worker";
  try {
    return getWorkerDisplayName(worker, "Worker");
  } catch {
    return "Worker";
  }
}

export function buildIncidentCsv(reports: IncidentReportRecord[]): string {
  const headers = [
    "Reference",
    "Date/Time",
    "Project",
    "Injured Worker",
    "Treatment",
    "Notifiable",
    "Submitted By",
    "Status",
    "What Occurred",
  ];
  const lines = [headers.join(",")];
  for (const row of reports) {
    if (!row) continue;
    const cells = [
      row.reference_number || "",
      row.incident_date_time || "",
      row.project_name ?? "",
      row.injured_worker_name ?? "",
      row.treatment_details || "None",
      row.is_notifiable_under_whs ? "Yes" : "No",
      row.submitted_by_name ?? "",
      incidentStatusLabel(row.status),
      row.what_occurred || "",
    ].map((cell) => `"${String(cell ?? "").replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
