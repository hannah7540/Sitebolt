import {
  assignMasterPlantToProject,
  assignMasterWorkerToProject,
  deleteProjectPlantAssignmentRecord,
  fetchPlantList,
  getWorkerAssignedProjectIds,
  isSupabaseConfigured,
  resolvePlantAssignedProjectId,
  resolvePlantAssignedProjectName,
  resolveWorkerAssignedProjectName,
  supabase,
  syncPlantProjectAssignmentFields,
  updateWorkerAssignedProjectIds,
  upsertProjectPlantAssignmentRecord,
  verifyMasterPlantId,
  type PlantAsset,
  type PlantAssignmentSource,
  type ProjectAssignmentSource,
  type Worker,
  type WorkerAssignmentSource,
} from "./supabase";
import { getCachedProjects, resolveProjectId } from "./project-resolver";
import { formatDateOnly } from "./scheduler-utils";
import { applyPermanentProjectAssignmentTransfer } from "./project-worker-assignment-transfer";
import { applyPermanentPlantAssignmentTransfer } from "./project-plant-assignment-transfer";
import { isApprovedOrLegacyStatus } from "./resource-approval";

export interface ProjectPlantAssignment {
  id: string;
  project_id: string;
  plant_id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_name?: string | null;
  approval_status?: string | null;
}

export interface ProjectWorkerAssignment {
  id: string;
  project_id: string;
  worker_id: string;
  status?: string | null;
  start_date?: string | null;
  end_date?: string | null;
  project_name?: string | null;
  approval_status?: string | null;
}

export function isActiveProjectWorkerAssignment(
  row: ProjectWorkerAssignment,
  onDate: string = formatDateOnly(new Date())
): boolean {
  if (!isApprovedOrLegacyStatus(row.approval_status)) return false;
  if (row.status === "Transferred" || row.status === "Unassigned" || row.status === "Pending") return false;
  const start = formatDateOnly(row.start_date);
  const end = formatDateOnly(row.end_date);
  if (start && start > onDate) return false;
  if (end && end < onDate) return false;
  return true;
}

export function assignmentCoversDay(
  row: ProjectWorkerAssignment,
  dayIso: string
): boolean {
  if (!isApprovedOrLegacyStatus(row.approval_status)) return false;
  if (row.status === "Unassigned" || row.status === "Pending") return false;
  const day = formatDateOnly(dayIso);
  if (!day) return false;
  const start = formatDateOnly(row.start_date);
  const end = formatDateOnly(row.end_date);
  if (row.status === "Transferred" && !end) return false;
  if (start && start > day) return false;
  if (end && end < day) return false;
  return true;
}

export function isActiveProjectPlantAssignment(
  row: ProjectPlantAssignment,
  onDate: string = formatDateOnly(new Date())
): boolean {
  if (!isApprovedOrLegacyStatus(row.approval_status)) return false;
  if (row.status === "Transferred" || row.status === "Unassigned" || row.status === "Pending") return false;
  const start = formatDateOnly(row.start_date);
  const end = formatDateOnly(row.end_date);
  if (start && start > onDate) return false;
  if (end && end < onDate) return false;
  return true;
}

/** `end_date IS NULL` is an open-ended assignment that continues indefinitely. */
export function plantAssignmentCoversDay(
  row: ProjectPlantAssignment,
  dayIso: string
): boolean {
  if (!isApprovedOrLegacyStatus(row.approval_status)) return false;
  if (row.status === "Unassigned" || row.status === "Pending") return false;
  const day = formatDateOnly(dayIso);
  if (!day) return false;
  const start = formatDateOnly(row.start_date);
  const end = formatDateOnly(row.end_date);
  if (row.status === "Transferred" && !end) return false;
  if (start && start > day) return false;
  if (end && end < day) return false;
  return true;
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  const tableLower = table.toLowerCase();
  return (
    lower.includes(tableLower) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

export type PlantProjectFieldSource = Pick<
  PlantAsset,
  "assigned_project_id" | "project_id" | "current_project_id"
>;

export {
  resolvePlantAssignedProjectId,
  resolvePlantAssignedProjectName,
  resolveWorkerAssignedProjectName,
};

export function getPlantAssignedProjectIds(
  plant: PlantProjectFieldSource,
  junctionIds: string[] = []
): string[] {
  const ids = new Set(junctionIds.filter(Boolean));
  const legacy = resolvePlantAssignedProjectId(plant);
  if (legacy) ids.add(legacy);
  return [...ids];
}

function buildProjectAssignmentSource(
  projectId: string,
  projectName?: string | null
): ProjectAssignmentSource {
  const projects = getCachedProjects();
  const resolved = projects.find((row) => row.id === projectId);
  const name = projectName ?? resolved?.name ?? null;
  return {
    id: projectId,
    project_id: projectId,
    name,
    project_name: name,
  };
}

export async function fetchProjectPlantAssignments(): Promise<ProjectPlantAssignment[]> {
  if (!isSupabaseConfigured()) return [];

  const datedSelect =
    "id, project_id, plant_id, status, start_date, end_date, project_name, approval_status";
  const legacySelect = "id, project_id, plant_id, status";

  try {
    const { data, error } = await supabase
      .from("project_plant_assignments")
      .select(datedSelect);

    if (!error) {
      return (data ?? []) as ProjectPlantAssignment[];
    }

    const missingDates =
      error.message.toLowerCase().includes("start_date") ||
      error.message.toLowerCase().includes("end_date") ||
      error.message.toLowerCase().includes("project_name") ||
      error.message.toLowerCase().includes("approval_status");

    if (missingDates) {
      const fallback = await supabase
        .from("project_plant_assignments")
        .select(legacySelect);
      if (!fallback.error) {
        return (fallback.data ?? []) as ProjectPlantAssignment[];
      }
    }

    if (!isMissingTableError(error.message, "project_plant_assignments")) {
      console.warn("fetchProjectPlantAssignments failed:", error.message);
    }
    return [];
  } catch (error) {
    console.warn("fetchProjectPlantAssignments threw:", error);
    return [];
  }
}

export async function fetchProjectWorkerAssignments(): Promise<ProjectWorkerAssignment[]> {
  if (!isSupabaseConfigured()) return [];

  const datedSelect =
    "id, project_id, worker_id, status, start_date, end_date, project_name, approval_status";
  const legacySelect = "id, project_id, worker_id, status";

  try {
    const { data, error } = await supabase
      .from("project_worker_assignments")
      .select(datedSelect);

    if (!error) {
      return (data ?? []) as ProjectWorkerAssignment[];
    }

    const missingDates =
      error.message.toLowerCase().includes("start_date") ||
      error.message.toLowerCase().includes("end_date") ||
      error.message.toLowerCase().includes("project_name") ||
      error.message.toLowerCase().includes("approval_status");

    if (missingDates) {
      const fallback = await supabase
        .from("project_worker_assignments")
        .select(legacySelect);
      if (!fallback.error) {
        return (fallback.data ?? []) as ProjectWorkerAssignment[];
      }
    }

    if (!isMissingTableError(error.message, "project_worker_assignments")) {
      console.warn("fetchProjectWorkerAssignments failed:", error.message);
    }
    return [];
  } catch (error) {
    console.warn("fetchProjectWorkerAssignments threw:", error);
    return [];
  }
}

export function buildPlantProjectMap(
  assignments: ProjectPlantAssignment[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of assignments) {
    if (!isActiveProjectPlantAssignment(row)) continue;
    const list = map.get(row.plant_id) ?? [];
    if (!list.includes(row.project_id)) list.push(row.project_id);
    map.set(row.plant_id, list);
  }
  return map;
}

export function buildDatedPlantAssignmentMap(
  assignments: ProjectPlantAssignment[]
): Map<string, ProjectPlantAssignment[]> {
  const map = new Map<string, ProjectPlantAssignment[]>();
  for (const row of assignments) {
    const list = map.get(row.plant_id) ?? [];
    list.push(row);
    map.set(row.plant_id, list);
  }
  return map;
}

export function buildWorkerProjectMap(
  assignments: ProjectWorkerAssignment[]
): Map<string, string[]>
{
  const map = new Map<string, string[]>();
  for (const row of assignments) {
    if (!isActiveProjectWorkerAssignment(row)) continue;
    const list = map.get(row.worker_id) ?? [];
    if (!list.includes(row.project_id)) list.push(row.project_id);
    map.set(row.worker_id, list);
  }
  return map;
}

export function buildDatedWorkerAssignmentMap(
  assignments: ProjectWorkerAssignment[]
): Map<string, ProjectWorkerAssignment[]> {
  const map = new Map<string, ProjectWorkerAssignment[]>();
  for (const row of assignments) {
    const list = map.get(row.worker_id) ?? [];
    list.push(row);
    map.set(row.worker_id, list);
  }
  return map;
}

export async function fetchPlantIdsForProject(projectId: string): Promise<string[]> {
  try {
    const { id: resolvedId, error } = await resolveProjectId(projectId);
    if (error || !resolvedId) return [];

    const junction = await fetchProjectPlantAssignments();
    const fromJunction = junction
      .filter((row) => row.project_id === resolvedId)
      .map((row) => row.plant_id);

    if (fromJunction.length > 0) return fromJunction;

    const masterPlant = await fetchPlantList();
    return masterPlant
      .filter((row) => getPlantAssignedProjectIds(row).includes(resolvedId))
      .map((row) => row.id);
  } catch (error) {
    console.warn("fetchPlantIdsForProject failed:", error);
    return [];
  }
}

export async function fetchWorkerIdsForProject(projectId: string): Promise<string[]> {
  try {
    const { id: resolvedId, error } = await resolveProjectId(projectId);
    if (error || !resolvedId) return [];

    const junction = await fetchProjectWorkerAssignments();
    return junction
      .filter((row) => row.project_id === resolvedId && isActiveProjectWorkerAssignment(row))
      .map((row) => row.worker_id);
  } catch (error) {
    console.warn("fetchWorkerIdsForProject failed:", error);
    return [];
  }
}

export async function setPlantProjectAssignments(
  plant: PlantAssignmentSource,
  projectIds: string[]
): Promise<{ error: string | null }> {
  try {
    const resolvedIds: string[] = [];
    for (const projectId of projectIds) {
      const { id, error } = await resolveProjectId(projectId);
      if (error) {
        console.warn("setPlantProjectAssignments project resolve failed:", error);
        continue;
      }
      if (id) resolvedIds.push(id);
    }

    const uniqueIds = [...new Set(resolvedIds)];
    const projects = getCachedProjects();
    const primaryProject = projects.find((p) => p.id === uniqueIds[0]);

    await syncPlantProjectAssignmentFields(
      verifyMasterPlantId(plant).plantId || plant.id || "",
      uniqueIds[0] ?? null,
      primaryProject?.name ?? null
    );

    let existingRows: ProjectPlantAssignment[] = [];
    const plantId = verifyMasterPlantId(plant).plantId;
    if (plantId) {
      const { data, error: readError } = await supabase
        .from("project_plant_assignments")
        .select("id, project_id, plant_id, status, start_date, end_date")
        .eq("plant_id", plantId);

      if (readError && !isMissingTableError(readError.message, "project_plant_assignments")) {
        console.warn("setPlantProjectAssignments read failed:", readError.message);
      } else {
        existingRows = (data ?? []) as ProjectPlantAssignment[];
      }
    }

    const openRows = existingRows.filter((row) => isActiveProjectPlantAssignment(row));
    const toRemove = openRows.filter((row) => !uniqueIds.includes(row.project_id));
    const existingProjectIds = openRows.map((row) => row.project_id);
    const toAdd = uniqueIds.filter((id) => !existingProjectIds.includes(id));

    for (const row of toRemove) {
      await deleteProjectPlantAssignmentRecord(plant, row.project_id);
    }

    for (const project_id of toAdd) {
      await upsertProjectPlantAssignmentRecord(
        plant,
        buildProjectAssignmentSource(project_id)
      );
    }

    return { error: null };
  } catch (error) {
    console.warn("setPlantProjectAssignments failed:", error);
    return { error: null };
  }
}

export async function assignPlantToProjectAssignment(
  plant: PlantAssignmentSource,
  projectId: string
): Promise<{ error: string | null }> {
  const { id: resolvedProjectId } = await resolveProjectId(projectId);
  const projects = getCachedProjects();
  const projectName =
    projects.find((p) => p.id === resolvedProjectId)?.name ?? null;

  return assignMasterPlantToProject({
    plant,
    project: buildProjectAssignmentSource(resolvedProjectId || projectId, projectName),
  });
}

export async function unassignPlantFromProject(
  plant: PlantAssignmentSource,
  projectId: string
): Promise<{ error: string | null }> {
  try {
    const { plantId } = verifyMasterPlantId(plant);
    const { id: resolvedProjectId } = await resolveProjectId(projectId);

    if (plantId && resolvedProjectId) {
      await deleteProjectPlantAssignmentRecord(plant, resolvedProjectId);
    }

    const remaining = await fetchProjectPlantAssignments();
    const stillAssigned = remaining.filter(
      (row) => row.plant_id === plantId && row.project_id !== resolvedProjectId
    );
    const nextProject = stillAssigned[0];
    const projects = getCachedProjects();
    const nextName = nextProject
      ? projects.find((p) => p.id === nextProject.project_id)?.name ?? null
      : null;

    if (plantId) {
      await syncPlantProjectAssignmentFields(
        plantId,
        nextProject?.project_id ?? null,
        nextName
      );
    }

    return { error: null };
  } catch (error) {
    console.warn("unassignPlantFromProject failed:", error);
    return { error: null };
  }
}

export async function assignWorkerToProjectAssignment(
  worker: WorkerAssignmentSource,
  projectId: string,
  workers: Worker[] = []
): Promise<{ error: string | null }> {
  const workerId = worker.id || worker.worker_id || "";
  const { id: resolvedProjectId } = await resolveProjectId(projectId);
  const projects = getCachedProjects();
  const projectName =
    projects.find((p) => p.id === resolvedProjectId)?.name ?? null;

  const match = workers.find((row) => row.id === workerId);
  if (match && resolvedProjectId) {
    const currentIds = getWorkerAssignedProjectIds(match);
    if (!currentIds.includes(resolvedProjectId)) {
      try {
        await updateWorkerAssignedProjectIds(workerId, [
          ...currentIds,
          resolvedProjectId,
        ]);
      } catch (error) {
        console.warn("assignWorkerToProjectAssignment legacy sync failed:", error);
      }
    }
  }

  return assignMasterWorkerToProject({
    worker: match ?? worker,
    project: buildProjectAssignmentSource(resolvedProjectId || projectId, projectName),
  });
}

export async function unassignWorkerFromProject(
  worker: WorkerAssignmentSource,
  projectId: string,
  workers: Worker[] = []
): Promise<{ error: string | null }> {
  try {
    const workerId = worker.id || worker.worker_id || "";
    const { id: resolvedProjectId } = await resolveProjectId(projectId);
    if (!workerId || !resolvedProjectId) return { error: null };

    const match = workers.find((row) => row.id === workerId);
    const nextIds = getWorkerAssignedProjectIds(
      match ?? { assigned_project_id: null, assigned_project_ids: [] }
    ).filter((id) => id !== resolvedProjectId);

    try {
      await updateWorkerAssignedProjectIds(workerId, nextIds);
    } catch (error) {
      console.warn("unassignWorkerFromProject workers update failed:", error);
    }

    try {
      await supabase
        .from("project_worker_assignments")
        .delete()
        .eq("worker_id", workerId)
        .eq("project_id", resolvedProjectId);
    } catch (error) {
      console.warn("unassignWorkerFromProject junction delete failed:", error);
    }

    return { error: null };
  } catch (error) {
    console.warn("unassignWorkerFromProject failed:", error);
    return { error: null };
  }
}

export async function setWorkerProjectAssignments(
  worker: WorkerAssignmentSource,
  projectIds: string[]
): Promise<{ error: string | null }> {
  try {
    const workerId = worker.id || worker.worker_id || "";
    const resolvedIds: string[] = [];

    for (const projectId of projectIds) {
      const { id, error } = await resolveProjectId(projectId);
      if (error) {
        console.warn("setWorkerProjectAssignments project resolve failed:", error);
        continue;
      }
      if (id) resolvedIds.push(id);
    }

    const uniqueIds = [...new Set(resolvedIds)];
    const projects = getCachedProjects();

    try {
      await updateWorkerAssignedProjectIds(workerId, uniqueIds);
    } catch (error) {
      console.warn("setWorkerProjectAssignments workers update failed:", error);
    }

    for (const project_id of uniqueIds) {
      const projectName = projects.find((p) => p.id === project_id)?.name ?? null;
      await assignMasterWorkerToProject({
        worker,
        project: buildProjectAssignmentSource(project_id, projectName),
      });
    }

    return { error: null };
  } catch (error) {
    console.warn("setWorkerProjectAssignments failed:", error);
    return { error: null };
  }
}

export async function assignWorkersToProjectBatch(
  projectId: string,
  workerIds: string[],
  workers: Worker[] = []
): Promise<{ error: string | null }> {
  try {
    for (const workerId of workerIds) {
      const match = workers.find((row) => row.id === workerId) ?? { id: workerId };
      await assignWorkerToProjectAssignment(match, projectId, workers);
    }
    return { error: null };
  } catch (error) {
    console.warn("assignWorkersToProjectBatch failed:", error);
    return { error: null };
  }
}

/** Transfer plant to a project from an effective date (open-ended, no end date). */
export async function transferPlantToProject(input: {
  plant: PlantAsset | PlantAssignmentSource;
  toProjectId: string | null;
  effectiveFrom: string;
}): Promise<{ error: string | null }> {
  try {
    const plantId = verifyMasterPlantId(input.plant).plantId;
    const effectiveFrom = formatDateOnly(input.effectiveFrom);
    if (!plantId) return { error: "Select a machine." };
    if (!effectiveFrom) return { error: "Effective From Date is required." };

    let toId: string | null = null;
    let toProjectName = "";
    if (input.toProjectId) {
      const { id, error: toError } = await resolveProjectId(input.toProjectId);
      if (toError || !id) {
        return { error: toError ?? "Invalid project selection." };
      }
      toId = id;
      toProjectName = getCachedProjects().find((p) => p.id === toId)?.name ?? "";
    }

    const plantRecord = input.plant as PlantAsset;
    const plantName =
      plantRecord.unit_number?.trim() ||
      plantRecord.name?.trim() ||
      null;

    const assignmentError = await applyPermanentPlantAssignmentTransfer(supabase, {
      plantId,
      projectId: toId,
      projectName: toProjectName,
      plantName,
      effectiveFrom,
    });

    if (assignmentError) {
      return { error: assignmentError };
    }

    await syncPlantProjectAssignmentFields(
      plantId,
      toId,
      toId ? toProjectName || null : null
    );

    return { error: null };
  } catch (error) {
    console.warn("transferPlantToProject failed:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to transfer plant.",
    };
  }
}

/** Transfer a worker from one project to another (updates workers + junction rows). */
export async function transferWorkerToProject(input: {
  worker: Worker;
  fromProjectId: string;
  toProjectId: string;
  effectiveFrom: string;
}): Promise<{ error: string | null }> {
  try {
    const workerId = input.worker.id;
    const effectiveFrom = formatDateOnly(input.effectiveFrom);
    const { id: fromId, error: fromError } = await resolveProjectId(input.fromProjectId);
    const { id: toId, error: toError } = await resolveProjectId(input.toProjectId);

    if (fromError || toError || !fromId || !toId) {
      return { error: fromError ?? toError ?? "Invalid project selection." };
    }

    if (fromId === toId) {
      return { error: "Select a different project to transfer this worker." };
    }

    if (!effectiveFrom) {
      return { error: "Effective From Date is required." };
    }

    const projects = getCachedProjects();
    const toProjectName = projects.find((p) => p.id === toId)?.name ?? null;

    const assignmentError = await applyPermanentProjectAssignmentTransfer(supabase, {
      workerId,
      projectId: toId,
      projectName: toProjectName ?? "",
      workerName: input.worker.full_name,
      effectiveFrom,
    });

    if (assignmentError) {
      return { error: assignmentError };
    }

    const currentIds = getWorkerAssignedProjectIds(input.worker).filter(
      (id) => id !== fromId
    );
    const nextIds = currentIds.includes(toId) ? currentIds : [...currentIds, toId];

    try {
      await updateWorkerAssignedProjectIds(workerId, nextIds);
    } catch (error) {
      console.warn("transferWorkerToProject assigned_project_ids failed:", error);
    }

    try {
      await supabase
        .from("workers")
        .update({
          assigned_project_id: toId,
          assigned_project_name: toProjectName,
          project_id: toId,
          project_name: toProjectName,
        })
        .eq("id", workerId);
    } catch (error) {
      console.warn("transferWorkerToProject worker project fields failed:", error);
    }

    return { error: null };
  } catch (error) {
    console.warn("transferWorkerToProject failed:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to transfer worker.",
    };
  }
}

export async function assignPlantToProjectBatch(
  projectId: string,
  plantIds: string[],
  masterPlant: PlantAsset[] = []
): Promise<{ error: string | null }> {
  try {
    const sourceList = masterPlant.length > 0 ? masterPlant : await fetchPlantList();
    const masterById = new Map(sourceList.map((row) => [row.id, row]));

    for (const plantId of plantIds) {
      const plant = masterById.get(plantId);
      if (!plant) {
        console.warn("assignPlantToProjectBatch: plant not in master list", plantId);
        continue;
      }
      await assignPlantToProjectAssignment(plant, projectId);
    }
    return { error: null };
  } catch (error) {
    console.warn("assignPlantToProjectBatch failed:", error);
    return { error: null };
  }
}

export function filterPlantForProject(
  plant: PlantAsset[],
  projectId: string,
  junctionMap: Map<string, string[]>
): PlantAsset[] {
  if (!projectId) return [];
  return plant.filter((asset) =>
    getPlantAssignedProjectIds(asset, junctionMap.get(asset.id) ?? []).includes(projectId)
  );
}

export function filterWorkersForProject(
  workers: Worker[],
  projectId: string,
  junctionMap: Map<string, string[]>
): Worker[] {
  if (!projectId) return [];
  return workers.filter((worker) => {
    const junctionIds = junctionMap.get(worker.id) ?? [];
    const ids = new Set<string>([
      ...getWorkerAssignedProjectIds(worker),
      ...junctionIds,
    ]);
    // Legacy / alternate columns that getWorkerAssignedProjectIds may skip
    // (e.g. non-UUID legacy values are filtered there, but project_id is still set).
    const assignedSingle = worker.assigned_project_id?.trim();
    const projectCol = worker.project_id?.trim();
    if (assignedSingle) ids.add(assignedSingle);
    if (projectCol) ids.add(projectCol);
    if (Array.isArray(worker.assigned_project_ids)) {
      for (const id of worker.assigned_project_ids) {
        if (typeof id === "string" && id.trim()) ids.add(id.trim());
      }
    }
    return ids.has(projectId);
  });
}

export async function loadAssignmentMaps(): Promise<{
  plantByProject: Map<string, string[]>;
  workerByProject: Map<string, string[]>;
}> {
  const [plantAssignments, workerAssignments] = await Promise.all([
    fetchProjectPlantAssignments(),
    fetchProjectWorkerAssignments(),
  ]);

  return {
    plantByProject: buildPlantProjectMap(plantAssignments),
    workerByProject: buildWorkerProjectMap(workerAssignments),
  };
}
