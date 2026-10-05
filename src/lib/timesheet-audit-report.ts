import {
  supabase,
  isSupabaseConfigured,
  fetchAllWorkers,
  isWorkerDeleted,
  isWorkerRevoked,
  type Worker,
  type WorkerTimesheet,
} from "./supabase";
import { handleSupabaseNetworkFetchError } from "./project-resolver";
import { mapTimesheetRow } from "./timesheet-entries";
import { getPayWeekRange, shiftPayWeekStart } from "./pay-week-utils";
import { localIsoDate, formatTimesheetHours, toTimesheetDateKey } from "./timesheet-utils";
import {
  calculateTimesheetPay,
  isLeaveTimesheet,
} from "./calculateTimesheetPay";
import { fetchPayRatesAndRules, type PayRateRule } from "./pay-rates-and-rules";
import { resolvePayRuleTemplateNameForWorker } from "./worker-pay-rule-assignment";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import { getWorkerDisplayName } from "./worker-utils";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";

export type TimesheetAuditPreset =
  | "last_7_days"
  | "last_pay_period"
  | "current_month"
  | "last_financial_year"
  | "last_7_years";

export type TimesheetSubmissionMethod =
  | "Worker (Self)"
  | "Admin (on behalf of worker)"
  | "System Auto-Entry (Leave)";

export interface TimesheetAuditDateRange {
  startDate: string;
  endDate: string;
}

export interface TimesheetAuditHours {
  baseHours: number;
  overtime15Hours: number;
  overtime20Hours: number;
  leaveHours: number;
  totalHours: number;
}

export interface TimesheetAuditAllowances {
  travel: number;
  meal: number;
  site: number;
  aac: number;
}

export interface TimesheetAuditRow {
  id: string;
  workDate: string;
  submittedAt: string | null;
  createdAt: string | null;
  submissionMethod: TimesheetSubmissionMethod;
  leaveLabel: string | null;
  projectName: string;
  role: string;
  hours: TimesheetAuditHours;
  allowances: TimesheetAuditAllowances;
  signatureUrl: string | null;
  signatureLabel: string;
  leaveRequestId?: string | null;
  notes: string | null;
  status: string;
}

export interface TimesheetAuditTotals {
  baseHours: number;
  overtimeHours: number;
  overtime15Hours: number;
  overtime20Hours: number;
  leaveHours: number;
  totalHours: number;
}

export interface TimesheetAuditWorkerOption {
  id: string;
  name: string;
  lastName: string;
  employeeId: string;
  trade: string | null;
  email: string;
  statusLabel: string;
  searchText: string;
}

export interface TimesheetAuditReport {
  worker: TimesheetAuditWorkerOption;
  startDate: string;
  endDate: string;
  generatedAt: string;
  rows: TimesheetAuditRow[];
  totals: TimesheetAuditTotals;
}

const TIMESHEET_PAGE_SIZE = 1000;

function roundHours(value: number): number {
  return Math.round(value * 100) / 100;
}

export function formatAuditDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(
    value.includes("T") ? value : `${value.slice(0, 10)}T12:00:00`
  );
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()}`;
}

export function formatAuditDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return formatAuditDate(value);
  const day = String(date.getDate()).padStart(2, "0");
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const hours = String(date.getHours()).padStart(2, "0");
  const minutes = String(date.getMinutes()).padStart(2, "0");
  const seconds = String(date.getSeconds()).padStart(2, "0");
  return `${day}/${month}/${date.getFullYear()} ${hours}:${minutes}:${seconds}`;
}

export function formatAuditHours(hours: number): string {
  return formatTimesheetHours(roundHours(hours));
}

function startOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(0, 0, 0, 0);
  return localIsoDate(copy);
}

function endOfDayIso(date: Date): string {
  const copy = new Date(date);
  copy.setHours(23, 59, 59, 999);
  return localIsoDate(copy);
}

function lastCompletedFinancialYear(today: Date): TimesheetAuditDateRange {
  const year = today.getFullYear();
  const month = today.getMonth();
  const fyEndYear = month >= 6 ? year : year - 1;
  return {
    startDate: `${fyEndYear - 1}-07-01`,
    endDate: `${fyEndYear}-06-30`,
  };
}

export function resolveTimesheetAuditPreset(
  preset: TimesheetAuditPreset,
  now: Date = new Date()
): TimesheetAuditDateRange {
  if (preset === "last_7_days") {
    const end = new Date(now);
    const start = new Date(now);
    start.setDate(start.getDate() - 6);
    return { startDate: startOfDayIso(start), endDate: endOfDayIso(end) };
  }

  if (preset === "last_pay_period") {
    const current = getPayWeekRange(now);
    const previousStart = shiftPayWeekStart(current.startIso, -1);
    const previous = getPayWeekRange(new Date(`${previousStart}T12:00:00`));
    return { startDate: previous.startIso, endDate: previous.endIso };
  }

  if (preset === "current_month") {
    const start = new Date(now.getFullYear(), now.getMonth(), 1);
    const end = new Date(now.getFullYear(), now.getMonth() + 1, 0);
    return { startDate: startOfDayIso(start), endDate: endOfDayIso(end) };
  }

  if (preset === "last_financial_year") {
    return lastCompletedFinancialYear(now);
  }

  const end = new Date(now);
  const start = new Date(now);
  start.setFullYear(start.getFullYear() - 7);
  return { startDate: startOfDayIso(start), endDate: endOfDayIso(end) };
}

export const TIMESHEET_AUDIT_PRESETS: Array<{
  id: TimesheetAuditPreset;
  label: string;
}> = [
  { id: "last_7_days", label: "Last 7 Days" },
  { id: "last_pay_period", label: "Last Pay Period" },
  { id: "current_month", label: "Current Month" },
  { id: "last_financial_year", label: "Last Financial Year" },
  { id: "last_7_years", label: "Last 7 Years" },
];

function workerStatusLabel(worker: Worker): string {
  if (isWorkerDeleted(worker)) return "Archived";
  if (isWorkerRevoked(worker) || worker.is_archived) return "Inactive";
  const status = String(worker.status ?? "").toLowerCase();
  if (status === "archived" || status === "inactive") return "Inactive";
  return "Active";
}

function resolveEmployeeId(worker: Worker): string {
  return (
    worker.worker_code?.trim() ||
    worker.white_card_number?.trim() ||
    worker.id
  );
}

function resolveLastName(worker: Worker, displayName: string): string {
  const last = worker.last_name?.trim();
  if (last) return last;
  const parts = displayName.trim().split(/\s+/).filter(Boolean);
  return parts[parts.length - 1] || displayName || "Worker";
}

export function toTimesheetAuditWorkerOption(
  worker: Worker
): TimesheetAuditWorkerOption {
  const name = getWorkerDisplayName(worker, "Worker");
  const statusLabel = workerStatusLabel(worker);
  const employeeId = resolveEmployeeId(worker);
  const trade = worker.trade?.trim() || null;
  const searchText = [
    name,
    worker.first_name,
    worker.last_name,
    worker.email,
    employeeId,
    trade,
    statusLabel,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return {
    id: worker.id,
    name,
    lastName: resolveLastName(worker, name),
    employeeId,
    trade,
    email: worker.email?.trim() || "",
    statusLabel,
    searchText,
  };
}

export async function fetchTimesheetAuditWorkers(): Promise<{
  workers: TimesheetAuditWorkerOption[];
  error: string | null;
}> {
  const result = await fetchAllWorkers({ includeDeleted: true });
  if (result.error) {
    return { workers: [], error: result.error };
  }

  const seen = new Set<string>();
  const workers = result.workers
    .filter((worker) => {
      if (!worker.id || seen.has(worker.id)) return false;
      seen.add(worker.id);
      return true;
    })
    .map(toTimesheetAuditWorkerOption)
    .sort((left, right) => left.name.localeCompare(right.name));

  return { workers, error: null };
}

function readFormMetadata(
  row: Record<string, unknown>
): Record<string, unknown> | null {
  const raw = row.form_metadata ?? row.formMetadata;
  if (!raw || typeof raw !== "object" || Array.isArray(raw)) return null;
  return raw as Record<string, unknown>;
}

function asBoolean(value: unknown): boolean {
  return value === true || String(value).toLowerCase() === "true";
}

function resolveLeaveLabel(timesheet: WorkerTimesheet): string | null {
  if (!isLeaveTimesheet(timesheet)) return null;
  const notes = String(timesheet.notes ?? "");
  const activities = timesheet.activities ?? [];
  const activityLabel = activities
    .map((slot) => String(slot.label ?? slot.category ?? ""))
    .filter(Boolean)
    .join(" ");
  const source = `${notes} ${activityLabel}`.trim();
  if (!source) return "System Auto-Entry (Leave)";
  return normalizeLeaveTypeLabel(source);
}

function resolveSubmissionMethod(
  timesheet: WorkerTimesheet,
  raw: Record<string, unknown>
): TimesheetSubmissionMethod {
  if (isLeaveTimesheet(timesheet)) {
    return "System Auto-Entry (Leave)";
  }

  const metadata = readFormMetadata(raw);
  const notes = String(timesheet.notes ?? "").toLowerCase();
  if (
    asBoolean(metadata?.submitted_by_admin) ||
    asBoolean(metadata?.approved_by_admin) ||
    asBoolean(raw.submitted_by_admin)
  ) {
    return "Admin (on behalf of worker)";
  }

  const submissionType = String(
    raw.submission_type ?? raw.submissionType ?? metadata?.submission_type ?? ""
  )
    .trim()
    .toLowerCase();
  if (
    submissionType.includes("admin") ||
    submissionType.includes("on behalf") ||
    submissionType.includes("proxy")
  ) {
    return "Admin (on behalf of worker)";
  }

  if (notes.includes("on behalf") || notes.includes("submitted by admin")) {
    return "Admin (on behalf of worker)";
  }

  return "Worker (Self)";
}

function asSignatureString(value: unknown, depth = 0): string | null {
  if (depth > 4 || value == null) return null;
  if (typeof value === "string") {
    const trimmed = value.trim();
    if (!trimmed || trimmed === "[object Object]") return null;
    return trimmed;
  }
  if (Array.isArray(value)) {
    for (const item of value) {
      const found = asSignatureString(item, depth + 1);
      if (found) return found;
    }
    return null;
  }
  if (typeof value === "object") {
    const record = value as Record<string, unknown>;
    for (const key of [
      "signature_url",
      "signatureUrl",
      "signature_data",
      "signatureData",
      "signature_data_url",
      "data_url",
      "dataUrl",
      "worker_signature",
      "workerSignature",
      "url",
      "src",
      "data",
      "signature",
    ]) {
      const found = asSignatureString(record[key], depth + 1);
      if (found) return found;
    }
  }
  return null;
}

const TIMESHEET_SIGNATURE_KEYS = [
  "signature_url",
  "signatureUrl",
  "signature_data",
  "signatureData",
  "signature_data_url",
  "worker_signature",
  "workerSignature",
  "worker_signature_url",
  "signoff_signature",
  "sign_off_signature",
  "signature",
] as const;

export function pickSignatureFromRecord(
  row: Record<string, unknown> | null | undefined
): string | null {
  if (!row) return null;
  for (const key of TIMESHEET_SIGNATURE_KEYS) {
    const found = asSignatureString(row[key]);
    if (found) return found;
  }
  const metadata = readFormMetadata(row);
  if (metadata) {
    for (const key of TIMESHEET_SIGNATURE_KEYS) {
      const found = asSignatureString(metadata[key]);
      if (found) return found;
    }
  }
  return null;
}

function resolveSignatureLabel(
  method: TimesheetSubmissionMethod,
  signatureUrl: string | null
): string {
  if (method === "System Auto-Entry (Leave)") {
    return "[System Verified - Approved Leave]";
  }
  if (method === "Admin (on behalf of worker)") {
    return signatureUrl?.trim()
      ? "Signed"
      : "[Admin Approved - Submitted on Behalf]";
  }
  if (signatureUrl?.trim()) return "Signed";
  return "No signature captured";
}

interface StorageObjectRef {
  bucket: string;
  path: string;
}

export function extractStorageObjectRef(src: string): StorageObjectRef | null {
  const trimmed = src.trim();
  if (!trimmed || trimmed.startsWith("data:")) return null;

  const objectMatch = trimmed.match(
    /\/storage\/v1\/object\/(?:public|sign|authenticated)\/([^/?]+)\/([^?]+)/i
  );
  if (objectMatch?.[1] && objectMatch[2]) {
    return {
      bucket: decodeURIComponent(objectMatch[1]),
      path: decodeURIComponent(objectMatch[2]),
    };
  }

  if (/^https?:\/\//i.test(trimmed)) return null;

  const stripped = trimmed.replace(/^\/+/, "");
  const knownBuckets = ["worker-docs", "signatures", "timesheet-signatures"];
  for (const bucket of knownBuckets) {
    if (stripped === bucket || stripped.startsWith(`${bucket}/`)) {
      return {
        bucket,
        path: stripped.slice(bucket.length).replace(/^\/+/, ""),
      };
    }
  }

  if (stripped.startsWith("timesheets/")) {
    return { bucket: "worker-docs", path: stripped };
  }

  return null;
}

export async function hydrateTimesheetSignatureUrl(
  src: string | null | undefined
): Promise<string | null> {
  const trimmed = src?.trim() || "";
  if (!trimmed) return null;
  if (trimmed.startsWith("data:")) return trimmed;

  const ref = extractStorageObjectRef(trimmed);
  if (!ref?.path) return trimmed;

  try {
    const signed = await supabase.storage
      .from(ref.bucket)
      .createSignedUrl(ref.path, 60 * 60 * 24);
    if (signed.data?.signedUrl) return signed.data.signedUrl;
  } catch {
    /* fall through to public URL */
  }

  const { data } = supabase.storage.from(ref.bucket).getPublicUrl(ref.path);
  return data.publicUrl || trimmed;
}

async function fetchLeaveRequestSignatures(
  leaveRequestIds: string[]
): Promise<Map<string, string>> {
  const uniqueIds = [...new Set(leaveRequestIds.filter(Boolean))];
  const signatures = new Map<string, string>();
  if (!isSupabaseConfigured() || uniqueIds.length === 0) return signatures;

  const { data, error } = await supabase
    .from("leave_requests")
    .select("id, signature_url")
    .in("id", uniqueIds);

  if (error || !data) return signatures;

  for (const row of data as Record<string, unknown>[]) {
    const id = String(row.id ?? "");
    const signature = pickSignatureFromRecord(row);
    if (id && signature) signatures.set(id, signature);
  }
  return signatures;
}

async function fetchPayWeekBatchSignatures(
  workerId: string,
  rows: TimesheetAuditRow[]
): Promise<Map<string, string>> {
  const signatures = new Map<string, string>();
  const missing = rows.filter(
    (row) =>
      !row.signatureUrl && row.submissionMethod === "Worker (Self)" && row.workDate
  );
  if (!isSupabaseConfigured() || missing.length === 0) return signatures;

  const weekBounds = missing.map((row) =>
    getPayWeekRange(new Date(`${row.workDate}T12:00:00`))
  );
  const startDate = weekBounds.map((week) => week.startIso).sort()[0];
  const endDates = weekBounds.map((week) => week.endIso).sort();
  const endDate = endDates[endDates.length - 1];
  if (!startDate || !endDate) return signatures;

  const { rows: batchRows } = await fetchTimesheetRowsForRange(
    workerId,
    startDate,
    endDate
  );
  for (const raw of batchRows) {
    const signature = pickSignatureFromRecord(raw);
    if (!signature) continue;
    const workDate = toTimesheetDateKey(String(raw.work_date ?? "")) || "";
    if (!workDate) continue;
    const week = getPayWeekRange(new Date(`${workDate}T12:00:00`));
    if (!signatures.has(week.startIso)) signatures.set(week.startIso, signature);
  }
  return signatures;
}

function applySignatureFallbacks(
  rows: TimesheetAuditRow[],
  options: {
    payWeekSignatures: Map<string, string>;
    leaveSignatures: Map<string, string>;
    workerSignature: string | null;
  }
): TimesheetAuditRow[] {
  return rows.map((row) => {
    let signatureUrl = row.signatureUrl;
    if (!signatureUrl && row.submissionMethod === "Worker (Self)") {
      const week = getPayWeekRange(new Date(`${row.workDate}T12:00:00`));
      signatureUrl = options.payWeekSignatures.get(week.startIso) ?? null;
    }
    if (!signatureUrl && row.leaveRequestId) {
      signatureUrl = options.leaveSignatures.get(row.leaveRequestId) ?? null;
    }
    if (
      !signatureUrl &&
      row.submissionMethod === "Worker (Self)" &&
      options.workerSignature
    ) {
      signatureUrl = options.workerSignature;
    }
    return {
      ...row,
      signatureUrl,
      signatureLabel: resolveSignatureLabel(row.submissionMethod, signatureUrl),
    };
  });
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

function resolveAuditPayRule(
  worker: Worker,
  payRules: PayRateRule[]
): PayRateRule | null {
  const byId = findPayRuleById(
    payRules,
    worker.pay_rule_id ?? worker.pay_rate_id ?? null
  );
  if (byId) return byId;

  const templateName = resolvePayRuleTemplateNameForWorker(worker.state);
  const byTemplateName = findPayRuleByName(payRules, templateName);
  if (byTemplateName) return byTemplateName;

  const state = normalizeWorkerStateRegion(worker.state);
  if (state) {
    const byState = payRules.find((rule) =>
      rule.rule_name.trim().toUpperCase().startsWith(state)
    );
    if (byState) return byState;
  }

  return null;
}

function splitOvertimeHours(
  workHours: number,
  workDate: string,
  payRule: PayRateRule | null
): Pick<TimesheetAuditHours, "baseHours" | "overtime15Hours" | "overtime20Hours"> {
  const hours = Math.max(0, roundHours(workHours));
  if (hours <= 0) {
    return { baseHours: 0, overtime15Hours: 0, overtime20Hours: 0 };
  }

  const weekday = new Date(`${workDate}T12:00:00`).getDay();
  if (weekday === 0) {
    return { baseHours: 0, overtime15Hours: 0, overtime20Hours: hours };
  }
  if (weekday === 6) {
    return { baseHours: 0, overtime15Hours: hours, overtime20Hours: 0 };
  }

  const threshold15 = payRule?.overtime_15_threshold_hours || 8;
  const threshold20 = Math.max(
    threshold15,
    payRule?.overtime_20_threshold_hours || 10
  );
  const baseHours = Math.min(hours, threshold15);
  const overtime15Hours = Math.max(0, Math.min(hours, threshold20) - threshold15);
  const overtime20Hours = Math.max(0, hours - threshold20);
  return {
    baseHours: roundHours(baseHours),
    overtime15Hours: roundHours(overtime15Hours),
    overtime20Hours: roundHours(overtime20Hours),
  };
}

function mapAuditRow(
  raw: Record<string, unknown>,
  worker: Worker,
  payRules: PayRateRule[]
): TimesheetAuditRow {
  const timesheet = mapTimesheetRow(raw);
  const method = resolveSubmissionMethod(timesheet, raw);
  const leaveLabel = resolveLeaveLabel(timesheet);
  const payRule = resolveAuditPayRule(worker, payRules);

  const breakdown = payRule
    ? calculateTimesheetPay(timesheet, payRule, {
        hsrApplicable: worker.is_hsr ?? false,
        isApprentice: worker.is_apprentice ?? false,
        hasCompanyVehicle: worker.has_company_vehicle ?? false,
      })
    : null;

  const workHours = breakdown?.work_hours ?? Number(timesheet.total_hours ?? 0);
  const leaveHours = roundHours(breakdown?.leave_hours ?? 0);
  const split = splitOvertimeHours(
    method === "System Auto-Entry (Leave)" && leaveHours > 0 ? 0 : workHours,
    timesheet.work_date,
    payRule
  );
  const totalHours = roundHours(
    leaveHours > 0 && split.baseHours + split.overtime15Hours + split.overtime20Hours === 0
      ? leaveHours
      : split.baseHours + split.overtime15Hours + split.overtime20Hours + leaveHours
  );

  const signatureUrl =
    pickSignatureFromRecord(raw) || timesheet.signature_url?.trim() || null;

  return {
    id: timesheet.id,
    workDate: timesheet.work_date,
    submittedAt: timesheet.submitted_at ?? null,
    createdAt: timesheet.created_at ?? null,
    submissionMethod: method,
    leaveLabel,
    projectName: timesheet.project_name?.trim() || "General / Unassigned",
    role:
      timesheet.worker_trade?.trim() ||
      worker.trade?.trim() ||
      "—",
    hours: {
      ...split,
      leaveHours,
      totalHours,
    },
    allowances: {
      travel: breakdown?.travel_allowance_pay ?? 0,
      meal: breakdown?.meal_allowance_pay ?? 0,
      site: breakdown?.site_allowance_pay ?? 0,
      aac: breakdown?.productivity_allowance_pay ?? 0,
    },
    signatureUrl,
    signatureLabel: resolveSignatureLabel(method, signatureUrl),
    leaveRequestId: timesheet.leave_request_id ?? null,
    notes: timesheet.notes,
    status: timesheet.status,
  };
}

async function fetchTimesheetRowsForRange(
  workerId: string,
  startDate: string,
  endDate: string
): Promise<{ rows: Record<string, unknown>[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { rows: [], error: "Supabase is not configured." };
  }

  const collected: Record<string, unknown>[] = [];
  let from = 0;

  while (true) {
    const { data, error } = await supabase
      .from("worker_timesheets")
      .select("*")
      .eq("worker_id", workerId)
      .gte("work_date", `${startDate}T00:00:00.000`)
      .lte("work_date", `${endDate}T23:59:59.999`)
      .order("work_date", { ascending: true })
      .order("created_at", { ascending: true })
      .range(from, from + TIMESHEET_PAGE_SIZE - 1);

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch timesheet audit")) {
        return { rows: [], error: null };
      }

      const dateOnly = await supabase
        .from("worker_timesheets")
        .select("*")
        .eq("worker_id", workerId)
        .gte("work_date", startDate)
        .lte("work_date", endDate)
        .order("work_date", { ascending: true })
        .order("created_at", { ascending: true })
        .range(from, from + TIMESHEET_PAGE_SIZE - 1);

      if (dateOnly.error) {
        if (
          handleSupabaseNetworkFetchError(dateOnly.error, "fetch timesheet audit")
        ) {
          return { rows: [], error: null };
        }
        return {
          rows: [],
          error: dateOnly.error.message || error.message,
        };
      }

      const page = (dateOnly.data ?? []) as Record<string, unknown>[];
      collected.push(...page);
      if (page.length < TIMESHEET_PAGE_SIZE) break;
      from += TIMESHEET_PAGE_SIZE;
      continue;
    }

    const page = (data ?? []) as Record<string, unknown>[];
    collected.push(...page);
    if (page.length < TIMESHEET_PAGE_SIZE) break;
    from += TIMESHEET_PAGE_SIZE;
  }

  return { rows: collected, error: null };
}

function sumTotals(rows: TimesheetAuditRow[]): TimesheetAuditTotals {
  return rows.reduce<TimesheetAuditTotals>(
    (acc, row) => ({
      baseHours: roundHours(acc.baseHours + row.hours.baseHours),
      overtimeHours: roundHours(
        acc.overtimeHours + row.hours.overtime15Hours + row.hours.overtime20Hours
      ),
      overtime15Hours: roundHours(acc.overtime15Hours + row.hours.overtime15Hours),
      overtime20Hours: roundHours(acc.overtime20Hours + row.hours.overtime20Hours),
      leaveHours: roundHours(acc.leaveHours + row.hours.leaveHours),
      totalHours: roundHours(acc.totalHours + row.hours.totalHours),
    }),
    {
      baseHours: 0,
      overtimeHours: 0,
      overtime15Hours: 0,
      overtime20Hours: 0,
      leaveHours: 0,
      totalHours: 0,
    }
  );
}

export function formatHoursAllowancesPreview(row: TimesheetAuditRow): string {
  const hourParts = [
    `Base ${formatAuditHours(row.hours.baseHours)}`,
    `OT 1.5x ${formatAuditHours(row.hours.overtime15Hours)}`,
    `OT 2x ${formatAuditHours(row.hours.overtime20Hours)}`,
  ];
  if (row.hours.leaveHours > 0) {
    hourParts.push(`Leave ${formatAuditHours(row.hours.leaveHours)}`);
  }
  hourParts.push(`Total ${formatAuditHours(row.hours.totalHours)}`);

  const allowanceParts: string[] = [];
  if (row.allowances.travel > 0) allowanceParts.push("Travel");
  if (row.allowances.meal > 0) allowanceParts.push("Meal");
  if (row.allowances.site > 0) allowanceParts.push("Site");
  if (row.allowances.aac > 0) allowanceParts.push("AAC");

  return allowanceParts.length > 0
    ? `${hourParts.join(" · ")}\n${allowanceParts.join(", ")}`
    : hourParts.join(" · ");
}

export function formatSubmissionMethodLabel(row: TimesheetAuditRow): string {
  if (row.submissionMethod === "System Auto-Entry (Leave)") {
    return row.leaveLabel
      ? `System Auto-Entry (Leave) / ${row.leaveLabel}`
      : "System Auto-Entry (Leave)";
  }
  return row.submissionMethod;
}

export async function generateTimesheetAuditReport(input: {
  workerId: string;
  startDate: string;
  endDate: string;
}): Promise<{ report: TimesheetAuditReport | null; error: string | null }> {
  const workerId = input.workerId.trim();
  const startDate = input.startDate.slice(0, 10);
  const endDate = input.endDate.slice(0, 10);

  if (!workerId) {
    return { report: null, error: "Select a worker to generate the report." };
  }
  if (!startDate || !endDate) {
    return { report: null, error: "Select a start and end date." };
  }
  if (startDate > endDate) {
    return { report: null, error: "Start date must be on or before the end date." };
  }

  const workersResult = await fetchAllWorkers({ includeDeleted: true });
  if (workersResult.error) {
    return { report: null, error: workersResult.error };
  }

  const worker = workersResult.workers.find((row) => row.id === workerId);
  if (!worker) {
    return { report: null, error: "Worker could not be found." };
  }

  const [{ rows, error }, payRulesResult] = await Promise.all([
    fetchTimesheetRowsForRange(workerId, startDate, endDate),
    fetchPayRatesAndRules(),
  ]);

  if (error) {
    return { report: null, error };
  }

  const mapped = rows
    .filter((row) => {
      const status = String(row.status ?? "").toLowerCase();
      return status !== "draft" && row.is_draft !== true;
    })
    .map((row) => mapAuditRow(row, worker, payRulesResult.rules))
    .sort((left, right) => {
      const dateCompare = left.workDate.localeCompare(right.workDate);
      if (dateCompare !== 0) return dateCompare;
      return String(left.submittedAt ?? left.createdAt ?? "").localeCompare(
        String(right.submittedAt ?? right.createdAt ?? "")
      );
    });

  const [payWeekSignatures, leaveSignatures] = await Promise.all([
    fetchPayWeekBatchSignatures(workerId, mapped),
    fetchLeaveRequestSignatures(
      mapped
        .map((row) => row.leaveRequestId)
        .filter((id): id is string => Boolean(id))
    ),
  ]);

  const workerSignature =
    pickSignatureFromRecord(worker as unknown as Record<string, unknown>) ||
    worker.induction_signature_url?.trim() ||
    null;

  const withFallbacks = applySignatureFallbacks(mapped, {
    payWeekSignatures,
    leaveSignatures,
    workerSignature,
  });

  const hydratedUrls = new Map<string, string>();
  await Promise.all(
    [
      ...new Set(
        withFallbacks
          .map((row) => row.signatureUrl)
          .filter((url): url is string => Boolean(url))
      ),
    ].map(async (url) => {
      hydratedUrls.set(url, (await hydrateTimesheetSignatureUrl(url)) ?? url);
    })
  );

  const hydrated = withFallbacks.map((row) => ({
    ...row,
    signatureUrl: row.signatureUrl
      ? hydratedUrls.get(row.signatureUrl) ?? row.signatureUrl
      : null,
  }));

  return {
    report: {
      worker: toTimesheetAuditWorkerOption(worker),
      startDate,
      endDate,
      generatedAt: new Date().toISOString(),
      rows: hydrated,
      totals: sumTotals(hydrated),
    },
    error: null,
  };
}
