import type { SupabaseClient } from "@supabase/supabase-js";
import {
  calendarDayAppliesToWorker,
  normalizeCompanyCalendarDay,
  type CompanyCalendarDay,
} from "@/lib/company-calendar-days";
import { PUBLIC_HOLIDAY_EVENT_STYLE } from "@/lib/leave-type-calendar";
import { resolveLeaveTimesheetDaySpec } from "@/lib/leave-timesheet-rules";
import { formatDateOnly } from "@/lib/scheduler-utils";

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

async function insertWithColumnFallback(
  client: SupabaseClient,
  table: string,
  payload: Record<string, unknown>
): Promise<string | null> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(payload)) {
    if (value !== null && value !== undefined) next[key] = value;
  }
  for (let attempt = 0; attempt < 10; attempt += 1) {
    const { error } = await client.from(table).insert([next]);
    if (!error) return null;
    if (isDuplicate(error.message)) return null;
    const mentioned = Object.keys(next).find((key) =>
      error.message.toLowerCase().includes(key.toLowerCase())
    );
    if (
      mentioned &&
      /does not exist|schema cache|could not find|column/i.test(error.message)
    ) {
      delete next[mentioned];
      continue;
    }
    return error.message;
  }
  return "Insert failed.";
}

async function loadWorker(
  client: SupabaseClient,
  workerId: string
): Promise<{ worker: Record<string, unknown> | null; error: string | null }> {
  const columns = [
    "id, worker_category, state, trade, worker_type, employment_type, first_name, last_name, full_name, worker_name, email, assigned_project_id, assigned_project_name, organisation_id, status, deleted_at",
    "id, worker_category, state, trade, worker_type, employment_type, first_name, last_name, full_name, email, assigned_project_id, organisation_id, status",
    "id, state, trade, first_name, last_name, email, assigned_project_id, status",
  ];
  let lastError = "Worker not found.";
  for (const select of columns) {
    const { data, error } = await client.from("workers").select(select).eq("id", workerId).maybeSingle();
    if (!error && data) {
      return { worker: data as unknown as Record<string, unknown>, error: null };
    }
    if (error) lastError = error.message;
    if (error && !/column|schema cache|does not exist/i.test(error.message)) {
      return { worker: null, error: error.message };
    }
  }
  return { worker: null, error: lastError };
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
    query = query.eq("organisation_id", organisationId);
  }
  let { data, error } = await query;
  if (error && organisationId && /organisation_id/i.test(error.message)) {
    ({ data, error } = await client
      .from("company_calendar_days")
      .select("*")
      .eq("day_type", "public_holiday")
      .gte("date", today)
      .order("date", { ascending: true }));
  }
  if (error || !data) return [];
  return (data as unknown as Record<string, unknown>[]).map((row) => normalizeCompanyCalendarDay(row));
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
    return { calendarInserted: 0, timesheetsInserted: 0, error: "Worker id is required." };
  }

  const db = client ?? (await import("./supabase")).supabase;
  const loaded = await loadWorker(db, trimmedId);
  if (loaded.error || !loaded.worker) {
    return {
      calendarInserted: 0,
      timesheetsInserted: 0,
      error: loaded.error ?? "Worker not found.",
    };
  }

  const worker = loaded.worker;
  if (worker.deleted_at || String(worker.status ?? "").trim().toLowerCase() === "deleted") {
    return { calendarInserted: 0, timesheetsInserted: 0, error: null };
  }

  const today = todayIso();
  const orgId =
    organisationId?.trim() ||
    (worker.organisation_id ? String(worker.organisation_id) : null);
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
  const { data: calendarRows, error: calendarLookupError } = await db
    .from("worker_calendar_events")
    .select("start_date, display_code, leave_kind")
    .eq("worker_id", trimmedId)
    .gte("start_date", today);
  if (calendarLookupError && !/leave_kind|display_code/i.test(calendarLookupError.message)) {
    return { calendarInserted: 0, timesheetsInserted: 0, error: calendarLookupError.message };
  }
  for (const row of calendarRows ?? []) {
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
    const error = await insertWithColumnFallback(db, "worker_calendar_events", {
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
    if (error) {
      return { calendarInserted, timesheetsInserted: 0, error };
    }
    existingCalendar.add(day.date);
    calendarInserted += 1;
  }

  if (isHiredLabour(worker.worker_category)) {
    return { calendarInserted, timesheetsInserted: 0, error: null };
  }

  const existingTimesheets = new Set<string>();
  const { data: timesheetRows, error: timesheetLookupError } = await db
    .from("worker_timesheets")
    .select("work_date")
    .eq("worker_id", trimmedId)
    .in("work_date", dates);
  if (timesheetLookupError) {
    return { calendarInserted, timesheetsInserted: 0, error: timesheetLookupError.message };
  }
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
    const error = await insertWithColumnFallback(db, "worker_timesheets", {
      worker_id: trimmedId,
      work_date: day.date,
      project_id: projectId,
      project_name: projectName,
      ...(orgId ? { organisation_id: orgId } : {}),
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
    if (error) {
      return { calendarInserted, timesheetsInserted, error };
    }
    existingTimesheets.add(day.date);
    timesheetsInserted += 1;
  }

  return { calendarInserted, timesheetsInserted, error: null };
}
