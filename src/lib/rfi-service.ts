import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchProjects, getProjectDisplayName, type DbProject } from "./project-resolver";
import { uploadSignature } from "./prestart-upload";
import {
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";
import { SITE_PROJECTS } from "./projects";
import { nullIfBlank, nullIfBlankDate, sanitizeWritePayload } from "./form-payload-utils";

export const RFIS_TABLE = "rfis";
const FORM_WORKER_ASSIGNMENTS_TABLE = "form_worker_assignments";

export type RfiStatus = "Open" | "Pending" | "Resolved" | "Closed";
export type RfiPriority = "Low" | "Medium" | "High" | "Urgent";

export const RFI_PRIORITY_OPTIONS: RfiPriority[] = [
  "Low",
  "Medium",
  "High",
  "Urgent",
];

export const RFI_CATEGORY_OPTIONS = [
  "Design",
  "Site Instructions",
  "Materials",
  "Safety",
  "Programme",
  "Quality",
  "Other",
] as const;

export const RFI_DISCIPLINE_OPTIONS = [
  "Civil",
  "Structural",
  "Mechanical",
  "Electrical",
  "Hydraulic",
  "Architectural",
  "General",
] as const;

export interface RfiAttachment {
  name: string;
  url: string;
  type?: string | null;
}

export interface RfiRecord {
  id: string;
  rfi_number: string;
  title: string;
  subject: string;
  description: string;
  project_id: string | null;
  project_name: string | null;
  zone_area: string | null;
  category: string | null;
  discipline: string | null;
  status: RfiStatus;
  priority: RfiPriority;
  requested_by_id: string;
  requested_by_name: string;
  raised_by: string;
  request_signature_url: string | null;
  assigned_to_id: string | null;
  assigned_to_name: string | null;
  assigned_at: string | null;
  due_date: string | null;
  action_response: string | null;
  response_resolution: string | null;
  action_required: string | null;
  action_signature_url: string | null;
  completed_at: string | null;
  close_out_date: string | null;
  closed_by: string | null;
  attachments: RfiAttachment[];
  document_url: string | null;
  comments: string | null;
  date_raised: string | null;
  created_at: string;
  updated_at: string;
}

export type RfiRegisterFilter =
  | "all"
  | "open"
  | "pending"
  | "resolved"
  | "closed";

export interface RfiProjectOption {
  id: string;
  name: string;
}

const LOCAL_RFIS_KEY = "sitebolt_rfis_local";

const FALLBACK_RFI_PROJECTS: RfiProjectOption[] = [
  { id: "project-1", name: "Project 1" },
  { id: "project-2", name: "Project 2" },
  { id: "project-3", name: "Project 3 - Sydney Metro" },
];

function stripUndefinedFields(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined) {
      next[key] = value;
    }
  }
  return next;
}

function omitFields(row: Record<string, unknown>, fields: string[]): Record<string, unknown> {
  const next = { ...row };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

function dedupeProjectOptions(options: RfiProjectOption[]): RfiProjectOption[] {
  const seen = new Set<string>();
  const result: RfiProjectOption[] = [];
  for (const option of options) {
    const key = option.id.trim() || option.name.trim();
    if (!key || seen.has(key)) continue;
    seen.add(key);
    result.push(option);
  }
  return result.sort((a, b) => a.name.localeCompare(b.name));
}

function firstNonEmptyString(...values: unknown[]): string {
  for (const value of values) {
    const text = String(value ?? "").trim();
    if (text) return text;
  }
  return "";
}

function normalizeSignatureValue(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function formatRfiCode(sequence: number): string {
  const safe =
    Number.isFinite(sequence) && sequence > 0 ? Math.floor(sequence) : 1;
  return `RFI-${String(safe).padStart(4, "0")}`;
}

function normalizeRfiFormattedCode(value: unknown, fallbackSequence = 1): string {
  const text = String(value ?? "").trim();
  const match = text.match(/RFI-(\d+)/i) ?? text.match(/(\d+)/);
  if (match) {
    const num = Number.parseInt(match[1], 10);
    if (Number.isFinite(num) && num > 0) {
      return formatRfiCode(num);
    }
  }
  return formatRfiCode(fallbackSequence);
}

function rfiMutationTimestamp(): string {
  return new Date().toISOString();
}

function ensureRfiUpdatedAt(payload: Record<string, unknown>): Record<string, unknown> {
  return {
    ...payload,
    updated_at: rfiMutationTimestamp(),
  };
}

function normalizeRfiPriority(value: unknown): RfiPriority {
  const priority = String(value ?? "Medium").trim();
  if (priority === "Low" || priority === "High" || priority === "Urgent") {
    return priority;
  }
  return "Medium";
}

function normalizeRfiStatus(value: unknown): RfiStatus {
  const status = String(value ?? "Open").trim();
  if (status === "Outstanding" || status === "Open") return "Open";
  if (status === "Assigned" || status === "Pending") return "Pending";
  if (status === "Resolved") return "Resolved";
  if (status === "Completed" || status === "Closed") return "Closed";
  return "Open";
}

function normalizeAttachments(raw: unknown): RfiAttachment[] {
  if (!Array.isArray(raw)) return [];
  const attachments: RfiAttachment[] = [];
  for (const item of raw) {
    if (!item || typeof item !== "object") continue;
    const row = item as Record<string, unknown>;
    const url = String(row.url ?? "").trim();
    if (!url) continue;
    attachments.push({
      name: String(row.name ?? url).trim() || url,
      url,
      type: row.type ? String(row.type) : null,
    });
  }
  return attachments;
}

function mapRfiRow(row: Record<string, unknown>): RfiRecord {
  const title = firstNonEmptyString(row.title, row.subject);
  const description = firstNonEmptyString(row.description, row.request_details, row.details);
  const signatureUrl = firstNonEmptyString(
    row.request_signature_url,
    row.requester_signature_url,
    row.signature_url
  );
  const responseResolution = firstNonEmptyString(
    row.response_resolution,
    row.action_response
  );
  const raisedBy = firstNonEmptyString(row.raised_by, row.requested_by_name, row.worker_name);
  const createdAt = String(row.created_at ?? new Date().toISOString());
  const dateRaised = firstNonEmptyString(
    row.date_raised,
    createdAt.slice(0, 10)
  );

  return {
    id: String(row.id),
    rfi_number: firstNonEmptyString(row.rfi_number, row.rfi_code) || "RFI-0000",
    title,
    subject: title,
    description,
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    zone_area: row.zone_area ? String(row.zone_area) : null,
    category: row.category ? String(row.category) : null,
    discipline: row.discipline ? String(row.discipline) : null,
    status: normalizeRfiStatus(row.status),
    priority: normalizeRfiPriority(row.priority),
    requested_by_id: String(row.requested_by_id ?? ""),
    requested_by_name: String(row.requested_by_name ?? raisedBy ?? "Worker"),
    raised_by: raisedBy || String(row.requested_by_name ?? "Worker"),
    request_signature_url: signatureUrl || null,
    assigned_to_id: row.assigned_to_id ? String(row.assigned_to_id) : null,
    assigned_to_name: row.assigned_to_name ? String(row.assigned_to_name) : null,
    assigned_at: row.assigned_at ? String(row.assigned_at) : null,
    due_date: row.due_date ? String(row.due_date).slice(0, 10) : null,
    action_response: responseResolution || null,
    response_resolution: responseResolution || null,
    action_required: row.action_required ? String(row.action_required) : null,
    action_signature_url: row.action_signature_url
      ? String(row.action_signature_url)
      : null,
    completed_at: row.completed_at ? String(row.completed_at) : null,
    close_out_date: row.close_out_date ? String(row.close_out_date) : null,
    closed_by: row.closed_by ? String(row.closed_by) : null,
    attachments: normalizeAttachments(row.attachments),
    document_url: row.document_url ? String(row.document_url) : null,
    comments: row.comments ? String(row.comments) : null,
    date_raised: dateRaised || null,
    created_at: createdAt,
    updated_at: String(row.updated_at ?? createdAt),
  };
}

function readLocalRfis(): RfiRecord[] {
  if (typeof window === "undefined") return [];
  try {
    const raw = window.localStorage.getItem(LOCAL_RFIS_KEY);
    if (!raw) return [];
    const parsed = JSON.parse(raw) as unknown[];
    return Array.isArray(parsed)
      ? parsed.map((row) => mapRfiRow(row as Record<string, unknown>))
      : [];
  } catch {
    return [];
  }
}

function writeLocalRfis(rows: RfiRecord[]) {
  if (typeof window === "undefined") return;
  window.localStorage.setItem(LOCAL_RFIS_KEY, JSON.stringify(rows));
}

function nextLocalRfiNumber(rows: RfiRecord[]): string {
  const max = rows.reduce((acc, row) => {
    const match = row.rfi_number.match(/(\d+)/);
    const num = match ? Number.parseInt(match[1], 10) : 0;
    return Math.max(acc, num);
  }, 0);
  return formatRfiCode(max + 1);
}

function sortRfisNewestFirst(rows: RfiRecord[]): RfiRecord[] {
  return [...rows].sort(
    (a, b) => new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
  );
}

export function filterRfisForRegister(
  rows: RfiRecord[],
  filter: RfiRegisterFilter,
  projectId?: string | null
): RfiRecord[] {
  let list = rows;
  if (projectId?.trim()) {
    list = list.filter((row) => row.project_id === projectId);
  }
  switch (filter) {
    case "open":
      return list.filter((row) => row.status === "Open");
    case "pending":
      return list.filter((row) => row.status === "Pending");
    case "resolved":
      return list.filter((row) => row.status === "Resolved");
    case "closed":
      return list.filter((row) => row.status === "Closed");
    default:
      return list;
  }
}

export function filterRfisByRegisterOptions(
  rows: RfiRecord[],
  options: {
    status?: RfiRegisterFilter;
    priority?: RfiPriority | "";
    category?: string;
    zoneArea?: string;
    projectId?: string | null;
  }
): RfiRecord[] {
  let list = filterRfisForRegister(rows, options.status ?? "all", options.projectId);

  if (options.priority) {
    list = list.filter((row) => row.priority === options.priority);
  }
  if (options.category?.trim()) {
    list = list.filter((row) => row.category === options.category);
  }
  if (options.zoneArea?.trim()) {
    list = list.filter((row) => row.zone_area === options.zoneArea);
  }

  return list;
}

export function collectRfiFilterOptions(rows: RfiRecord[]): {
  categories: string[];
  zoneAreas: string[];
} {
  const categories = new Set<string>();
  const zoneAreas = new Set<string>();
  for (const row of rows) {
    if (row.category?.trim()) categories.add(row.category.trim());
    if (row.zone_area?.trim()) zoneAreas.add(row.zone_area.trim());
  }
  return {
    categories: [...categories].sort(),
    zoneAreas: [...zoneAreas].sort(),
  };
}

export function parseAttachmentLinks(text: string): RfiAttachment[] {
  return text
    .split("\n")
    .map((line) => line.trim())
    .filter(Boolean)
    .map((line, index) => {
      const [name, url] = line.includes("|")
        ? line.split("|").map((part) => part.trim())
        : [`Attachment ${index + 1}`, line];
      return {
        name: name || `Attachment ${index + 1}`,
        url: url || line,
        type: "link",
      };
    });
}

export function formatRfiDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function rfiStatusBadgeClass(status: RfiStatus): string {
  switch (status) {
    case "Closed":
      return "bg-slate-100 text-slate-800";
    case "Resolved":
      return "bg-emerald-100 text-emerald-800";
    case "Pending":
      return "bg-blue-100 text-blue-800";
    default:
      return "bg-orange-100 text-orange-800";
  }
}

export function rfiPriorityBadgeClass(priority: RfiPriority): string {
  switch (priority) {
    case "Urgent":
      return "bg-red-100 text-red-800";
    case "High":
      return "bg-orange-100 text-orange-800";
    case "Low":
      return "bg-slate-100 text-slate-700";
    default:
      return "bg-amber-100 text-amber-800";
  }
}

/** Active projects for RFI submission — Supabase first, then assignments, then mock list. */
export async function fetchRfiProjectOptions(
  seedProjects: DbProject[] = []
): Promise<RfiProjectOption[]> {
  const collected: RfiProjectOption[] = [];

  for (const project of seedProjects) {
    if (project.id && project.name) {
      collected.push({ id: project.id, name: project.name });
    }
  }

  try {
    const fromDb = await fetchProjects();
    for (const project of fromDb) {
      collected.push({ id: project.id, name: project.name });
    }
  } catch {
    // fall through to other sources
  }

  if (collected.length > 0) {
    const deduped = dedupeProjectOptions(collected);
    if (deduped.length > 0) return deduped;
  }

  if (isSupabaseConfigured()) {
    try {
      const { data, error } = await supabase
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("project_id")
        .not("project_id", "is", null);

      if (!error && data?.length) {
        for (const row of data) {
          const projectId = String((row as { project_id?: string }).project_id ?? "").trim();
          if (!projectId) continue;
          collected.push({
            id: projectId,
            name: getProjectDisplayName(projectId) ?? projectId,
          });
        }
      }
    } catch {
      // fall through
    }

    try {
      const { data, error } = await supabase
        .from(RFIS_TABLE)
        .select("project_id, project_name")
        .not("project_id", "is", null);

      if (!error && data?.length) {
        for (const row of data) {
          const record = row as { project_id?: string; project_name?: string };
          const projectId = String(record.project_id ?? "").trim();
          if (!projectId) continue;
          collected.push({
            id: projectId,
            name:
              String(record.project_name ?? "").trim() ||
              getProjectDisplayName(projectId) ||
              projectId,
          });
        }
      }
    } catch {
      // fall through
    }
  }

  const deduped = dedupeProjectOptions(collected);
  if (deduped.length > 0) return deduped;

  return dedupeProjectOptions([
    ...FALLBACK_RFI_PROJECTS,
    ...SITE_PROJECTS.map((project) => ({
      id: project.slug,
      name: project.name,
    })),
  ]);
}

export async function fetchRfis(options?: {
  filter?: RfiRegisterFilter;
  projectId?: string | null;
}): Promise<{ rfis: RfiRecord[]; error: string | null }> {
  const filter = options?.filter ?? "all";
  const projectId = options?.projectId ?? null;

  if (!isSupabaseConfigured()) {
    return {
      rfis: filterRfisForRegister(readLocalRfis(), filter, projectId),
      error: null,
    };
  }

  try {
    let query = supabase.from(RFIS_TABLE).select("*").order("created_at", { ascending: false });

    if (projectId?.trim()) {
      query = query.eq("project_id", projectId);
    }

    if (filter === "open") {
      query = query.in("status", ["Open", "Outstanding"]);
    } else if (filter === "pending") {
      query = query.in("status", ["Pending", "Assigned"]);
    } else if (filter === "resolved") {
      query = query.eq("status", "Resolved");
    } else if (filter === "closed") {
      query = query.in("status", ["Closed", "Completed"]);
    }

    const { data, error } = await query;

    if (error) {
      return {
        rfis: filterRfisForRegister(readLocalRfis(), filter, projectId),
        error: error.message,
      };
    }

    return {
      rfis: (data ?? []).map((row) => mapRfiRow(row as Record<string, unknown>)),
      error: null,
    };
  } catch (cause) {
    return {
      rfis: filterRfisForRegister(readLocalRfis(), filter, projectId),
      error: cause instanceof Error ? cause.message : "Failed to load RFIs.",
    };
  }
}

export async function fetchWorkerRfis(workerId: string): Promise<{
  assigned: RfiRecord[];
  submitted: RfiRecord[];
  error: string | null;
}> {
  const id = workerId.trim();
  if (!id) {
    return { assigned: [], submitted: [], error: "Worker id is required." };
  }

  if (!isSupabaseConfigured()) {
    const rows = readLocalRfis();
    return {
      assigned: sortRfisNewestFirst(
        rows.filter((row) => row.assigned_to_id === id && row.status === "Pending")
      ),
      submitted: sortRfisNewestFirst(rows.filter((row) => row.requested_by_id === id)),
      error: null,
    };
  }

  try {
    const [assignedResult, submittedResult] = await Promise.all([
      supabase
        .from(RFIS_TABLE)
        .select("*")
        .eq("assigned_to_id", id)
        .eq("status", "Pending")
        .order("assigned_at", { ascending: false }),
      supabase
        .from(RFIS_TABLE)
        .select("*")
        .eq("requested_by_id", id)
        .order("created_at", { ascending: false }),
    ]);

    if (assignedResult.error || submittedResult.error) {
      const rows = readLocalRfis();
      return {
        assigned: sortRfisNewestFirst(
          rows.filter((row) => row.assigned_to_id === id && row.status === "Pending")
        ),
        submitted: sortRfisNewestFirst(rows.filter((row) => row.requested_by_id === id)),
        error: assignedResult.error?.message ?? submittedResult.error?.message ?? null,
      };
    }

    return {
      assigned: (assignedResult.data ?? []).map((row) =>
        mapRfiRow(row as Record<string, unknown>)
      ),
      submitted: (submittedResult.data ?? []).map((row) =>
        mapRfiRow(row as Record<string, unknown>)
      ),
      error: null,
    };
  } catch (cause) {
    const rows = readLocalRfis();
    return {
      assigned: sortRfisNewestFirst(
        rows.filter((row) => row.assigned_to_id === id && row.status === "Pending")
      ),
      submitted: sortRfisNewestFirst(rows.filter((row) => row.requested_by_id === id)),
      error: cause instanceof Error ? cause.message : "Failed to load worker RFIs.",
    };
  }
}

export interface SubmitRfiInput {
  title: string;
  description: string;
  projectId: string | null;
  projectName?: string | null;
  zoneArea?: string | null;
  category?: string | null;
  discipline?: string | null;
  priority?: RfiPriority;
  dueDate?: string | null;
  attachments?: RfiAttachment[];
  documentUrl?: string | null;
  comments?: string | null;
  requestedById: string;
  requestedByName: string;
  requestedByEmail?: string;
  signatureDataUrl: string;
}

function buildRfiInsertPayload(input: {
  rfiNumber: string;
  title: string;
  description: string;
  projectId: string | null;
  projectName: string;
  zoneArea?: string | null;
  category?: string | null;
  discipline?: string | null;
  priority?: RfiPriority;
  dueDate?: string | null;
  attachments?: RfiAttachment[];
  documentUrl?: string | null;
  comments?: string | null;
  requestedById: string;
  requestedByName: string;
  requestedByEmail: string;
  signatureUrl: string;
  now: string;
}): Record<string, unknown> {
  const titleValue = input.title.trim() || "New RFI";
  const detailsValue = input.description.trim() || "";
  const projectName = input.projectName.trim() || "General / Unassigned";
  const signatureValue = normalizeSignatureValue(input.signatureUrl);
  const rfiFormattedCode = normalizeRfiFormattedCode(input.rfiNumber);
  const raisedBy = input.requestedByName.trim() || "Worker";

  return sanitizeWritePayload(
    stripUndefinedFields({
      rfi_number: rfiFormattedCode,
      rfi_code: rfiFormattedCode,
      title: titleValue,
      subject: titleValue,
      description: detailsValue,
      request_details: detailsValue,
      details: detailsValue,
      project_id: input.projectId || null,
      project_name: projectName,
      zone_area: nullIfBlank(input.zoneArea),
      category: nullIfBlank(input.category),
      discipline: nullIfBlank(input.discipline),
      priority: input.priority ?? "Medium",
      due_date: nullIfBlankDate(input.dueDate),
      attachments: input.attachments ?? [],
      document_url: nullIfBlank(input.documentUrl),
      comments: nullIfBlank(input.comments),
      requested_by_id: input.requestedById || null,
      requested_by_name: raisedBy,
      raised_by: raisedBy,
      requested_by_email: nullIfBlank(input.requestedByEmail),
      signature_url: signatureValue,
      request_signature_url: signatureValue,
      requester_signature_url: signatureValue,
      status: "Open",
      date_raised: input.now.slice(0, 10),
      created_at: input.now,
      updated_at: input.now,
    }),
    { requiredTextKeys: ["title", "rfi_number"] }
  );
}

function buildRfiMigrationPayload(
  fullPayload: Record<string, unknown>
): Record<string, unknown> {
  return stripUndefinedFields({
    rfi_number: fullPayload.rfi_number,
    rfi_code: fullPayload.rfi_code ?? fullPayload.rfi_number,
    title: fullPayload.title,
    description: fullPayload.description,
    project_id: fullPayload.project_id,
    project_name: fullPayload.project_name,
    requested_by_id: fullPayload.requested_by_id,
    requested_by_name: fullPayload.requested_by_name,
    request_signature_url: normalizeSignatureValue(
      String(fullPayload.request_signature_url ?? fullPayload.signature_url ?? "")
    ),
    status: fullPayload.status,
    created_at: fullPayload.created_at,
    updated_at: fullPayload.updated_at ?? rfiMutationTimestamp(),
  });
}

function buildRfiAlternateSchemaPayload(
  fullPayload: Record<string, unknown>
): Record<string, unknown> {
  return stripUndefinedFields({
    rfi_number: fullPayload.rfi_number,
    rfi_code: fullPayload.rfi_code ?? fullPayload.rfi_number,
    subject: fullPayload.subject,
    request_details: fullPayload.request_details,
    details: fullPayload.details,
    project_id: fullPayload.project_id,
    project_name: fullPayload.project_name,
    requested_by_id: fullPayload.requested_by_id,
    requested_by_name: fullPayload.requested_by_name,
    requested_by_email: fullPayload.requested_by_email,
    signature_url: normalizeSignatureValue(String(fullPayload.signature_url ?? "")),
    requester_signature_url: normalizeSignatureValue(
      String(fullPayload.requester_signature_url ?? fullPayload.signature_url ?? "")
    ),
    status: fullPayload.status,
    created_at: fullPayload.created_at,
    updated_at: fullPayload.updated_at ?? rfiMutationTimestamp(),
  });
}

async function insertRfiRow(
  payload: Record<string, unknown>
): Promise<{ data: RfiRecord | null; error: SupabaseRequestError | null }> {
  const { data, error } = await supabase
    .from(RFIS_TABLE)
    .insert(ensureRfiUpdatedAt(payload))
    .select("*")
    .single();

  if (error) {
    return { data: null, error: toSupabaseRequestError(error) };
  }

  return { data: mapRfiRow(data as Record<string, unknown>), error: null };
}

async function updateRfiRow(
  rfiId: string,
  payload: Record<string, unknown>
): Promise<{ data: RfiRecord | null; error: SupabaseRequestError | null }> {
  const { data, error } = await supabase
    .from(RFIS_TABLE)
    .update(ensureRfiUpdatedAt(payload))
    .eq("id", rfiId)
    .select("*")
    .single();

  if (error) {
    return { data: null, error: toSupabaseRequestError(error) };
  }

  return { data: mapRfiRow(data as Record<string, unknown>), error: null };
}

async function insertRfiResilient(
  fullPayload: Record<string, unknown>
): Promise<{ rfi: RfiRecord | null; error: string | null }> {
  const attempts: Record<string, unknown>[] = [
    fullPayload,
    buildRfiMigrationPayload(fullPayload),
    buildRfiAlternateSchemaPayload(fullPayload),
    stripUndefinedFields({
      ...omitFields(buildRfiMigrationPayload(fullPayload), ["rfi_number"]),
      rfi_code: normalizeRfiFormattedCode(
        fullPayload.rfi_code ?? fullPayload.rfi_number
      ),
    }),
    omitFields(fullPayload, [
      "subject",
      "request_details",
      "details",
      "requested_by_email",
      "signature_url",
      "requester_signature_url",
      "rfi_code",
    ]),
  ];

  let lastError: SupabaseRequestError | null = null;

  for (const payload of attempts) {
    const sanitized = stripUndefinedFields(payload);
    const result = await insertRfiRow(sanitized);
    if (result.data) {
      return { rfi: result.data, error: null };
    }

    lastError = result.error;
    if (!isSupabaseSchemaOrConstraintError(result.error)) {
      break;
    }
  }

  return {
    rfi: null,
    error: lastError?.message ?? "Failed to submit RFI.",
  };
}

export async function submitRfi(
  input: SubmitRfiInput
): Promise<{ rfi: RfiRecord | null; error: string | null }> {
  const title = input.title.trim();
  const description = input.description.trim();
  if (!title || !description) {
    return { rfi: null, error: "Title and description are required." };
  }
  if (!input.signatureDataUrl.trim()) {
    return { rfi: null, error: "Signature is required." };
  }

  const now = rfiMutationTimestamp();
  const projectName =
    input.projectName?.trim() ||
    (input.projectId ? getProjectDisplayName(input.projectId) : null) ||
    "General / Unassigned";

  const signatureUrl =
    (await uploadSignature(
      input.signatureDataUrl,
      `rfi/submit/${input.requestedById}/${Date.now()}-signature.png`
    )) || input.signatureDataUrl.trim();

  if (!isSupabaseConfigured()) {
    const rows = readLocalRfis();
    const rfi: RfiRecord = {
      id: `local-rfi-${Date.now()}`,
      rfi_number: nextLocalRfiNumber(rows),
      title,
      subject: title,
      description,
      project_id: input.projectId,
      project_name: projectName,
      zone_area: input.zoneArea?.trim() || null,
      category: input.category?.trim() || null,
      discipline: input.discipline?.trim() || null,
      status: "Open",
      priority: input.priority ?? "Medium",
      requested_by_id: input.requestedById,
      requested_by_name: input.requestedByName,
      raised_by: input.requestedByName,
      request_signature_url: signatureUrl,
      assigned_to_id: null,
      assigned_to_name: null,
      assigned_at: null,
      due_date: input.dueDate ?? null,
      action_response: null,
      response_resolution: null,
      action_required: null,
      action_signature_url: null,
      completed_at: null,
      close_out_date: null,
      closed_by: null,
      attachments: input.attachments ?? [],
      document_url: input.documentUrl?.trim() || null,
      comments: input.comments?.trim() || null,
      date_raised: now.slice(0, 10),
      created_at: now,
      updated_at: now,
    };
    writeLocalRfis([rfi, ...rows]);
    return { rfi, error: null };
  }

  try {
    const { count } = await supabase.from(RFIS_TABLE).select("*", { count: "exact", head: true });
    const rfiNumber = formatRfiCode((count ?? 0) + 1);

    const fullPayload = buildRfiInsertPayload({
      rfiNumber,
      title,
      description,
      projectId: input.projectId,
      projectName,
      zoneArea: input.zoneArea,
      category: input.category,
      discipline: input.discipline,
      priority: input.priority,
      dueDate: input.dueDate,
      attachments: input.attachments,
      documentUrl: input.documentUrl,
      comments: input.comments,
      requestedById: input.requestedById,
      requestedByName: input.requestedByName,
      requestedByEmail: input.requestedByEmail?.trim() ?? "",
      signatureUrl,
      now,
    });

    return await insertRfiResilient(fullPayload);
  } catch (cause) {
    return {
      rfi: null,
      error: cause instanceof Error ? cause.message : "Failed to submit RFI.",
    };
  }
}

export async function assignRfi(input: {
  rfiId: string;
  assignedToId: string;
  assignedToName: string;
}): Promise<{ rfi: RfiRecord | null; error: string | null }> {
  const now = rfiMutationTimestamp();
  const payload = {
    status: "Pending" as const,
    assigned_to_id: input.assignedToId,
    assigned_to_name: input.assignedToName,
    assigned_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured()) {
    const rows = readLocalRfis();
    const index = rows.findIndex((row) => row.id === input.rfiId);
    if (index < 0) return { rfi: null, error: "RFI not found." };
    rows[index] = { ...rows[index], ...payload };
    writeLocalRfis(rows);
    return { rfi: rows[index], error: null };
  }

  const result = await updateRfiRow(input.rfiId, payload);

  if (result.error || !result.data) {
    return { rfi: null, error: result.error?.message ?? "Failed to assign RFI." };
  }

  return { rfi: result.data, error: null };
}

export async function completeRfi(input: {
  rfiId: string;
  actionResponse: string;
  signatureDataUrl: string;
}): Promise<{ rfi: RfiRecord | null; error: string | null }> {
  const actionResponse = input.actionResponse.trim();
  if (!actionResponse) {
    return { rfi: null, error: "Response is required." };
  }
  if (!input.signatureDataUrl.trim()) {
    return { rfi: null, error: "Signature is required." };
  }

  const now = rfiMutationTimestamp();
  const signatureUrl = await uploadSignature(
    input.signatureDataUrl,
    `rfi/complete/${input.rfiId}/${Date.now()}-signature.png`
  );

  const payload = {
    status: "Resolved" as const,
    action_response: actionResponse,
    response_resolution: actionResponse,
    action_signature_url: signatureUrl,
    completed_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured()) {
    const rows = readLocalRfis();
    const index = rows.findIndex((row) => row.id === input.rfiId);
    if (index < 0) return { rfi: null, error: "RFI not found." };
    rows[index] = { ...rows[index], ...payload };
    writeLocalRfis(rows);
    return { rfi: rows[index], error: null };
  }

  const result = await updateRfiRow(input.rfiId, payload);

  if (result.error || !result.data) {
    return { rfi: null, error: result.error?.message ?? "Failed to complete RFI." };
  }

  return { rfi: result.data, error: null };
}

export async function closeOutRfi(input: {
  rfiId: string;
  responseResolution: string;
  actionRequired: string;
  closeOutDate: string;
  closedBy: string;
}): Promise<{ rfi: RfiRecord | null; error: string | null }> {
  const responseResolution = input.responseResolution.trim();
  const actionRequired = input.actionRequired.trim();
  const closedBy = input.closedBy.trim();
  const closeOutDate = input.closeOutDate.trim();

  if (!responseResolution) {
    return { rfi: null, error: "Response / resolution is required." };
  }
  if (!closedBy) {
    return { rfi: null, error: "Closed by is required." };
  }
  if (!closeOutDate) {
    return { rfi: null, error: "Close-out date is required." };
  }

  const now = rfiMutationTimestamp();
  const payload = {
    status: "Closed" as const,
    response_resolution: responseResolution,
    action_response: responseResolution,
    action_required: actionRequired || null,
    close_out_date: closeOutDate,
    closed_by: closedBy,
    completed_at: now,
    updated_at: now,
  };

  if (!isSupabaseConfigured()) {
    const rows = readLocalRfis();
    const index = rows.findIndex((row) => row.id === input.rfiId);
    if (index < 0) return { rfi: null, error: "RFI not found." };
    rows[index] = { ...rows[index], ...payload };
    writeLocalRfis(rows);
    return { rfi: rows[index], error: null };
  }

  const result = await updateRfiRow(input.rfiId, payload);
  if (result.error || !result.data) {
    return { rfi: null, error: result.error?.message ?? "Failed to close out RFI." };
  }

  return { rfi: result.data, error: null };
}
