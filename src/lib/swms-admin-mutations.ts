import type { SupabaseClient } from "@supabase/supabase-js";
import {
  createSwmsSigningToken,
  isValidSwmsId,
  resolveSwmsDocumentDate,
  resolveSwmsDocumentUrl,
  resolveSwmsIsArchived,
  resolveSwmsScope,
  resolveSwmsVersion,
  type SwmsScope,
} from "@/lib/supabase";

type SwmsTable = "swms_documents" | "swms";

export interface AdminSwmsSummary {
  id: string;
  title: string;
  document_date: string;
  file_url: string;
  document_url: string;
  file_name: string | null;
  project_id: string | null;
  swms_scope: SwmsScope;
  version: string;
  is_archived: boolean;
  status: string;
  totalAssigned: number;
  signedCount: number;
  pendingCount: number;
  created_at?: string;
  updated_at?: string;
}

function createSwmsRecordId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

function resolveWorkerDisplayName(row: {
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
}): string {
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  const combined = [row.first_name, row.last_name]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean)
    .join(" ");
  return combined || "Worker";
}

function buildInsertPayload(input: {
  title: string;
  documentDate?: string | null;
  fileUrl: string;
  fileName?: string | null;
  projectId?: string | null;
  swmsScope?: SwmsScope;
  version?: string;
}): Record<string, string | boolean> {
  const selectedDate =
    input.documentDate?.trim() ||
    new Date().toISOString().slice(0, 10);
  const projectId = input.projectId?.trim() || null;
  const scope = input.swmsScope ?? (projectId ? "site_specific" : "company");

  if (scope === "site_specific" && !projectId) {
    throw new Error("project_id is required when swms_scope is site_specific.");
  }

  const payload: Record<string, string | boolean> = {
    title: input.title.trim() || "Untitled SWMS",
    document_date: selectedDate,
    issue_date: selectedDate,
    date: selectedDate,
    file_url: input.fileUrl,
    doc_url: input.fileUrl,
    document_url: input.fileUrl,
    is_archived: false,
    status: "Active",
    swms_scope: scope === "site_specific" ? "site_specific" : "company",
    version: input.version?.trim() || "1.0",
  };

  if (scope === "site_specific" && projectId) payload.project_id = projectId;
  if (input.fileName?.trim()) payload.file_name = input.fileName.trim();

  return payload;
}

async function insertSwmsRowAdmin(
  admin: SupabaseClient,
  table: SwmsTable,
  payload: Record<string, string | boolean>
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  const optionalColumns = [
    "doc_url",
    "document_url",
    "file_name",
    "issue_date",
    "date",
    "is_archived",
    "status",
    "project_id",
    "swms_scope",
    "version",
  ] as const;

  let currentPayload: Record<string, string | boolean> = { ...payload };

  for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
    const { data, error } = await admin
      .from(table)
      .insert([currentPayload])
      .select("*")
      .single();

    if (!error) {
      return { data: (data as Record<string, unknown> | null) ?? null, error: null };
    }

    const missingColumn = optionalColumns.find(
      (field) =>
        field in currentPayload &&
        error.message.toLowerCase().includes(field.toLowerCase()) &&
        (error.message.toLowerCase().includes("does not exist") ||
          error.message.toLowerCase().includes("could not find") ||
          error.message.toLowerCase().includes("schema cache"))
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "Failed to insert SWMS document." };
}

function mapSwmsRow(row: Record<string, unknown>): AdminSwmsSummary {
  const documentUrl = resolveSwmsDocumentUrl(row);
  return {
    id: String(row.id ?? ""),
    title: String(row.title ?? "").trim(),
    document_date: resolveSwmsDocumentDate(row),
    file_url: documentUrl,
    document_url: String(row.document_url ?? documentUrl).trim() || documentUrl,
    file_name: row.file_name ? String(row.file_name) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    swms_scope: resolveSwmsScope(row),
    version: resolveSwmsVersion(row),
    is_archived: resolveSwmsIsArchived(row),
    status: String(row.status ?? "Active"),
    totalAssigned: 0,
    signedCount: 0,
    pendingCount: 0,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export async function fetchSwmsListAdmin(
  admin: SupabaseClient
): Promise<{ swms: AdminSwmsSummary[]; error: string | null }> {
  const byId = new Map<string, AdminSwmsSummary>();

  for (const table of ["swms_documents", "swms"] as const) {
    const { data, error } = await admin.from(table).select("*");
    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("schema cache")) {
        continue;
      }
      return { swms: [], error: error.message };
    }

    for (const row of data ?? []) {
      const mapped = mapSwmsRow(row as Record<string, unknown>);
      if (mapped.id) byId.set(mapped.id, mapped);
    }
  }

  const { data: assignments, error: assignmentError } = await admin
    .from("swms_assignments")
    .select("swms_id, status");

  if (assignmentError) {
    return { swms: [], error: assignmentError.message };
  }

  const counts = new Map<string, { total: number; signed: number }>();
  for (const row of assignments ?? []) {
    const swmsId = String((row as { swms_id?: string }).swms_id ?? "");
    if (!swmsId) continue;
    const current = counts.get(swmsId) ?? { total: 0, signed: 0 };
    current.total += 1;
    if (String((row as { status?: string }).status ?? "") === "Signed") {
      current.signed += 1;
    }
    counts.set(swmsId, current);
  }

  const swms = Array.from(byId.values())
    .map((doc) => {
      const count = counts.get(doc.id) ?? { total: 0, signed: 0 };
      return {
        ...doc,
        totalAssigned: count.total,
        signedCount: count.signed,
        pendingCount: count.total - count.signed,
      };
    })
    .sort((left, right) => right.document_date.localeCompare(left.document_date));

  return { swms, error: null };
}

async function createSwmsAssignmentsAdmin(
  admin: SupabaseClient,
  swmsId: string,
  workerIds: string[]
): Promise<{ error: string | null; created: number }> {
  if (!isValidSwmsId(swmsId) || workerIds.length === 0) {
    return { error: null, created: 0 };
  }

  const uniqueIds = Array.from(new Set(workerIds.map((id) => id.trim()).filter(Boolean)));
  const { data: workers, error: workersError } = await admin
    .from("workers")
    .select("id, full_name, first_name, last_name")
    .in("id", uniqueIds);

  if (workersError) {
    return { error: workersError.message, created: 0 };
  }

  const workerMap = new Map(
    (workers ?? []).map((row) => [String((row as { id: string }).id), row as Record<string, unknown>])
  );

  const { data: existing, error: existingError } = await admin
    .from("swms_assignments")
    .select("assignee_id")
    .eq("swms_id", swmsId)
    .eq("assignee_type", "worker");

  if (existingError) {
    return { error: existingError.message, created: 0 };
  }

  const existingIds = new Set(
    (existing ?? []).map((row) => String((row as { assignee_id?: string }).assignee_id ?? ""))
  );

  const rows: Array<Record<string, string>> = uniqueIds
    .filter((workerId) => !existingIds.has(workerId))
    .map((workerId) => {
      const worker = workerMap.get(workerId);
      const name = worker ? resolveWorkerDisplayName(worker) : "Worker";
      const token = createSwmsSigningToken();
      return {
        swms_id: swmsId,
        assignee_type: "worker",
        assignee_id: workerId,
        worker_id: workerId,
        assignee_name: name,
        worker_name: name,
        name,
        signing_token: token,
        token,
        signature_token: token,
        status: "Pending",
      };
    });

  if (rows.length === 0) {
    return { error: null, created: 0 };
  }

  const optionalColumns = [
    "worker_name",
    "name",
    "token",
    "signature_token",
    "worker_id",
  ] as const;

  let currentRows: Array<Record<string, string>> = rows.map((row) => ({ ...row }));

  for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
    const { error } = await admin.from("swms_assignments").insert(currentRows);
    if (!error) {
      return { error: null, created: currentRows.length };
    }

    const lower = error.message.toLowerCase();
    if (
      lower.includes("duplicate key") ||
      lower.includes("unique constraint") ||
      lower.includes("already exists")
    ) {
      // Concurrent/idempotent assign — treat as skipped, not failure.
      return { error: null, created: 0 };
    }

    const missingColumn = optionalColumns.find(
      (field) =>
        error.message.toLowerCase().includes(field.toLowerCase()) &&
        (error.message.toLowerCase().includes("does not exist") ||
          error.message.toLowerCase().includes("could not find") ||
          error.message.toLowerCase().includes("schema cache"))
    );

    if (missingColumn) {
      currentRows = currentRows.map((row) => {
        const { [missingColumn]: _removed, ...rest } = row;
        return rest;
      });
      continue;
    }

    return { error: error.message, created: 0 };
  }

  return { error: "Failed to create SWMS assignments.", created: 0 };
}

export async function createSwmsDocumentAdmin(
  admin: SupabaseClient,
  input: {
    title: string;
    documentDate?: string | null;
    fileUrl: string;
    fileName?: string | null;
    projectId?: string | null;
    swmsScope?: SwmsScope;
    version?: string;
    allWorkers?: boolean;
    workerIds?: string[];
  }
): Promise<{ swms: AdminSwmsSummary | null; error: string | null }> {
  const payload = buildInsertPayload(input);
  const generatedId = createSwmsRecordId();
  const swmsId = generatedId;

  const primary = await insertSwmsRowAdmin(admin, "swms", { id: swmsId, ...payload });
  let resolvedRow = primary.data;

  if (primary.error) {
    const documentsOnly = await insertSwmsRowAdmin(admin, "swms_documents", {
      id: swmsId,
      ...payload,
    });
    if (documentsOnly.error || !documentsOnly.data) {
      return { swms: null, error: documentsOnly.error ?? primary.error };
    }
    resolvedRow = documentsOnly.data;
  } else {
    await insertSwmsRowAdmin(admin, "swms_documents", { id: swmsId, ...payload });
  }

  let workerIds = input.workerIds ?? [];
  if (input.allWorkers) {
    const { data: allWorkers, error: allWorkersError } = await admin
      .from("workers")
      .select("id")
      .eq("is_subcontractor", false);

    if (allWorkersError) {
      return { swms: null, error: allWorkersError.message };
    }

    workerIds = (allWorkers ?? []).map((row) => String((row as { id: string }).id));
  }

  if (workerIds.length > 0) {
    const assignmentResult = await createSwmsAssignmentsAdmin(admin, swmsId, workerIds);
    if (assignmentResult.error) {
      return { swms: null, error: assignmentResult.error };
    }
  }

  const mapped = mapSwmsRow(resolvedRow ?? { id: swmsId, ...payload });
  const { swms } = await fetchSwmsListAdmin(admin);
  const created = swms.find((row) => row.id === mapped.id) ?? mapped;
  return { swms: created, error: null };
}

export async function updateSwmsDocumentAdmin(
  admin: SupabaseClient,
  id: string,
  input: {
    title?: string;
    documentDate?: string | null;
    fileUrl?: string;
    fileName?: string | null;
  }
): Promise<{ error: string | null }> {
  if (!isValidSwmsId(id)) {
    return { error: "A valid SWMS document id is required." };
  }

  const payload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (input.title !== undefined) payload.title = input.title.trim();
  if (input.documentDate !== undefined) {
    const selectedDate =
      input.documentDate?.trim() || new Date().toISOString().slice(0, 10);
    payload.document_date = selectedDate;
    payload.issue_date = selectedDate;
    payload.date = selectedDate;
  }
  if (input.fileUrl !== undefined) {
    payload.file_url = input.fileUrl;
    payload.doc_url = input.fileUrl;
    payload.document_url = input.fileUrl;
  }
  if (input.fileName !== undefined && input.fileName?.trim()) {
    payload.file_name = input.fileName.trim();
  }

  for (const table of ["swms_documents", "swms"] as const) {
    const { error } = await admin.from(table).update(payload).eq("id", id);
    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("schema cache")) {
        continue;
      }
      return { error: error.message };
    }
  }

  return { error: null };
}

export async function deleteSwmsDocumentAdmin(
  admin: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  if (!isValidSwmsId(id)) {
    return { error: "A valid SWMS document id is required." };
  }

  const { error: assignmentsError } = await admin
    .from("swms_assignments")
    .delete()
    .eq("swms_id", id);

  if (assignmentsError) {
    return { error: assignmentsError.message };
  }

  for (const table of ["swms_documents", "swms"] as const) {
    const { error } = await admin.from(table).delete().eq("id", id);
    if (error) {
      const lower = error.message.toLowerCase();
      if (lower.includes("does not exist") || lower.includes("schema cache")) {
        continue;
      }
      return { error: error.message };
    }
  }

  return { error: null };
}

export async function assignSwmsWorkersAdmin(
  admin: SupabaseClient,
  input: {
    swmsId: string;
    workerIds: string[];
    projectId?: string | null;
  }
): Promise<{ error: string | null; created: number }> {
  if (!isValidSwmsId(input.swmsId)) {
    return { error: "A valid SWMS document id is required.", created: 0 };
  }

  if (input.projectId?.trim()) {
    const { error: projectError } = await admin
      .from("swms_documents")
      .update({ project_id: input.projectId.trim(), updated_at: new Date().toISOString() })
      .eq("id", input.swmsId);

    if (projectError) {
      const lower = projectError.message.toLowerCase();
      if (!lower.includes("does not exist") && !lower.includes("schema cache")) {
        return { error: projectError.message, created: 0 };
      }
    }

    await admin
      .from("swms")
      .update({ project_id: input.projectId.trim(), updated_at: new Date().toISOString() })
      .eq("id", input.swmsId);
  }

  return createSwmsAssignmentsAdmin(admin, input.swmsId, input.workerIds);
}

export async function fetchWorkerSwmsAssignmentsAdmin(
  admin: SupabaseClient,
  workerId: string
): Promise<{
  assignments: Array<Record<string, unknown>>;
  error: string | null;
}> {
  const trimmedWorkerId = workerId.trim();
  if (!trimmedWorkerId) {
    return { assignments: [], error: "Worker id is required." };
  }

  let { data, error } = await admin
    .from("swms_assignments")
    .select("*")
    .or(`assignee_id.eq.${trimmedWorkerId},worker_id.eq.${trimmedWorkerId}`)
    .order("created_at", { ascending: false });

  if (error && error.message.toLowerCase().includes("worker_id")) {
    ({ data, error } = await admin
      .from("swms_assignments")
      .select("*")
      .eq("assignee_type", "worker")
      .eq("assignee_id", trimmedWorkerId)
      .order("created_at", { ascending: false }));
  }

  if (error) {
    return { assignments: [], error: error.message };
  }

  const rows = (data ?? []) as Array<Record<string, unknown>>;
  const swmsIds = Array.from(
    new Set(rows.map((row) => String(row.swms_id ?? "")).filter(Boolean))
  );

  const docsById = new Map<string, Record<string, unknown>>();
  for (const table of ["swms_documents", "swms"] as const) {
    if (swmsIds.length === 0) break;
    const { data: docs } = await admin.from(table).select("*").in("id", swmsIds);
    for (const doc of docs ?? []) {
      docsById.set(String((doc as { id: string }).id), doc as Record<string, unknown>);
    }
  }

  const assignments = rows
    .map((row) => {
      const swmsId = String(row.swms_id ?? "");
      const swms = docsById.get(swmsId);
      if (swms && resolveSwmsIsArchived(swms)) return null;
      return {
        ...row,
        swms: swms
          ? {
              ...swms,
              file_url: resolveSwmsDocumentUrl(swms),
              document_date: resolveSwmsDocumentDate(swms),
              swms_scope: resolveSwmsScope(swms),
              version: resolveSwmsVersion(swms),
            }
          : null,
      };
    })
    .filter(Boolean) as Array<Record<string, unknown>>;

  return { assignments, error: null };
}

export async function signWorkerSwmsAssignmentAdmin(
  admin: SupabaseClient,
  input: {
    workerId: string;
    token: string;
    signatureUrl: string;
    acknowledgedRisks: boolean;
  }
): Promise<{ error: string | null }> {
  const trimmedToken = input.token.trim();
  if (!trimmedToken) {
    return { error: "Signing token is required." };
  }
  if (!input.acknowledgedRisks) {
    return { error: "Risk acknowledgment is required before signing." };
  }

  const updatePayload: Record<string, string | boolean> = {
    status: "Signed",
    signature_url: input.signatureUrl,
    signed_at: new Date().toISOString(),
    acknowledged_risks: true,
  };

  let currentPayload: Record<string, string | boolean> = { ...updatePayload };

  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin
      .from("swms_assignments")
      .update(currentPayload)
      .or(
        `signing_token.eq.${trimmedToken},token.eq.${trimmedToken},signature_token.eq.${trimmedToken}`
      )
      .eq("assignee_id", input.workerId)
      .eq("status", "Pending");

    if (!error) {
      return { error: null };
    }

    if (
      "acknowledged_risks" in currentPayload &&
      error.message.toLowerCase().includes("acknowledged_risks")
    ) {
      const { acknowledged_risks: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    const { error: fallbackError } = await admin
      .from("swms_assignments")
      .update(currentPayload)
      .eq("signing_token", trimmedToken)
      .eq("assignee_id", input.workerId)
      .eq("status", "Pending");

    return { error: fallbackError?.message ?? error.message };
  }

  return { error: "Failed to sign SWMS assignment." };
}
