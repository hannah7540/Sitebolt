import { supabase, isSupabaseConfigured, type Worker } from "./supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { formatDateOnly } from "./scheduler-utils";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import { PUBLIC_HOLIDAYS_2026 } from "./company-calendar-2026";
import {
  PUBLIC_HOLIDAY_EVENT_STYLE,
  RDO_LEAVE_EVENT_STYLE,
} from "./leave-type-calendar";
import type { WorkerCalendarEvent } from "./worker-calendar-events";

export const COMPANY_CALENDAR_DAYS_TABLE = "company_calendar_days";

export const COMPANY_CALENDAR_STATES = ["ALL", "NSW", "ACT", "WA", "NZ"] as const;
export type CompanyCalendarState = (typeof COMPANY_CALENDAR_STATES)[number];
export type CompanyCalendarDayType = "public_holiday" | "rdo";

export interface CompanyCalendarDay {
  id: string;
  organisation_id?: string | null;
  date: string;
  day_type: CompanyCalendarDayType;
  title: string;
  state: string;
  applicable_roles: string[] | null;
  created_at?: string;
}

export interface CompanyCalendarDayInput {
  date: string;
  day_type: CompanyCalendarDayType;
  title: string;
  state?: string;
  applicable_roles?: string[] | null;
}

function normalizeDayType(value: unknown): CompanyCalendarDayType {
  return String(value ?? "").trim().toLowerCase() === "rdo"
    ? "rdo"
    : "public_holiday";
}

function normalizeRoles(value: unknown): string[] | null {
  if (!Array.isArray(value)) return null;
  const roles = value
    .map((role) => String(role ?? "").trim())
    .filter(Boolean);
  return roles.length > 0 ? roles : null;
}

export function normalizeCompanyCalendarState(value?: string | null): string {
  const trimmed = String(value ?? "ALL").trim().toUpperCase();
  if (!trimmed) return "ALL";
  if (trimmed === "ALL" || trimmed === "NATIONAL") return "ALL";
  return normalizeWorkerStateRegion(trimmed) ?? trimmed;
}

export function normalizeCompanyCalendarDay(
  row: Record<string, unknown>
): CompanyCalendarDay {
  return {
    id: String(row.id ?? ""),
    organisation_id: row.organisation_id ? String(row.organisation_id) : null,
    date: formatDateOnly(row.date as string),
    day_type: normalizeDayType(row.day_type),
    title: String(row.title ?? "").trim() || "Calendar day",
    state: normalizeCompanyCalendarState(row.state as string | null),
    applicable_roles: normalizeRoles(row.applicable_roles),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

export function calendarDayAppliesToWorker(
  day: CompanyCalendarDay,
  worker: Pick<Worker, "state" | "trade" | "worker_type" | "employment_type">
): boolean {
  const dayState = normalizeCompanyCalendarState(day.state);
  const workerState = normalizeCompanyCalendarState(worker.state);
  if (dayState !== "ALL" && workerState && dayState !== workerState) {
    return false;
  }
  if (dayState !== "ALL" && !workerState) {
    return true;
  }

  const roles = day.applicable_roles;
  if (!roles || roles.length === 0) return true;

  const workerRoles = [worker.trade, worker.worker_type, worker.employment_type]
    .map((value) => String(value ?? "").trim().toLowerCase())
    .filter(Boolean);

  if (workerRoles.length === 0) return true;

  return roles.some((role) => workerRoles.includes(role.trim().toLowerCase()));
}

export async function fetchCompanyCalendarDays(options?: {
  startDate?: string;
  endDate?: string;
  state?: string;
  dayType?: CompanyCalendarDayType;
}): Promise<CompanyCalendarDay[]> {
  if (!isSupabaseConfigured()) return [];

  let query = supabase
    .from(COMPANY_CALENDAR_DAYS_TABLE)
    .select("*")
    .order("date", { ascending: true });

  if (options?.startDate) {
    query = query.gte("date", formatDateOnly(options.startDate));
  }
  if (options?.endDate) {
    query = query.lte("date", formatDateOnly(options.endDate));
  }
  if (options?.state && options.state !== "ALL") {
    query = query.in("state", [options.state, "ALL", "all"]);
  }
  if (options?.dayType) {
    query = query.eq("day_type", options.dayType);
  }

  const { data, error } = await query;
  if (error) {
    if (
      !isSupabaseMissingColumnError(error) &&
      !isSupabaseSchemaOrConstraintError(error)
    ) {
      console.warn("[company-calendar] fetch failed:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) =>
    normalizeCompanyCalendarDay(row as Record<string, unknown>)
  );
}

export async function insertCompanyCalendarDays(
  inputs: CompanyCalendarDayInput[]
): Promise<{ error: string | null; saved: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", saved: 0 };
  }
  if (inputs.length === 0) {
    return { error: "Select at least one date.", saved: 0 };
  }

  const rows = inputs.map((input) => ({
    date: formatDateOnly(input.date),
    day_type: input.day_type,
    title: input.title.trim() || (input.day_type === "rdo" ? "Industry RDO" : "Public Holiday"),
    state: normalizeCompanyCalendarState(input.state),
    applicable_roles: normalizeRoles(input.applicable_roles),
  }));

  const { data, error } = await supabase
    .from(COMPANY_CALENDAR_DAYS_TABLE)
    .upsert(rows, { onConflict: "date,day_type,state" })
    .select("id");

  if (error) {
    const fallback = await supabase.from(COMPANY_CALENDAR_DAYS_TABLE).insert(rows).select("id");
    if (fallback.error) {
      return {
        error: toSupabaseRequestError(fallback.error)?.message ?? fallback.error.message,
        saved: 0,
      };
    }
    return { error: null, saved: fallback.data?.length ?? rows.length };
  }

  return { error: null, saved: data?.length ?? rows.length };
}

export async function deleteCompanyCalendarDay(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from(COMPANY_CALENDAR_DAYS_TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    return { error: toSupabaseRequestError(error)?.message ?? error.message };
  }
  return { error: null };
}

export async function preloadPublicHolidays2026(): Promise<{
  error: string | null;
  saved: number;
}> {
  return insertCompanyCalendarDays(PUBLIC_HOLIDAYS_2026);
}

export function companyCalendarDaysToWorkerEvents(
  days: CompanyCalendarDay[],
  workers: Worker[]
): WorkerCalendarEvent[] {
  const events: WorkerCalendarEvent[] = [];

  for (const worker of workers) {
    for (const day of days) {
      if (!calendarDayAppliesToWorker(day, worker)) continue;
      const style =
        day.day_type === "rdo" ? RDO_LEAVE_EVENT_STYLE : PUBLIC_HOLIDAY_EVENT_STYLE;
      events.push({
        id: `company-calendar-${day.id}-${worker.id}`,
        worker_id: worker.id,
        worker_name: worker.full_name ?? null,
        project_id: worker.assigned_project_id ?? null,
        project_name: worker.assigned_project_name ?? null,
        event_type: day.day_type === "rdo" ? "RDO" : "Leave",
        start_date: day.date,
        end_date: day.date,
        is_full_day: true,
        start_time: null,
        end_time: null,
        notes: day.title,
        trade: worker.trade ?? null,
        display_code: style.displayCode,
        bg_color: style.bgColor,
        text_color: style.textColor,
        leave_kind: day.day_type === "rdo" ? "rdo" : "public_holiday",
        leave_status: "Approved",
        leave_request_id: null,
      });
    }
  }

  return events;
}

export function mergeCompanyCalendarIntoEvents(
  events: WorkerCalendarEvent[],
  companyEvents: WorkerCalendarEvent[]
): WorkerCalendarEvent[] {
  const seen = new Set(
    events.map(
      (event) =>
        `${event.worker_id}|${event.start_date}|${event.leave_kind ?? event.event_type}`
    )
  );

  const merged = [...events];
  for (const event of companyEvents) {
    const key = `${event.worker_id}|${event.start_date}|${event.leave_kind ?? event.event_type}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(event);
  }
  return merged;
}
