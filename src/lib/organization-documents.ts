import { supabase, isSupabaseConfigured, fetchAuthenticatedWorkerById } from "./supabase";
import {
  filterRowsByOrganisation,
  isAPlusOrganisationId,
  isDemoOrganisationScopeBlocked,
  isOrganisationColumnMissing,
  resolveActiveOrganisationId,
  stampOrganisationId,
  withOrganisationScope,
} from "./tenant-scope";
import {
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { normalizeCalendarStateCode } from "./worker-state-region";

const DOCUMENTS_TABLE = "organization_documents";

const MISSING_TABLE_MESSAGE =
  "Documents table is missing. Run migration 162_organization_documents.sql in Supabase.";

export const DOCUMENT_VISIBILITY_SCOPES = ["company_wide", "state_specific"] as const;
export type DocumentVisibilityScope = (typeof DOCUMENT_VISIBILITY_SCOPES)[number];

export const DOCUMENT_VISIBILITY_STATES = [
  "NSW",
  "QLD",
  "VIC",
  "ACT",
  "WA",
  "SA",
  "TAS",
  "NT",
] as const;
export type DocumentVisibilityState = (typeof DOCUMENT_VISIBILITY_STATES)[number];

export interface OrganizationDocument {
  id: string;
  name: string;
  file_url: string;
  file_name: string | null;
  file_size: number | null;
  scope: DocumentVisibilityScope;
  state: string | null;
  created_at: string;
  updated_at: string;
}

const DOCUMENT_SELECT =
  "id, name, file_url, file_name, file_size, scope, state, created_at, updated_at, organisation_id";
const DOCUMENT_SELECT_NO_SCOPE =
  "id, name, file_url, file_name, file_size, created_at, updated_at, organisation_id";
const DOCUMENT_SELECT_MINIMAL =
  "id, name, file_url, file_name, file_size, created_at, updated_at";

function formatDocumentsError(error: { message?: string; code?: string }): string {
  const normalized = toSupabaseRequestError({
    message: error.message ?? "",
    code: error.code ?? "",
    details: "",
    hint: "",
  });
  if (
    isSupabaseRelationMissingError(normalized) ||
    isSupabaseTableUnavailableError(normalized) ||
    isSupabaseSchemaCacheError(normalized)
  ) {
    return MISSING_TABLE_MESSAGE;
  }
  return error.message || "Failed to save organisation document.";
}

export function normalizeDocumentScope(
  value: string | null | undefined
): DocumentVisibilityScope {
  return String(value ?? "").trim().toLowerCase() === "state_specific"
    ? "state_specific"
    : "company_wide";
}

export function normalizeDocumentState(
  value: string | null | undefined
): DocumentVisibilityState | null {
  const code = normalizeCalendarStateCode(value);
  if (!code) return null;
  return (DOCUMENT_VISIBILITY_STATES as readonly string[]).includes(code)
    ? (code as DocumentVisibilityState)
    : null;
}

function normalizeDocumentRow(row: Record<string, unknown>): OrganizationDocument {
  const scope = normalizeDocumentScope(
    typeof row.scope === "string" ? row.scope : null
  );
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    file_url: String(row.file_url ?? ""),
    file_name: row.file_name ? String(row.file_name) : null,
    file_size:
      row.file_size == null || row.file_size === ""
        ? null
        : Number(row.file_size),
    scope,
    state: scope === "state_specific" ? normalizeDocumentState(String(row.state ?? "")) : null,
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function documentVisibleToWorker(
  document: OrganizationDocument,
  workerState: string | null
): boolean {
  if (document.scope !== "state_specific") return true;
  if (!workerState || !document.state) return false;
  return document.state === workerState;
}

export async function resolveWorkerDocumentState(
  workerId: string | null | undefined
): Promise<string | null> {
  const id = workerId?.trim();
  if (!id || !isSupabaseConfigured()) return null;

  const worker = await fetchAuthenticatedWorkerById(id);
  const direct = normalizeDocumentState(worker?.state ?? null);
  if (direct) return direct;

  const projectIds = [
    ...new Set(
      [
        ...(Array.isArray(worker?.assigned_project_ids) ? worker.assigned_project_ids : []),
        worker?.assigned_project_id ?? "",
      ]
        .map((value) => String(value ?? "").trim())
        .filter(Boolean)
    ),
  ];
  if (projectIds.length === 0) return null;

  const { data } = await supabase
    .from("projects")
    .select("id, state, location")
    .in("id", projectIds);
  for (const row of data ?? []) {
    const record = row as unknown as Record<string, unknown>;
    const inferred =
      normalizeDocumentState(String(record.state ?? "")) ||
      normalizeDocumentState(String(record.location ?? ""));
    if (inferred) return inferred;
  }
  return null;
}

export async function fetchOrganizationDocuments(options?: {
  workerState?: string | null;
  workerScoped?: boolean;
}): Promise<{
  data: OrganizationDocument[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }

  const orgId = resolveActiveOrganisationId();
  const workerState = options?.workerScoped
    ? normalizeDocumentState(options.workerState)
    : null;
  let select = DOCUMENT_SELECT;
  let query = supabase.from(DOCUMENTS_TABLE).select(select);
  query = withOrganisationScope(query, orgId);
  if (options?.workerScoped) {
    query = workerState
      ? query.or(
          `scope.eq.company_wide,scope.is.null,and(scope.eq.state_specific,state.eq.${workerState})`
        )
      : query.or("scope.eq.company_wide,scope.is.null");
  }
  let { data, error } = await query.order("created_at", { ascending: false });

  if (error && (parseMissingColumnFromError(error.message) === "scope" || /scope|state/i.test(error.message))) {
    select = DOCUMENT_SELECT_NO_SCOPE;
    let retry = supabase.from(DOCUMENTS_TABLE).select(select);
    retry = withOrganisationScope(retry, orgId);
    ({ data, error } = await retry.order("created_at", { ascending: false }));
  }

  if (error && isDemoOrganisationScopeBlocked(error.message, orgId)) {
    return { data: [], error: null };
  }

  if (error && isOrganisationColumnMissing(error.message)) {
    const retry = await supabase
      .from(DOCUMENTS_TABLE)
      .select(DOCUMENT_SELECT_MINIMAL)
      .order("created_at", { ascending: false });
    data = retry.data as typeof data;
    error = retry.error;
    if (error) {
      return { data: [], error: formatDocumentsError(error) };
    }
    if (!isAPlusOrganisationId(orgId)) {
      return { data: [], error: null };
    }
  } else if (error) {
    return { data: [], error: formatDocumentsError(error) };
  }

  let documents = filterRowsByOrganisation(data ?? [], orgId).map((row) =>
    normalizeDocumentRow(row as unknown as Record<string, unknown>)
  );

  if (options?.workerScoped) {
    documents = documents.filter((document) =>
      documentVisibleToWorker(document, options.workerState ?? null)
    );
  }

  return { data: documents, error: null };
}

async function writeDocumentWithColumnRetry(
  mode: "insert" | "update",
  payload: Record<string, unknown>,
  id?: string
): Promise<{ data: OrganizationDocument | null; error: string | null }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 12; attempt += 1) {
    const query =
      mode === "insert"
        ? supabase.from(DOCUMENTS_TABLE).insert(current)
        : supabase.from(DOCUMENTS_TABLE).update(current).eq("id", id ?? "");
    const { data, error } = await query
      .select(DOCUMENT_SELECT_MINIMAL)
      .maybeSingle();
    if (!error) {
      return {
        data: data ? normalizeDocumentRow(data as unknown as Record<string, unknown>) : null,
        error: null,
      };
    }
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { data: null, error: formatDocumentsError(error) };
  }
  return { data: null, error: "Could not save organisation document." };
}

export async function insertOrganizationDocument(input: {
  id: string;
  name: string;
  file_url: string;
  file_name?: string | null;
  file_size?: number | null;
  scope?: DocumentVisibilityScope | null;
  state?: string | null;
}): Promise<{ data: OrganizationDocument | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const scope = normalizeDocumentScope(input.scope);
  const state = scope === "state_specific" ? normalizeDocumentState(input.state) : null;
  if (scope === "state_specific" && !state) {
    return { data: null, error: "Select an Australian state for state-specific documents." };
  }

  const now = new Date().toISOString();
  const payload = stampOrganisationId({
    id: input.id,
    name: input.name.trim(),
    file_url: input.file_url,
    file_name: input.file_name?.trim() || null,
    file_size: input.file_size ?? null,
    scope,
    state,
    created_at: now,
    updated_at: now,
  });

  return writeDocumentWithColumnRetry("insert", payload);
}

export async function updateOrganizationDocument(
  id: string,
  input: {
    name: string;
    file_url?: string;
    file_name?: string | null;
    file_size?: number | null;
    scope?: DocumentVisibilityScope | null;
    state?: string | null;
  }
): Promise<{ data: OrganizationDocument | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const payload: Record<string, unknown> = {
    name: input.name.trim(),
    updated_at: new Date().toISOString(),
  };
  if (input.file_url !== undefined) payload.file_url = input.file_url;
  if (input.file_name !== undefined) payload.file_name = input.file_name?.trim() || null;
  if (input.file_size !== undefined) payload.file_size = input.file_size;
  if (input.scope !== undefined) {
    const scope = normalizeDocumentScope(input.scope);
    payload.scope = scope;
    payload.state = scope === "state_specific" ? normalizeDocumentState(input.state) : null;
    if (scope === "state_specific" && !payload.state) {
      return { data: null, error: "Select an Australian state for state-specific documents." };
    }
  }

  return writeDocumentWithColumnRetry("update", payload, id);
}

export async function deleteOrganizationDocument(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase.from(DOCUMENTS_TABLE).delete().eq("id", id);
  if (error) return { error: formatDocumentsError(error) };
  return { error: null };
}

export function formatDocumentScopeLabel(document: OrganizationDocument): string {
  if (document.scope === "state_specific") {
    return document.state ? `State specific · ${document.state}` : "State specific";
  }
  return "Company wide";
}

export function formatDocumentAddedDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatDocumentFileSize(bytes: number | null | undefined): string {
  if (bytes == null || Number.isNaN(Number(bytes))) return "—";
  const size = Number(bytes);
  if (size < 1024) return `${size} B`;
  if (size < 1024 * 1024) return `${Math.round((size / 1024) * 10) / 10} KB`;
  return `${Math.round((size / (1024 * 1024)) * 10) / 10} MB`;
}
