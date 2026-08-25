import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import { supabase } from "@/lib/supabase/client";
import { isSupabaseConfigured } from "@/lib/supabase/env";
import { getWorkerDisplayName } from "@/lib/worker-utils";

export const INCIDENT_REPORTS_TABLE = "incident_reports";

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
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item)).filter(Boolean);
}

function normalizeTreatment(value: unknown): IncidentTreatmentDetails {
  const text = String(value ?? "None");
  return (INCIDENT_TREATMENT_OPTIONS as readonly string[]).includes(text)
    ? (text as IncidentTreatmentDetails)
    : "None";
}

function normalizeStatus(value: unknown): IncidentStatus {
  const text = String(value ?? "new");
  return (INCIDENT_STATUS_OPTIONS as readonly string[]).includes(text)
    ? (text as IncidentStatus)
    : "new";
}

export function normalizeIncidentReport(row: Record<string, unknown>): IncidentReportRecord {
  return {
    id: String(row.id ?? ""),
    reference_number: String(row.reference_number ?? ""),
    submitted_by_id: row.submitted_by_id ? String(row.submitted_by_id) : null,
    submitted_by_name: row.submitted_by_name ? String(row.submitted_by_name) : null,
    incident_date_time: String(row.incident_date_time ?? ""),
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    injured_worker_id: row.injured_worker_id ? String(row.injured_worker_id) : null,
    injured_worker_name: row.injured_worker_name ? String(row.injured_worker_name) : null,
    injury_details: row.injury_details ? String(row.injury_details) : null,
    treatment_details: normalizeTreatment(row.treatment_details),
    treating_person_id: row.treating_person_id ? String(row.treating_person_id) : null,
    treating_person_name: row.treating_person_name
      ? String(row.treating_person_name)
      : null,
    offsite_treatment_location: row.offsite_treatment_location
      ? String(row.offsite_treatment_location)
      : null,
    what_occurred: String(row.what_occurred ?? ""),
    incident_location_details: String(row.incident_location_details ?? ""),
    treatment_given: row.treatment_given ? String(row.treatment_given) : null,
    witness_ids: asStringArray(row.witness_ids),
    witness_names: asStringArray(row.witness_names),
    immediate_corrective_action_required: Boolean(row.immediate_corrective_action_required),
    is_notifiable_under_whs: Boolean(row.is_notifiable_under_whs),
    what_caused_to_go_wrong: row.what_caused_to_go_wrong
      ? String(row.what_caused_to_go_wrong)
      : null,
    what_could_have_prevented: row.what_could_have_prevented
      ? String(row.what_could_have_prevented)
      : null,
    recommendations_to_prevent: row.recommendations_to_prevent
      ? String(row.recommendations_to_prevent)
      : null,
    medical_certificate_urls: asStringArray(row.medical_certificate_urls),
    submitter_signature_url: row.submitter_signature_url
      ? String(row.submitter_signature_url)
      : null,
    status: normalizeStatus(row.status),
    is_read_admin: Boolean(row.is_read_admin),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? ""),
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

export function isIncidentUnread(row: Pick<IncidentReportRecord, "is_read_admin" | "status">): boolean {
  return !row.is_read_admin || row.status === "new";
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
  const now = new Date().toISOString();
  return {
    reference_number: referenceNumber,
    submitted_by_id: input.submittedById || null,
    submitted_by_name: input.submittedByName,
    incident_date_time: input.incidentDateTime,
    project_id: input.projectId || null,
    project_name: input.projectName,
    injured_worker_id: input.injuredWorkerId || null,
    injured_worker_name: input.injuredWorkerName || null,
    injury_details: input.injuryDetails?.trim() || null,
    treatment_details: input.treatmentDetails,
    treating_person_id: input.treatingPersonId || null,
    treating_person_name: input.treatingPersonName || null,
    offsite_treatment_location: input.offsiteTreatmentLocation?.trim() || null,
    what_occurred: input.whatOccurred.trim(),
    incident_location_details: input.incidentLocationDetails.trim(),
    treatment_given: input.treatmentGiven?.trim() || null,
    witness_ids: input.witnessIds,
    witness_names: input.witnessNames,
    immediate_corrective_action_required: input.immediateCorrectiveActionRequired,
    is_notifiable_under_whs: input.isNotifiableUnderWhs,
    what_caused_to_go_wrong: input.whatCausedToGoWrong?.trim() || null,
    what_could_have_prevented: input.whatCouldHavePrevented?.trim() || null,
    recommendations_to_prevent: input.recommendationsToPrevent?.trim() || null,
    medical_certificate_urls: input.medicalCertificateUrls,
    submitter_signature_url: input.submitterSignatureUrl,
    status: "new",
    is_read_admin: false,
    created_at: now,
    updated_at: now,
  };
}

export async function submitIncidentReport(
  input: IncidentReportSubmitInput
): Promise<{ report: IncidentReportRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { report: null, error: "Supabase is not configured." };
  }

  const referenceNumber = await generateIncidentReferenceNumber();
  const payload = buildIncidentInsertPayload(input, referenceNumber);

  const { data, error } = await supabase
    .from(INCIDENT_REPORTS_TABLE)
    .insert([payload])
    .select("*")
    .single();

  if (error) {
    return { report: null, error: error.message };
  }

  return {
    report: normalizeIncidentReport(data as Record<string, unknown>),
    error: null,
  };
}

export async function fetchIncidentReports(options?: {
  status?: IncidentStatus | "all";
  unreadOnly?: boolean;
}): Promise<{ reports: IncidentReportRecord[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { reports: [], error: "Supabase is not configured." };
  }

  let query = supabase
    .from(INCIDENT_REPORTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.status && options.status !== "all") {
    query = query.eq("status", options.status);
  }

  const { data, error } = await query;
  if (error) {
    return { reports: [], error: error.message };
  }

  let reports = ((data ?? []) as Record<string, unknown>[]).map(normalizeIncidentReport);
  if (options?.unreadOnly) {
    reports = reports.filter(isIncidentUnread);
  }
  return { reports, error: null };
}

export async function countUnreadIncidentReports(): Promise<number> {
  const { reports } = await fetchIncidentReports();
  return reports.filter(isIncidentUnread).length;
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

  const { data, error } = await supabase
    .from(INCIDENT_REPORTS_TABLE)
    .update(payload)
    .eq("id", id)
    .select("*")
    .single();

  if (error) {
    return { report: null, error: error.message };
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
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  worker_name?: string | null;
}): string {
  return getWorkerDisplayName(worker, "Worker");
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
    const cells = [
      row.reference_number,
      row.incident_date_time,
      row.project_name ?? "",
      row.injured_worker_name ?? "",
      row.treatment_details,
      row.is_notifiable_under_whs ? "Yes" : "No",
      row.submitted_by_name ?? "",
      incidentStatusLabel(row.status),
      row.what_occurred,
    ].map((cell) => `"${String(cell).replace(/"/g, '""')}"`);
    lines.push(cells.join(","));
  }
  return lines.join("\n");
}
