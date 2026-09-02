import type { SupabaseClient } from "@supabase/supabase-js";
import {
  FORM_WORKER_ASSIGNMENTS_TABLE,
  INDUCTION_FORM_TEMPLATES_TABLE,
  sanitizeFormWorkerAssignmentRow,
} from "@/lib/induction-form-builder";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured, isSupabaseConfigured } from "@/lib/supabase/env";
import { supabase } from "@/lib/supabase/client";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  normalizeWorkerStateRegion,
  type WorkerStateRegion,
  WORKER_STATE_REGION_OPTIONS,
} from "@/lib/worker-state-region";
import { WORKER_INDUCTIONS_CHANGED_EVENT } from "@/lib/worker-induction-events";

export { WORKER_INDUCTIONS_CHANGED_EVENT } from "@/lib/worker-induction-events";

export type InductionAutoAssignResult = {
  companyAssigned: number;
  projectAssigned: number;
  skipped: number;
  warnings: string[];
};

type InductionTemplateRow = {
  id: string;
  title: string;
  project_id: string | null;
  scope: "company" | "project";
  system_template_key?: string | null;
};

type WorkerLookupRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  worker_name: string | null;
  state: string | null;
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

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes(column.toLowerCase()) && lower.includes("column");
}

function isUniqueViolation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("duplicate key") ||
    lower.includes("unique constraint") ||
    lower.includes("already exists")
  );
}

/** True when title/key indicates a company induction for the given state (ACT/NSW/WA/NZ). */
export function companyInductionMatchesState(
  title: string | null | undefined,
  systemTemplateKey: string | null | undefined,
  state: WorkerStateRegion
): boolean {
  const upperState = state.toUpperCase();
  const key = (systemTemplateKey ?? "").trim().toUpperCase();
  if (key) {
    if (
      key === `${upperState}-COMPANY-INDUCTION` ||
      key.startsWith(`${upperState}-COMPANY`) ||
      (key.includes(`${upperState}-`) && key.includes("COMPANY"))
    ) {
      return true;
    }
  }

  const titleText = (title ?? "").trim();
  if (!titleText) return false;

  // Token match so "WA" does not match inside unrelated words.
  const tokenPattern = new RegExp(`(^|[^A-Za-z0-9])${upperState}([^A-Za-z0-9]|$)`, "i");
  return tokenPattern.test(titleText);
}

export function notifyWorkerInductionsChanged(workerId?: string | null): void {
  if (typeof window === "undefined") return;
  try {
    window.dispatchEvent(
      new CustomEvent(WORKER_INDUCTIONS_CHANGED_EVENT, {
        detail: { workerId: workerId?.trim() || null },
      })
    );
  } catch {
    // Ignore environments without CustomEvent support.
  }
}

async function fetchWorkerLookup(
  client: SupabaseClient,
  workerId: string
): Promise<WorkerLookupRow | null> {
  const { data, error } = await client
    .from("workers")
    .select(
      "id, email, first_name, last_name, full_name, worker_name, state, assigned_project_id, assigned_project_ids"
    )
    .eq("id", workerId)
    .maybeSingle();

  if (error) {
    console.warn("[induction-auto-assign] worker lookup failed:", error.message);
    return null;
  }

  return (data as WorkerLookupRow | null) ?? null;
}

async function workerAlreadyHasInductionAssignment(
  client: SupabaseClient,
  templateId: string,
  workerId: string
): Promise<boolean> {
  const { data, error } = await client
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .select("id")
    .eq("worker_id", workerId)
    .or(`form_id.eq.${templateId},form_template_id.eq.${templateId}`)
    .limit(1);

  if (error) {
    if (isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
      return false;
    }
    if (isMissingColumnError(error.message, "form_template_id")) {
      const fallback = await client
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("id")
        .eq("worker_id", workerId)
        .eq("form_id", templateId)
        .limit(1);
      if (fallback.error) {
        console.warn(
          "[induction-auto-assign] assignment lookup failed:",
          fallback.error.message
        );
        return false;
      }
      return (fallback.data ?? []).length > 0;
    }
    console.warn("[induction-auto-assign] assignment lookup failed:", error.message);
    return false;
  }

  return (data ?? []).length > 0;
}

async function insertInductionAssignment(
  client: SupabaseClient,
  input: {
    template: InductionTemplateRow;
    worker: WorkerLookupRow;
    workerId: string;
    projectId?: string | null;
    projectName?: string | null;
    assignedByName?: string;
  }
): Promise<boolean> {
  const workerName = getWorkerDisplayName(input.worker, "Worker");
  const now = new Date().toISOString();
  const payload = sanitizeFormWorkerAssignmentRow({
    template: {
      id: input.template.id,
      title: input.template.title,
      project_id: input.projectId ?? input.template.project_id,
      project_name: input.projectName ?? null,
    },
    worker: {
      id: input.workerId,
      full_name: workerName,
      project_id: input.projectId ?? input.template.project_id,
      project_name: input.projectName ?? null,
    },
    assignedBy: {
      id: "system",
      full_name: input.assignedByName ?? "SiteBolt Auto-Assign",
    },
    assignedAt: now,
  });

  let currentPayload: Record<string, unknown> = { ...payload };
  const optionalColumns = [
    "form_template_id",
    "template_id",
    "form_title",
    "worker_name",
    "project_name",
    "assigned_by",
    "assigned_by_id",
    "assigned_by_name",
    "due_date",
  ] as const;

  const { error: upsertError } = await client
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .upsert([currentPayload], {
      onConflict: "form_id,worker_id",
      ignoreDuplicates: true,
    });

  if (!upsertError) {
    return true;
  }
  if (isUniqueViolation(upsertError.message)) {
    return false;
  }

  for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
    const { error } = await client
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .insert([currentPayload]);

    if (!error) {
      return true;
    }

    if (isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
      console.warn("[induction-auto-assign] assignments table unavailable.");
      return false;
    }

    // Unique (form_id, worker_id) — already assigned; treat as idempotent success.
    if (isUniqueViolation(error.message)) {
      return false;
    }

    const columnToDrop = optionalColumns.find(
      (column) =>
        isMissingColumnError(error.message, column) && column in currentPayload
    );

    if (!columnToDrop) {
      console.warn("[induction-auto-assign] assignment insert failed:", error.message);
      return false;
    }

    const nextPayload = { ...currentPayload };
    delete nextPayload[columnToDrop];
    currentPayload = nextPayload;
  }

  return false;
}

async function findActiveCompanyInductionsForState(
  client: SupabaseClient,
  state: WorkerStateRegion
): Promise<InductionTemplateRow[]> {
  try {
    const { data, error } = await client
      .from(INDUCTION_FORM_TEMPLATES_TABLE)
      .select("id, title, project_id, scope, status, system_template_key")
      .eq("scope", "company")
      .eq("status", "active");

    if (error) {
      if (isMissingColumnError(error.message, "system_template_key")) {
        const fallback = await client
          .from(INDUCTION_FORM_TEMPLATES_TABLE)
          .select("id, title, project_id, scope, status")
          .eq("scope", "company")
          .eq("status", "active");
        if (fallback.error) {
          if (isMissingTableError(fallback.error.message, INDUCTION_FORM_TEMPLATES_TABLE)) {
            return [];
          }
          console.warn(
            "[induction-auto-assign] company template lookup failed:",
            fallback.error.message
          );
          return [];
        }
        return ((fallback.data ?? []) as Record<string, unknown>[])
          .filter((row) =>
            companyInductionMatchesState(
              row.title ? String(row.title) : null,
              null,
              state
            )
          )
          .map((row) => ({
            id: String(row.id),
            title: String(row.title ?? "Company induction"),
            project_id: row.project_id ? String(row.project_id) : null,
            scope: "company" as const,
            system_template_key: null,
          }));
      }

      if (isMissingTableError(error.message, INDUCTION_FORM_TEMPLATES_TABLE)) {
        return [];
      }
      console.warn("[induction-auto-assign] company template lookup failed:", error.message);
      return [];
    }

    return ((data ?? []) as Record<string, unknown>[])
      .filter((row) =>
        companyInductionMatchesState(
          row.title ? String(row.title) : null,
          row.system_template_key ? String(row.system_template_key) : null,
          state
        )
      )
      .map((row) => ({
        id: String(row.id),
        title: String(row.title ?? "Company induction"),
        project_id: row.project_id ? String(row.project_id) : null,
        scope: "company" as const,
        system_template_key: row.system_template_key
          ? String(row.system_template_key)
          : null,
      }));
  } catch (cause) {
    console.warn("[induction-auto-assign] company template lookup error:", cause);
    return [];
  }
}

/** Resolve all active project-scoped induction templates linked to a project. */
export async function findActiveProjectInductionTemplates(
  client: SupabaseClient,
  projectId: string
): Promise<InductionTemplateRow[]> {
  try {
    const projectKeys = new Set<string>([projectId]);
    const { data: projectRow } = await client
      .from("projects")
      .select("id, slug, name")
      .or(`id.eq.${projectId},slug.eq.${projectId}`)
      .maybeSingle();

    if (projectRow) {
      if (projectRow.id) projectKeys.add(String(projectRow.id));
      if (projectRow.slug) projectKeys.add(String(projectRow.slug));
    }

    const matched = new Map<string, InductionTemplateRow>();

    for (const key of projectKeys) {
      const { data, error } = await client
        .from(INDUCTION_FORM_TEMPLATES_TABLE)
        .select("id, title, project_id, scope, status")
        .eq("scope", "project")
        .eq("status", "active")
        .eq("project_id", key)
        .order("updated_at", { ascending: false });

      if (error) {
        if (isMissingTableError(error.message, INDUCTION_FORM_TEMPLATES_TABLE)) {
          return [];
        }
        console.warn("[induction-auto-assign] project template lookup failed:", error.message);
        continue;
      }

      for (const row of (data ?? []) as Record<string, unknown>[]) {
        if (!row?.id) continue;
        const id = String(row.id);
        if (matched.has(id)) continue;
        matched.set(id, {
          id,
          title: String(row.title ?? "Site induction"),
          project_id: row.project_id ? String(row.project_id) : null,
          scope: "project",
        });
      }
    }

    return [...matched.values()];
  } catch (cause) {
    console.warn("[induction-auto-assign] project template lookup error:", cause);
    return [];
  }
}

async function resolveProjectName(
  client: SupabaseClient,
  projectId: string
): Promise<string | null> {
  const { data } = await client
    .from("projects")
    .select("name")
    .or(`id.eq.${projectId},slug.eq.${projectId}`)
    .maybeSingle();
  return data?.name ? String(data.name) : null;
}

export async function assignCompanyInductionsForWorkerState(
  client: SupabaseClient,
  workerId: string,
  state: string | null | undefined
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  const normalized = normalizeWorkerStateRegion(state);
  if (!normalized) {
    return { assigned: 0, skipped: 0, warnings };
  }

  if (!(WORKER_STATE_REGION_OPTIONS as readonly string[]).includes(normalized)) {
    return { assigned: 0, skipped: 0, warnings };
  }

  const worker = await fetchWorkerLookup(client, workerId);
  if (!worker) {
    warnings.push("Worker not found for company induction assignment.");
    return { assigned: 0, skipped: 0, warnings };
  }

  const templates = await findActiveCompanyInductionsForState(client, normalized);
  if (templates.length === 0) {
    return { assigned: 0, skipped: 0, warnings };
  }

  let assigned = 0;
  let skipped = 0;

  for (const template of templates) {
    try {
      const already = await workerAlreadyHasInductionAssignment(
        client,
        template.id,
        workerId
      );
      if (already) {
        skipped += 1;
        continue;
      }

      const created = await insertInductionAssignment(client, {
        template,
        worker,
        workerId,
        assignedByName: "SiteBolt State Induction Rules",
      });
      if (created) {
        assigned += 1;
      } else {
        skipped += 1;
      }
    } catch (cause) {
      console.warn("[induction-auto-assign] company assign error:", cause);
      warnings.push(`Company induction skipped for ${template.title}.`);
    }
  }

  return { assigned, skipped, warnings };
}

export async function assignProjectInductionsForWorker(
  client: SupabaseClient,
  workerId: string,
  projectIds: Array<string | null | undefined>,
  options?: { projectNames?: Record<string, string | null | undefined> }
): Promise<{ assigned: number; skipped: number; warnings: string[] }> {
  const warnings: string[] = [];
  const uniqueProjectIds = [
    ...new Set(
      projectIds
        .map((id) => (typeof id === "string" ? id.trim() : ""))
        .filter(Boolean)
    ),
  ];

  if (uniqueProjectIds.length === 0) {
    return { assigned: 0, skipped: 0, warnings };
  }

  const worker = await fetchWorkerLookup(client, workerId);
  if (!worker) {
    warnings.push("Worker not found for project induction assignment.");
    return { assigned: 0, skipped: 0, warnings };
  }

  let assigned = 0;
  let skipped = 0;

  for (const projectId of uniqueProjectIds) {
    try {
      const templates = await findActiveProjectInductionTemplates(client, projectId);
      if (templates.length === 0) continue;

      const projectName =
        options?.projectNames?.[projectId] ??
        (await resolveProjectName(client, projectId));

      for (const template of templates) {
        const already = await workerAlreadyHasInductionAssignment(
          client,
          template.id,
          workerId
        );
        if (already) {
          skipped += 1;
          continue;
        }

        const created = await insertInductionAssignment(client, {
          template,
          worker,
          workerId,
          projectId,
          projectName,
          assignedByName: "SiteBolt Project Induction Rules",
        });
        if (created) {
          assigned += 1;
        } else {
          skipped += 1;
        }
      }
    } catch (cause) {
      console.warn("[induction-auto-assign] project assign error:", cause);
      warnings.push(`Project induction assignment skipped for ${projectId}.`);
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

/** Apply state + project induction workflow rules for a worker (admin/server client). */
export async function applyWorkerInductionWorkflowRules(
  client: SupabaseClient,
  input: {
    workerId: string;
    /** When provided (including null), run state-based company induction rules. */
    state?: string | null;
    /** When true and state omitted, load worker.state and run company rules. */
    syncCompanyFromWorkerState?: boolean;
    projectIds?: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<InductionAutoAssignResult> {
  const warnings: string[] = [];
  const workerId = input.workerId.trim();
  if (!workerId) {
    return { companyAssigned: 0, projectAssigned: 0, skipped: 0, warnings: ["Missing worker id."] };
  }

  const runCompany =
    input.state !== undefined || input.syncCompanyFromWorkerState === true;
  let state = input.state;
  let projectIds = [...(input.projectIds ?? [])];

  if (input.syncCompanyFromWorkerState || input.includeExistingProjects) {
    const worker = await fetchWorkerLookup(client, workerId);
    if (worker) {
      if (input.syncCompanyFromWorkerState && state === undefined) {
        state = worker.state;
      }
      if (input.includeExistingProjects) {
        projectIds = [...projectIds, ...collectWorkerProjectIds(worker)];
      }
    }
  }

  const company = runCompany
    ? await assignCompanyInductionsForWorkerState(client, workerId, state)
    : { assigned: 0, skipped: 0, warnings: [] as string[] };
  const project = await assignProjectInductionsForWorker(client, workerId, projectIds, {
    projectNames: input.projectNames,
  });

  warnings.push(...company.warnings, ...project.warnings);

  return {
    companyAssigned: company.assigned,
    projectAssigned: project.assigned,
    skipped: company.skipped + project.skipped,
    warnings,
  };
}

/** Browser/client entry — prefers API (admin) when available. */
export async function applyWorkerInductionWorkflowRulesForWorker(
  workerId: string,
  input?: {
    state?: string | null;
    syncCompanyFromWorkerState?: boolean;
    projectIds?: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<InductionAutoAssignResult> {
  const empty: InductionAutoAssignResult = {
    companyAssigned: 0,
    projectAssigned: 0,
    skipped: 0,
    warnings: [],
  };

  const trimmedId = workerId.trim();
  if (!trimmedId) return empty;

  try {
    if (typeof window !== "undefined") {
      const response = await fetch("/api/workers/auto-assign-inductions", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          workerId: trimmedId,
          state: input?.state ?? null,
          syncCompanyFromWorkerState: input?.syncCompanyFromWorkerState ?? false,
          projectIds: input?.projectIds ?? [],
          projectNames: input?.projectNames ?? {},
          includeExistingProjects: input?.includeExistingProjects ?? false,
          applyCompanyRules: input?.state !== undefined || input?.syncCompanyFromWorkerState === true,
        }),
      });

      const payload = (await response.json().catch(() => null)) as
        | InductionAutoAssignResult
        | { error?: string }
        | null;

      if (!response.ok) {
        console.warn(
          "[induction-auto-assign] API assignment skipped:",
          payload && "error" in payload ? payload.error : payload
        );
        notifyWorkerInductionsChanged(trimmedId);
        return empty;
      }

      const result = (payload ?? empty) as InductionAutoAssignResult;
      if (result.companyAssigned > 0 || result.projectAssigned > 0) {
        notifyWorkerInductionsChanged(trimmedId);
      }
      return {
        companyAssigned: result.companyAssigned ?? 0,
        projectAssigned: result.projectAssigned ?? 0,
        skipped: result.skipped ?? 0,
        warnings: Array.isArray(result.warnings) ? result.warnings : [],
      };
    }

    if (!isSupabaseConfigured()) {
      return empty;
    }

    const result = await applyWorkerInductionWorkflowRules(supabase, {
      workerId: trimmedId,
      state: input?.state,
      syncCompanyFromWorkerState: input?.syncCompanyFromWorkerState,
      projectIds: input?.projectIds,
      projectNames: input?.projectNames,
      includeExistingProjects: input?.includeExistingProjects,
    });

    if (result.companyAssigned > 0 || result.projectAssigned > 0) {
      notifyWorkerInductionsChanged(trimmedId);
    }
    return result;
  } catch (cause) {
    console.warn("[induction-auto-assign] client workflow failed:", cause);
    return empty;
  }
}

export async function applyWorkerInductionWorkflowRulesAdmin(
  admin: SupabaseClient,
  workerId: string,
  input?: {
    state?: string | null;
    syncCompanyFromWorkerState?: boolean;
    projectIds?: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<InductionAutoAssignResult> {
  return applyWorkerInductionWorkflowRules(admin, {
    workerId,
    state: input?.state,
    syncCompanyFromWorkerState: input?.syncCompanyFromWorkerState,
    projectIds: input?.projectIds,
    projectNames: input?.projectNames,
    includeExistingProjects: input?.includeExistingProjects,
  });
}

/** Convenience for server routes that always use the service role client. */
export async function applyWorkerInductionWorkflowRulesWithAdmin(
  workerId: string,
  input?: {
    state?: string | null;
    syncCompanyFromWorkerState?: boolean;
    projectIds?: Array<string | null | undefined>;
    projectNames?: Record<string, string | null | undefined>;
    includeExistingProjects?: boolean;
  }
): Promise<InductionAutoAssignResult> {
  if (!isSupabaseAdminConfigured()) {
    return {
      companyAssigned: 0,
      projectAssigned: 0,
      skipped: 0,
      warnings: ["SUPABASE_SERVICE_ROLE_KEY is not configured."],
    };
  }
  const admin = createSupabaseAdminClient();
  return applyWorkerInductionWorkflowRulesAdmin(admin, workerId, input);
}
