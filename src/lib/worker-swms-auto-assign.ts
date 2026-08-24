import type { SupabaseClient } from "@supabase/supabase-js";
import { assignSwmsWorkersAdmin } from "@/lib/swms-admin-mutations";
import { resolveSwmsScope } from "@/lib/swms";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { WORKER_SWMS_CHANGED_EVENT } from "@/lib/worker-swms-events";

export { WORKER_SWMS_CHANGED_EVENT } from "@/lib/worker-swms-events";

export type SwmsAutoAssignResult = {
  companyAssigned: number;
  projectAssigned: number;
  skipped: number;
  warnings: string[];
};

type SwmsDocumentRow = {
  id: string;
  title: string;
  project_id: string | null;
  swms_scope: string | null;
  is_archived?: boolean | null;
  status?: string | null;
};

type WorkerLookupRow = {
  id: string;
  assigned_project_id: string | null;
  assigned_project_ids: string[] | null;
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isArchivedSwmsDocument(row: {
  is_archived?: boolean | null;
  status?: string | null;
}): boolean {
  return Boolean(row.is_archived || row.status === "Archived");
}

export function notifyWorkerSwmsChanged(workerId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(WORKER_SWMS_CHANGED_EVENT, {
        detail: { workerId: workerId?.trim() || null },
      })
    );
  } catch {
    // Ignore environments without CustomEvent support.
  }
}

function isActiveSwmsDocument(row: Record<string, unknown>): boolean {
  return !isArchivedSwmsDocument({
    is_archived: row.is_archived as boolean | null | undefined,
    status: row.status ? String(row.status) : null,
  });
}

function toSwmsDocumentRow(row: Record<string, unknown>): SwmsDocumentRow {
  return {
    id: String(row.id),
    title: String(row.title ?? "SWMS"),
    project_id: row.project_id ? String(row.project_id) : null,
    swms_scope: row.swms_scope ? String(row.swms_scope) : null,
    is_archived: row.is_archived as boolean | null | undefined,
    status: row.status ? String(row.status) : null,
  };
}

async function fetchWorkerLookup(
  client: SupabaseClient,
  workerId: string
): Promise<WorkerLookupRow | null> {
  const { data, error } = await client
    .from("workers")
    .select("id, assigned_project_id, assigned_project_ids")
    .eq("id", workerId)
    .maybeSingle();

  if (error) {
    console.warn("[swms-auto-assign] worker lookup failed:", error.message);
    return null;
  }

  return (data as WorkerLookupRow | null) ?? null;
}

async function fetchActiveCompanySwms(
  client: SupabaseClient
): Promise<SwmsDocumentRow[]> {
  try {
    const { data, error } = await client
      .from("swms_documents")
      .select("id, title, project_id, swms_scope, is_archived, status")
      .eq("swms_scope", "company");

    if (error) {
      if (isMissingTableError(error.message, "swms_documents")) {
        return [];
      }
      // Older schemas may lack swms_scope — fall back to null project_id.
      if (error.message.toLowerCase().includes("swms_scope")) {
        const fallback = await client
          .from("swms_documents")
          .select("id, title, project_id, is_archived, status")
          .is("project_id", null);
        if (fallback.error) {
          console.warn(
            "[swms-auto-assign] company SWMS lookup failed:",
            fallback.error.message
          );
          return [];
        }
        return ((fallback.data ?? []) as Record<string, unknown>[])
          .filter(isActiveSwmsDocument)
          .map(toSwmsDocumentRow);
      }
      console.warn("[swms-auto-assign] company SWMS lookup failed:", error.message);
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[])
      .filter((row) => isActiveSwmsDocument(row) && resolveSwmsScope(row) === "company")
      .map(toSwmsDocumentRow);
  } catch (cause) {
    console.warn("[swms-auto-assign] company SWMS lookup error:", cause);
    return [];
  }
}

async function resolveProjectKeys(
  client: SupabaseClient,
  projectId: string
): Promise<Set<string>> {
  const keys = new Set<string>([projectId]);
  const { data } = await client
    .from("projects")
    .select("id, slug")
    .or(`id.eq.${projectId},slug.eq.${projectId}`)
    .maybeSingle();
  if (data?.id) keys.add(String(data.id));
  if (data?.slug) keys.add(String(data.slug));
  return keys;
}

/** Active site-specific SWMS linked to a project. */
export async function findActiveProjectSwmsDocuments(
  client: SupabaseClient,
  projectId: string
): Promise<SwmsDocumentRow[]> {
  try {
    const projectKeys = await resolveProjectKeys(client, projectId);
    const matched = new Map<string, SwmsDocumentRow>();

    for (const key of projectKeys) {
      const { data, error } = await client
        .from("swms_documents")
        .select("id, title, project_id, swms_scope, is_archived, status")
        .eq("project_id", key);

      if (error) {
        if (isMissingTableError(error.message, "swms_documents")) {
          return [];
        }
        console.warn("[swms-auto-assign] project SWMS lookup failed:", error.message);
        continue;
      }

      for (const row of (data ?? []) as Record<string, unknown>[]) {
        if (!row?.id || !isActiveSwmsDocument(row)) continue;
        const scope = resolveSwmsScope(row);
        if (scope !== "site_specific" && !row.project_id) continue;
        const id = String(row.id);
        if (matched.has(id)) continue;
        matched.set(id, toSwmsDocumentRow(row));
      }
    }

    return [...matched.values()];
  } catch (cause) {
    console.warn("[swms-auto-assign] project SWMS lookup error:", cause);
    return [];
  }
}

async function assignSwmsDocsToWorker(
  admin: SupabaseClient,
  workerId: string,
  docs: SwmsDocumentRow[]
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  let assigned = 0;
  let skipped = 0;

  for (const doc of docs) {
    try {
      const result = await assignSwmsWorkersAdmin(admin, {
        swmsId: doc.id,
        workerIds: [workerId],
      });
      if (result.error) {
        // Unique constraint races / duplicates are non-fatal.
        const lower = result.error.toLowerCase();
        if (
          lower.includes("duplicate key") ||
          lower.includes("unique constraint") ||
          lower.includes("already exists")
        ) {
          skipped += 1;
          continue;
        }
        warnings.push(`SWMS "${doc.title}" skipped: ${result.error}`);
        continue;
      }
      if (result.created > 0) {
        assigned += result.created;
      } else {
        skipped += 1;
      }
    } catch (cause) {
      console.warn("[swms-auto-assign] assign error:", cause);
      warnings.push(`SWMS "${doc.title}" assignment failed.`);
    }
  }

  return { assigned, skipped, warnings };
}

export async function assignCompanySwmsForWorker(
  admin: SupabaseClient,
  workerId: string
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const docs = await fetchActiveCompanySwms(admin);
  if (docs.length === 0) {
    return { assigned: 0, skipped: 0, warnings: [] };
  }
  return assignSwmsDocsToWorker(admin, workerId, docs);
}

export async function assignProjectSwmsForWorker(
  admin: SupabaseClient,
  workerId: string,
  projectIds: Array<string | null | undefined>
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const uniqueProjectIds = [
    ...new Set(
      projectIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    ),
  ];

  if (uniqueProjectIds.length === 0) {
    return { assigned: 0, skipped: 0, warnings: [] };
  }

  const warnings: string[] = [];
  let assigned = 0;
  let skipped = 0;

  for (const projectId of uniqueProjectIds) {
    try {
      const docs = await findActiveProjectSwmsDocuments(admin, projectId);
      if (docs.length === 0) continue;
      const result = await assignSwmsDocsToWorker(admin, workerId, docs);
      assigned += result.assigned;
      skipped += result.skipped;
      warnings.push(...result.warnings);
    } catch (cause) {
      console.warn("[swms-auto-assign] project assign error:", cause);
      warnings.push(`Project SWMS assignment skipped for ${projectId}.`);
    }
  }

  return { assigned, skipped, warnings };
}

function collectWorkerProjectIds(worker: WorkerLookupRow): string[] {
  const ids = new Set<string>();
  if (worker.assigned_project_id?.trim()) {
    ids.add(worker.assigned_project_id.trim());
  }
  if (Array.isArray(worker.assigned_project_ids)) {
    for (const id of worker.assigned_project_ids) {
      if (typeof id === "string" && id.trim()) ids.add(id.trim());
    }
  }
  return [...ids];
}

/** Apply company + project SWMS workflow rules (admin/server client). */
export async function applyWorkerSwmsWorkflowRules(
  admin: SupabaseClient,
  input: {
    workerId: string;
    /** When true, assign all active company SWMS. */
    assignCompanySwms?: boolean;
    projectIds?: Array<string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<SwmsAutoAssignResult> {
  const warnings: string[] = [];
  const workerId = input.workerId.trim();
  if (!workerId) {
    return {
      companyAssigned: 0,
      projectAssigned: 0,
      skipped: 0,
      warnings: ["Missing worker id."],
    };
  }

  let projectIds = [...(input.projectIds ?? [])];

  if (input.includeExistingProjects) {
    const worker = await fetchWorkerLookup(admin, workerId);
    if (worker) {
      projectIds = [...projectIds, ...collectWorkerProjectIds(worker)];
    }
  }

  const company =
    input.assignCompanySwms === true
      ? await assignCompanySwmsForWorker(admin, workerId)
      : { assigned: 0, skipped: 0, warnings: [] as string[] };

  const project = await assignProjectSwmsForWorker(admin, workerId, projectIds);

  warnings.push(...company.warnings, ...project.warnings);

  return {
    companyAssigned: company.assigned,
    projectAssigned: project.assigned,
    skipped: company.skipped + project.skipped,
    warnings,
  };
}

export async function applyWorkerSwmsWorkflowRulesAdmin(
  admin: SupabaseClient,
  workerId: string,
  input?: {
    assignCompanySwms?: boolean;
    projectIds?: Array<string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<SwmsAutoAssignResult> {
  return applyWorkerSwmsWorkflowRules(admin, {
    workerId,
    assignCompanySwms: input?.assignCompanySwms,
    projectIds: input?.projectIds,
    includeExistingProjects: input?.includeExistingProjects,
  });
}

/** Browser/client entry — prefers API (admin) when available. */
export async function applyWorkerSwmsWorkflowRulesForWorker(
  workerId: string,
  input?: {
    assignCompanySwms?: boolean;
    projectIds?: Array<string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<SwmsAutoAssignResult> {
  const empty: SwmsAutoAssignResult = {
    companyAssigned: 0,
    projectAssigned: 0,
    skipped: 0,
    warnings: [],
  };

  const trimmedId = workerId.trim();
  if (!trimmedId) return empty;

  try {
    if (typeof window !== "undefined") {
      const response = await fetch("/api/workers/auto-assign-swms", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: trimmedId,
          assignCompanySwms: input?.assignCompanySwms === true,
          projectIds: input?.projectIds ?? [],
          includeExistingProjects: input?.includeExistingProjects ?? false,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | SwmsAutoAssignResult
        | { error?: string }
        | null;

      if (!response.ok) {
        console.warn(
          "[swms-auto-assign] API assignment skipped:",
          payload && "error" in payload ? payload.error : payload
        );
        notifyWorkerSwmsChanged(trimmedId);
        return empty;
      }

      const result = (payload ?? empty) as SwmsAutoAssignResult;
      if (result.companyAssigned > 0 || result.projectAssigned > 0) {
        notifyWorkerSwmsChanged(trimmedId);
      }
      return {
        companyAssigned: result.companyAssigned ?? 0,
        projectAssigned: result.projectAssigned ?? 0,
        skipped: result.skipped ?? 0,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      };
    }

    if (!isSupabaseAdminConfigured()) {
      return empty;
    }

    const admin = createSupabaseAdminClient();
    const result = await applyWorkerSwmsWorkflowRulesAdmin(admin, trimmedId, input);
    return result;
  } catch (cause) {
    console.warn("[swms-auto-assign] client workflow failed:", cause);
    return empty;
  }
}
