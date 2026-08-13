import { createClient } from "@supabase/supabase-js";
import { readFileSync, writeFileSync, existsSync } from "node:fs";
import path from "node:path";
import { getSupabaseEnv } from "./env";

export interface E2ETestContext {
  adminWorkerId: string | null;
  workerId: string | null;
  subcontractorWorkerId: string | null;
  projectId: string | null;
  projectName: string | null;
  plantId: string | null;
  supabaseConfigured: boolean;
}

const CONTEXT_PATH = path.resolve(process.cwd(), "e2e/.test-context.json");

function normalizeRole(role: string | null | undefined): string {
  return String(role ?? "")
    .trim()
    .toLowerCase();
}

function isAdminRole(role: string | null | undefined): boolean {
  const normalized = normalizeRole(role);
  return (
    normalized === "full_access" ||
    normalized === "project_super_admin" ||
    normalized === "project_admin" ||
    normalized === "admin_access" ||
    normalized === "admin" ||
    normalized === "super_admin" ||
    normalized === "owner"
  );
}

function firstAssignedProjectId(worker: Record<string, unknown> | null | undefined): string | null {
  if (!worker) return null;

  const assignedIds = worker.assigned_project_ids;
  if (Array.isArray(assignedIds)) {
    for (const value of assignedIds) {
      const trimmed = String(value ?? "").trim();
      if (trimmed) return trimmed;
    }
  }

  for (const key of ["assigned_project_id", "project_id"] as const) {
    const trimmed = String(worker[key] ?? "").trim();
    if (trimmed) return trimmed;
  }

  return null;
}

export async function resolveE2ETestContext(): Promise<E2ETestContext> {
  const envOverride: Partial<E2ETestContext> = {
    adminWorkerId: process.env.E2E_ADMIN_WORKER_ID?.trim() || null,
    workerId: process.env.E2E_WORKER_ID?.trim() || null,
    subcontractorWorkerId: process.env.E2E_SUBCONTRACTOR_WORKER_ID?.trim() || null,
    projectId: process.env.E2E_PROJECT_ID?.trim() || null,
    projectName: process.env.E2E_PROJECT_NAME?.trim() || null,
    plantId: process.env.E2E_PLANT_ID?.trim() || null,
  };

  const supabaseEnv = getSupabaseEnv();
  if (!supabaseEnv) {
    return {
      adminWorkerId: envOverride.adminWorkerId ?? null,
      workerId: envOverride.workerId ?? null,
      subcontractorWorkerId: envOverride.subcontractorWorkerId ?? null,
      projectId: envOverride.projectId ?? null,
      projectName: envOverride.projectName ?? null,
      plantId: envOverride.plantId ?? null,
      supabaseConfigured: false,
    };
  }

  const supabase = createClient(supabaseEnv.url, supabaseEnv.anonKey);
  const { data: workers } = await supabase
    .from("workers")
    .select(
      "id, security_role, is_subcontractor, subcontractor_id, first_name, last_name, full_name, worker_name"
    )
    .limit(200);

  const rows = workers ?? [];

  const adminWorker =
    rows.find((row) => normalizeRole(row.security_role) === "full_access") ??
    rows.find((row) => isAdminRole(row.security_role)) ??
    rows[0] ??
    null;

  const generalWorker =
    rows.find(
      (row) =>
        normalizeRole(row.security_role) === "general_worker" &&
        row.is_subcontractor !== true
    ) ??
    rows.find((row) => row.is_subcontractor !== true && row.id !== adminWorker?.id) ??
    rows[1] ??
    null;

  const subcontractorWorker =
    rows.find((row) => row.is_subcontractor === true) ??
    rows.find((row) => row.subcontractor_id) ??
    null;

  let projectId = envOverride.projectId;
  let projectName = envOverride.projectName;
  if (!projectId) {
    const { data: projects } = await supabase.from("projects").select("id, name, project_name").limit(1);
    if (projects?.[0]) {
      projectId = projects[0].id ? String(projects[0].id) : null;
      projectName =
        (projects[0].project_name ? String(projects[0].project_name) : null) ??
        (projects[0].name ? String(projects[0].name) : null) ??
        projectName;
    }
  }

  if (!projectId) {
    const workerForProject =
      generalWorker ?? adminWorker ?? subcontractorWorker ?? null;
    if (workerForProject?.id) {
      const { data: workerRow } = await supabase
        .from("workers")
        .select("assigned_project_ids, assigned_project_id, project_id")
        .eq("id", workerForProject.id)
        .maybeSingle();
      projectId = firstAssignedProjectId(
        (workerRow as Record<string, unknown> | null) ?? null
      );
    }
  }

  if (!projectId) {
    projectId = "project-1";
    projectName = projectName ?? "E2E Test Project";
  }

  let plantId = envOverride.plantId;
  if (!plantId) {
    const { data: plantRows } = await supabase.from("plant").select("id").limit(1);
    plantId = plantRows?.[0]?.id ? String(plantRows[0].id) : null;
  }

  return {
    adminWorkerId: envOverride.adminWorkerId ?? adminWorker?.id ?? null,
    workerId: envOverride.workerId ?? generalWorker?.id ?? adminWorker?.id ?? null,
    subcontractorWorkerId:
      envOverride.subcontractorWorkerId ?? subcontractorWorker?.id ?? null,
    projectId,
    projectName: projectName ?? null,
    plantId,
    supabaseConfigured: true,
  };
}

export function writeTestContext(context: E2ETestContext): void {
  writeFileSync(CONTEXT_PATH, JSON.stringify(context, null, 2), "utf8");
}

export function readTestContext(): E2ETestContext {
  if (!existsSync(CONTEXT_PATH)) {
    throw new Error(
      "Missing e2e/.test-context.json. Run Playwright global setup or `npx playwright test` first."
    );
  }
  return JSON.parse(readFileSync(CONTEXT_PATH, "utf8")) as E2ETestContext;
}

export function requireSupabaseContext(context: E2ETestContext): void {
  if (!context.supabaseConfigured) {
    throw new Error(
      "Supabase is not configured for E2E tests. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local."
    );
  }
}
