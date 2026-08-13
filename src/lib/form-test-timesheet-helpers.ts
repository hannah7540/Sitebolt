import {
  buildPayrollTimesheetExportCsv,
  type AccountsTimesheetRow,
} from "./accounts-timesheets";
import {
  PAYROLL_CSV_HEADERS,
  PAYROLL_CSV_V2_HEADER,
  buildPayrollExportLinesForTimesheet,
  formatPayrollExportDate,
} from "./payroll-timesheet-csv-export";
import { resolveFormTestContext, type FormTestContext } from "./form-submission-tester";
import {
  fetchTimesheetFormOptions,
  formatTimesheetProjectDisplayName,
} from "./timesheet-options";
import { mapTimesheetRow } from "./timesheet-entries";
import {
  calculateDailyTotalsFromSlots,
  resolveTimesheetDisplayTotals,
  type TimesheetActivitySlot,
  type TimesheetBreakSlot,
} from "./timesheet-utils";
import { validateActBreakForTimesheetPayload as validateActBreakRuleForPayload } from "./timesheet-act-break-validation";
import { buildWorkerFullName, getWorkerDisplayName } from "./worker-utils";
import { supabase } from "./supabase";
import type { WorkerTimesheet } from "./supabase";

export interface TimesheetTestPicklists {
  projectId: string;
  projectName: string;
  taskName: string;
  projectCount: number;
  taskCount: number;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function nowIso(): string {
  return new Date().toISOString();
}

export async function resolveTimesheetTestPicklists(): Promise<{
  picklists: TimesheetTestPicklists | null;
  error: string | null;
}> {
  const result = await fetchTimesheetFormOptions();

  if (result.projects.length === 0 || result.tasks.length === 0) {
    return {
      picklists: null,
      error:
        result.error ??
        `Active picklists incomplete (projects=${result.projects.length}, tasks=${result.tasks.length}). Populate timesheet_projects and timesheet_tasks with is_active = true and public SELECT policies.`,
    };
  }

  const project = result.projects[0]!;
  const task = result.tasks[0]!;

  return {
    picklists: {
      projectId: project.id,
      projectName: formatTimesheetProjectDisplayName(project),
      taskName: task.name,
      projectCount: result.projects.length,
      taskCount: result.tasks.length,
    },
    error: result.error,
  };
}

export async function enrichFormTestContext(
  ctx: FormTestContext
): Promise<FormTestContext> {
  const { data: workerRow } = await supabase
    .from("workers")
    .select("id, first_name, last_name, full_name, state")
    .eq("id", ctx.workerId)
    .maybeSingle();

  const record =
    workerRow && typeof workerRow === "object"
      ? (workerRow as Record<string, unknown>)
      : null;

  const workerFirstName = String(record?.first_name ?? "").trim();
  const workerLastName = String(record?.last_name ?? "").trim();
  const workerName = getWorkerDisplayName(
    {
      first_name: workerFirstName || null,
      last_name: workerLastName || null,
      full_name: record?.full_name ? String(record.full_name) : null,
    },
    ctx.workerName
  );

  const { picklists } = await resolveTimesheetTestPicklists();

  return {
    ...ctx,
    workerName,
    workerFirstName: workerFirstName || undefined,
    workerLastName: workerLastName || undefined,
    workerState: record?.state ? String(record.state) : null,
    timesheetProjectId: picklists?.projectId ?? ctx.projectId,
    timesheetProjectName: picklists?.projectName ?? ctx.projectName,
    timesheetTaskName: picklists?.taskName ?? "Labourer",
  };
}

export function buildTestTimesheetInsertPayload(options: {
  workerId: string;
  projectId: string | null;
  projectName: string;
  taskName: string;
  workDate?: string;
  notes?: string;
  includeBreak?: boolean;
}): Record<string, unknown> {
  const workDate = options.workDate ?? todayIso();
  const now = nowIso();
  const activities: TimesheetActivitySlot[] = [
    {
      id: "activity-test",
      startTime: "06:30",
      endTime: "14:30",
      label: "WORKING ON SITE",
    },
  ];
  const breaks: TimesheetBreakSlot[] = options.includeBreak === false
    ? []
    : [
        {
          id: "break-test",
          startTime: "09:30",
          endTime: "10:00",
        },
      ];

  const totals = calculateDailyTotalsFromSlots(activities, breaks);

  return {
    worker_id: options.workerId,
    work_date: workDate,
    timesheet_date: workDate,
    week_start_date: workDate,
    week_end_date: workDate,
    project_id: options.projectId,
    project_name: options.projectName,
    worker_trade: options.taskName,
    trade: options.taskName,
    start_time: "06:30:00",
    finish_time: "14:30:00",
    end_time: "14:30:00",
    break_minutes: breaks.length > 0 ? 30 : 0,
    work_hours: totals.workHours,
    break_hours: totals.breakHours,
    daily_total_hours: totals.dailyTotalHours,
    total_hours: totals.dailyTotalHours,
    activities: activities.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
      label: row.label,
    })),
    entries: activities.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
      label: row.label,
    })),
    breaks: breaks.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
    notes: options.notes ?? "Test timesheet entry",
    signature_url: "https://example.com/form-test-signature.png",
    is_draft: false,
    status: "pending",
    submitted_at: now,
    created_at: now,
    updated_at: now,
  };
}

export function validateTimesheetHourCalculations(row: WorkerTimesheet): string[] {
  const totals = resolveTimesheetDisplayTotals(row);
  const errors: string[] = [];
  const expectedDaily = Math.max(0, totals.workHours - totals.breakHours);

  if (Math.abs(totals.dailyTotalHours - expectedDaily) > 0.02) {
    errors.push(
      `Daily total ${totals.dailyTotalHours} does not match work ${totals.workHours} minus break ${totals.breakHours}.`
    );
  }

  if (totals.workHours < 0 || totals.breakHours < 0 || totals.dailyTotalHours < 0) {
    errors.push("Work, break, or daily totals are negative.");
  }

  return errors;
}

export { validateActBreakRuleForPayload as validateActBreakForTimesheetPayload };

export function buildLeaveTimesheetInsertPayload(options: {
  workerId: string;
  projectId: string | null;
  projectName: string;
  workDate?: string;
  leaveType?: string;
  leaveRequestId?: string;
}): Record<string, unknown> {
  const workDate = options.workDate ?? todayIso();
  const leaveType = options.leaveType ?? "Annual Leave";
  const now = nowIso();

  return {
    worker_id: options.workerId,
    work_date: workDate,
    project_id: options.projectId,
    project_name: options.projectName,
    start_time: "06:30",
    finish_time: "14:30",
    break_minutes: 0,
    break_hours: 0,
    work_hours: 8,
    daily_total_hours: 8,
    total_hours: 8,
    activities: [
      {
        id: "leave-auto",
        start_time: "06:30",
        end_time: "14:30",
        label: leaveType,
      },
    ],
    breaks: [],
    notes: `${leaveType} - Auto-generated from approved leave request`,
    status: "pending",
    is_draft: false,
    submitted_at: now,
    leave_request_id: options.leaveRequestId ?? null,
    updated_at: now,
  };
}

export function parseCsvLine(line: string): string[] {
  const cells: string[] = [];
  let current = "";
  let inQuotes = false;

  for (let index = 0; index < line.length; index += 1) {
    const char = line[index]!;
    if (char === '"') {
      if (inQuotes && line[index + 1] === '"') {
        current += '"';
        index += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (char === "," && !inQuotes) {
      cells.push(current);
      current = "";
      continue;
    }
    current += char;
  }

  cells.push(current);
  return cells;
}

export function validatePayrollCsvExportRow(
  row: AccountsTimesheetRow,
  csv: string,
  _rowIndex = 0
): string[] {
  const lines = csv.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) {
    return ["CSV export did not produce a header and data row."];
  }

  if (lines[0] !== PAYROLL_CSV_V2_HEADER) {
    return ["CSV header row does not match Payroll V2 NSW schema."];
  }

  const dataLines = lines.slice(1).map(parseCsvLine);
  const formattedDate = formatPayrollExportDate(row.work_date);
  const firstName = row.worker_first_name?.trim() ?? "";
  const lastName = row.worker_last_name?.trim() ?? "";

  const workerRows = dataLines.filter((cells) => {
    const matchesDate = cells[4] === formattedDate;
    const matchesName =
      (firstName ? cells[1] === firstName : true) &&
      (lastName ? cells[2] === lastName : true);
    return matchesDate && matchesName;
  });

  if (workerRows.length === 0) {
    return [`No payroll export rows found for worker on ${formattedDate}.`];
  }

  const expectedLines = buildPayrollExportLinesForTimesheet(row, null);
  const errors: string[] = [];

  for (const expected of expectedLines) {
    const match = workerRows.find(
      (cells) =>
        cells[3] === expected.payrollCategory &&
        Number(cells[7]) === expected.units
    );
    if (!match) {
      errors.push(
        `Missing payroll line "${expected.payrollCategory}" with ${expected.units} units.`
      );
    }
  }

  for (const cells of workerRows) {
    if (cells.length !== PAYROLL_CSV_HEADERS.length) {
      errors.push(
        `Expected ${PAYROLL_CSV_HEADERS.length} columns, got ${cells.length}.`
      );
      break;
    }
    if (!/^\d+$/.test(cells[0] ?? "")) {
      errors.push("First column must contain sequential row numbers.");
      break;
    }
    if (Number.isNaN(Number(cells[7]))) {
      errors.push("Units must be numeric.");
      break;
    }
  }

  return errors;
}

export async function loadWorkerTimesheetRow(id: string): Promise<WorkerTimesheet | null> {
  const { data, error } = await supabase
    .from("worker_timesheets")
    .select("*")
    .eq("id", id)
    .maybeSingle();

  if (error || !data || typeof data !== "object") return null;
  return mapTimesheetRow(data as Record<string, unknown>);
}

export function buildExpectedWorkerDisplayName(ctx: FormTestContext): string {
  if (ctx.workerFirstName || ctx.workerLastName) {
    return buildWorkerFullName(ctx.workerFirstName, ctx.workerLastName);
  }
  return ctx.workerName;
}

export async function resolveEnrichedFormTestContext(): Promise<
  { context: FormTestContext } | { error: string }
> {
  const resolved = await resolveFormTestContext();
  if ("error" in resolved) {
    return resolved;
  }

  return {
    context: await enrichFormTestContext(resolved.context),
  };
}

export function buildSampleAccountsTimesheetRow(
  ctx: FormTestContext,
  timesheet: WorkerTimesheet
): AccountsTimesheetRow {
  return {
    ...timesheet,
    worker_name: buildExpectedWorkerDisplayName(ctx),
    worker_first_name: ctx.workerFirstName ?? null,
    worker_last_name: ctx.workerLastName ?? null,
    worker_trade: ctx.timesheetTaskName ?? timesheet.worker_trade ?? null,
    pay_rate_id: null,
    worker_is_hsr: false,
    worker_has_company_vehicle: false,
  };
}

export function buildPayrollCsvForSampleRow(row: AccountsTimesheetRow): string {
  return buildPayrollTimesheetExportCsv([row]);
}
