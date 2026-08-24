import { supabase, isSupabaseConfigured, type WorkerTimesheet } from "./supabase";
import type { PayRateRule } from "./pay-rates-and-rules";
import type { DbProject } from "./project-resolver";
import { isSupabaseMissingColumnError } from "./supabase-errors";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import { resolveLeaveTimesheetDisplay } from "./leave-timesheet-rules";
import {
  calculateTimesheetPay,
  type TimesheetPayBreakdown,
} from "./calculateTimesheetPay";
import {
  isLeaveLineCategory,
  resolveTimesheetLineItems,
  type TimesheetLineCategory,
} from "./timesheet-line-items";
import { resolveTimesheetDisplayTotals } from "./timesheet-utils";
import {
  isMealAllowanceEligible,
  MEAL_ALLOWANCE_HOURS_THRESHOLD,
  PAYROLL_MEAL_ALLOWANCE_CATEGORY,
  resolveMealAllowanceThreshold,
  resolveNetWorkedHoursForMealAllowance,
} from "./meal-allowance";
import { resolveTravelPayrollCategory } from "./worker-pay-rule-assignment";
import { splitWorkerFullName } from "./worker-utils";

/** Exact Payroll V2 NSW header row (leading empty column). */
export const PAYROLL_CSV_V2_HEADER =
  ",Employee First Name,Employee Co./Last Name,Payroll Category,Date,JOB NAME,JOB,Units";

export const PAYROLL_CSV_HEADERS = [
  "",
  "Employee First Name",
  "Employee Co./Last Name",
  "Payroll Category",
  "Date",
  "JOB NAME",
  "JOB",
  "Units",
] as const;

export type PayrollExportTimesheetRow = WorkerTimesheet & {
  worker_name: string;
  worker_first_name?: string | null;
  worker_last_name?: string | null;
  worker_is_hsr?: boolean;
  worker_is_apprentice?: boolean;
  worker_has_company_vehicle?: boolean;
  worker_state?: string | null;
  pay_rate_id?: string | null;
  /** Legacy or denormalised job number when present on the timesheet row. */
  project_code?: string | null;
  job?: string | null;
  job_number?: string | null;
  project?: string | null;
};

/** Normalised project row for payroll CSV Job / Job Number resolution. */
export type PayrollCsvProjectRecord = {
  id: string;
  name: string;
  code: string;
  projectNumber: string;
};

export type PayrollCsvProjectLookups = {
  byId: Map<string, PayrollCsvProjectRecord>;
  byName: Map<string, PayrollCsvProjectRecord>;
};

const PAYROLL_CSV_PROJECT_SELECT_VARIANTS = [
  "id, project_name, project_code, client",
  "id, project_name, name, code, project_number, client, client_name",
  "id, project_name, slug, project_code",
  "*",
] as const;

const EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS: PayrollCsvProjectLookups = {
  byId: new Map(),
  byName: new Map(),
};

function normalizeProjectLookupKey(value: string | null | undefined): string {
  return value?.trim().toLowerCase() ?? "";
}

function mapPayrollCsvProjectRow(row: Record<string, unknown>): PayrollCsvProjectRecord | null {
  const id = String(row.id ?? "").trim();
  if (!id) return null;

  const name = String(row.project_name ?? row.name ?? row.slug ?? "").trim();
  const code = String(row.project_code ?? row.code ?? "").trim();
  const projectNumber = String(row.project_number ?? row.project_code ?? row.code ?? "").trim();

  return { id, name, code, projectNumber };
}

function buildPayrollCsvProjectLookupsFromRecords(
  records: PayrollCsvProjectRecord[]
): PayrollCsvProjectLookups {
  const byId = new Map<string, PayrollCsvProjectRecord>();
  const byName = new Map<string, PayrollCsvProjectRecord>();

  for (const project of records) {
    byId.set(project.id, project);

    const nameKey = normalizeProjectLookupKey(project.name);
    if (nameKey && !byName.has(nameKey)) {
      byName.set(nameKey, project);
    }
  }

  return { byId, byName };
}

/** Build lookups from already-loaded DbProject rows (tests / cached UI data). */
export function buildPayrollCsvProjectLookupsFromDbProjects(
  projects: DbProject[] = []
): PayrollCsvProjectLookups {
  const records = projects
    .map((project) =>
      mapPayrollCsvProjectRow({
        id: project.id,
        project_name: project.project_name ?? project.name,
        project_code: project.project_code,
        project_number: project.project_code,
      })
    )
    .filter((record): record is PayrollCsvProjectRecord => record !== null);

  return buildPayrollCsvProjectLookupsFromRecords(records);
}

/** Fetch projects directly from Supabase for payroll CSV export resolution. */
export async function fetchPayrollCsvExportProjectLookups(): Promise<PayrollCsvProjectLookups> {
  if (!isSupabaseConfigured()) return EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS;

  try {
    for (const select of PAYROLL_CSV_PROJECT_SELECT_VARIANTS) {
      const { data, error } = await supabase.from("projects").select(select);

      if (error) {
        if (isSupabaseMissingColumnError(error)) continue;
        return EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS;
      }

      const records = (data ?? [])
        .map((row) =>
          mapPayrollCsvProjectRow(row as unknown as Record<string, unknown>)
        )
        .filter((record): record is PayrollCsvProjectRecord => record !== null);

      return buildPayrollCsvProjectLookupsFromRecords(records);
    }
  } catch {
    return EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS;
  }

  return EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS;
}

export function resolvePayrollCsvProjectLookups(
  projectsOrLookups: DbProject[] | PayrollCsvProjectLookups = []
): PayrollCsvProjectLookups {
  if (!Array.isArray(projectsOrLookups)) {
    return projectsOrLookups;
  }
  return buildPayrollCsvProjectLookupsFromDbProjects(projectsOrLookups);
}

/** Strip client prefix from stored display names (`Client — Project`). */
function extractProjectNameOnly(stored: string | null | undefined): string {
  const trimmed = stored?.trim() ?? "";
  if (!trimmed) return "";
  if (trimmed.includes(" — ")) {
    return trimmed.split(" — ").pop()?.trim() ?? trimmed;
  }
  return trimmed;
}

function resolveStoredProjectNameKeys(row: PayrollExportTimesheetRow): string[] {
  const keys = new Set<string>();
  const candidates = [
    row.project_name,
    row.project,
    row.job,
    extractProjectNameOnly(row.project_name),
  ];

  for (const candidate of candidates) {
    const key = normalizeProjectLookupKey(candidate);
    if (key) keys.add(key);
  }

  return [...keys];
}

function resolveMatchedPayrollCsvProject(
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups
): PayrollCsvProjectRecord | undefined {
  const projectId = row.project_id?.trim();
  if (projectId) {
    const byIdMatch = lookups.byId.get(projectId);
    if (byIdMatch) return byIdMatch;
  }

  for (const nameKey of resolveStoredProjectNameKeys(row)) {
    const byNameMatch = lookups.byName.get(nameKey);
    if (byNameMatch) return byNameMatch;
  }

  return undefined;
}

export interface PayrollCsvExportLine {
  employeeFirstName: string;
  employeeLastName: string;
  payrollCategory: string;
  date: string;
  jobName: string;
  job: string;
  units: number;
}

export interface PayrollCategoryNames {
  baseHourly: string;
  overtime: string;
  siteAllowance: string;
  productivity: string;
  travel: string;
  meal: string;
  hsr: string;
  annualLeavePay: string;
  annualLeaveLoading: string;
}

export const PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY = "Annual Leave Pay";
export const PAYROLL_ANNUAL_LEAVE_LOADING_CATEGORY = "Annual Leave Loading";

const LEAVE_LINE_TO_PAYROLL_CATEGORY: Record<TimesheetLineCategory, string> = {
  work: "Base Hourly",
  sick_leave: "Personal Leave Pay",
  personal_leave: "Personal Leave Pay",
  annual_leave: PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY,
  carers_leave: "Personal Leave Pay",
  leave_without_pay: "Leave Without Pay",
  wfh: "Base Hourly",
  rdo: "RDO Taken",
  public_holiday: "Public Holiday Pay",
};

export function isAnnualLeavePayrollCategory(category: string): boolean {
  return category === PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY;
}

function roundUnits(value: number): number {
  return Math.round(value * 10) / 10;
}

export function formatPayrollExportDate(isoDate: string): string {
  const [year, month, day] = isoDate.split("-").map(Number);
  if (!year || !month || !day) return isoDate;
  return `${day}/${String(month).padStart(2, "0")}/${year}`;
}

export function formatPayrollExportUnitsValue(units: number): string {
  return roundUnits(units).toFixed(1);
}

export function buildPayrollExportFilename(rows: PayrollExportTimesheetRow[]): string {
  if (rows.length === 0) return "Payroll V2 - Export.csv";

  const dates = [...new Set(rows.map((row) => row.work_date))].sort();
  const start = dates[0]!;
  const end = dates[dates.length - 1]!;

  if (start === end) {
    return `Payroll V2 - ${formatPayrollExportDate(start)}.csv`;
  }

  return `Payroll V2 - ${formatPayrollExportDate(start)} to ${formatPayrollExportDate(end)}.csv`;
}

export function resolvePayrollCategoryNames(
  payRule: PayRateRule | null,
  options?: { isApprentice?: boolean; workerState?: string | null }
): PayrollCategoryNames {
  const isApprentice =
    options?.isApprentice ??
    payRule?.rule_name?.toLowerCase().includes("apprentice") ??
    false;

  return {
    baseHourly: "Base Hourly",
    overtime: "Overtime NSW (2x)",
    siteAllowance: "Site Allowance 2026",
    productivity: "AAC Productivity Allowance",
    travel: resolveTravelPayrollCategory(isApprentice, options?.workerState),
    meal: PAYROLL_MEAL_ALLOWANCE_CATEGORY,
    hsr: "HSR allowance",
    annualLeavePay: PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY,
    annualLeaveLoading: PAYROLL_ANNUAL_LEAVE_LOADING_CATEGORY,
  };
}

export function mapLeaveTypeToPayrollCategory(leaveType: string): string {
  const normalized = normalizeLeaveTypeLabel(leaveType);

  switch (normalized) {
    case "Personal Leave":
    case "Sick Leave":
      return "Personal Leave Pay";
    case "Annual Leave":
      return PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY;
    case "Public Holiday":
      return "Public Holiday Pay";
    case "RDO":
    case "Flexi RDO":
      return "RDO Taken";
    case "Leave without pay":
      return "Leave Without Pay";
    case "Carers Leave":
      return "Personal Leave Pay";
    default:
      return PAYROLL_ANNUAL_LEAVE_PAY_CATEGORY;
  }
}

function resolveEmployeeNames(row: PayrollExportTimesheetRow): {
  firstName: string;
  lastName: string;
} {
  const firstName = row.worker_first_name?.trim();
  const lastName = row.worker_last_name?.trim();
  if (firstName || lastName) {
    return {
      firstName: firstName ?? "",
      lastName: lastName ?? "",
    };
  }
  return splitWorkerFullName(row.worker_name ?? "");
}

/**
 * Resolve payroll CSV Job (project name) and Job Number (project code).
 * JOB NAME column ← project name only; JOB column ← project code / number.
 */
function resolveJobFields(
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups = EMPTY_PAYROLL_CSV_PROJECT_LOOKUPS
): { jobName: string; job: string } {
  const matchedProj = resolveMatchedPayrollCsvProject(row, lookups);

  const jobName =
    matchedProj?.name?.trim() ||
    extractProjectNameOnly(row.project_name) ||
    row.project?.trim() ||
    row.job?.trim() ||
    "";

  const jobNumber =
    matchedProj?.code?.trim() ||
    matchedProj?.projectNumber?.trim() ||
    row.project_code?.trim() ||
    row.job_number?.trim() ||
    "";

  return {
    jobName: jobName.toUpperCase(),
    job: jobNumber,
  };
}

/** Net paid work hours used as allowance units (e.g. 8.0, 10.0, 11.0). */
function resolveWorkedShiftHours(
  row: PayrollExportTimesheetRow,
  breakdown: TimesheetPayBreakdown | null
): number {
  if (breakdown) {
    return Math.max(0, roundUnits(breakdown.work_hours));
  }

  const totals = resolveTimesheetDisplayTotals(row);
  return Math.max(0, roundUnits(totals.workHours - totals.breakHours));
}

function hasWorkedPayLines(breakdown: TimesheetPayBreakdown | null): boolean {
  if (!breakdown) return false;
  return breakdown.base_hours > 0 || breakdown.overtime_hours > 0;
}

/**
 * Explicitly inject mandatory daily allowance rows after base/overtime lines.
 * Only called when the worker worked that day (base or overtime > 0).
 */
function injectDailyAllowanceRows(
  lines: PayrollCsvExportLine[],
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups,
  shiftHours: number,
  travelCategory: string,
  mealCategory: string,
  mealThreshold: number
): void {
  if (shiftHours <= 0) return;

  if (!row.worker_has_company_vehicle) {
    pushLine(lines, row, lookups, travelCategory, 1);
  }
  pushLine(lines, row, lookups, "Site Allowance 2026", shiftHours);
  pushLine(lines, row, lookups, "AAC Productivity Allowance", shiftHours);

  if (isMealAllowanceEligible(
    resolveNetWorkedHoursForMealAllowance(row),
    mealThreshold
  )) {
    pushLine(lines, row, lookups, mealCategory, 1);
  }
}

const PAYROLL_CATEGORY_SORT_ORDER: Record<string, number> = {
  "Base Hourly": 10,
  "Overtime NSW (2x)": 20,
  "Travel NSW": 30,
  "Travel NSW Apprentice": 30,
  "Meal Allowance NSW 2025": 40,
  "Site Allowance 2026": 50,
  "AAC Productivity Allowance": 60,
  "HSR allowance": 70,
  "Personal Leave Pay": 110,
  "Annual Leave Pay": 120,
  "Annual Leave Loading": 130,
  "RDO Taken": 140,
  "Public Holiday Pay": 150,
  "Leave Without Pay": 160,
};

function payrollCategorySortIndex(category: string): number {
  return PAYROLL_CATEGORY_SORT_ORDER[category] ?? 999;
}

function parsePayrollExportDateSortKey(date: string): number {
  const [day, month, year] = date.split("/").map(Number);
  if (!day || !month || !year) return 0;
  return new Date(year, month - 1, day).getTime();
}

/** Group and order export rows: worker → date → category sequence. */
export function sortPayrollExportLines(
  lines: PayrollCsvExportLine[]
): PayrollCsvExportLine[] {
  return [...lines].sort((a, b) => {
    const lastNameCompare = a.employeeLastName.localeCompare(b.employeeLastName);
    if (lastNameCompare !== 0) return lastNameCompare;

    const firstNameCompare = a.employeeFirstName.localeCompare(b.employeeFirstName);
    if (firstNameCompare !== 0) return firstNameCompare;

    const dateCompare =
      parsePayrollExportDateSortKey(a.date) - parsePayrollExportDateSortKey(b.date);
    if (dateCompare !== 0) return dateCompare;

    return (
      payrollCategorySortIndex(a.payrollCategory) -
      payrollCategorySortIndex(b.payrollCategory)
    );
  });
}

function resolveLeavePayrollCategory(
  row: PayrollExportTimesheetRow,
  category: TimesheetLineCategory,
  label: string
): string {
  if (category !== "work") {
    return LEAVE_LINE_TO_PAYROLL_CATEGORY[category] ?? label;
  }

  const leaveDisplay = resolveLeaveTimesheetDisplay(row);
  if (leaveDisplay?.leaveType) {
    return mapLeaveTypeToPayrollCategory(leaveDisplay.leaveType);
  }

  return label;
}

function pushLine(
  lines: PayrollCsvExportLine[],
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups,
  payrollCategory: string,
  units: number
): void {
  if (units <= 0) return;

  const { firstName, lastName } = resolveEmployeeNames(row);
  const { jobName, job } = resolveJobFields(row, lookups);

  lines.push({
    employeeFirstName: firstName,
    employeeLastName: lastName,
    payrollCategory,
    date: formatPayrollExportDate(row.work_date),
    jobName,
    job,
    units: roundUnits(units),
  });
}

function pushLeaveExportLine(
  lines: PayrollCsvExportLine[],
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups,
  payrollCategory: string,
  units: number
): void {
  pushLine(lines, row, lookups, payrollCategory, units);
  if (isAnnualLeavePayrollCategory(payrollCategory)) {
    pushLine(lines, row, lookups, PAYROLL_ANNUAL_LEAVE_LOADING_CATEGORY, units);
  }
}

function buildLeaveExportLines(
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups,
  breakdown: TimesheetPayBreakdown | null
): PayrollCsvExportLine[] {
  const lines: PayrollCsvExportLine[] = [];

  if (breakdown) {
    for (const item of breakdown.line_items) {
      if (!isLeaveLineCategory(item.category) || item.hours <= 0) continue;
      const payrollCategory = resolveLeavePayrollCategory(row, item.category, item.label);
      pushLeaveExportLine(lines, row, lookups, payrollCategory, item.hours);
    }
    return lines;
  }

  for (const item of resolveTimesheetLineItems(row)) {
    if (!isLeaveLineCategory(item.category) || item.hours <= 0) continue;
    pushLeaveExportLine(
      lines,
      row,
      lookups,
      resolveLeavePayrollCategory(
        row,
        item.category,
        LEAVE_LINE_TO_PAYROLL_CATEGORY[item.category]
      ),
      item.hours
    );
  }

  const leaveDisplay = resolveLeaveTimesheetDisplay(row);
  if (lines.length === 0 && leaveDisplay) {
    const totals = resolveTimesheetDisplayTotals(row);
    pushLeaveExportLine(
      lines,
      row,
      lookups,
      mapLeaveTypeToPayrollCategory(leaveDisplay.leaveType),
      totals.dailyTotalHours
    );
  }

  return lines;
}

function buildWorkAndAllowanceExportLines(
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups,
  payRule: PayRateRule,
  breakdown: TimesheetPayBreakdown
): PayrollCsvExportLine[] {
  const lines: PayrollCsvExportLine[] = [];
  const categories = resolvePayrollCategoryNames(payRule, {
    isApprentice: row.worker_is_apprentice ?? false,
    workerState: row.worker_state,
  });
  const shiftHours = resolveWorkedShiftHours(row, breakdown);
  const workedDay = hasWorkedPayLines(breakdown);

  if (!workedDay) {
    return lines;
  }

  if (breakdown.base_hours > 0) {
    pushLine(lines, row, lookups, categories.baseHourly, breakdown.base_hours);
  }

  if (breakdown.overtime_hours > 0) {
    pushLine(lines, row, lookups, categories.overtime, breakdown.overtime_hours);
  }

  injectDailyAllowanceRows(
    lines,
    row,
    lookups,
    shiftHours,
    categories.travel,
    categories.meal,
    resolveMealAllowanceThreshold(payRule.meal_allowance_threshold)
  );

  if (breakdown.hsr_allowance_pay > 0 && shiftHours > 0) {
    pushLine(lines, row, lookups, categories.hsr, shiftHours);
  }

  return lines;
}

function buildFallbackWorkExportLines(
  row: PayrollExportTimesheetRow,
  lookups: PayrollCsvProjectLookups
): PayrollCsvExportLine[] {
  const lines: PayrollCsvExportLine[] = [];
  const categories = resolvePayrollCategoryNames(null, {
    isApprentice: row.worker_is_apprentice ?? false,
    workerState: row.worker_state,
  });
  const totals = resolveTimesheetDisplayTotals(row);
  const shiftHours = Math.max(0, roundUnits(totals.workHours - totals.breakHours));

  if (shiftHours <= 0) return lines;

  const baseHours = Math.min(8, shiftHours);
  const overtimeHours = Math.max(0, roundUnits(shiftHours - 8));

  if (baseHours > 0) {
    pushLine(lines, row, lookups, categories.baseHourly, baseHours);
  }
  if (overtimeHours > 0) {
    pushLine(lines, row, lookups, categories.overtime, overtimeHours);
  }

  if (baseHours > 0 || overtimeHours > 0) {
    injectDailyAllowanceRows(
      lines,
      row,
      lookups,
      shiftHours,
      categories.travel,
      categories.meal,
      MEAL_ALLOWANCE_HOURS_THRESHOLD
    );
  }

  return lines;
}

/** Build itemized Payroll V2 rows for a single timesheet. */
export function buildPayrollExportLinesForTimesheet(
  row: PayrollExportTimesheetRow,
  payRule: PayRateRule | null,
  projectsOrLookups: DbProject[] | PayrollCsvProjectLookups = []
): PayrollCsvExportLine[] {
  const lookups = resolvePayrollCsvProjectLookups(projectsOrLookups);
  const breakdown = payRule
    ? calculateTimesheetPay(row, payRule, {
        hsrApplicable: row.worker_is_hsr ?? false,
        isApprentice: row.worker_is_apprentice ?? false,
        hasCompanyVehicle: row.worker_has_company_vehicle ?? false,
      })
    : null;

  const leaveLines = buildLeaveExportLines(row, lookups, breakdown);
  const workLines =
    breakdown && payRule && hasWorkedPayLines(breakdown)
      ? buildWorkAndAllowanceExportLines(row, lookups, payRule, breakdown)
      : breakdown && payRule
        ? []
        : buildFallbackWorkExportLines(row, lookups);

  const combined = [...workLines, ...leaveLines];

  if (combined.length > 0) {
    return combined;
  }

  const totals = resolveTimesheetDisplayTotals(row);
  if (totals.dailyTotalHours > 0) {
    const fallback: PayrollCsvExportLine[] = [];
    pushLine(
      fallback,
      row,
      lookups,
      resolvePayrollCategoryNames(payRule, {
        isApprentice: row.worker_is_apprentice ?? false,
        workerState: row.worker_state,
      }).baseHourly,
      totals.dailyTotalHours
    );
    return fallback;
  }

  return combined;
}

export function escapePayrollCsvValue(value: string | number | null | undefined): string {
  const text = value == null ? "" : String(value);
  if (/[",\n]/.test(text)) {
    return `"${text.replace(/"/g, '""')}"`;
  }
  return text;
}

export function payrollExportLineToCsvCells(
  line: PayrollCsvExportLine,
  rowNumber: number
): string[] {
  return [
    String(rowNumber),
    line.employeeFirstName,
    line.employeeLastName,
    line.payrollCategory,
    line.date,
    line.jobName,
    line.job,
    formatPayrollExportUnitsValue(line.units),
  ];
}

export function buildPayrollTimesheetExportCsvFromLines(
  lines: PayrollCsvExportLine[]
): string {
  const sortedLines = sortPayrollExportLines(lines);
  const dataRows = sortedLines.map((line, index) =>
    payrollExportLineToCsvCells(line, index + 1)
      .map(escapePayrollCsvValue)
      .join(",")
  );

  return [PAYROLL_CSV_V2_HEADER, ...dataRows].join("\n");
}
