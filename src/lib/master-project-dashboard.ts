import { fetchIncidentReports, type IncidentReportRecord } from "./incident-reports";
import {
  fetchPlant,
  fetchPlantPrestarts,
  fetchSiteForms,
  fetchSwmsAssignmentRecords,
  isSupabaseConfigured,
  resolvePlantAssignedProjectId,
  type PlantAsset,
  type PlantPrestart,
  type SwmsAssignmentRecord,
  type Worker,
} from "./supabase";
import {
  fetchLeaveRequestsNormalized,
  getLeaveEndDate,
  getLeaveStartDate,
  isLeaveRequestPending,
} from "./leave-requests";
import type { LeaveRequest } from "./supabase";
import { fetchIncompleteInductionAssignments, type FormWorkerAssignment } from "./induction-form-builder";
import { getSiteFormSubmitterName, getToolboxTalkTopic } from "./dashboard-form-utils";
import { isSiteFormViewed } from "./dashboard-form-utils";
import { formatSiteFormDate, type SiteFormSubmission } from "./site-forms";
import { getWorkerDisplayName } from "./worker-utils";
import { getProjectDisplayName } from "./project-resolver";
import { isActiveDashboardDefect } from "./plant-prestart-utils";
import { getPlantPrestartDisplayTitle } from "./plant-prestart-utils";
import { isFleetVehiclePrestart } from "./fleet-prestart";
import { fetchSwmsDocuments, type SwmsDocumentSummary } from "./swms";
import { normalizeCalendarStateCode } from "./worker-state-region";
import { resolveProjectFilterState } from "./worker-calendar-grid";

export interface DashboardFilterWorker {
  id: string;
  state?: string | null;
  assigned_project_id?: string | null;
  assigned_project_ids?: string[] | null;
  project_id?: string | null;
}

export interface DashboardFilterProject {
  id: string;
  state?: string | null;
  location?: string | null;
}

export interface DashboardFilterContext {
  filterProjectIds: readonly string[];
  filterState: string | null;
  projectStateById: Map<string, string | null>;
  workerStateById: Map<string, string | null>;
  workerProjectIdsById: Map<string, string[]>;
}

export interface DashboardFilterRecord {
  projectId?: string | null;
  workerId?: string | null;
  assignedState?: string | null;
  extraProjectIds?: Array<string | null | undefined>;
}

export interface MasterDashboardItem {
  id: string;
  title: string;
  subtitle: string;
}

export interface MasterDashboardWidgetData {
  count: number;
  items: MasterDashboardItem[];
}

export interface MasterProjectDashboardData {
  incidents: MasterDashboardWidgetData;
  safetyWalks: MasterDashboardWidgetData;
  toolboxTalks: MasterDashboardWidgetData;
  plantPrestarts: MasterDashboardWidgetData;
  leaveRequests: MasterDashboardWidgetData;
  incompleteInductions: MasterDashboardWidgetData;
  swmsWaitingSignOff: MasterDashboardWidgetData;
}

export interface MasterProjectDashboardSnapshot {
  incidents: IncidentReportRecord[];
  safetyWalks: SiteFormSubmission[];
  toolboxTalks: SiteFormSubmission[];
  plantPrestarts: PlantPrestart[];
  leaveRequests: LeaveRequest[];
  incompleteInductions: FormWorkerAssignment[];
  swmsWaitingSignOff: SwmsAssignmentRecord[];
  swmsDocuments: SwmsDocumentSummary[];
  plant: PlantAsset[];
}

export function createEmptyMasterProjectDashboardSnapshot(): MasterProjectDashboardSnapshot {
  return {
    incidents: [],
    safetyWalks: [],
    toolboxTalks: [],
    plantPrestarts: [],
    leaveRequests: [],
    incompleteInductions: [],
    swmsWaitingSignOff: [],
    swmsDocuments: [],
    plant: [],
  };
}

function emptyWidget(): MasterDashboardWidgetData {
  return { count: 0, items: [] };
}

async function safeLoad<T>(
  label: string,
  loader: () => Promise<T>,
  fallback: T
): Promise<T> {
  try {
    const result = await loader();
    return result ?? fallback;
  } catch (error) {
    console.warn(`[master-dashboard] ${label} failed:`, error);
    return fallback;
  }
}

export function createEmptyMasterProjectDashboardData(): MasterProjectDashboardData {
  return {
    incidents: emptyWidget(),
    safetyWalks: emptyWidget(),
    toolboxTalks: emptyWidget(),
    plantPrestarts: emptyWidget(),
    leaveRequests: emptyWidget(),
    incompleteInductions: emptyWidget(),
    swmsWaitingSignOff: emptyWidget(),
  };
}

export function isOpenIncident(row: Pick<IncidentReportRecord, "status">): boolean {
  return String(row.status ?? "").trim().toLowerCase() !== "closed";
}

export function isPendingSwmsAssignment(row: SwmsAssignmentRecord): boolean {
  if (row.signed_at) return false;
  return String(row.status ?? "").toLowerCase() !== "signed";
}

export function matchesDashboardProject(
  recordProjectId: string | null | undefined,
  filterProjectIds: readonly string[] | null | undefined
): boolean {
  if (!filterProjectIds || filterProjectIds.length === 0) return true;
  const recordId = (recordProjectId ?? "").trim();
  if (!recordId) return false;
  return filterProjectIds.includes(recordId);
}

function collectWorkerProjectIds(worker: DashboardFilterWorker | undefined): string[] {
  if (!worker) return [];
  return uniqueIds([
    worker.assigned_project_id,
    worker.project_id,
    ...(worker.assigned_project_ids ?? []),
  ]);
}

function uniqueIds(values: Array<string | null | undefined>): string[] {
  const seen = new Set<string>();
  const ids: string[] = [];
  for (const value of values) {
    const id = String(value ?? "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    ids.push(id);
  }
  return ids;
}

export function buildDashboardFilterContext(
  projects: DashboardFilterProject[] | undefined,
  workers: DashboardFilterWorker[] | undefined,
  filterProjectIds: readonly string[] | null | undefined,
  filterState: string | null | undefined
): DashboardFilterContext {
  const projectStateById = new Map<string, string | null>();
  for (const project of projects ?? []) {
    projectStateById.set(
      project.id,
      resolveProjectFilterState({
        state: project.state ?? null,
        location: project.location ?? null,
      })
    );
  }

  const workerStateById = new Map<string, string | null>();
  const workerProjectIdsById = new Map<string, string[]>();
  for (const worker of workers ?? []) {
    workerStateById.set(worker.id, normalizeCalendarStateCode(worker.state));
    workerProjectIdsById.set(worker.id, collectWorkerProjectIds(worker));
  }

  return {
    filterProjectIds: [...(filterProjectIds ?? [])],
    filterState: normalizeCalendarStateCode(filterState),
    projectStateById,
    workerStateById,
    workerProjectIdsById,
  };
}

function relatedProjectIds(
  record: DashboardFilterRecord,
  ctx: DashboardFilterContext
): string[] {
  const workerProjects = record.workerId
    ? ctx.workerProjectIdsById.get(record.workerId) ?? []
    : [];
  return uniqueIds([
    record.projectId,
    ...workerProjects,
    ...(record.extraProjectIds ?? []),
  ]);
}

function relatedStates(
  record: DashboardFilterRecord,
  ctx: DashboardFilterContext,
  projectIds: readonly string[]
): string[] {
  const states: Array<string | null | undefined> = [
    normalizeCalendarStateCode(record.assignedState),
  ];
  if (record.workerId) {
    states.push(ctx.workerStateById.get(record.workerId));
  }
  for (const projectId of projectIds) {
    states.push(ctx.projectStateById.get(projectId));
  }
  return uniqueIds(states);
}

/** Unified Master Dashboard filter: worker state OR project state, plus project id. */
export function matchesDashboardFilters(
  record: DashboardFilterRecord,
  ctx: DashboardFilterContext
): boolean {
  const projectIds = relatedProjectIds(record, ctx);

  if (ctx.filterProjectIds.length > 0) {
    if (!projectIds.some((id) => ctx.filterProjectIds.includes(id))) {
      return false;
    }
  }

  if (ctx.filterState) {
    const states = relatedStates(record, ctx, projectIds);
    if (!states.includes(ctx.filterState)) {
      return false;
    }
  }

  return true;
}

function isVisibleMasterPrestart(row: PlantPrestart): boolean {
  return isActiveDashboardDefect(row) || isFleetVehiclePrestart(row);
}

export function filterMasterDashboardSnapshot(
  snapshot: MasterProjectDashboardSnapshot,
  projectIds: readonly string[] | null | undefined,
  options?: {
    state?: string | null;
    projects?: DashboardFilterProject[];
    workers?: DashboardFilterWorker[];
  }
): MasterProjectDashboardSnapshot {
  const swmsProjectById = new Map<string, string | null>();
  for (const doc of snapshot.swmsDocuments) {
    if (doc.id) swmsProjectById.set(doc.id, doc.project_id ?? null);
    if (doc.swms_id) {
      swmsProjectById.set(doc.swms_id, doc.project_id ?? swmsProjectById.get(doc.swms_id) ?? null);
    }
  }
  const plantProjectById = new Map(
    snapshot.plant.map((asset) => [asset.id, resolvePlantAssignedProjectId(asset) || null])
  );
  const ctx = buildDashboardFilterContext(
    options?.projects,
    options?.workers,
    projectIds,
    options?.state
  );

  return {
    ...snapshot,
    incidents: snapshot.incidents.filter(
      (row) =>
        isOpenIncident(row) &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.injured_worker_id,
          },
          ctx
        )
    ),
    safetyWalks: snapshot.safetyWalks.filter(
      (row) =>
        !isSiteFormViewed(row) &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.worker_id,
          },
          ctx
        )
    ),
    toolboxTalks: snapshot.toolboxTalks.filter(
      (row) =>
        !isSiteFormViewed(row) &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.worker_id,
          },
          ctx
        )
    ),
    plantPrestarts: snapshot.plantPrestarts.filter(
      (row) =>
        isVisibleMasterPrestart(row) &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.operator_worker_id,
            assignedState: row.assigned_state,
            extraProjectIds: [plantProjectById.get(row.plant_id)],
          },
          ctx
        )
    ),
    leaveRequests: snapshot.leaveRequests.filter(
      (row) =>
        isLeaveRequestPending(row.status) &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.worker_id,
          },
          ctx
        )
    ),
    incompleteInductions: snapshot.incompleteInductions.filter(
      (row) =>
        row.status !== "completed" &&
        matchesDashboardFilters(
          {
            projectId: row.project_id,
            workerId: row.worker_id,
          },
          ctx
        )
    ),
    swmsWaitingSignOff: snapshot.swmsWaitingSignOff.filter((row) => {
      if (!isPendingSwmsAssignment(row)) return false;
      const projectId = swmsProjectById.get(row.swms_id) ?? null;
      const workerId = row.worker_id || (row.assignee_type === "worker" ? row.assignee_id : null);
      return matchesDashboardFilters(
        {
          projectId,
          workerId,
        },
        ctx
      );
    }),
  };
}

export function toMasterDashboardWidgetData(
  snapshot: MasterProjectDashboardSnapshot,
  workers: Worker[]
): MasterProjectDashboardData {
  return {
    incidents: {
      count: snapshot.incidents.length,
      items: snapshot.incidents.map((row) => ({
        id: row.id,
        title: row.reference_number || row.injured_worker_name || "Incident",
        subtitle: [
          row.project_name || getProjectDisplayName(row.project_id) || "Unassigned project",
          row.incident_date_time ? String(row.incident_date_time).slice(0, 10) : null,
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    safetyWalks: {
      count: snapshot.safetyWalks.length,
      items: snapshot.safetyWalks.map((form) => ({
        id: form.id,
        title: getSiteFormSubmitterName(form, workers) || "Safety walk",
        subtitle: [
          formatSiteFormDate(form.form_date),
          getProjectDisplayName(form.project_id),
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    toolboxTalks: {
      count: snapshot.toolboxTalks.length,
      items: snapshot.toolboxTalks.map((form) => ({
        id: form.id,
        title: getToolboxTalkTopic(form),
        subtitle: [
          getSiteFormSubmitterName(form, workers),
          formatSiteFormDate(form.form_date),
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    plantPrestarts: {
      count: snapshot.plantPrestarts.length,
      items: snapshot.plantPrestarts.map((row) => ({
        id: row.id,
        title: getPlantPrestartDisplayTitle(row, snapshot.plant),
        subtitle: [
          row.operator_name?.trim() || "Unknown operator",
          (row.submitted_at ?? row.created_at)?.slice(0, 10) || "No date",
        ]
          .filter(Boolean)
          .join(" · "),
      })),
    },
    leaveRequests: {
      count: snapshot.leaveRequests.length,
      items: snapshot.leaveRequests.map((row) => {
        const worker = workers.find((item) => item.id === row.worker_id);
        return {
          id: row.id,
          title:
            row.worker_name?.trim() ||
            (worker ? getWorkerDisplayName(worker) : "Leave request"),
          subtitle: [getLeaveStartDate(row), getLeaveEndDate(row)]
            .filter(Boolean)
            .join(" → "),
        };
      }),
    },
    incompleteInductions: {
      count: snapshot.incompleteInductions.length,
      items: snapshot.incompleteInductions.map((row) => {
        const worker = workers.find((item) => item.id === row.worker_id);
        return {
          id: row.id,
          title:
            row.worker_name?.trim() ||
            (worker ? getWorkerDisplayName(worker) : "Worker"),
          subtitle: row.form_title?.trim() || "Induction incomplete",
        };
      }),
    },
    swmsWaitingSignOff: {
      count: snapshot.swmsWaitingSignOff.length,
      items: snapshot.swmsWaitingSignOff.map((row) => ({
        id: row.id,
        title: row.assignee_name || "Worker",
        subtitle: "Waiting for SWMS sign-off",
      })),
    },
  };
}

export async function fetchMasterProjectDashboardSnapshot(): Promise<MasterProjectDashboardSnapshot> {
  if (!isSupabaseConfigured()) {
    return createEmptyMasterProjectDashboardSnapshot();
  }

  const [
    incidentResult,
    siteForms,
    prestarts,
    leaveRows,
    inductionRows,
    swmsRows,
    swmsDocuments,
    plant,
  ] = await Promise.all([
    safeLoad("incident_reports", () => fetchIncidentReports(), {
      reports: [],
      error: null,
    }),
    safeLoad("site_forms", () => fetchSiteForms({ limit: 500 }), []),
    safeLoad("plant_prestarts", () => fetchPlantPrestarts({ limit: 500 }), []),
    safeLoad("leave_requests", () => fetchLeaveRequestsNormalized(), []),
    safeLoad(
      "form_worker_assignments",
      () => fetchIncompleteInductionAssignments(),
      []
    ),
    safeLoad("swms_assignments", () => fetchSwmsAssignmentRecords(), []),
    safeLoad("swms_documents", () => fetchSwmsDocuments(), []),
    safeLoad("plant", () => fetchPlant(), []),
  ]);

  const incidents = (Array.isArray(incidentResult.reports) ? incidentResult.reports : []).filter(
    isOpenIncident
  );
  const safetyWalks = (siteForms ?? []).filter(
    (form) => form?.form_type === "safety_walk" && !isSiteFormViewed(form)
  );
  const toolboxTalks = (siteForms ?? []).filter(
    (form) => form?.form_type === "toolbox_talk" && !isSiteFormViewed(form)
  );
  const plantPrestarts = (prestarts ?? []).filter((row) => isVisibleMasterPrestart(row));
  const pendingLeave = (leaveRows ?? []).filter((row) =>
    isLeaveRequestPending(row?.status)
  );
  const waitingSwms = (swmsRows ?? []).filter(isPendingSwmsAssignment);
  const incompleteInductions = (inductionRows ?? []).filter(
    (row) => row.status !== "completed"
  );

  return {
    incidents,
    safetyWalks,
    toolboxTalks,
    plantPrestarts,
    leaveRequests: pendingLeave,
    incompleteInductions,
    swmsWaitingSignOff: waitingSwms,
    swmsDocuments: swmsDocuments ?? [],
    plant: plant ?? [],
  };
}

export async function fetchMasterProjectDashboardData(
  workers: Worker[] = []
): Promise<MasterProjectDashboardData> {
  const snapshot = await fetchMasterProjectDashboardSnapshot();
  return toMasterDashboardWidgetData(snapshot, workers);
}
