import {
  supabase,
  isSupabaseConfigured,
  type WorkerTimesheet,
  type MyobExportStatus,
  type TimesheetStatus,
  type LeaveRequest,
  type LeaveRequestStatus,
} from "./supabase";
import { handleSupabaseNetworkFetchError } from "./project-resolver";
import { mapTimesheetRow } from "./timesheet-entries";
import {
  formatTimesheetHours,
  isTimesheetApproved,
  isTimesheetPending,
  normalizeTimesheetStatus,
} from "./timesheet-utils";
import { getWorkerDisplayName } from "./worker-utils";
import type { PayRateRule } from "./pay-rates-and-rules";
import {
  calculateTimesheetPay,
  formatPayCurrency,
  type TimesheetPayLineItem,
} from "./calculateTimesheetPay";
import { resolveTimesheetLineItems } from "./timesheet-line-items";
import {
  buildPayrollExportFilename,
  buildPayrollExportLinesForTimesheet,
  buildPayrollTimesheetExportCsvFromLines,
  fetchPayrollCsvExportProjectLookups,
  resolvePayrollCsvProjectLookups,
  type PayrollCsvProjectLookups,
} from "./payroll-timesheet-csv-export";
import type { DbProject } from "./project-resolver";
import {
  normalizeWorkerStateRegion,
  WORKER_STATE_REGION_OPTIONS,
  type WorkerStateRegion,
} from "./worker-state-region";
import {
  getLeaveEndDate,
  getLeaveStartDate,
  isLeaveRequestApproved,
  isLeaveRequestPending,
} from "./leave-requests";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import { resolveLeaveTimesheetDaySpec } from "./leave-timesheet-rules";
import { enumerateDateRange } from "./scheduler-utils";
import { getProjectDisplayName } from "./project-resolver";
import { isDateInPayWeek } from "./pay-week-utils";
import { resolvePayRuleTemplateNameForWorker } from "./worker-pay-rule-assignment";

export type AccountsTimesheetFilter =
  | "all"
  | "pending"
  | "approved"
  | "exported";

export interface TimesheetLinePayBreakdown extends TimesheetPayLineItem {}

export interface AccountsTimesheetLineBreakdown {
  summary: string;
  items: TimesheetLinePayBreakdown[];
  totalAmount: number;
}

export interface AccountsTimesheetRow extends WorkerTimesheet {
  worker_name: string;
  worker_first_name?: string | null;
  worker_last_name?: string | null;
  worker_trade?: string | null;
  pay_rate_id?: string | null;
  worker_is_hsr?: boolean;
  worker_is_apprentice?: boolean;
  worker_has_company_vehicle?: boolean;
  worker_state?: string | null;
  is_leave_preview?: boolean;
  leave_preview_request_status?: LeaveRequestStatus;
}

const LEAVE_PREVIEW_ID_PREFIX = "leave-preview-";

export function isLeavePreviewTimesheetRow(row: Pick<AccountsTimesheetRow, "id" | "is_leave_preview">): boolean {
  return row.is_leave_preview === true || row.id.startsWith(LEAVE_PREVIEW_ID_PREFIX);
}

function intersectDateRangeWithPayWeek(
  rangeStart: string,
  rangeEnd: string,
  weekStartIso: string,
  weekEndIso: string
): string[] {
  const overlapStart = rangeStart > weekStartIso ? rangeStart : weekStartIso;
  const overlapEnd = rangeEnd < weekEndIso ? rangeEnd : weekEndIso;
  if (overlapEnd < overlapStart) return [];
  return enumerateDateRange(overlapStart, overlapEnd);
}

function buildLeavePreviewTimesheetRow(
  request: LeaveRequest,
  dayIso: string,
  workerMeta: AccountsTimesheetRow | null
): AccountsTimesheetRow {
  const leaveType = normalizeLeaveTypeLabel(request.leave_type);
  const daySpec = resolveLeaveTimesheetDaySpec(leaveType, dayIso);
  const projectId = request.project_id?.trim() || null;
  const projectName = projectId ? getProjectDisplayName(projectId) : null;
  const previewSuffix = isLeaveRequestPending(request.status)
    ? "Pending leave request (advance preview)"
    : "Approved leave request (advance preview)";
  const workerName =
    request.worker_name?.trim() ||
    workerMeta?.worker_name ||
    "Unknown worker";

  return {
    id: `${LEAVE_PREVIEW_ID_PREFIX}${request.id}-${dayIso}`,
    worker_id: request.worker_id,
    work_date: dayIso,
    project_id: projectId,
    project_name: projectName,
    start_time: daySpec.startTime,
    finish_time: daySpec.finishTime,
    break_minutes: 0,
    total_hours: daySpec.totalHours,
    work_hours: daySpec.workHours,
    daily_total_hours: daySpec.totalHours,
    activities: daySpec.activities.map((activity) => ({
      id: activity.id,
      startTime: activity.start_time,
      endTime: activity.end_time,
      label: activity.label,
    })),
    breaks: [],
    notes: `${leaveType} - ${previewSuffix}`,
    status: "pending",
    is_draft: false,
    leave_request_id: request.id,
    worker_name: workerName,
    worker_first_name: workerMeta?.worker_first_name ?? null,
    worker_last_name: workerMeta?.worker_last_name ?? null,
    worker_trade: workerMeta?.worker_trade ?? null,
    pay_rate_id: workerMeta?.pay_rate_id ?? null,
    worker_is_hsr: workerMeta?.worker_is_hsr ?? false,
    worker_is_apprentice: workerMeta?.worker_is_apprentice ?? false,
    worker_has_company_vehicle: workerMeta?.worker_has_company_vehicle ?? false,
    worker_state: workerMeta?.worker_state ?? null,
    myob_export_status: "not_exported",
    overtime_hours: 0,
    is_leave_preview: true,
    leave_preview_request_status: request.status,
  };
}

/** Add synthetic leave rows for pending/approved requests not yet backed by timesheets. */
export function mergeAdvanceLeaveRequestsIntoTimesheets(
  rows: AccountsTimesheetRow[],
  leaveRequests: LeaveRequest[],
  weekStartIso: string,
  weekEndIso: string
): AccountsTimesheetRow[] {
  const existingByWorkerDate = new Set(
    rows.map((row) => `${row.worker_id}:${row.work_date}`)
  );
  const workerMetaById = new Map<string, AccountsTimesheetRow>();
  for (const row of rows) {
    if (!workerMetaById.has(row.worker_id)) {
      workerMetaById.set(row.worker_id, row);
    }
  }

  const previewRows: AccountsTimesheetRow[] = [];

  for (const request of leaveRequests) {
    if (!isLeaveRequestPending(request.status) && !isLeaveRequestApproved(request.status)) {
      continue;
    }

    const leaveStart = getLeaveStartDate(request);
    const leaveEnd = getLeaveEndDate(request);
    const overlappingDays = intersectDateRangeWithPayWeek(
      leaveStart,
      leaveEnd,
      weekStartIso,
      weekEndIso
    );

    for (const dayIso of overlappingDays) {
      if (!isDateInPayWeek(dayIso, weekStartIso, weekEndIso)) continue;
      const key = `${request.worker_id}:${dayIso}`;
      if (existingByWorkerDate.has(key)) continue;

      previewRows.push(
        buildLeavePreviewTimesheetRow(
          request,
          dayIso,
          workerMetaById.get(request.worker_id) ?? null
        )
      );
      existingByWorkerDate.add(key);
    }
  }

  if (previewRows.length === 0) return rows;
  return [...rows, ...previewRows];
}

export { WORKER_STATE_REGION_OPTIONS as ACCOUNTS_TIMESHEET_STATE_OPTIONS };
export type { WorkerStateRegion as AccountsTimesheetStateFilter };

/** Parse ACT/NSW/WA/NZ from a project location string (e.g. "Perth, WA"). */
export function parseStateFromProjectLocation(
  location: string | null | undefined
): WorkerStateRegion | null {
  const direct = normalizeWorkerStateRegion(location);
  if (direct) return direct;

  const text = location?.trim();
  if (!text) return null;

  const upper = text.toUpperCase();
  for (const state of WORKER_STATE_REGION_OPTIONS) {
    if (new RegExp(`\\b${state}\\b`).test(upper)) {
      return state;
    }
  }

  return null;
}

/** Worker state first; fall back to the timesheet project's location. */
export function resolveTimesheetStateForFilter(
  row: Pick<AccountsTimesheetRow, "worker_state" | "project_id">,
  projectById: Map<string, DbProject>
): WorkerStateRegion | null {
  const workerState = normalizeWorkerStateRegion(row.worker_state);
  if (workerState) return workerState;

  if (!row.project_id) return null;

  const project = projectById.get(row.project_id);
  return parseStateFromProjectLocation(project?.location ?? null);
}

export function resolveTimesheetOvertimeHours(row: WorkerTimesheet): number {
  if (row.overtime_hours != null && row.overtime_hours > 0) {
    return Number(row.overtime_hours);
  }
  return Math.max(0, Math.round((Number(row.total_hours) - 8) * 100) / 100);
}

type WorkerPayrollRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  trade?: string | null;
  pay_rule_id?: string | null;
  pay_rate_id?: string | null;
  is_hsr?: boolean | null;
  is_apprentice?: boolean | null;
  has_company_vehicle?: boolean | null;
  state?: string | null;
};

const WORKER_PAYROLL_SELECT_VARIANTS = [
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id, trade, is_hsr, is_apprentice, has_company_vehicle, state",
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id, trade, is_hsr, is_apprentice, state",
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id, trade, is_hsr, is_apprentice",
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id, trade, is_hsr",
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id, trade",
  "id, first_name, last_name, full_name, pay_rule_id, pay_rate_id",
  "id, first_name, last_name, full_name, pay_rate_id",
  "id, first_name, last_name, full_name",
  "id, first_name, last_name",
] as const;

function isMissingWorkerColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

async function fetchWorkerPayrollRows(workerIds: string[]): Promise<WorkerPayrollRow[]> {
  if (workerIds.length === 0) return [];

  try {
    for (const select of WORKER_PAYROLL_SELECT_VARIANTS) {
      const { data, error } = await supabase.from("workers").select(select).in("id", workerIds);
      if (!error) {
        return (data ?? []) as unknown as WorkerPayrollRow[];
      }
      if (handleSupabaseNetworkFetchError(error, "fetch worker payroll rows")) {
        return [];
      }
      if (!isMissingWorkerColumnError(error.message)) {
        console.warn("Failed to resolve worker payroll fields for timesheets:", error.message);
        return [];
      }
    }

    return [];
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch worker payroll rows")) {
      return [];
    }
    console.warn("Failed to resolve worker payroll fields for timesheets:", error);
    return [];
  }
}

export function formatTimesheetDatePeriod(workDate: string): string {
  const parsed = new Date(`${workDate}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return workDate;
  return parsed.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function myobExportStatusMeta(status: MyobExportStatus | undefined): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "exported":
      return {
        label: "Exported to MYOB",
        badgeClass: "bg-blue-100 text-blue-800",
      };
    case "processed":
      return {
        label: "Processed",
        badgeClass: "bg-emerald-100 text-emerald-800",
      };
    default:
      return {
        label: "Not Exported",
        badgeClass: "bg-slate-100 text-slate-700",
      };
  }
}

export function approvalStatusMeta(status: TimesheetStatus | string): {
  label: string;
  badgeClass: string;
} {
  switch (normalizeTimesheetStatus(status)) {
    case "approved":
      return {
        label: "Approved",
        badgeClass: "bg-emerald-100 text-emerald-800",
      };
    case "rejected":
      return {
        label: "Rejected",
        badgeClass: "bg-red-100 text-red-800",
      };
    case "draft":
      return {
        label: "Draft",
        badgeClass: "bg-slate-100 text-slate-700",
      };
    default:
      return {
        label: "Pending Review",
        badgeClass: "bg-amber-100 text-amber-800",
      };
  }
}

export function filterAccountsTimesheets(
  rows: AccountsTimesheetRow[],
  filter: AccountsTimesheetFilter
): AccountsTimesheetRow[] {
  switch (filter) {
    case "pending":
      return rows.filter((row) => isTimesheetPending(row.status));
    case "approved":
      return rows.filter((row) => isTimesheetApproved(row.status));
    case "exported":
      return rows.filter(
        (row) =>
          row.myob_export_status === "exported" ||
          row.myob_export_status === "processed"
      );
    default:
      return rows;
  }
}

export async function fetchAccountsTimesheets(): Promise<AccountsTimesheetRow[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data: timesheetData, error: timesheetError } = await supabase
      .from("worker_timesheets")
      .select("*")
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (timesheetError) {
      if (handleSupabaseNetworkFetchError(timesheetError, "fetch accounts timesheets")) {
        return [];
      }
      if (!timesheetError.message.toLowerCase().includes("worker_timesheets")) {
        console.error("Failed to fetch accounts timesheets:", timesheetError.message);
      }
      return [];
    }

    const timesheets = (timesheetData ?? []).map((row) =>
      mapTimesheetRow(row as Record<string, unknown>)
    );
    if (timesheets.length === 0) return [];

    const workerIds = [...new Set(timesheets.map((row) => row.worker_id))];
    const workerRows = await fetchWorkerPayrollRows(workerIds);

    const workerNameById = new Map<string, string>();
    const workerFirstNameById = new Map<string, string | null>();
    const workerLastNameById = new Map<string, string | null>();
    const workerTradeById = new Map<string, string | null>();
    const workerPayRateById = new Map<string, string | null>();
    const workerHsrById = new Map<string, boolean>();
    const workerApprenticeById = new Map<string, boolean>();
    const workerCompanyVehicleById = new Map<string, boolean>();
    const workerStateById = new Map<string, string | null>();

    for (const worker of workerRows) {
      const row = worker as WorkerPayrollRow;
      workerNameById.set(row.id, getWorkerDisplayName(row, "Unknown worker"));
      workerFirstNameById.set(row.id, row.first_name?.trim() || null);
      workerLastNameById.set(row.id, row.last_name?.trim() || null);
      workerTradeById.set(row.id, row.trade?.trim() || null);
      workerPayRateById.set(
        row.id,
        row.pay_rule_id?.trim() || row.pay_rate_id?.trim() || null
      );
      workerHsrById.set(row.id, Boolean(row.is_hsr));
      workerApprenticeById.set(row.id, Boolean(row.is_apprentice));
      workerCompanyVehicleById.set(row.id, Boolean(row.has_company_vehicle));
      workerStateById.set(row.id, row.state?.trim() || null);
    }

    return timesheets.map((row) => ({
      ...row,
      worker_name: workerNameById.get(row.worker_id) ?? "Unknown worker",
      worker_first_name: workerFirstNameById.get(row.worker_id) ?? null,
      worker_last_name: workerLastNameById.get(row.worker_id) ?? null,
      worker_trade: row.worker_trade ?? workerTradeById.get(row.worker_id) ?? null,
      pay_rate_id: workerPayRateById.get(row.worker_id) ?? null,
      worker_is_hsr: workerHsrById.get(row.worker_id) ?? false,
      worker_is_apprentice: workerApprenticeById.get(row.worker_id) ?? false,
      worker_has_company_vehicle: workerCompanyVehicleById.get(row.worker_id) ?? false,
      worker_state: workerStateById.get(row.worker_id) ?? null,
      myob_export_status: (row.myob_export_status ?? "not_exported") as MyobExportStatus,
      overtime_hours: resolveTimesheetOvertimeHours(row),
    }));
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch accounts timesheets")) {
      return [];
    }
    console.error("Failed to fetch accounts timesheets:", error);
    return [];
  }
}

export async function approveAccountsTimesheets(
  ids: string[],
  approvedBy?: string | null
): Promise<{ error: string | null; updated: number }> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return { error: null, updated: 0 };
  }

  const now = new Date().toISOString();
  const payload: Record<string, unknown> = {
    status: "approved",
    approved_at: now,
    updated_at: now,
  };
  if (approvedBy?.trim()) {
    payload.approved_by = approvedBy.trim();
  }

  const { data, error } = await supabase
    .from("worker_timesheets")
    .update(payload)
    .in("id", ids)
    .select("id");

  if (error) {
    const fallbackPayload: Record<string, unknown> = { status: "approved" };
    if (approvedBy?.trim()) {
      fallbackPayload.approved_by = approvedBy.trim();
    }

    const fallback = await supabase
      .from("worker_timesheets")
      .update(fallbackPayload)
      .in("id", ids)
      .select("id");

    if (fallback.error) {
      const minimalFallback = await supabase
        .from("worker_timesheets")
        .update({ status: "approved" })
        .in("id", ids)
        .select("id");

      if (minimalFallback.error) {
        return { error: minimalFallback.error.message, updated: 0 };
      }

      return { error: null, updated: minimalFallback.data?.length ?? 0 };
    }

    return { error: null, updated: fallback.data?.length ?? 0 };
  }

  return { error: null, updated: data?.length ?? 0 };
}

export async function markTimesheetsExportedToMyob(
  ids: string[]
): Promise<{ error: string | null; updated: number }> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return { error: null, updated: 0 };
  }

  const now = new Date().toISOString();
  const payload = {
    myob_export_status: "exported",
    myob_exported_at: now,
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("worker_timesheets")
    .update(payload)
    .in("id", ids)
    .select("id");

  if (error) {
    if (
      error.message.toLowerCase().includes("myob_export_status") ||
      error.message.toLowerCase().includes("column")
    ) {
      return {
        error:
          "MYOB export columns are missing. Run migration 055_accounts_navigation_and_security.sql in Supabase.",
        updated: 0,
      };
    }
    return { error: error.message, updated: 0 };
  }

  return { error: null, updated: data?.length ?? 0 };
}

export async function markTimesheetsProcessed(
  ids: string[]
): Promise<{ error: string | null; updated: number }> {
  if (!isSupabaseConfigured() || ids.length === 0) {
    return { error: null, updated: 0 };
  }

  const now = new Date().toISOString();
  const payload = {
    myob_export_status: "processed",
    updated_at: now,
  };

  const { data, error } = await supabase
    .from("worker_timesheets")
    .update(payload)
    .in("id", ids)
    .select("id");

  if (error) {
    if (
      error.message.toLowerCase().includes("myob_export_status") ||
      error.message.toLowerCase().includes("column")
    ) {
      return {
        error:
          "MYOB export columns are missing. Run migration 055_accounts_navigation_and_security.sql in Supabase.",
        updated: 0,
      };
    }
    return { error: error.message, updated: 0 };
  }

  return { error: null, updated: data?.length ?? 0 };
}

function escapeCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function buildMyobTimesheetCsv(rows: AccountsTimesheetRow[]): string {
  const headers = [
    "Worker Name",
    "Project",
    "Work Date",
    "Start Time",
    "Finish Time",
    "Break Minutes",
    "Total Hours",
    "Overtime Hours",
    "Approval Status",
    "MYOB Export Status",
    "Notes",
  ];

  const lines = rows.map((row) =>
    [
      row.worker_name,
      row.project_name ?? "",
      row.work_date,
      row.start_time,
      row.finish_time,
      row.break_minutes,
      row.total_hours,
      resolveTimesheetOvertimeHours(row),
      row.status,
      row.myob_export_status ?? "not_exported",
      row.notes ?? "",
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  return [headers.join(","), ...lines].join("\n");
}

export function formatPayrollExportUnits(hours: number): number {
  return Math.round(hours * 100) / 100;
}

export function buildPayrollTimesheetExportCsv(
  rows: AccountsTimesheetRow[],
  payRules: PayRateRule[] = [],
  projectsOrLookups: DbProject[] | PayrollCsvProjectLookups = []
): string {
  const lookups = resolvePayrollCsvProjectLookups(projectsOrLookups);
  const exportLines = rows.flatMap((row) => {
    const payRule = resolveTimesheetPayRule(row, payRules);
    return buildPayrollExportLinesForTimesheet(row, payRule, lookups);
  });

  return buildPayrollTimesheetExportCsvFromLines(exportLines);
}

export async function buildPayrollTimesheetExportCsvAsync(
  rows: AccountsTimesheetRow[],
  payRules: PayRateRule[] = []
): Promise<string> {
  const lookups = await fetchPayrollCsvExportProjectLookups();
  return buildPayrollTimesheetExportCsv(rows, payRules, lookups);
}

export { buildPayrollExportFilename } from "./payroll-timesheet-csv-export";

export async function downloadPayrollTimesheetCsv(
  rows: AccountsTimesheetRow[],
  payRules: PayRateRule[] = [],
  options: {
    filename?: string;
    projects?: DbProject[];
    lookups?: PayrollCsvProjectLookups;
  } = {}
): Promise<void> {
  const lookups =
    options.lookups ??
    (options.projects?.length
      ? resolvePayrollCsvProjectLookups(options.projects)
      : await fetchPayrollCsvExportProjectLookups());
  const csv = buildPayrollTimesheetExportCsv(rows, payRules, lookups);
  const filename = options.filename ?? buildPayrollExportFilename(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function downloadMyobTimesheetCsv(
  rows: AccountsTimesheetRow[],
  filename = "sitebolt-myob-timesheets.csv"
): void {
  const csv = buildMyobTimesheetCsv(rows);
  const blob = new Blob([csv], { type: "text/csv;charset=utf-8;" });
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  link.click();
  URL.revokeObjectURL(url);
}

export function summarizeTimesheetHours(rows: AccountsTimesheetRow[]): {
  totalHours: string;
  totalOvertime: string;
} {
  const totalHours = rows.reduce((sum, row) => sum + Number(row.total_hours), 0);
  const totalOvertime = rows.reduce(
    (sum, row) => sum + resolveTimesheetOvertimeHours(row),
    0
  );

  return {
    totalHours: formatTimesheetHours(Math.round(totalHours * 100) / 100),
    totalOvertime: formatTimesheetHours(Math.round(totalOvertime * 100) / 100),
  };
}

function findPayRuleById(
  payRules: PayRateRule[],
  id: string | null | undefined
): PayRateRule | null {
  const trimmed = id?.trim();
  if (!trimmed) return null;
  return payRules.find((rule) => rule.id === trimmed) ?? null;
}

function findPayRuleByName(
  payRules: PayRateRule[],
  name: string | null | undefined
): PayRateRule | null {
  const trimmed = name?.trim().toLowerCase();
  if (!trimmed) return null;
  return (
    payRules.find((rule) => rule.rule_name.trim().toLowerCase() === trimmed) ??
    payRules.find((rule) => rule.rule_name.trim().toLowerCase().includes(trimmed)) ??
    null
  );
}

/**
 * Resolve the pay rule for a timesheet the same way payroll export does:
 * explicit worker pay_rule_id / pay_rate_id, then the state-derived Site Worker mapping.
 */
export function resolveTimesheetPayRule(
  row: Pick<AccountsTimesheetRow, "pay_rate_id" | "worker_state">,
  payRules: PayRateRule[]
): PayRateRule | null {
  const byId = findPayRuleById(payRules, row.pay_rate_id);
  if (byId) return byId;

  const templateName = resolvePayRuleTemplateNameForWorker(row.worker_state);
  const byTemplateName = findPayRuleByName(payRules, templateName);
  if (byTemplateName) return byTemplateName;

  const state = normalizeWorkerStateRegion(row.worker_state);
  if (state) {
    const byState = payRules.find((rule) =>
      rule.rule_name.trim().toUpperCase().startsWith(state)
    );
    if (byState) return byState;
  }

  return null;
}

/** True when a timesheet already has a pay rule via stored id, worker state, or name lookup. */
export function timesheetHasResolvablePayRule(
  row: Pick<AccountsTimesheetRow, "pay_rate_id" | "worker_state">,
  payRules: PayRateRule[] = []
): boolean {
  if (row.pay_rate_id?.trim()) return true;
  if (normalizeWorkerStateRegion(row.worker_state)) return true;
  return resolveTimesheetPayRule(row, payRules) != null;
}

/** Admin-only gross pay calculation for Accounts timesheets. */
export function calculateAccountsTimesheetPay(
  row: AccountsTimesheetRow,
  payRules: PayRateRule[]
): import("./calculateTimesheetPay").TimesheetPayBreakdown | null {
  const payRule = resolveTimesheetPayRule(row, payRules);
  if (!payRule) return null;

  return calculateTimesheetPay(row, payRule, {
    hsrApplicable: row.worker_is_hsr ?? false,
    isApprentice: row.worker_is_apprentice ?? false,
    hasCompanyVehicle: row.worker_has_company_vehicle ?? false,
  });
}

/** Itemized hours and pay amounts per daily line entry. */
export function resolveTimesheetLineBreakdown(
  row: AccountsTimesheetRow,
  payRules: PayRateRule[]
): AccountsTimesheetLineBreakdown {
  const payBreakdown = calculateAccountsTimesheetPay(row, payRules);
  const resolvedItems = resolveTimesheetLineItems(row);

  if (!payBreakdown) {
    return {
      summary:
        resolvedItems.length > 0
          ? resolvedItems
              .map((item) => `${item.hours}h ${item.label}`)
              .join(", ")
          : "—",
      items: resolvedItems.map((item) => ({
        category: item.category,
        label: item.label,
        hours: item.hours,
        rate: 0,
        amount: 0,
      })),
      totalAmount: 0,
    };
  }

  return {
    summary: payBreakdown.line_items
      .map((item) => `${item.hours}h ${item.label}`)
      .join(", "),
    items: payBreakdown.line_items,
    totalAmount: payBreakdown.line_items.reduce((sum, item) => sum + item.amount, 0),
  };
}

export function formatTimesheetLineBreakdownAmount(amount: number): string {
  return formatPayCurrency(amount);
}
