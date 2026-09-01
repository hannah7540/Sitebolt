import { fetchIncidentReports } from "./incident-reports";
import {
  fetchPlantPrestarts,
  fetchSiteForms,
  fetchSwmsAssignmentRecords,
  isSupabaseConfigured,
  type Worker,
} from "./supabase";
import {
  fetchLeaveRequestsNormalized,
  getLeaveEndDate,
  getLeaveStartDate,
  isLeaveRequestPending,
} from "./leave-requests";
import { fetchIncompleteInductionAssignments } from "./induction-form-builder";
import { getSiteFormSubmitterName, getToolboxTalkTopic } from "./dashboard-form-utils";
import { formatSiteFormDate } from "./site-forms";
import { getWorkerDisplayName } from "./worker-utils";
import { getProjectDisplayName } from "./project-resolver";

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

export async function fetchMasterProjectDashboardData(
  workers: Worker[] = []
): Promise<MasterProjectDashboardData> {
  if (!isSupabaseConfigured()) {
    return createEmptyMasterProjectDashboardData();
  }

  const [
    incidentResult,
    siteForms,
    prestarts,
    leaveRows,
    inductionRows,
    swmsRows,
  ] = await Promise.all([
    safeLoad("incident_reports", () => fetchIncidentReports(), {
      reports: [],
      error: null,
    }),
    safeLoad("site_forms", () => fetchSiteForms({ limit: 400 }), []),
    safeLoad("plant_prestarts", () => fetchPlantPrestarts({ limit: 200 }), []),
    safeLoad("leave_requests", () => fetchLeaveRequestsNormalized(), []),
    safeLoad(
      "form_worker_assignments",
      () => fetchIncompleteInductionAssignments(),
      []
    ),
    safeLoad("swms_assignments", () => fetchSwmsAssignmentRecords(), []),
  ]);

  const incidents = Array.isArray(incidentResult.reports) ? incidentResult.reports : [];
  const safetyWalks = (siteForms ?? []).filter(
    (form) => form?.form_type === "safety_walk"
  );
  const toolboxTalks = (siteForms ?? []).filter(
    (form) => form?.form_type === "toolbox_talk"
  );
  const pendingLeave = (leaveRows ?? []).filter((row) =>
    isLeaveRequestPending(row?.status)
  );
  const waitingSwms = (swmsRows ?? []).filter((row) => {
    if (!row) return false;
    if (row.signed_at) return false;
    return String(row.status ?? "").toLowerCase() !== "signed";
  });

  return {
    incidents: {
      count: incidents.length,
      items: incidents.slice(0, 5).map((row) => ({
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
      count: safetyWalks.length,
      items: safetyWalks.slice(0, 5).map((form) => ({
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
      count: toolboxTalks.length,
      items: toolboxTalks.slice(0, 5).map((form) => ({
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
      count: (prestarts ?? []).length,
      items: (prestarts ?? []).slice(0, 5).map((row) => ({
        id: row.id,
        title: row.operator_name?.trim() || "Plant pre-start",
        subtitle: (row.submitted_at ?? row.created_at)?.slice(0, 10) || "No date",
      })),
    },
    leaveRequests: {
      count: pendingLeave.length,
      items: pendingLeave.slice(0, 5).map((row) => {
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
      count: (inductionRows ?? []).length,
      items: (inductionRows ?? []).slice(0, 5).map((row) => {
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
      count: waitingSwms.length,
      items: waitingSwms.slice(0, 5).map((row) => ({
        id: row.id,
        title: row.assignee_name || "Worker",
        subtitle: "Waiting for SWMS sign-off",
      })),
    },
  };
}
