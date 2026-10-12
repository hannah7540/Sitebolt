import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarDayAppliesToWorker,
  normalizeCompanyCalendarDay,
  type CompanyCalendarDay,
} from "@/lib/company-calendar-days";
import { PUBLIC_HOLIDAY_EVENT_STYLE } from "@/lib/leave-type-calendar";
import { resolveLeaveTimesheetDaySpec } from "@/lib/leave-timesheet-rules";
import { formatDateOnly } from "@/lib/scheduler-utils";
import {
  filterRowsByOrganisationStrict,
  isOrganisationColumnMissing,
  withOrganisationScope,
} from "@/lib/tenant-scope";

const HIRED_LABOUR_CATEGORY = "hired_labour";

export interface PublicHolidaySyncResult {
  calendarInserted: number;
  timesheetsInserted: number;
  error: string | null;
}

function todayIso(): string {
  return new Intl.DateTimeFormat("en-CA", {
    timeZone: "Australia/Sydney",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  }).format(new Date());
}

function isHiredLabour(category: unknown): boolean {
  return String(category ?? "").trim().toLowerCase() === HIRED_LABOUR_CATEGORY;
}

function isDuplicate(message: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes("duplicate") || lower.includes("unique") || lower.includes("already exists");
}

function isMissingColumnMessage(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  if (!lower.includes(column.toLowerCase())) return false;
  return /does not exist|schema cache|could not find/.test(lower);
}

function throwIfError(error: { message: string } | null): void {
  if (error) throw new Error(error.message);
}

async function insertWithColumnFallback(
  client: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<void> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (key === "organisation_id" || (value !== null && value !== undefined)) {
      next[key] = value;
    }
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await client.from(table).insert([next]);
    if (!error) return;
    if (isDuplicate(error.message)) return;
    const mentioned = Object.keys(next).find(
      (key) => key !== "organisation_id" && isMissingColumnMessage(error.message, key)
    );
    if (mentioned) {
      delete next[mentioned];
      continue;
    }
    throw new Error(error.message);
  }
  throw new Error(`Insert into ${table} failed.`);
}

async function loadWorker(
  client: SupabaseClient,
  workerId: string
): Promise<Record<string, unknown>> {
  const columns = [
    "id, worker_category, state, trade, worker_type, employment_type, first_name, last_name, full_name, worker_name, email, assigned_project_id, assigned_project_name, organisation_id, status, deleted_at",
    "id, worker_category, state, trade, worker_type, employment_type, first_name, last_name, full_name, email, assigned_project_id, organisation_id, status",
    "id, state, trade, first_name, last_name, email, assigned_project_id, status",
  ];
  let lastError = "Worker not found.";
  for (const select of columns) {
    const { data, error } = await client.from("workers").select(select).eq("id", workerId).maybeSingle();
    if (!error && data) {
      return data as unknown as Record<string, unknown>;
    }
    if (error) lastError = error.message;
    if (error && !/column|schema cache|does not exist/i.test(error.message)) {
      throw new Error(error.message);
    }
  }
  throw new Error(lastError);
}

async function loadUpcomingHolidays(
  client: SupabaseClient,
  organisationId: string | null,
  today: string
): Promise<CompanyCalendarDay[]> {
  let query = client
    .from("company_calendar_days")
    .select("*")
    .eq("day_type", "public_holiday")
    .gte("date", today)
    .order("date", { ascending: true });
  if (organisationId) {
    query = withOrganisationScope(query, organisationId);
  }
  const { data, error } = await query;
  if (error && organisationId && isOrganisationColumnMissing(error.message)) {
    const retry = await client
      .from("company_calendar_days")
      .select("*")
      .eq("day_type", "public_holiday")
      .gte("date", today)
      .order("date", { ascending: true });
    throwIfError(retry.error);
    return filterRowsByOrganisationStrict(retry.data ?? [], organisationId).map((row) =>
      normalizeCompanyCalendarDay(row as Record<string, unknown>)
    );
  }
  throwIfError(error);
  return ((data ?? []) as unknown as Record<string, unknown>[]).map((row) =>
    normalizeCompanyCalendarDay(row)
  );
}

function resolveWorkerOrganisationId(
  worker: Record<string, unknown>,
  organisationId?: string | null
): string {
  const fromWorker = worker.organisation_id ? String(worker.organisation_id).trim() : "";
  const fromCaller = organisationId?.trim() ?? "";
  const orgId = fromWorker || fromCaller;
  if (!orgId) {
    throw new Error("Worker is missing organisation_id.");
  }
  return orgId;
}

/**
 * Fill missing public-holiday calendar rows for one worker.
 * Timesheets are created only for internal workers. Hired labour never receives them.
 */
export async function syncPublicHolidaysForWorker(
  workerId: string,
  client?: SupabaseClient,
  organisationId?: string | null
): Promise<PublicHolidaySyncResult> {
  const trimmedId = workerId.trim();
  if (!trimmedId) {
    throw new Error("Worker id is required.");
  }

  const db = client ?? (await import("./supabase")).supabase;
  const worker = await loadWorker(db, trimmedId);
  if (worker.deleted_at || String(worker.status ?? "").trim().toLowerCase() === "deleted") {
    return { calendarInserted: 0, timesheetsInserted: 0, error: null };
  }

  const today = todayIso();
  const orgId = resolveWorkerOrganisationId(worker, organisationId);
  const holidays = (await loadUpcomingHolidays(db, orgId, today)).filter((day) =>
    calendarDayAppliesToWorker(day, {
      state: worker.state ? String(worker.state) : null,
      trade: worker.trade ? String(worker.trade) : null,
      worker_type: worker.worker_type ? String(worker.worker_type) : null,
      employment_type: worker.employment_type ? String(worker.employment_type) : null,
    })
  );
  if (holidays.length === 0) {
    return { calendarInserted: 0, timesheetsInserted: 0, error: null };
  }

  const dates = holidays.map((day) => day.date);
  const existingCalendar = new Set<string>();
  const calendarLookup = await db
    .from("worker_calendar_events")
    .select("start_date, display_code, leave_kind")
    .eq("worker_id", trimmedId)
    .gte("start_date", today);
  const calendarColumnsMissing =
    Boolean(calendarLookup.error) &&
    /leave_kind|display_code/i.test(calendarLookup.error?.message ?? "") &&
    /does not exist|schema cache|could not find/i.test(calendarLookup.error?.message ?? "");
  if (calendarLookup.error && !calendarColumnsMissing) {
    throw new Error(calendarLookup.error.message);
  }
  for (const row of calendarColumnsMissing ? [] : (calendarLookup.data ?? [])) {
    const record = row as { start_date?: string; display_code?: string; leave_kind?: string };
    const code = String(record.display_code ?? "").trim().toUpperCase();
    const kind = String(record.leave_kind ?? "").trim().toLowerCase();
    if (code !== "PH" && kind !== "public_holiday") continue;
    const date = formatDateOnly(record.start_date);
    if (date) existingCalendar.add(date);
  }

  const workerName =
    String(worker.full_name ?? worker.worker_name ?? "").trim() ||
    [worker.first_name, worker.last_name].filter(Boolean).join(" ").trim() ||
    null;
  const projectId = worker.assigned_project_id ? String(worker.assigned_project_id) : null;
  const projectName = worker.assigned_project_name ? String(worker.assigned_project_name) : null;

  let calendarInserted = 0;
  for (const day of holidays) {
    if (existingCalendar.has(day.date)) continue;
    await insertWithColumnFallback(db, "worker_calendar_events", {
      worker_id: trimmedId,
      worker_name: workerName,
      project_id: projectId,
      project_name: projectName,
      event_type: "Leave",
      start_date: day.date,
      end_date: day.date,
      is_full_day: true,
      notes: day.title,
      trade: worker.trade ? String(worker.trade) : null,
      display_code: PUBLIC_HOLIDAY_EVENT_STYLE.displayCode,
      bg_color: PUBLIC_HOLIDAY_EVENT_STYLE.bgColor,
      text_color: PUBLIC_HOLIDAY_EVENT_STYLE.textColor,
      leave_kind: "public_holiday",
      leave_status: "Approved",
    });
    existingCalendar.add(day.date);
    calendarInserted += 1;
  }

  if (isHiredLabour(worker.worker_category)) {
    return { calendarInserted, timesheetsInserted: 0, error: null };
  }

  const { data: timesheetRows, error: timesheetLookupError } = await db
    .from("worker_timesheets")
    .select("work_date")
    .eq("worker_id", trimmedId)
    .in("work_date", dates);
  throwIfError(timesheetLookupError);
  const existingTimesheets = new Set<string>();
  for (const row of timesheetRows ?? []) {
    const date = formatDateOnly((row as { work_date?: string }).work_date);
    if (date) existingTimesheets.add(date);
  }

  const now = new Date().toISOString();
  let timesheetsInserted = 0;
  for (const day of holidays) {
    if (existingTimesheets.has(day.date)) continue;
    const spec = resolveLeaveTimesheetDaySpec("Public Holiday", day.date);
    if (spec.totalHours <= 0) continue;
    await insertWithColumnFallback(db, "worker_timesheets", {
      worker_id: trimmedId,
      work_date: day.date,
      project_id: projectId,
      project_name: projectName,
      organisation_id: orgId,
      start_time: spec.startTime,
      finish_time: spec.finishTime,
      break_minutes: 0,
      total_hours: spec.totalHours,
      work_hours: spec.workHours,
      daily_total_hours: spec.totalHours,
      activities: spec.activities,
      breaks: [],
      notes: `Public Holiday - ${day.title} - Auto-generated from company public holiday`,
      status: "pending",
      is_draft: false,
      submitted_at: now,
      updated_at: now,
    });
    existingTimesheets.add(day.date);
    timesheetsInserted += 1;
  }

  return { calendarInserted, timesheetsInserted, error: null };
}
