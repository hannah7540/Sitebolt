import {
  supabase,
  isSupabaseConfigured,
  type WorkerTimesheet,
  type MyobExportStatus,
  type TimesheetStatus,
} from "./supabase";
import { mapTimesheetRow } from "./timesheet-entries";
import { formatTimesheetHours, isTimesheetApproved, isTimesheetPending, normalizeTimesheetStatus } from "./timesheet-utils";
import { fetchWorkerProfileNameMap } from "./worker-profile-lookup";

export type AccountsTimesheetFilter =
  | "all"
  | "pending"
  | "approved"
  | "exported";

export interface AccountsTimesheetRow extends WorkerTimesheet {
  worker_name: string;
  worker_trade?: string | null;
  pay_rate_id?: string | null;
  worker_is_hsr?: boolean;
}

export function resolveTimesheetOvertimeHours(row: WorkerTimesheet): number {
  if (row.overtime_hours != null && row.overtime_hours > 0) {
    return Number(row.overtime_hours);
  }
  return Math.max(0, Math.round((Number(row.total_hours) - 8) * 100) / 100);
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

  const { data: timesheetData, error: timesheetError } = await supabase
    .from("worker_timesheets")
    .select("*")
    .order("work_date", { ascending: false })
    .order("created_at", { ascending: false });

  if (timesheetError) {
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
  const workerNameById = await fetchWorkerProfileNameMap(workerIds);

  const { data: workerData, error: workerError } = await supabase
    .from("workers")
    .select("id, trade, pay_rate_id, is_hsr")
    .in("id", workerIds);

  type WorkerPayrollRow = {
    id: string;
    trade?: string | null;
    pay_rate_id?: string | null;
    is_hsr?: boolean | null;
  };

  let workerRows: WorkerPayrollRow[] | null = (workerData ?? []) as WorkerPayrollRow[];
  if (workerError) {
    console.warn("Failed to resolve worker payroll fields for timesheets:", workerError.message);
    const { data: fallbackData } = await supabase
      .from("workers")
      .select("id, trade, pay_rate_id")
      .in("id", workerIds);
    workerRows = (fallbackData ?? []) as WorkerPayrollRow[];
  }

  const workerTradeById = new Map<string, string | null>();
  const workerPayRateById = new Map<string, string | null>();
  const workerHsrById = new Map<string, boolean>();

  for (const worker of workerRows ?? []) {
    const row = worker as {
      id: string;
      trade?: string | null;
      pay_rate_id?: string | null;
      is_hsr?: boolean | null;
    };
    workerTradeById.set(row.id, row.trade?.trim() || null);
    workerPayRateById.set(row.id, row.pay_rate_id?.trim() || null);
    workerHsrById.set(row.id, Boolean(row.is_hsr));
  }

  return timesheets.map((row) => ({
    ...row,
    worker_name: workerNameById.get(row.worker_id) ?? "Unknown worker",
    worker_trade: row.worker_trade ?? workerTradeById.get(row.worker_id) ?? null,
    pay_rate_id: workerPayRateById.get(row.worker_id) ?? null,
    worker_is_hsr: workerHsrById.get(row.worker_id) ?? false,
    myob_export_status: (row.myob_export_status ?? "not_exported") as MyobExportStatus,
    overtime_hours: resolveTimesheetOvertimeHours(row),
  }));
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

export function downloadPayrollTimesheetCsv(
  rows: AccountsTimesheetRow[],
  filename = "sitebolt-timesheets-payroll.csv"
): void {
  const headers = [
    "Worker Name",
    "Trade",
    "Project",
    "Work Date",
    "Work Hours",
    "Break Hours",
    "Total Hours",
    "Status",
    "Signature URL",
    "Notes",
  ];

  const lines = rows.map((row) =>
    [
      row.worker_name,
      row.worker_trade ?? "",
      row.project_name ?? "",
      row.work_date,
      row.work_hours ?? row.total_hours,
      row.break_hours ?? row.break_minutes / 60,
      row.daily_total_hours ?? row.total_hours,
      row.status,
      row.signature_url ?? "",
      row.notes ?? "",
    ]
      .map(escapeCsvValue)
      .join(",")
  );

  const csv = [headers.join(","), ...lines].join("\n");
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
