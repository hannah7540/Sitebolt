import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { formatDateOnly } from "@/lib/scheduler-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "@/lib/supabase-errors";
import { parseMissingColumnFromError, stripMissingColumn } from "@/lib/form-payload-utils";

export const PLANT_CALENDAR_EVENTS_TABLE = "plant_calendar_events";

export type PlantCalendarEventType = "service" | "other";

export interface PlantCalendarEvent {
  id: string;
  plant_id: string;
  event_date: string;
  event_type: PlantCalendarEventType;
  title: string;
  notes: string | null;
  created_at: string;
}

export interface PlantCalendarEventInput {
  plant_id: string;
  event_date: string;
  event_type: PlantCalendarEventType;
  title: string;
  notes?: string | null;
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

export function formatPlantCalendarDotDate(iso: string | null | undefined): string {
  const normalized = formatDateOnly(iso);
  if (!normalized) return "—";
  const [year, month, day] = normalized.split("-");
  if (!year || !month || !day) return normalized;
  return `${day}.${month}.${year}`;
}

export function formatPlantCalendarEventLabel(event: {
  event_type: PlantCalendarEventType;
  title: string;
  event_date: string;
}): string {
  const dateLabel = formatPlantCalendarDotDate(event.event_date);
  const title =
    event.event_type === "service" ? "Service" : event.title.trim() || "Other";
  return `${title} ${dateLabel}`;
}

function normalizeEventType(value: unknown): PlantCalendarEventType {
  return String(value ?? "").trim().toLowerCase() === "other" ? "other" : "service";
}

export function normalizePlantCalendarEvent(row: unknown): PlantCalendarEvent {
  const record = asRecord(row);
  const eventType = normalizeEventType(record.event_type ?? record.type);
  const title =
    str(record, "title") ?? (eventType === "service" ? "Service" : "Other");
  return {
    id: String(record.id ?? ""),
    plant_id: str(record, "plant_id") ?? "",
    event_date: formatDateOnly(str(record, "event_date") ?? str(record, "date")),
    event_type: eventType,
    title,
    notes: str(record, "notes"),
    created_at: str(record, "created_at") ?? "",
  };
}

export async function fetchPlantCalendarEvents(
  startDate: string,
  endDate: string
): Promise<{ data: PlantCalendarEvent[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from(PLANT_CALENDAR_EVENTS_TABLE)
    .select("*")
    .gte("event_date", startDate)
    .lte("event_date", endDate)
    .order("event_date", { ascending: true });

  if (error) {
    if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), PLANT_CALENDAR_EVENTS_TABLE)) {
      return { data: [], error: null };
    }
    return { data: [], error: error.message };
  }

  return {
    data: (data ?? []).map(normalizePlantCalendarEvent).filter((row) => row.id && row.plant_id),
    error: null,
  };
}

export async function insertPlantCalendarEvent(
  input: PlantCalendarEventInput
): Promise<{ data: PlantCalendarEvent | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }

  const eventDate = formatDateOnly(input.event_date);
  const eventType: PlantCalendarEventType = input.event_type === "other" ? "other" : "service";
  const title =
    eventType === "service" ? "Service" : input.title.trim() || "Other";

  let payload: Record<string, unknown> = {
    plant_id: input.plant_id,
    event_date: eventDate,
    event_type: eventType,
    title,
    notes: input.notes?.trim() || null,
  };

  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data, error } = await supabase
      .from(PLANT_CALENDAR_EVENTS_TABLE)
      .insert(payload)
      .select("*")
      .maybeSingle();

    if (!error) {
      return {
        data: data
          ? normalizePlantCalendarEvent(data)
          : {
              id: crypto.randomUUID(),
              plant_id: String(payload.plant_id ?? input.plant_id),
              event_date: eventDate,
              event_type: eventType,
              title,
              notes: typeof payload.notes === "string" ? payload.notes : input.notes?.trim() || null,
              created_at: new Date().toISOString(),
            },
        error: null,
      };
    }

    if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), PLANT_CALENDAR_EVENTS_TABLE)) {
      return {
        data: null,
        error: "Plant calendar events table is missing. Run migration 165_plant_calendar_events.sql.",
      };
    }

    if (isSupabaseMissingColumnError(error)) {
      const missing = parseMissingColumnFromError(error.message);
      if (missing && missing in payload) {
        payload = stripMissingColumn(payload, missing);
        continue;
      }
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "Could not save calendar event." };
}

export async function deletePlantCalendarEvent(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }
  const { error } = await supabase.from(PLANT_CALENDAR_EVENTS_TABLE).delete().eq("id", id);
  if (!error) return { error: null };
  if (isSupabaseTableUnavailableError(toSupabaseRequestError(error), PLANT_CALENDAR_EVENTS_TABLE)) {
    return { error: "Plant calendar events table is missing." };
  }
  return { error: error.message };
}
