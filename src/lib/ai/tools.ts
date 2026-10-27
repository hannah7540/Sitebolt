import { tool } from "ai";
import { z } from "zod";
import type { SupabaseClient } from "@supabase/supabase-js";
import { getSydneyDateIso } from "@/lib/ai/system-prompt";
import {
  isActiveProjectWorkerAssignment,
  type ProjectWorkerAssignment,
} from "@/lib/project-assignments";
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

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

/** Explicit non-financial worker columns for AI tools. Never select pay/payroll fields. */
const AI_WORKER_SAFE_COLUMNS =
  "id, first_name, last_name, full_name, email, phone, status, trade, worker_type, worker_category, employment_type, state, tags, assigned_project_id, assigned_project_ids, assigned_project_name, project_id, project_name, white_card_number, drivers_licence_expiry, is_deleted, deleted_at, is_revoked, is_archived, organisation_id";

const AI_PLANT_SAFE_COLUMNS =
  "id, unit_number, plant_number, name, category, make, model, status, assigned_project_id, assigned_project_name, project_id, project_name, assigned_worker_id, assigned_worker_name, current_hours, current_kms, registration_expiry_date, next_service_hours, next_service_kms, archived_at, organisation_id";

const AI_VOC_SAFE_COLUMNS =
  "id, worker_id, title, voc_type, issue_date, expiry_date, document_url";

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
  assigned_workers: string[];
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
      error: "You must be signed in to look up live project data.",
    };
  }

  if (isSupabaseAdminConfigured()) {
    try {
      return { client: createSupabaseAdminClient(), error: null };
    } catch (cause) {
      console.error("[Site-Bolt AI] Admin client unavailable:", cause);
    }
  }

  return { client: userClient, error: null };
}

function workerAssignedProjectIds(row: Record<string, unknown>): string[] {
  const ids = new Set<string>();
  const single = String(
    row.assigned_project_id ?? row.project_id ?? ""
  ).trim();
  if (single) ids.add(single);

  const arrayValue = row.assigned_project_ids;
  if (Array.isArray(arrayValue)) {
    for (const value of arrayValue) {
      const id = String(value ?? "").trim();
      if (id) ids.add(id);
    }
  }
  return [...ids];
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

function workerDisplayName(row: Record<string, unknown>): string {
  const full = String(row.full_name ?? "").trim();
  if (full) return full;
  const first = String(row.first_name ?? "").trim();
  const last = String(row.last_name ?? "").trim();
  return [first, last].filter(Boolean).join(" ") || "Worker";
}

async function findMatchingProjects(
  supabase: SupabaseClient,
  projectName: string,
  orgId: string
): Promise<MatchedProject[]> {
  const needle = sanitizeSearch(projectName);
  if (!needle) return [];
  const pattern = `%${needle}%`;
  const byId = new Map<string, MatchedProject>();

  const mergeRows = (rows: Array<Record<string, unknown>>) => {
    for (const row of filterRowsByOrganisation(rows, orgId)) {
      const id = String(row.id ?? "").trim();
      if (!id) continue;
      const name =
        String(
          row.project_name ?? row.name ?? row.slug ?? row.location ?? ""
        ).trim() || id;
      const assigned = Array.isArray(row.assigned_workers)
        ? row.assigned_workers.map((value) => String(value ?? "").trim()).filter(Boolean)
        : [];
      const existing = byId.get(id);
      byId.set(id, {
        id,
        name,
        assigned_workers: [
          ...new Set([...(existing?.assigned_workers ?? []), ...assigned]),
        ],
      });
    }
  };

  const columns =
    "id, project_name, name, slug, location, project_code, assigned_workers, organisation_id";
  const runOr = async (scoped: boolean) => {
    let query = supabase.from("projects").select(columns);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query.or(
      [
        `project_name.ilike.${pattern}`,
        `name.ilike.${pattern}`,
        `slug.ilike.${pattern}`,
        `location.ilike.${pattern}`,
        `project_code.ilike.${pattern}`,
      ].join(",")
    );
  };

  let result = await runOr(true);
  if (result.error && isOrganisationColumnMissing(result.error.message)) {
    if (isDemoOrganisationScopeBlocked(result.error.message, orgId)) {
      return [];
    }
    result = await runOr(false);
  }

  // Some PostgREST setups reject multi-column `.or` — fall back to per-column ilike.
  if (result.error) {
    for (const column of [
      "project_name",
      "name",
      "slug",
      "location",
      "project_code",
    ] as const) {
      let query = supabase.from("projects").select(columns).ilike(column, pattern);
      query = withOrganisationScope(query, orgId);
      let page = await query;
      if (page.error && isOrganisationColumnMissing(page.error.message)) {
        page = await supabase.from("projects").select(columns).ilike(column, pattern);
      }
      if (!page.error && page.data) {
        mergeRows(page.data as Array<Record<string, unknown>>);
      }
    }
  } else if (result.data) {
    mergeRows(result.data as Array<Record<string, unknown>>);
  }

  // Also discover projects via junction project_name labels (same UI assignment source).
  const junctionName = await supabase
    .from("project_worker_assignments")
    .select("project_id, project_name")
    .ilike("project_name", pattern)
    .limit(500);

  if (!junctionName.error && junctionName.data) {
    const extraIds = [
      ...new Set(
        junctionName.data
          .map((row) => String((row as { project_id?: string }).project_id ?? "").trim())
          .filter(Boolean)
      ),
    ];
    if (extraIds.length) {
      let projectsById = await supabase
        .from("projects")
        .select(columns)
        .in("id", extraIds);
      if (projectsById.error && isOrganisationColumnMissing(projectsById.error.message)) {
        projectsById = await supabase.from("projects").select(columns).in("id", extraIds);
      }
      if (!projectsById.error && projectsById.data) {
        mergeRows(projectsById.data as Array<Record<string, unknown>>);
      } else {
        for (const row of junctionName.data as Array<Record<string, unknown>>) {
          const id = String(row.project_id ?? "").trim();
          if (!id || byId.has(id)) continue;
          byId.set(id, {
            id,
            name: String(row.project_name ?? id).trim() || id,
            assigned_workers: [],
          });
        }
      }
    }
  }

  return [...byId.values()];
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

async function loadActiveAssignmentWorkerIds(
  supabase: SupabaseClient,
  projectIds: string[],
  projectNameNeedle: string
): Promise<Set<string>> {
  const workerIds = new Set<string>();
  if (projectIds.length === 0 && !projectNameNeedle) return workerIds;

  const datedSelect =
    "id, project_id, worker_id, status, start_date, end_date, project_name, approval_status";
  const legacySelect = "id, project_id, worker_id, status, project_name";

  let data: ProjectWorkerAssignment[] | null = null;
  let error: { message: string } | null = null;

  const primary = await supabase
    .from("project_worker_assignments")
    .select(datedSelect);
  data = (primary.data as ProjectWorkerAssignment[] | null) ?? null;
  error = primary.error;

  if (error) {
    const fallback = await supabase
      .from("project_worker_assignments")
      .select(legacySelect);
    data = (fallback.data as ProjectWorkerAssignment[] | null) ?? null;
    error = fallback.error;
  }

  if (error || !data) return workerIds;

  for (const raw of data) {
    const projectId = String(raw.project_id ?? "").trim();
    const matchesId = projectId && projectIds.includes(projectId);
    const matchesName = matchesProjectName(raw.project_name, projectNameNeedle);
    if (!matchesId && !matchesName) continue;
    if (!isActiveProjectWorkerAssignment(raw)) continue;
    const workerId = String(raw.worker_id ?? "").trim();
    if (workerId) workerIds.add(workerId);
  }

  return workerIds;
}

async function collectAssignedWorkerIds(
  supabase: SupabaseClient,
  projects: MatchedProject[],
  projectNameNeedle: string,
  orgId: string
): Promise<{ workerIds: Set<string>; error: string | null }> {
  const workerIds = new Set<string>();
  const projectIds = projects.map((project) => project.id);

  for (const project of projects) {
    for (const workerId of project.assigned_workers) {
      if (workerId) workerIds.add(workerId);
    }
  }

  const fromJunction = await loadActiveAssignmentWorkerIds(
    supabase,
    projectIds,
    projectNameNeedle
  );
  for (const workerId of fromJunction) workerIds.add(workerId);

  // Mirror UI: scan workers with safe columns and match assigned project ids / names in memory.
  const runWorkers = async (scoped: boolean) => {
    let query = supabase.from("workers").select(AI_WORKER_SAFE_COLUMNS).limit(5000);
    if (scoped) query = withOrganisationScope(query, orgId);
    return query;
  };

  let workers = await runWorkers(true);
  if (workers.error && isOrganisationColumnMissing(workers.error.message)) {
    if (isDemoOrganisationScopeBlocked(workers.error.message, orgId)) {
      return {
        workerIds,
        error: "Unable to read workers for this organisation.",
      };
    }
    workers = await runWorkers(false);
  }

  if (workers.error) {
    return { workerIds, error: workers.error.message };
  }

  const projectIdSet = new Set(projectIds);
  for (const row of filterRowsByOrganisation(
    (workers.data ?? []) as Array<Record<string, unknown>>,
    orgId
  )) {
    if (!isCountableWorker(row)) continue;
    const assignedIds = workerAssignedProjectIds(row);
    const matchesId = assignedIds.some((id) => projectIdSet.has(id));
    const matchesName =
      matchesProjectName(String(row.assigned_project_name ?? ""), projectNameNeedle) ||
      matchesProjectName(String(row.project_name ?? ""), projectNameNeedle);
    if (!matchesId && !matchesName) continue;
    const workerId = String(row.id ?? "").trim();
    if (workerId) workerIds.add(workerId);
  }

  return { workerIds, error: null };
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

    const projects = await findMatchingProjects(
      resolved.client,
      projectName,
      orgId
    );
    const projectIds = new Set(projects.map((project) => project.id));

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
      matchedProjects: projects.map((project) => project.name),
      headcount: uniqueWorkerCount(matched),
      error: null,
    };
  },
});

export const get_project_worker_stats = tool({
  description:
    "Searches the database for the number of workers assigned to a specific project or site. Uses case-insensitive partial matching on project name/location and the same assignment sources as the Site-Bolt UI (project_worker_assignments + worker assigned project fields).",
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

    const needle = sanitizeSearch(projectName).toLowerCase();
    if (!needle) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        error: "A project name is required.",
      };
    }

    const projects = await findMatchingProjects(
      resolved.client,
      projectName,
      orgId
    );

    const assignment = await collectAssignedWorkerIds(
      resolved.client,
      projects,
      needle,
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

    if (projects.length === 0 && assignment.workerIds.size === 0) {
      return {
        workerCount: 0,
        matchedProjects: [] as string[],
        projectName: projectName.trim(),
        error: `No project matched "${projectName.trim()}".`,
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

export const search_workers = tool({
  description:
    "Retrieves worker details (name, tags, assigned sites). Never returns financial or pay-rate fields.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Worker name, tag, trade, or assigned site text to search."),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async ({ query, limit }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return { workers: [], error: "No active organisation selected." };
    }
    const resolved = await resolveAiSupabaseClient();
    if (resolved.error) {
      return { workers: [], error: resolved.error };
    }

    const needle = sanitizeSearch(query).toLowerCase();
    const max = limit ?? 20;

    let workersQuery = resolved.client
      .from("workers")
      .select(AI_WORKER_SAFE_COLUMNS)
      .limit(2000);
    workersQuery = withOrganisationScope(workersQuery, orgId);
    let { data, error } = await workersQuery;
    if (error && isOrganisationColumnMissing(error.message)) {
      if (isDemoOrganisationScopeBlocked(error.message, orgId)) {
        return { workers: [], error: "Unable to read workers for this organisation." };
      }
      const retry = await resolved.client
        .from("workers")
        .select(AI_WORKER_SAFE_COLUMNS)
        .limit(2000);
      data = retry.data;
      error = retry.error;
    }
    if (error) return { workers: [], error: error.message };

    const matched = filterRowsByOrganisation(
      (data ?? []) as Array<Record<string, unknown>>,
      orgId
    )
      .filter((row) => isCountableWorker(row))
      .filter((row) => {
        const haystack = [
          workerDisplayName(row),
          row.email,
          row.trade,
          row.worker_type,
          row.worker_category,
          row.assigned_project_name,
          row.project_name,
          Array.isArray(row.tags) ? row.tags.join(" ") : row.tags,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");
        return haystack.includes(needle);
      })
      .slice(0, max)
      .map((row) => ({
        id: String(row.id ?? ""),
        name: workerDisplayName(row),
        email: String(row.email ?? "") || null,
        phone: String(row.phone ?? "") || null,
        status: String(row.status ?? "") || null,
        trade: String(row.trade ?? "") || null,
        tags: Array.isArray(row.tags)
          ? row.tags.map((tag) => String(tag))
          : row.tags
            ? [String(row.tags)]
            : [],
        assignedProjects: [
          ...new Set(
            [
              ...workerAssignedProjectIds(row),
              String(row.assigned_project_name ?? "").trim(),
              String(row.project_name ?? "").trim(),
            ].filter(Boolean)
          ),
        ],
      }));

    return { workers: matched, error: null };
  },
});

export const search_equipment = tool({
  description:
    "Retrieves plant/equipment status by name, unit number, category, or assigned project. Excludes cost/rate fields.",
  inputSchema: z.object({
    query: z
      .string()
      .min(1)
      .describe("Equipment name, unit number, category, or project text."),
    limit: z.number().int().min(1).max(50).optional(),
  }),
  execute: async ({ query, limit }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return { equipment: [], error: "No active organisation selected." };
    }
    const resolved = await resolveAiSupabaseClient();
    if (resolved.error) {
      return { equipment: [], error: resolved.error };
    }

    const needle = sanitizeSearch(query).toLowerCase();
    const max = limit ?? 20;
    const tables = ["plant", "plant_equipment"] as const;
    const items: Array<Record<string, unknown>> = [];

    for (const table of tables) {
      let plantQuery = resolved.client
        .from(table)
        .select(AI_PLANT_SAFE_COLUMNS)
        .limit(2000);
      plantQuery = withOrganisationScope(plantQuery, orgId);
      let { data, error } = await plantQuery;
      if (error && isOrganisationColumnMissing(error.message)) {
        if (isDemoOrganisationScopeBlocked(error.message, orgId)) {
          continue;
        }
        const retry = await resolved.client
          .from(table)
          .select(AI_PLANT_SAFE_COLUMNS)
          .limit(2000);
        data = retry.data;
        error = retry.error;
      }
      if (error) {
        if (/does not exist|schema cache|could not find/i.test(error.message)) {
          continue;
        }
        return { equipment: [], error: error.message };
      }
      items.push(...((data ?? []) as Array<Record<string, unknown>>));
      if (items.length) break;
    }

    const matched = filterRowsByOrganisation(items, orgId)
      .filter((row) => !row.archived_at)
      .filter((row) => {
        const haystack = [
          row.name,
          row.unit_number,
          row.plant_number,
          row.category,
          row.make,
          row.model,
          row.status,
          row.assigned_project_name,
          row.project_name,
          row.assigned_worker_name,
        ]
          .map((value) => String(value ?? "").toLowerCase())
          .join(" ");
        return haystack.includes(needle);
      })
      .slice(0, max)
      .map((row) => ({
        id: String(row.id ?? ""),
        name: String(row.name ?? row.unit_number ?? "Plant"),
        unitNumber: String(row.unit_number ?? row.plant_number ?? "") || null,
        category: String(row.category ?? "") || null,
        status: String(row.status ?? "") || null,
        assignedProject:
          String(row.assigned_project_name ?? row.project_name ?? "") || null,
        assignedWorker: String(row.assigned_worker_name ?? "") || null,
        registrationExpiry: String(row.registration_expiry_date ?? "") || null,
      }));

    return { equipment: matched, error: null };
  },
});

export const get_compliance_status = tool({
  description:
    "Checks for expiring VOCs, licences, or other compliance tickets. Does not return financial data.",
  inputSchema: z.object({
    workerName: z
      .string()
      .optional()
      .describe("Optional worker name filter. Leave blank for organisation-wide upcoming expiries."),
    daysAhead: z
      .number()
      .int()
      .min(1)
      .max(365)
      .optional()
      .describe("Look-ahead window in days. Defaults to 30."),
  }),
  execute: async ({ workerName, daysAhead }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return { items: [], error: "No active organisation selected." };
    }
    const resolved = await resolveAiSupabaseClient();
    if (resolved.error) {
      return { items: [], error: resolved.error };
    }

    const windowDays = daysAhead ?? 30;
    const today = getSydneyDateIso();
    const until = new Date(`${today}T00:00:00`);
    until.setDate(until.getDate() + windowDays);
    const untilIso = until.toLocaleDateString("en-CA", {
      timeZone: "Australia/Sydney",
    });

    let workersQuery = resolved.client
      .from("workers")
      .select(AI_WORKER_SAFE_COLUMNS)
      .limit(3000);
    workersQuery = withOrganisationScope(workersQuery, orgId);
    let workersResult = await workersQuery;
    if (
      workersResult.error &&
      isOrganisationColumnMissing(workersResult.error.message)
    ) {
      if (isDemoOrganisationScopeBlocked(workersResult.error.message, orgId)) {
        return { items: [], error: "Unable to read workers for this organisation." };
      }
      workersResult = await resolved.client
        .from("workers")
        .select(AI_WORKER_SAFE_COLUMNS)
        .limit(3000);
    }
    if (workersResult.error) {
      return { items: [], error: workersResult.error.message };
    }

    const needle = sanitizeSearch(workerName ?? "").toLowerCase();
    const workers = filterRowsByOrganisation(
      (workersResult.data ?? []) as Array<Record<string, unknown>>,
      orgId
    ).filter((row) => {
      if (!isCountableWorker(row)) return false;
      if (!needle) return true;
      return workerDisplayName(row).toLowerCase().includes(needle);
    });
    const workerById = new Map(
      workers.map((row) => [String(row.id ?? ""), row] as const)
    );
    const workerIds = [...workerById.keys()].filter(Boolean);

    const items: Array<Record<string, unknown>> = [];

    for (const row of workers) {
      const licenceExpiry = String(row.drivers_licence_expiry ?? "").trim();
      if (licenceExpiry && licenceExpiry <= untilIso) {
        items.push({
          workerId: String(row.id ?? ""),
          workerName: workerDisplayName(row),
          item: "Driver's Licence",
          expiryDate: licenceExpiry,
          status: licenceExpiry < today ? "expired" : "expiring_soon",
        });
      }
    }

    if (workerIds.length) {
      const { data: vocs, error: vocError } = await resolved.client
        .from("worker_vocs")
        .select(AI_VOC_SAFE_COLUMNS)
        .in("worker_id", workerIds)
        .not("expiry_date", "is", null)
        .lte("expiry_date", untilIso)
        .limit(1000);

      if (vocError) {
        return { items, error: vocError.message };
      }

      for (const voc of (vocs ?? []) as Array<Record<string, unknown>>) {
        const workerId = String(voc.worker_id ?? "");
        const worker = workerById.get(workerId);
        if (!worker) continue;
        const expiry = String(voc.expiry_date ?? "").trim();
        if (!expiry) continue;
        items.push({
          workerId,
          workerName: workerDisplayName(worker),
          item: String(voc.voc_type ?? voc.title ?? "VOC"),
          expiryDate: expiry,
          status: expiry < today ? "expired" : "expiring_soon",
        });
      }
    }

    items.sort((left, right) =>
      String(left.expiryDate).localeCompare(String(right.expiryDate))
    );

    return {
      asOf: today,
      daysAhead: windowDays,
      count: items.length,
      items: items.slice(0, 100),
      error: null,
    };
  },
});
