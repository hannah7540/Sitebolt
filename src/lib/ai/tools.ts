import { tool } from "ai";
import { z } from "zod";
import { createSupabaseServerClient as createClient } from "@/lib/supabase/server";
import {
  filterRowsByOrganisation,
  isDemoOrganisationScopeBlocked,
  isOrganisationColumnMissing,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";

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

async function findMatchingProjectIds(
  supabase: Awaited<ReturnType<typeof createClient>>,
  projectName: string,
  orgId: string
): Promise<Set<string>> {
  const pattern = `%${sanitizeSearch(projectName)}%`;
  if (pattern === "%%") return new Set();

  const run = async (scoped: boolean, column: "project_name" | "name" | "slug") => {
    let query = supabase.from("projects").select("id, project_name, slug");
    if (scoped) query = withOrganisationScope(query, orgId);
    return query.ilike(column, pattern);
  };

  let { data, error } = await run(true, "project_name");

  if (error && isOrganisationColumnMissing(error.message)) {
    if (isDemoOrganisationScopeBlocked(error.message, orgId)) {
      return new Set();
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

  if (error) return new Set();

  const rows = filterRowsByOrganisation(
    (data ?? []) as Array<Record<string, unknown>>,
    orgId
  );
  return new Set(
    rows
      .map((row) => String((row as { id?: string }).id ?? "").trim())
      .filter(Boolean)
  );
}

async function queryTimesheetHeadcount(
  supabase: Awaited<ReturnType<typeof createClient>>,
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

export const getProjectHeadcount = tool({
  description:
    "Get the current number of workers logged into a specific project for a given date.",
  inputSchema: z.object({
    projectName: z
      .string()
      .min(1)
      .describe("Project name to match, for example Marsden Park."),
    date: z
      .string()
      .regex(DATE_RE)
      .describe("Work date in YYYY-MM-DD format."),
  }),
  execute: async ({ projectName, date }) => {
    const orgId = await resolveActiveOrganisationIdFromCookies();
    if (!orgId) {
      return {
        headcount: 0,
        error: "No active organisation selected.",
      };
    }

    const supabase = await createClient();
    const {
      data: { user },
      error: authError,
    } = await supabase.auth.getUser();

    if (authError || !user) {
      return {
        headcount: 0,
        error: "You must be signed in to look up project headcount.",
      };
    }

    const needle = sanitizeSearch(projectName).toLowerCase();
    if (!needle) {
      return { headcount: 0, error: "A project name is required." };
    }

    const projectIds = await findMatchingProjectIds(
      supabase,
      projectName,
      orgId
    );

    let result = await queryTimesheetHeadcount(
      supabase,
      "timesheets",
      date,
      orgId
    );

    if (
      result.error &&
      (/does not exist/i.test(result.error) ||
        /schema cache/i.test(result.error) ||
        /could not find/i.test(result.error))
    ) {
      result = await queryTimesheetHeadcount(
        supabase,
        "worker_timesheets",
        date,
        orgId
      );
    } else if (result.rows.length === 0 && !result.error) {
      const fallback = await queryTimesheetHeadcount(
        supabase,
        "worker_timesheets",
        date,
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
      date,
      headcount: uniqueWorkerCount(matched),
      error: null,
    };
  },
});
