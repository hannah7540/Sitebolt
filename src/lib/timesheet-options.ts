import { supabase, isSupabaseConfigured } from "./supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  logSupabaseTableUnavailable,
  type SupabaseRequestError,
} from "./supabase-errors";
import {
  fetchProjects,
  filterActiveProjects,
  type DbProject,
} from "./project-resolver";

export interface TimesheetProject {
  id: string;
  client: string;
  project: string;
  address: string;
  /** Organisation project code / job number when sourced from `projects`. */
  code?: string;
}

export interface TimesheetTask {
  id: string;
  name: string;
}

export interface ClientProjectGroup {
  client: string;
  projects: TimesheetProject[];
}

function mapTimesheetProjectRow(row: Record<string, unknown>): TimesheetProject {
  return {
    id: String(row.id),
    client: String(row.client ?? row.client_name ?? "").trim(),
    project: String(row.project ?? row.project_name ?? row.name ?? "").trim(),
    address: String(row.address ?? row.site_address ?? "").trim(),
  };
}

function mapTimesheetTaskRow(row: Record<string, unknown>): TimesheetTask {
  return {
    id: String(row.id),
    name: String(row.name ?? row.task ?? row.label ?? row.task_name ?? "").trim(),
  };
}

export function formatTimesheetProjectDisplayName(project: TimesheetProject): string {
  if (project.client && project.project) {
    return `${project.client} — ${project.project}`;
  }
  return project.project || project.client || "General / Unassigned";
}

export function groupTimesheetProjectsByClient(
  projects: TimesheetProject[]
): ClientProjectGroup[] {
  const uniqueProjects = deduplicateTimesheetProjects(projects);
  const grouped = new Map<string, TimesheetProject[]>();

  for (const project of uniqueProjects) {
    const client = project.client.trim() || "Other";
    const list = grouped.get(client) ?? [];
    list.push(project);
    grouped.set(client, list);
  }

  return [...grouped.entries()]
    .sort(([left], [right]) => left.localeCompare(right))
    .map(([client, clientProjects]) => ({
      client,
      projects: [...clientProjects].sort((left, right) =>
        left.project.localeCompare(right.project)
      ),
    }));
}

function applyActiveOnlyFilter<T extends { or: (filters: string) => T }>(query: T): T {
  return query.or("is_active.eq.true,is_active.is.null");
}

function formatTimesheetOptionsLoadError(
  tableName: "timesheet_projects" | "timesheet_tasks",
  error: SupabaseRequestError | null
): string {
  if (!error) {
    return `No rows returned from ${tableName}. If rows exist in Supabase, add a public SELECT policy (see supabase/migrations/083_timesheet_projects_and_tasks.sql) and click Retry.`;
  }

  if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
    logSupabaseTableUnavailable("fetch", tableName, error);
    return `${tableName} is not available yet. Run supabase/migrations/083_timesheet_projects_and_tasks.sql in the Supabase SQL editor, then click Retry.`;
  }

  return error.message ?? `Unable to load ${tableName}.`;
}

function sortTimesheetProjects(projects: TimesheetProject[]): TimesheetProject[] {
  return [...projects].sort((left, right) => {
    const nameCompare = (left.project || "").localeCompare(right.project || "");
    if (nameCompare !== 0) return nameCompare;
    return left.client.localeCompare(right.client);
  });
}

/** Deduplicate project picklist rows by id (fallback: project name). */
export function deduplicateTimesheetProjects(
  projects: TimesheetProject[] | null | undefined
): TimesheetProject[] {
  return Array.from(
    new Map(
      (projects ?? []).map((project) => [project.id || project.project, project])
    ).values()
  ).sort((left, right) => (left.project || "").localeCompare(right.project || ""));
}

/** Dropdown label: clean project name only (no project codes). */
export function formatTimesheetProjectOptionLabel(project: TimesheetProject): string {
  return project.project?.trim() || project.client?.trim() || "Unnamed project";
}

function mapOrganisationProjectToTimesheetProject(project: DbProject): TimesheetProject {
  return {
    id: project.id,
    client: project.client?.trim() || "Other",
    project: project.name?.trim() || project.project_name?.trim() || "",
    address: project.location?.trim() || "",
    code: project.project_code?.trim() || undefined,
  };
}

/** Active organisation projects for timesheet dropdowns (primary source). */
async function fetchOrganisationProjectsForTimesheets(): Promise<TimesheetProject[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const activeProjects = filterActiveProjects(await fetchProjects());
    return deduplicateTimesheetProjects(
      activeProjects
        .map(mapOrganisationProjectToTimesheetProject)
        .filter((row) => row.project || row.client)
    );
  } catch {
    return [];
  }
}

async function fetchTimesheetProjectsQuery(
  activeOnly: boolean,
  orderByClientProject = true,
  selectAll = false
): Promise<{ projects: TimesheetProject[]; error: string | null }> {
  let query = supabase
    .from("timesheet_projects")
    .select(selectAll ? "*" : "id,client,project,address,is_active");

  if (activeOnly) {
    query = applyActiveOnlyFilter(query);
  }

  if (orderByClientProject) {
    query = query.order("client", { ascending: true }).order("project", { ascending: true });
  }

  const { data, error } = await query;

  if (error) {
    if (!selectAll && isSupabaseMissingColumnError(error)) {
      return fetchTimesheetProjectsQuery(activeOnly, orderByClientProject, true);
    }
    if (activeOnly && isSupabaseMissingColumnError(error)) {
      return fetchTimesheetProjectsQuery(false, orderByClientProject, selectAll);
    }
    if (orderByClientProject && isSupabaseMissingColumnError(error)) {
      return fetchTimesheetProjectsQuery(activeOnly, false, selectAll);
    }
    return { projects: [], error: formatTimesheetOptionsLoadError("timesheet_projects", error) };
  }

  let projects = (data ?? [])
    .map((row) => mapTimesheetProjectRow(row as unknown as Record<string, unknown>))
    .filter((row) => row.project || row.client);

  if (!orderByClientProject) {
    projects = sortTimesheetProjects(projects);
  }

  if (projects.length === 0 && activeOnly) {
    const inactiveResult = await fetchTimesheetProjectsQuery(false, orderByClientProject, selectAll);
    if (inactiveResult.projects.length > 0) {
      return inactiveResult;
    }
  }

  if (projects.length === 0) {
    return {
      projects: [],
      error: formatTimesheetOptionsLoadError("timesheet_projects", null),
    };
  }

  return { projects, error: null };
}

async function fetchTimesheetTasksQuery(
  activeOnly: boolean
): Promise<{ tasks: TimesheetTask[]; error: string | null }> {
  let query = supabase.from("timesheet_tasks").select("*");

  if (activeOnly) {
    query = applyActiveOnlyFilter(query);
  }

  const { data, error } = await query;

  if (error) {
    if (activeOnly && isSupabaseMissingColumnError(error)) {
      return fetchTimesheetTasksQuery(false);
    }
    return { tasks: [], error: formatTimesheetOptionsLoadError("timesheet_tasks", error) };
  }

  let tasks = (data ?? [])
    .map((row) => mapTimesheetTaskRow(row as unknown as Record<string, unknown>))
    .filter((row) => row.name)
    .sort((left, right) => left.name.localeCompare(right.name));

  if (tasks.length === 0 && activeOnly) {
    const inactiveResult = await fetchTimesheetTasksQuery(false);
    if (inactiveResult.tasks.length > 0) {
      return inactiveResult;
    }
  }

  if (tasks.length === 0) {
    return {
      tasks: [],
      error: formatTimesheetOptionsLoadError("timesheet_tasks", null),
    };
  }

  return { tasks, error: null };
}

export async function fetchTimesheetProjects(): Promise<{
  projects: TimesheetProject[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { projects: [], error: "Supabase is not configured." };
  }

  try {
    const projects = await fetchOrganisationProjectsForTimesheets();

    if (projects.length === 0) {
      return {
        projects: [],
        error:
          "No active projects were returned. Add projects under Organisation → Projects, then click Retry.",
      };
    }

    return { projects, error: null };
  } catch {
    return { projects: [], error: "Unable to load projects." };
  }
}

export async function fetchTimesheetTasks(): Promise<{
  tasks: TimesheetTask[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { tasks: [], error: "Supabase is not configured." };
  }

  return fetchTimesheetTasksQuery(true);
}

export async function fetchTimesheetFormOptions(): Promise<{
  projects: TimesheetProject[];
  tasks: TimesheetTask[];
  projectGroups: ClientProjectGroup[];
  error: string | null;
}> {
  const [projectsResult, tasksResult] = await Promise.all([
    fetchTimesheetProjects(),
    fetchTimesheetTasks(),
  ]);

  const errors = [projectsResult.error, tasksResult.error].filter(Boolean);
  const error =
    errors.length === 2 && errors[0] === errors[1]
      ? errors[0]
      : errors[0] ?? errors[1] ?? null;

  return {
    projects: projectsResult.projects,
    tasks: tasksResult.tasks,
    projectGroups: groupTimesheetProjectsByClient(projectsResult.projects),
    error,
  };
}
