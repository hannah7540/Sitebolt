import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  logSupabaseTableUnavailable,
  type SupabaseRequestError,
} from "./supabase-errors";

const WORKER_CALENDAR_EVENTS_TABLE = "worker_calendar_events";

const SCHEMA_PROBE_TABLES = [WORKER_CALENDAR_EVENTS_TABLE] as const;

const SCHEMA_RETRY_DELAYS_MS = [0, 400, 900];

function delay(ms: number): Promise<void> {
  return new Promise((resolve) => {
    setTimeout(resolve, ms);
  });
}

/** Probe known tables so PostgREST picks up recently applied migrations sooner. */
export async function warmSupabaseSchemaCache(
  client: SupabaseClient
): Promise<void> {
  await Promise.all(
    SCHEMA_PROBE_TABLES.map(async (table) => {
      const { error } = await client.from(table).select("id").limit(0);
      if (error && isSupabaseTableUnavailableError(error, table)) {
        logSupabaseTableUnavailable("schema warm", table, error);
      }
    })
  );
}

export async function runWithSupabaseSchemaRetry<T>(input: {
  tableName: string;
  operation: string;
  run: () => Promise<{ data: T | null; error: SupabaseRequestError | null }>;
}): Promise<{ data: T | null; error: SupabaseRequestError | null; unavailable: boolean }> {
  let lastError: SupabaseRequestError | null = null;

  for (let attempt = 0; attempt < SCHEMA_RETRY_DELAYS_MS.length; attempt += 1) {
    const waitMs = SCHEMA_RETRY_DELAYS_MS[attempt];
    if (waitMs > 0) {
      await delay(waitMs);
    }

    const { data, error } = await input.run();
    if (!error) {
      return { data, error: null, unavailable: false };
    }

    lastError = error;

    const shouldRetry =
      isSupabaseSchemaCacheError(error) ||
      isSupabaseTableUnavailableError(error, input.tableName);

    if (!shouldRetry || attempt === SCHEMA_RETRY_DELAYS_MS.length - 1) {
      break;
    }
  }

  if (lastError && isSupabaseTableUnavailableError(lastError, input.tableName)) {
    logSupabaseTableUnavailable(input.operation, input.tableName, lastError);
    return { data: null, error: null, unavailable: true };
  }

  return { data: null, error: lastError, unavailable: false };
}

export { WORKER_CALENDAR_EVENTS_TABLE };
