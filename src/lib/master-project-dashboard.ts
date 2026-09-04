import { fetchIncidentReports, type IncidentReportRecord } from "./incident-reports";
import {
  fetchPlant,
  fetchPlantPrestarts,
  fetchSiteForms,
  fetchSwmsAssignmentRecords,
  isSupabaseConfigured,
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
import {
  isPlantPrestartRecent,
  isPlantPrestartUnread,
} from "./plant-prestart-mutations";
import { fetchSwmsDocuments, type SwmsDocumentSummary } from "./swms";

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
  filterProjectId: string | null
): boolean {
  if (!filterProjectId) return true;
  return (recordProjectId ?? "").trim() === filterProjectId;
}

export function filterMasterDashboardSnapshot(
  snapshot: MasterProjectDashboardSnapshot,
  projectId: string | null
): MasterProjectDashboardSnapshot {
  const swmsProjectById = new Map(
    snapshot.swmsDocuments.map((doc) => [doc.id, doc.project_id ?? null])
  );

  return {
    ...snapshot,
    incidents: snapshot.incidents.filter(
      (row) => isOpenIncident(row) && matchesDashboardProject(row.project_id, projectId)
    ),
    safetyWalks: snapshot.safetyWalks.filter(
      (row) =>
        !isSiteFormViewed(row) && matchesDashboardProject(row.project_id, projectId)
    ),
    toolboxTalks: snapshot.toolboxTalks.filter(
      (row) =>
        !isSiteFormViewed(row) && matchesDashboardProject(row.project_id, projectId)
    ),
    plantPrestarts: snapshot.plantPrestarts.filter(
      (row) =>
        isPlantPrestartUnread(row) &&
        isPlantPrestartRecent(row) &&
        matchesDashboardProject(row.project_id, projectId)
    ),
    leaveRequests: snapshot.leaveRequests.filter(
      (row) =>
        isLeaveRequestPending(row.status) &&
        matchesDashboardProject(row.project_id, projectId)
    ),
    incompleteInductions: snapshot.incompleteInductions.filter(
      (row) =>
        row.status !== "completed" &&
        matchesDashboardProject(row.project_id, projectId)
    ),
    swmsWaitingSignOff: snapshot.swmsWaitingSignOff.filter((row) => {
      if (!isPendingSwmsAssignment(row)) return false;
      return matchesDashboardProject(swmsProjectById.get(row.swms_id) ?? null, projectId);
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
        title: row.operator_name?.trim() || "Plant pre-start",
        subtitle: (row.submitted_at ?? row.created_at)?.slice(0, 10) || "No date",
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
  const plantPrestarts = (prestarts ?? []).filter(
    (row) => isPlantPrestartUnread(row) && isPlantPrestartRecent(row)
  );
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
