import { supabase } from "./supabase";
import { sanitizeWritePayload } from "./form-payload-utils";

/** Normalized project row used by the app. */
export interface DbProject {
  id: string;
  slug: string;
  project_name: string | null;
  /** Display label: project_name → slug */
  name: string;
  location: string | null;
  project_code: string | null;
  client: string | null;
  project_managers: string[];
  project_administrators: string[];
  project_admins: string[];
  assigned_workers: string[];
  is_active: boolean;
  is_archived: boolean;
  status: string | null;
}

export type ProjectViewFilter = "Active" | "Archived" | "All";

type RawProjectRow = {
  id: string;
  slug?: string | null;
  project_name?: string | null;
  location?: string | null;
  project_code?: string | null;
  client?: string | null;
  project_managers?: string[] | null;
  project_administrators?: string[] | null;
  project_admins?: string[] | null;
  assigned_workers?: string[] | null;
  is_active?: boolean | null;
  is_archived?: boolean | string | null;
  status?: string | null;
};

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

function resolveAdministratorsFromRow(row: RawProjectRow): string[] {
  const administrators = normalizeWorkerUuidArray(row.project_administrators);
  if (administrators.length > 0) return administrators;
  return normalizeWorkerUuidArray(row.project_admins);
}

function normalizeProject(row: RawProjectRow): DbProject {
  const slug = row.slug ?? "";
  const project_name = row.project_name ?? null;
  const is_archived = isProjectArchivedRow(row);
  const project_administrators = resolveAdministratorsFromRow(row);
  return {
    id: row.id,
    slug,
    project_name,
    name: project_name ?? slug ?? "Unnamed project",
    location: row.location ?? null,
    project_code: row.project_code ?? null,
    client: row.client ?? null,
    project_managers: normalizeWorkerUuidArray(row.project_managers),
    project_administrators,
    project_admins: project_administrators,
    assigned_workers: normalizeWorkerUuidArray(row.assigned_workers),
    is_active: isProjectActive(row.is_active) && !is_archived,
    is_archived,
    status: row.status ?? (is_archived ? "Archived" : "Active"),
  };
}

export function isProjectArchivedRow(
  project: Pick<RawProjectRow, "is_archived" | "status"> | Pick<DbProject, "is_archived" | "status">
): boolean {
  return Boolean(
    project.is_archived === true ||
      String(project.is_archived) === "true" ||
      project.status === "Archived"
  );
}

export function isProjectArchived(
  project: Pick<DbProject, "is_archived" | "status">
): boolean {
  return isProjectArchivedRow(project);
}

function slugifyTitle(title: string): string {
  return (
    title
      .toLowerCase()
      .replace(/[^a-z0-9]+/g, "-")
      .replace(/^-|-$/g, "") || "project"
  );
}

/**
 * Normalize Postgres TEXT[] (or legacy JSON) into deduped worker UUID strings.
 * Returns [] for null, undefined, invalid input, or empty selections.
 */
export function normalizeWorkerUuidArray(value: unknown): string[] {
  if (value == null) return [];

  let raw: unknown[] = [];

  if (Array.isArray(value)) {
    raw = value;
  } else if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "{}") return [];
    if (trimmed.startsWith("{") && trimmed.endsWith("}")) {
      const inner = trimmed.slice(1, -1).trim();
      raw = inner
        ? inner.split(",").map((part) => part.trim().replace(/^"|"$/g, ""))
        : [];
    } else {
      try {
        const parsed = JSON.parse(trimmed) as unknown;
        if (Array.isArray(parsed)) raw = parsed;
        else return [];
      } catch {
        return [];
      }
    }
  } else {
    return [];
  }

  const seen = new Set<string>();
  const result: string[] = [];
  for (const item of raw) {
    if (typeof item !== "string") continue;
    const id = item.trim();
    if (!id || !isProjectUuid(id) || seen.has(id)) continue;
    seen.add(id);
    result.push(id);
  }
  return result;
}

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function extractErrorMessage(error: unknown): string {
  if (error == null) return "";
  if (typeof error === "string") return error.trim();
  if (error instanceof Error) return error.message.trim();
  if (typeof error === "object") {
    const record = error as {
      message?: string;
      error_description?: string;
      details?: string;
      hint?: string;
    };
    return [record.message, record.error_description, record.details, record.hint]
      .filter((part): part is string => typeof part === "string" && part.trim().length > 0)
      .join(" ")
      .trim();
  }
  return String(error).trim();
}

/** User-facing message for project create/update failures. */
export function formatProjectSaveError(error: unknown): string {
  const raw = extractErrorMessage(error);
  const lower = raw.toLowerCase();

  if (!raw) {
    return "Something went wrong while saving the project. Please try again.";
  }

  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized") ||
    lower.includes("42501")
  ) {
    return "You don't have permission to save this project. Confirm Supabase INSERT/UPDATE policies are enabled for the projects table.";
  }

  if (
    lower.includes("duplicate key") ||
    lower.includes("unique constraint") ||
    lower.includes("already exists") ||
    lower.includes("idx_projects_slug")
  ) {
    return "A project with this name already exists. Please choose a different title.";
  }

  if (lower.includes("violates foreign key")) {
    return "One or more selected workers could not be linked to this project.";
  }

  if (lower.includes("invalid input syntax for type uuid")) {
    return "One or more worker selections are invalid. Refresh the page and try again.";
  }

  return raw;
}

export const DATABASE_CONNECTION_ERROR_MESSAGE =
  "Unable to connect to database. Please check your network connection or Supabase settings.";

export function isNetworkFetchError(error: unknown): boolean {
  const lower = extractErrorMessage(error).toLowerCase();
  return (
    lower.includes("failed to fetch") ||
    lower.includes("networkerror") ||
    lower.includes("network request failed") ||
    lower.includes("load failed") ||
    error instanceof TypeError
  );
}

export const SUPABASE_NETWORK_OFFLINE_WARNING = "Supabase network connection offline";

export function logSupabaseNetworkOfflineWarning(
  context?: string,
  error?: unknown
): void {
  const message = context
    ? `${SUPABASE_NETWORK_OFFLINE_WARNING} (${context})`
    : SUPABASE_NETWORK_OFFLINE_WARNING;
  if (error !== undefined) {
    console.warn(message, error);
    return;
  }
  console.warn(message);
}

/** Returns true when callers should use empty array / null-safe fallbacks. */
export function handleSupabaseNetworkFetchError(
  error: unknown,
  context?: string
): boolean {
  if (!isNetworkFetchError(error)) return false;
  logSupabaseNetworkOfflineWarning(context, error);
  return true;
}

/** Active when true, null, or undefined — only explicit false is inactive. */
export function isProjectActive(
  isActive: boolean | null | undefined
): boolean {
  return isActive !== false;
}

/** Keep projects that are active and not archived. */
export function filterActiveProjects(projects: DbProject[]): DbProject[] {
  return projects.filter(
    (p) => isProjectActive(p.is_active) && !isProjectArchived(p)
  );
}

const PROJECT_SELECT_VARIANTS = [
  "*",
  "id, project_name, slug, location, project_code, client, project_managers, project_administrators, project_admins, assigned_workers, is_active, is_archived, status",
  "id, project_name, slug, location, project_code, client, project_admins, assigned_workers, is_active, is_archived, status",
  "id, project_name, slug, location, project_admins, assigned_workers, is_active, is_archived, status",
  "id, project_name, slug, location, is_active, is_archived, status",
  "id, project_name, slug, is_active, is_archived, status",
  "id, project_name, slug, is_archived, status",
] as const;

async function queryAllProjects(): Promise<DbProject[]> {
  try {
    for (const select of PROJECT_SELECT_VARIANTS) {
      const { data, error } = await supabase
        .from("projects")
        .select(select)
        .order("project_name", { ascending: true, nullsFirst: false });

      if (!error) {
        return ((data ?? []) as unknown as RawProjectRow[]).map(normalizeProject);
      }

      if (isMissingColumnError(error.message)) {
        continue;
      }

      if (handleSupabaseNetworkFetchError(error, "fetch projects")) {
        return projectsCache ?? [];
      }

      console.error("Failed to fetch projects:", error.message);
      break;
    }

    return projectsCache ?? [];
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch projects")) {
      return projectsCache ?? [];
    }
    console.error("Failed to fetch projects:", error);
    return projectsCache ?? [];
  }
}

export function isProjectUuid(value: string): boolean {
  return UUID_RE.test(value);
}

/** Returns true for legacy slug ids like project-1, project-3 */
export function isProjectSlug(value: string): boolean {
  return /^project-\d+$/i.test(value);
}

let projectsCache: DbProject[] | null = null;

export function getCachedProjects(): DbProject[] {
  return projectsCache ?? [];
}

export function setProjectsCache(projects: DbProject[]): void {
  projectsCache = projects;
}

export async function fetchProjects(): Promise<DbProject[]> {
  try {
    const projects = filterActiveProjects(await queryAllProjects());
    projectsCache = projects;
    return projects;
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch projects")) {
      return projectsCache ?? [];
    }
    console.error("fetchProjects failed:", error);
    return projectsCache ?? [];
  }
}

/** Active projects for sidebar and organisation listing (same as fetchProjects). */
export async function fetchActiveProjects(): Promise<DbProject[]> {
  return fetchProjects();
}

export async function fetchAllProjectsAdmin(): Promise<DbProject[]> {
  return queryAllProjects();
}

/** Fields clients may send when creating or updating a project. */
export type ProjectSaveInput = {
  project_name: string;
  location?: string | null;
  project_code?: string | null;
  client?: string | null;
  project_managers?: string[] | null;
  project_administrators?: string[] | null;
  project_admins?: string[] | null;
  assigned_workers?: string[] | null;
  is_active?: boolean;
  status?: string | null;
};

export type ProjectUpdateInput = ProjectSaveInput & {
  id: string;
};

/** Writable columns only — excludes id, created_at, updated_at, and other system fields. */
type ProjectWritePayload = {
  project_name: string;
  slug: string;
  location: string | null;
  project_code: string | null;
  client: string | null;
  project_managers: string[];
  project_administrators: string[];
  project_admins: string[];
  assigned_workers: string[];
  is_active: boolean;
  is_archived: boolean;
  status: string;
};

const PROJECT_RETURN_SELECT =
  "id, project_name, slug, location, project_code, client, project_managers, project_administrators, project_admins, assigned_workers, is_active, is_archived, status";

const PROJECT_BASIC_RETURN_SELECT =
  "id, project_name, slug, location, is_active, is_archived, status";

function buildProjectWritePayload(input: ProjectSaveInput): ProjectWritePayload {
  const archived = input.status === "Archived";
  const administrators = normalizeWorkerUuidArray(
    input.project_administrators ?? input.project_admins
  );
  const managers = normalizeWorkerUuidArray(input.project_managers);
  return sanitizeWritePayload(
    {
      project_name: input.project_name.trim(),
      slug: slugifyTitle(input.project_name),
      location: input.location?.trim() || null,
      project_code: input.project_code?.trim() || null,
      client: input.client?.trim() || null,
      project_managers: managers,
      project_administrators: administrators,
      project_admins: administrators,
      assigned_workers: normalizeWorkerUuidArray(input.assigned_workers),
      is_active: archived ? false : input.is_active ?? true,
      is_archived: archived,
      status: input.status?.trim() || (archived ? "Archived" : "Active"),
    },
    { requiredTextKeys: ["project_name", "slug"] }
  ) as ProjectWritePayload;
}

async function persistProjectWrite(
  mode: "insert" | "update",
  projectId: string | undefined,
  payload: ProjectWritePayload
): Promise<{ data: RawProjectRow | null; error: string | null }> {
  if (mode === "update" && !projectId) {
    return { data: null, error: "Project id is required to update a project." };
  }

  const runWrite = (body: Record<string, unknown>, select: string) => {
    if (mode === "update") {
      return supabase
        .from("projects")
        .update(body)
        .eq("id", projectId!)
        .select(select)
        .single();
    }
    return supabase.from("projects").insert([body]).select(select).single();
  };

  let { data, error } = await runWrite(payload, PROJECT_RETURN_SELECT);

  if (error && isMissingColumnError(error.message)) {
    const optionalKeys = [
      "project_managers",
      "project_administrators",
      "project_admins",
      "assigned_workers",
      "project_code",
      "client",
      "is_archived",
      "status",
    ] as const;

    let body: Record<string, unknown> = { ...payload };
    let select = PROJECT_RETURN_SELECT;

    for (const key of optionalKeys) {
      if (!(key in body)) continue;
      delete body[key];
      if (key === "project_admins" || key === "assigned_workers" || key === "project_managers" || key === "project_administrators") {
        select = PROJECT_BASIC_RETURN_SELECT;
      }
      ({ data, error } = await runWrite(body, select));
      if (!error) break;
      if (!isMissingColumnError(error.message)) break;
    }
  }

  if (error) {
    return { data: null, error: formatProjectSaveError(error) };
  }

  const row = data as unknown as RawProjectRow | null;
  if (!row || typeof row.id !== "string") {
    return {
      data: null,
      error:
        "The project may have saved, but the server did not return the updated record. Refresh the page to confirm.",
    };
  }

  return { data: row, error: null };
}

async function finalizeProjectWrite(
  data: RawProjectRow
): Promise<{ error: string | null; project: DbProject | null }> {
  const project = normalizeProject(data);

  try {
    await fetchProjects();
  } catch (refreshError) {
    console.error("Project saved but cache refresh failed:", refreshError);
  }

  return { error: null, project };
}

/** Insert a new project — never sends id or timestamp fields. */
export async function saveProject(
  input: ProjectSaveInput
): Promise<{ error: string | null; project: DbProject | null }> {
  try {
    if (!input.project_name?.trim()) {
      return { error: "Project title is required.", project: null };
    }

    const payload = buildProjectWritePayload(input);
    const { data, error } = await persistProjectWrite("insert", undefined, payload);

    if (error || !data) {
      return { error: error ?? "Failed to create project.", project: null };
    }

    return finalizeProjectWrite(data);
  } catch (error) {
    console.error("saveProject failed:", error);
    return { error: formatProjectSaveError(error), project: null };
  }
}

/** Update an existing project — id is used in the query filter, not in the write payload. */
export async function updateProject(
  input: ProjectUpdateInput
): Promise<{ error: string | null; project: DbProject | null }> {
  try {
    if (!input.id?.trim()) {
      return { error: "Project id is required to update.", project: null };
    }
    if (!input.project_name?.trim()) {
      return { error: "Project title is required.", project: null };
    }

    const payload = buildProjectWritePayload(input);
    const { data, error } = await persistProjectWrite("update", input.id.trim(), payload);

    if (error || !data) {
      return { error: error ?? "Failed to update project.", project: null };
    }

    return finalizeProjectWrite(data);
  } catch (error) {
    console.error("updateProject failed:", error);
    return { error: formatProjectSaveError(error), project: null };
  }
}

/** Archive or restore a project with dual-field state (is_archived + status). */
export async function setProjectArchiveState(
  projectId: string,
  archived: boolean
): Promise<{ error: string | null; project: DbProject | null }> {
  try {
    if (!projectId?.trim()) {
      return { error: "Project id is required.", project: null };
    }

    const payload = {
      is_archived: archived,
      status: archived ? "Archived" : "Active",
      is_active: !archived,
    };

    let { data, error } = await supabase
      .from("projects")
      .update(payload)
      .eq("id", projectId.trim())
      .select(PROJECT_RETURN_SELECT)
      .single();

    if (error && isMissingColumnError(error.message)) {
      ({ data, error } = await supabase
        .from("projects")
        .update({ is_active: !archived })
        .eq("id", projectId.trim())
        .select(PROJECT_BASIC_RETURN_SELECT)
        .single());
    }

    if (error) {
      return { error: formatProjectSaveError(error), project: null };
    }

    const row = data as unknown as RawProjectRow | null;
    if (!row || typeof row.id !== "string") {
      return {
        error: "Archive state may have saved, but no updated row was returned.",
        project: null,
      };
    }

    return finalizeProjectWrite(row);
  } catch (error) {
    console.error("setProjectArchiveState failed:", error);
    return { error: formatProjectSaveError(error), project: null };
  }
}

/** Create or update based on whether an id is provided. */
export async function upsertProject(
  input: ProjectSaveInput & { id?: string }
): Promise<{ error: string | null; project: DbProject | null }> {
  if (input.id?.trim()) {
    return updateProject({ ...input, id: input.id.trim() });
  }
  return saveProject(input);
}

export async function syncProjectWorkerAssignments(
  projectId: string,
  workerIds: string[] | null | undefined
): Promise<{ error: string | null }> {
  try {
    const ids = normalizeWorkerUuidArray(workerIds);
    if (ids.length === 0) {
      return { error: null };
    }

    for (const workerId of ids) {
      const { error } = await supabase
        .from("workers")
        .update({ assigned_project_id: projectId })
        .eq("id", workerId);
      if (error) {
        return { error: formatProjectSaveError(error) };
      }
    }
    return { error: null };
  } catch (error) {
    console.error("syncProjectWorkerAssignments failed:", error);
    return { error: formatProjectSaveError(error) };
  }
}

/** Map a legacy slug (or stale form value) to a project UUID when possible. */
export function coerceProjectUuid(
  value: string | null | undefined,
  projects: DbProject[] = getCachedProjects()
): string | null {
  if (!value?.trim()) return null;
  const trimmed = value.trim();
  if (isProjectUuid(trimmed)) return trimmed;

  const match = projects.find(
    (p) => p.slug === trimmed || p.id === trimmed || p.name === trimmed
  );
  return match?.id ?? null;
}

/**
 * Resolves a project dropdown value to a database UUID.
 * Accepts an existing UUID, a legacy slug (project-3), or a project name.
 */
export async function resolveProjectId(
  projectIdOrSlug: string | null | undefined
): Promise<{ id: string | null; error: string | null }> {
  if (!projectIdOrSlug?.trim()) {
    return { id: null, error: null };
  }

  const value = projectIdOrSlug.trim();

  if (isProjectUuid(value)) {
    return { id: value, error: null };
  }

  const cached = projectsCache ?? [];
  const fromCache = coerceProjectUuid(value, cached);
  if (fromCache) return { id: fromCache, error: null };

  if (cached.length === 0) {
    await fetchProjects();
  }

  const afterFetch = coerceProjectUuid(value, projectsCache ?? []);
  if (afterFetch) return { id: afterFetch, error: null };

  const { data: bySlug, error: slugError } = await supabase
    .from("projects")
    .select("id")
    .eq("slug", value)
    .maybeSingle();

  if (slugError) {
    return { id: null, error: slugError.message };
  }
  if (bySlug?.id) return { id: bySlug.id, error: null };

  const { data: byName, error: nameError } = await supabase
    .from("projects")
    .select("id")
    .eq("project_name", value)
    .maybeSingle();

  if (nameError && !isMissingColumnError(nameError.message)) {
    return { id: null, error: nameError.message };
  }
  if (byName?.id) return { id: byName.id, error: null };

  return {
    id: null,
    error: `Could not find a project matching "${value}". Please select a project from the list.`,
  };
}

export function getProjectDisplayName(
  projectId: string | null | undefined,
  projects: DbProject[] = getCachedProjects()
): string | null {
  if (!projectId) return null;

  const byId = projects.find((p) => p.id === projectId);
  if (byId) return byId.name;

  const bySlug = projects.find((p) => p.slug === projectId);
  if (bySlug) return bySlug.name;

  return null;
}
