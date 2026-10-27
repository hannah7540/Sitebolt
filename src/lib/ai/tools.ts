import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient as createClient } from "@/lib/supabase/server";
import {
  filterRowsByOrganisation,
  isDemoOrganisationScopeBlocked,
  isOrganisationColumnMissing,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import { getSydneyDateIso } from "@/lib/ai/system-prompt";

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

type TimesheetHeadcountRow = {
  worker_id?: string | null;
  project_id?: string | null;
  project_name?: string | null;
  projects?:
    | {
        id?: string | null;
        project_name?: string | null;
        name?: string | null;
        slug?: string | null;
      }
    | Array<{
        id?: string | null;
        project_name?: string | null;
        name?: string | null;
        slug?: string | null;
      }>
    | null;
};

type MatchedProject = {
  id: string;
  name: string;
};

function sanitizeSearch(value: string): string {
  return value.replace(/[%_,()]/g, " ").replace(/\s+/g, " ").trim();
}

function matchesProjectName(
  candidate: string | null | undefined,
  needle: string
): boolean {
  const haystack = String(candidate ?? "").trim().toLowerCase();
  if (!haystack || !needle) return false;
  return haystack.includes(needle);
}

function uniqueWorkerCount(rows: TimesheetHeadcountRow[]): number {
  return new Set(
    rows
      .map((row) => String(row.worker_id ?? "").trim())
      .filter(Boolean)
  ).size;
}

function rowMatchesProject(
  row: TimesheetHeadcountRow,
  needle: string,
  projectIds: Set<string>
): boolean {
  if (row.project_id && projectIds.has(String(row.project_id))) return true;
  if (matchesProjectName(row.project_name, needle)) return true;

  const related = Array.isArray(row.projects)
    ? row.projects
    : row.projects
      ? [row.projects]
      : [];
  return related.some(
    (project) =>
      matchesProjectName(project.project_name, needle) ||
      matchesProjectName(project.name, needle) ||
      matchesProjectName(project.slug, needle)
  );
}

async function resolveAiSupabaseClient(): Promise<{
  client: SupabaseClient;
  usingServiceRole: boolean;
  error: string | null;
}> {
  const userClient = await createClient();
  const {
    data: { user },
    error: authError,
  } = await userClient.auth.getUser();

  if (authError || !user) {
    return {
      client: userClient,
      usingServiceRole: false,
      error: "You must be signed in to look up live project data.",
    };
  }

  if (isSupabaseAdminConfigured()) {
    try {
      return {
        client: createSupabaseAdminClient(),
        usingServiceRole: true,
        error: null,
      };
    } catch (cause) {
      console.error("[Site-Bolt AI] Admin client unavailable:", cause);
    }
  }

  return { client: userClient, usingServiceRole: false, error: null };
}

async function findMatchingProjects(
  supabase: SupabaseClient,
  projectName: string,
  orgId: string
): Promise<MatchedProject[]> {
  const pattern = `%${sanitizeSearch(projectName)}%`;
  if (pattern === "%%") return [];

  const run = async (scoped: boolean, column: "project_name" | "name" | "slug") => {
    let query = supabase.from("projects").select("id, project_name, name, slug");
    if (scoped) query = withOrganisationScope(query, orgId);
    return query.ilike(column, pattern);
  };

  let { data, error } = await run(true, "project_name");

  if (error && isOrganisationColumnMissing(error.message)) {
    if (isDemoOrganisationScopeBlocked(error.message, orgId)) {
      return [];
    }
    const retry = await run(false, "project_name");
    data = retry.data;
    error = retry.error;
  }

  if (error) {
    const byName = await run(true, "name");
    data = byName.data;
    error = byName.error;
  }

  if (error) {
    const bySlug = await run(true, "slug");
    data = bySlug.data;
    error = bySlug.error;
  }

  if (error) return [];

  const rows = filterRowsByOrganisation(
    (data ?? []) as Array<Record<string, unknown>>,
    orgId
  );

  return rows
    .map((row) => {
      const id = String((row as { id?: string }).id ?? "").trim();
      if (!id) return null;
      const name =
        String(
          (row as { project_name?: string }).project_name ??
            (row as { name?: string }).name ??
            (row as { slug?: string }).slug ??
            ""
        ).trim() || id;
      return { id, name };
    })
    .filter((row): row is MatchedProject => Boolean(row));
}

async function findMatchingProjectIds(
  supabase: SupabaseClient,
  projectName: string,
  orgId: string
): Promise<Set<string>> {
  const projects = await findMatchingProjects(supabase, projectName, orgId);
  return new Set(projects.map((project) => project.id));
}

async function queryTimesheetHeadcount(
  supabase: SupabaseClient,
  table: "timesheets" | "worker_timesheets",
  date: string,
  orgId: string
): Promise<{ rows: TimesheetHeadcountRow[]; error: string | null }> {
  const selectWithJoin =
    "worker_id, project_id, project_name, projects(id, project_name, slug)";

  const run = async (select: string, scoped: boolean) => {
    let query = supabase.from(table).select(select).eq("work_date", date);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query;
  };

  let { data, error } = await run(selectWithJoin, true);

  if (error && isOrganisationColumnMissing(error.message)) {
    if (isDemoOrganisationScopeBlocked(error.message, orgId)) {
      return { rows: [], error: "Unable to read timesheets for this organisation." };
    }
    const retry = await run(selectWithJoin, false);
    data = retry.data;
    error = retry.error;
  }

  if (
    error &&
    (/relationship/i.test(error.message) ||
      /could not find/i.test(error.message) ||
      /schema cache/i.test(error.message))
  ) {
    const withoutJoin = await run("worker_id, project_id, project_name", true);
    data = withoutJoin.data;
    error = withoutJoin.error;
    if (error && isOrganisationColumnMissing(error.message)) {
      const retry = await run("worker_id, project_id, project_name", false);
      data = retry.data;
      error = retry.error;
    }
  }

  if (error) {
    return { rows: [], error: error.message };
  }

  return {
    rows: filterRowsByOrganisation(
      (data ?? []) as TimesheetHeadcountRow[],
      orgId
    ),
    error: null,
  };
}

function isActiveAssignmentStatus(status: string | null | undefined): boolean {
  const value = String(status ?? "").trim().toLowerCase();
  if (!value) return true;
  return !["unassigned", "inactive", "removed", "ended", "complete", "completed"].includes(
    value
  );
}

function isCountableWorker(row: Record<string, unknown>): boolean {
  if (row.is_deleted === true || row.deleted_at) return false;
  if (row.is_revoked === true || row.is_archived === true) return false;
  const status = String(row.status ?? "").trim().toLowerCase();
  if (status === "deleted" || status === "revoked" || status === "archived") {
    return false;
  }
  return true;
}

async function collectAssignedWorkerIds(
  supabase: SupabaseClient,
  projectIds: string[],
  orgId: string
): Promise<{ workerIds: Set<string>; matchedProjects: string[]; error: string | null }> {
  const workerIds = new Set<string>();
  if (projectIds.length === 0) {
    return { workerIds, matchedProjects: [], error: null };
  }

  const runJunction = async (scoped: boolean) => {
    let query = supabase
      .from("project_worker_assignments")
      .select("worker_id, project_id, status")
      .in("project_id", projectIds);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query;
  };

  let junction = await runJunction(true);
  if (junction.error && isOrganisationColumnMissing(junction.error.message)) {
    if (isDemoOrganisationScopeBlocked(junction.error.message, orgId)) {
      return {
        workerIds,
        matchedProjects: projectIds,
        error: "Unable to read assignments for this organisation.",
      };
    }
    junction = await runJunction(false);
  }

  if (!junction.error && Array.isArray(junction.data)) {
    for (const row of filterRowsByOrganisation(
      junction.data as Array<Record<string, unknown>>,
      orgId
    )) {
      if (!isActiveAssignmentStatus(String(row.status ?? ""))) continue;
      const workerId = String(row.worker_id ?? "").trim();
      if (workerId) workerIds.add(workerId);
    }
  }

  const runWorkers = async (scoped: boolean) => {
    let query = supabase
      .from("workers")
      .select(
        "id, status, is_deleted, deleted_at, is_revoked, is_archived, assigned_project_id, assigned_project_ids, organisation_id"
      )
      .in("assigned_project_id", projectIds);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query;
  };

  let workers = await runWorkers(true);
  if (workers.error && isOrganisationColumnMissing(workers.error.message)) {
    if (isDemoOrganisationScopeBlocked(workers.error.message, orgId)) {
      return {
        workerIds,
        matchedProjects: projectIds,
        error: "Unable to read workers for this organisation.",
      };
    }
    workers = await runWorkers(false);
  }

  if (!workers.error && Array.isArray(workers.data)) {
    for (const row of filterRowsByOrganisation(
      workers.data as Array<Record<string, unknown>>,
      orgId
    )) {
      if (!isCountableWorker(row)) continue;
      const workerId = String(row.id ?? "").trim();
      if (workerId) workerIds.add(workerId);
    }
  }

  // assigned_project_ids array containment (best-effort)
  const runArrayWorkers = async (scoped: boolean) => {
    let query = supabase
      .from("workers")
      .select(
        "id, status, is_deleted, deleted_at, is_revoked, is_archived, assigned_project_id, assigned_project_ids, organisation_id"
      )
      .overlaps("assigned_project_ids", projectIds);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query;
  };

  let arrayWorkers = await runArrayWorkers(true);
  if (arrayWorkers.error && isOrganisationColumnMissing(arrayWorkers.error.message)) {
    arrayWorkers = await runArrayWorkers(false);
  }
  if (
    arrayWorkers.error &&
    (/overlaps|assigned_project_ids|column/i.test(arrayWorkers.error.message) ||
      /schema cache/i.test(arrayWorkers.error.message))
  ) {
    // Column may not exist — ignore.
  } else if (!arrayWorkers.error && Array.isArray(arrayWorkers.data)) {
    for (const row of filterRowsByOrganisation(
      arrayWorkers.data as Array<Record<string, unknown>>,
      orgId
    )) {
      if (!isCountableWorker(row)) continue;
      const workerId = String(row.id ?? "").trim();
      if (workerId) workerIds.add(workerId);
    }
  }

  return { workerIds, matchedProjects: projectIds, error: null };
}

export const getProjectHeadcount = tool({
  description:
    "Get the number of workers logged into a specific project on timesheets for a given date (YYYY-MM-DD). For 'today', use the current Sydney date from the system prompt.",
  inputSchema: z.object({
    projectName: z
      .string()
      .min(1)
      .describe("Project name to match, for example Marsden Park."),
    date: z
      .string()
      .regex(DATE_RE)
      .optional()
      .describe("Work date in YYYY-MM-DD format. Defaults to today in Australia/Sydney."),
  }),
  execute: async ({ projectName, date }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return {
        headcount: 0,
        error: "No active organisation selected.",
      };
    }

    const resolved = await resolveAiSupabaseClient();
    if (resolved.error) {
      return { headcount: 0, error: resolved.error };
    }

    const workDate = date?.trim() || getSydneyDateIso();
    const needle = sanitizeSearch(projectName).toLowerCase();
    if (!needle) {
      return { headcount: 0, error: "A project name is required." };
    }

    const projectIds = await findMatchingProjectIds(
      resolved.client,
      projectName,
      orgId
    );

    let result = await queryTimesheetHeadcount(
      resolved.client,
      "timesheets",
      workDate,
      orgId
    );

    if (
      result.error &&
      (/does not exist/i.test(result.error) ||
        /schema cache/i.test(result.error) ||
        /could not find/i.test(result.error))
    ) {
      result = await queryTimesheetHeadcount(
        resolved.client,
        "worker_timesheets",
        workDate,
        orgId
      );
    } else if (result.rows.length === 0 && !result.error) {
      const fallback = await queryTimesheetHeadcount(
        resolved.client,
        "worker_timesheets",
        workDate,
        orgId
      );
      if (!fallback.error) {
        result = fallback;
      }
    }

    if (result.error) {
      return { headcount: 0, error: result.error };
    }

    const matched = result.rows.filter((row) =>
      rowMatchesProject(row, needle, projectIds)
    );

    return {
      projectName: projectName.trim(),
      date: workDate,
      headcount: uniqueWorkerCount(matched),
      error: null,
    };
  },
});

export const get_project_worker_stats = tool({
  description:
    "Searches the database for the number of workers assigned to a specific project or site.",
  inputSchema: z.object({
    projectName: z
      .string()
      .min(1)
      .describe("Project or site name to match, for example Marsden Park."),
  }),
  execute: async ({ projectName }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        error: "No active organisation selected.",
      };
    }

    const resolved = await resolveAiSupabaseClient();
    if (resolved.error) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        error: resolved.error,
      };
    }

    const needle = sanitizeSearch(projectName);
    if (!needle) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        error: "A project name is required.",
      };
    }

    const projects = await findMatchingProjects(resolved.client, projectName, orgId);
    if (projects.length === 0) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        projectName: projectName.trim(),
        error: `No project matched "${projectName.trim()}".`,
      };
    }

    const assignment = await collectAssignedWorkerIds(
      resolved.client,
      projects.map((project) => project.id),
      orgId
    );

    if (assignment.error) {
      return {
        workerCount: 0,
        matchedProjects: projects.map((project) => project.name),
        projectName: projectName.trim(),
        error: assignment.error,
      };
    }

    return {
      projectName: projectName.trim(),
      matchedProjects: projects.map((project) => project.name),
      workerCount: assignment.workerIds.size,
      error: null,
    };
  },
});
