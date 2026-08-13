import { mapTimesheetRow } from "@/lib/timesheet-entries";
import type { DbProject } from "@/lib/project-resolver";
import { handleSupabaseNetworkFetchError } from "@/lib/project-resolver";
import { fetchSubcontractors } from "@/lib/subcontractors";
import {
  fetchAllWorkers,
  isSupabaseConfigured,
  supabase,
  type Worker,
  type WorkerTimesheet,
} from "@/lib/supabase";
import {
  calculateDailyTotalsFromSlots,
  formatTimeDisplay,
  formatTimesheetHours,
} from "@/lib/timesheet-utils";
import {
  getLineCategoryLabel,
  isLeaveLineCategory,
  resolveLineCategory,
  sumWorkLineHours,
} from "@/lib/timesheet-line-items";
import {
  parseStateFromProjectLocation,
  resolveTimesheetStateForFilter,
} from "@/lib/accounts-timesheets";
import type { WorkerStateRegion } from "@/lib/worker-state-region";

export interface TimesheetHoursReportRow {
  workerName: string;
  employmentStatus: string;
  projectSite: string;
  workDate: string;
  startTime: string;
  endTime: string;
  totalHours: string;
  attendanceStatus: string;
  notes: string;
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

function allProjectsSelected(
  projectIds: string[],
  projects: DbProject[]
): boolean {
  return projectIds.length === 0 || projectIds.length >= projects.length;
}

function matchesProjectFilter(
  projectId: string | null | undefined,
  projectIds: string[],
  projects: DbProject[]
): boolean {
  if (allProjectsSelected(projectIds, projects)) return true;
  if (!projectId) return false;
  return projectIds.includes(projectId);
}

function resolveProjectSiteLabel(
  timesheet: WorkerTimesheet,
  projects: DbProject[]
): string {
  if (timesheet.project_name?.trim()) return timesheet.project_name.trim();
  if (timesheet.project_id) {
    const project = projects.find((row) => row.id === timesheet.project_id);
    return project?.project_name ?? project?.name ?? timesheet.project_id;
  }
  return "—";
}

function resolveEmploymentStatus(
  worker: Worker | undefined,
  subcontractorNames: Map<string, string>
): string {
  if (!worker) return "Direct Employee";

  if (worker.is_subcontractor || worker.subcontractor_id) {
    const companyName = worker.subcontractor_id
      ? subcontractorNames.get(worker.subcontractor_id)
      : null;
    return companyName ? `Subcontractor — ${companyName}` : "Subcontractor";
  }

  const employmentType = worker.employment_type?.trim();
  if (employmentType) {
    return `Direct Employee — ${employmentType}`;
  }

  return "Direct Employee";
}

function resolveAttendanceStatusFromNotes(notes: string): string | null {
  const normalized = notes.toLowerCase();
  if (normalized.includes("public holiday")) return "Public Holiday";
  if (normalized.includes("annual leave")) return "Annual Leave";
  if (normalized.includes("sick leave") || normalized.includes(" sick")) {
    return "Sick Leave";
  }
  if (normalized.includes("personal leave")) return "Personal Leave";
  if (normalized.includes("carers leave")) return "Carers Leave";
  if (normalized.includes("flexi rdo")) return "RDO";
  if (normalized.includes(" rdo")) return "RDO";
  if (normalized.includes("leave without pay")) return "Leave Without Pay";
  if (normalized.includes("auto-generated from approved leave request")) {
    return "Leave";
  }
  return null;
}

export function resolveTimesheetAttendanceStatus(
  timesheet: WorkerTimesheet
): string {
  const activities = timesheet.activities ?? [];
  const leaveLabels = [
    ...new Set(
      activities
        .filter((activity) => isLeaveLineCategory(resolveLineCategory(activity)))
        .map((activity) => getLineCategoryLabel(resolveLineCategory(activity)))
    ),
  ];

  const workHours = sumWorkLineHours(activities);
  if (leaveLabels.length > 0) {
    if (workHours > 0) {
      return `Worked + ${leaveLabels.join(", ")}`;
    }
    return leaveLabels.join(", ");
  }

  if (timesheet.leave_request_id) {
    const fromNotes = resolveAttendanceStatusFromNotes(timesheet.notes ?? "");
    if (fromNotes) return fromNotes;
    return "Leave";
  }

  const fromNotes = resolveAttendanceStatusFromNotes(timesheet.notes ?? "");
  if (fromNotes) return fromNotes;

  if ((timesheet.total_hours ?? 0) <= 0 && (timesheet.daily_total_hours ?? 0) <= 0) {
    return "No Hours Logged";
  }

  return "Worked";
}

function resolveTotalHoursWorked(timesheet: WorkerTimesheet): number {
  if (timesheet.daily_total_hours != null && Number.isFinite(timesheet.daily_total_hours)) {
    return Math.max(0, Number(timesheet.daily_total_hours));
  }
  if (timesheet.total_hours != null && Number.isFinite(timesheet.total_hours)) {
    return Math.max(0, Number(timesheet.total_hours));
  }

  const activities = timesheet.activities ?? [];
  const breaks = timesheet.breaks ?? [];
  if (activities.length > 0 || breaks.length > 0) {
    return calculateDailyTotalsFromSlots(activities, breaks).dailyTotalHours;
  }

  return 0;
}

function resolveSiteRemarks(notes: string | null | undefined): string {
  const text = notes?.trim() ?? "";
  if (!text) return "";
  return text;
}

export async function fetchTimesheetHoursReportRows(input: {
  startDate: string;
  endDate: string;
  projectIds: string[];
  projects: DbProject[];
  stateFilters?: WorkerStateRegion[];
}): Promise<TimesheetHoursReportRow[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("worker_timesheets")
      .select("*")
      .gte("work_date", input.startDate)
      .lte("work_date", input.endDate)
      .order("work_date", { ascending: true })
      .order("created_at", { ascending: true });

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch timesheet hours report")) {
        return [];
      }
      console.error("Failed to fetch timesheet hours report:", error.message);
      return [];
    }

    const timesheets = (data ?? [])
      .map((row) => mapTimesheetRow(row as Record<string, unknown>))
      .filter((row) => row.is_draft !== true);

    if (timesheets.length === 0) return [];

    const [{ workers }, subcontractors] = await Promise.all([
      fetchAllWorkers(),
      fetchSubcontractors(),
    ]);

    const workerById = new Map(workers.map((worker) => [worker.id, worker]));
    const subcontractorNames = new Map(
      subcontractors.map((row) => [row.id, row.company_name || "Subcontractor"])
    );

    const projectById = new Map(input.projects.map((project) => [project.id, project]));
    const stateFilters = input.stateFilters ?? [];

    return timesheets
      .filter((timesheet) =>
        matchesProjectFilter(timesheet.project_id, input.projectIds, input.projects)
      )
      .filter((timesheet) => {
        if (stateFilters.length === 0) return true;
        const worker = workerById.get(timesheet.worker_id);
        const resolvedState =
          resolveTimesheetStateForFilter(
            {
              worker_state: worker?.state ?? null,
              project_id: timesheet.project_id,
            },
            projectById
          ) ??
          parseStateFromProjectLocation(
            projectById.get(timesheet.project_id ?? "")?.location ?? null
          );
        return resolvedState != null && stateFilters.includes(resolvedState);
      })
      .map((timesheet) => {
        const worker = workerById.get(timesheet.worker_id);
        return {
          workerName: getWorkerDisplayName(worker, "Unknown worker"),
          employmentStatus: resolveEmploymentStatus(worker, subcontractorNames),
          projectSite: resolveProjectSiteLabel(timesheet, input.projects),
          workDate: timesheet.work_date.slice(0, 10),
          startTime: formatTimeDisplay(timesheet.start_time),
          endTime: formatTimeDisplay(timesheet.finish_time),
          totalHours: formatTimesheetHours(resolveTotalHoursWorked(timesheet)),
          attendanceStatus: resolveTimesheetAttendanceStatus(timesheet),
          notes: resolveSiteRemarks(timesheet.notes),
        } satisfies TimesheetHoursReportRow;
      });
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch timesheet hours report")) {
      return [];
    }
    console.error("Failed to fetch timesheet hours report:", error);
    return [];
  }
}

export function buildTimesheetHoursReportCsv(rows: TimesheetHoursReportRow[]): string {
  const headers = [
    "Worker Name",
    "Subcontractor / Direct Employee Status",
    "Assigned Project / Site Location",
    "Date",
    "Start Time",
    "End Time",
    "Total Hours Worked",
    "Attendance / Leave Status",
    "Notes / Site Remarks",
  ];

  const body = rows.map((row) =>
    [
      row.workerName,
      row.employmentStatus,
      row.projectSite,
      row.workDate,
      row.startTime,
      row.endTime,
      row.totalHours,
      row.attendanceStatus,
      row.notes,
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [
    "### Timesheets & Daily Hours",
    headers.map(escapeCsvValue).join(","),
    ...body,
  ].join("\n");
}

export async function buildTimesheetHoursReportSection(input: {
  startDate: string;
  endDate: string;
  projectIds: string[];
  projects: DbProject[];
  stateFilters?: WorkerStateRegion[];
}): Promise<string> {
  const rows = await fetchTimesheetHoursReportRows(input);
  if (rows.length === 0) {
    return [
      "### Timesheets & Daily Hours",
      headersLine(),
      [
        "No timesheet records",
        "",
        "",
        "",
        "",
        "",
        "",
        "No records in selected date range",
        "",
      ]
        .map(escapeCsvValue)
        .join(","),
    ].join("\n");
  }
  return buildTimesheetHoursReportCsv(rows);
}

function headersLine(): string {
  return [
    "Worker Name",
    "Subcontractor / Direct Employee Status",
    "Assigned Project / Site Location",
    "Date",
    "Start Time",
    "End Time",
    "Total Hours Worked",
    "Attendance / Leave Status",
    "Notes / Site Remarks",
  ]
    .map(escapeCsvValue)
    .join(",");
}
