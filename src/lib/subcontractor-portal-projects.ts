import {
  mapSubcontractorPortalPlantRow,
  mapSubcontractorPortalWorkerRow,
  type SubcontractorPortalPlant,
  type SubcontractorPortalProject,
  type SubcontractorPortalWorker,
} from "./subcontractor-portal-models";
import { createSupabaseServerClient } from "./supabase/server";

export type { SubcontractorPortalProject };

const PLANT_TABLES = ["plant", "plant_equipment", "subcontractor_plant"] as const;

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

export async function fetchSubcontractorAssignedProjects(
  subcontractorId: string
): Promise<SubcontractorPortalProject[]> {
  const id = subcontractorId.trim();
  if (!id) return [];
  const supabase = await createSupabaseServerClient();

  const { data: links, error: linkError } = await supabase
    .from("project_subcontractors")
    .select("project_id")
    .eq("subcontractor_id", id);

  if (linkError || !links?.length) return [];

  const projectIds = [
    ...new Set(links.map((row) => text((row as Record<string, unknown>).project_id)).filter(Boolean)),
  ];
  if (projectIds.length === 0) return [];

  const { data: projects, error } = await supabase
    .from("projects")
    .select("id, project_name, slug, location, status, is_active")
    .in("id", projectIds);

  if (error || !projects) {
    return projectIds.map((projectId) => ({
      id: projectId,
      name: "Assigned project",
      location: "",
      status: "active",
    }));
  }

  const byId = new Map(
    projects.map((row) => {
      const record = row as Record<string, unknown>;
      return [
        text(record.id),
        {
          id: text(record.id),
          name: text(record.project_name) || text(record.slug) || "Assigned project",
          location: text(record.location),
          status: text(record.status) || (record.is_active === false ? "inactive" : "active"),
        } satisfies SubcontractorPortalProject,
      ];
    })
  );

  return projectIds.map(
    (projectId) =>
      byId.get(projectId) ?? {
        id: projectId,
        name: "Assigned project",
        location: "",
        status: "active",
      }
  );
}

async function fetchOwnedWorkers(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  subcontractorId: string
): Promise<SubcontractorPortalWorker[]> {
  const { data, error } = await supabase
    .from("workers")
    .select(
      "id, first_name, last_name, full_name, worker_name, email, phone, trade, worker_type, assigned_project_id, project_id, white_card_doc_url, white_card_photo_url, silica_cert_doc_url, silica_cert_photo_url"
    )
    .eq("subcontractor_id", subcontractorId);

  if (error || !data) return [];
  return data.map((row) => mapSubcontractorPortalWorkerRow(row as Record<string, unknown>));
}

async function fetchOwnedPlant(
  supabase: Awaited<ReturnType<typeof createSupabaseServerClient>>,
  subcontractorId: string
): Promise<SubcontractorPortalPlant[]> {
  for (const table of PLANT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("*")
      .eq("subcontractor_id", subcontractorId);
    if (error) continue;
    return (data ?? []).map((row) =>
      mapSubcontractorPortalPlantRow(row as Record<string, unknown>)
    );
  }
  return [];
}

export async function fetchSubcontractorProjectWorkspace(
  subcontractorId: string,
  projectId: string
): Promise<{
  project: SubcontractorPortalProject | null;
  projects: SubcontractorPortalProject[];
  workers: SubcontractorPortalWorker[];
  plant: SubcontractorPortalPlant[];
  assignedWorkers: SubcontractorPortalWorker[];
  assignedPlant: SubcontractorPortalPlant[];
}> {
  const projects = await fetchSubcontractorAssignedProjects(subcontractorId);
  const project = projects.find((row) => row.id === projectId) ?? null;
  if (!project) {
    return {
      project: null,
      projects,
      workers: [],
      plant: [],
      assignedWorkers: [],
      assignedPlant: [],
    };
  }

  const supabase = await createSupabaseServerClient();
  const [workers, plant, workerLinks, plantLinks] = await Promise.all([
    fetchOwnedWorkers(supabase, subcontractorId),
    fetchOwnedPlant(supabase, subcontractorId),
    supabase
      .from("project_worker_assignments")
      .select("worker_id, status, end_date")
      .eq("project_id", projectId),
    supabase
      .from("project_plant_assignments")
      .select("plant_id, status, end_date")
      .eq("project_id", projectId),
  ]);

  const activeWorkerIds = new Set(
    (workerLinks.data ?? [])
      .filter((row) => {
        const record = row as Record<string, unknown>;
        const status = text(record.status).toLowerCase();
        return status !== "transferred" && status !== "unassigned" && !text(record.end_date);
      })
      .map((row) => text((row as Record<string, unknown>).worker_id))
  );
  const activePlantIds = new Set(
    (plantLinks.data ?? [])
      .filter((row) => {
        const record = row as Record<string, unknown>;
        const status = text(record.status).toLowerCase();
        return status !== "transferred" && status !== "unassigned" && !text(record.end_date);
      })
      .map((row) => text((row as Record<string, unknown>).plant_id))
  );

  const assignedWorkers = workers.filter(
    (worker) => worker.assigned_project_id === projectId || activeWorkerIds.has(worker.id)
  );
  const assignedPlant = plant.filter(
    (item) => item.assigned_project_id === projectId || activePlantIds.has(item.id)
  );

  return { project, projects, workers, plant, assignedWorkers, assignedPlant };
}
