import type { PostgrestError } from "@supabase/supabase-js";

export type SupabaseRequestError = Pick<PostgrestError, "code" | "message" | "details" | "hint">;

export function toSupabaseRequestError(
  error: PostgrestError | null | undefined
): SupabaseRequestError | null {
  if (!error) return null;
  return {
    code: error.code,
    message: error.message,
    details: error.details,
    hint: error.hint,
  };
}

export function getPostgrestErrorCode(
  error: SupabaseRequestError | PostgrestError | null | undefined
): string {
  if (!error?.code) return "";
  return String(error.code).trim();
}

/** PostgREST column missing from schema cache (migration not applied yet). */
export function isSupabaseMissingColumnError(
  error: SupabaseRequestError | PostgrestError | null | undefined
): boolean {
  if (!error) return false;
  const code = getPostgrestErrorCode(error);
  if (code === "PGRST204") return true;
  const message = String(error.message ?? "").toLowerCase();
  return message.includes("column") && message.includes("could not find");
}

/** PostgREST schema cache is stale (table may exist but is not visible yet). */
export function isSupabaseSchemaCacheError(
  error: SupabaseRequestError | PostgrestError | null | undefined
): boolean {
  if (!error) return false;

  const code = getPostgrestErrorCode(error);
  if (code === "PGRST205" || code === "PGRST200") {
    return true;
  }

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("schema cache") ||
    (message.includes("could not find") &&
      message.includes("schema") &&
      !message.includes("column"))
  );
}

/** Postgres relation/table truly missing (SQLSTATE 42P01). */
export function isSupabaseRelationMissingError(
  error: SupabaseRequestError | PostgrestError | null | undefined
): boolean {
  if (!error) return false;

  const code = getPostgrestErrorCode(error);
  if (code === "42P01") return true;

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("does not exist") &&
    (message.includes("relation") || message.includes("table"))
  );
}

/** Missing column, check constraint, or schema cache issues — safe to retry slimmer payload. */
export function isSupabaseSchemaOrConstraintError(
  error: SupabaseRequestError | PostgrestError | null | undefined
): boolean {
  if (!error) return false;
  if (isSupabaseMissingColumnError(error) || isSupabaseSchemaCacheError(error)) {
    return true;
  }

  const code = getPostgrestErrorCode(error);
  if (code === "23514" || code === "42703" || code === "PGRST204") {
    return true;
  }

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("column") ||
    message.includes("constraint") ||
    message.includes("schema cache") ||
    message.includes("could not find")
  );
}

/** PostgREST `.single()` / `.maybeSingle()` returned zero rows (PGRST116). */
export function isSupabaseZeroRowsError(
  error: SupabaseRequestError | PostgrestError | null | undefined
): boolean {
  if (!error) return false;

  const code = getPostgrestErrorCode(error);
  if (code === "PGRST116") return true;

  const message = String(error.message ?? "").toLowerCase();
  return (
    message.includes("0 rows") ||
    message.includes("cannot coerce the result to a single json object")
  );
}

/** Table is not readable/writable right now — degrade gracefully to empty/no-op. */
export function isSupabaseTableUnavailableError(
  error: SupabaseRequestError | PostgrestError | null | undefined,
  tableName?: string
): boolean {
  if (!error) return false;
  if (isSupabaseSchemaCacheError(error) || isSupabaseRelationMissingError(error)) {
    return true;
  }

  if (!tableName) return false;

  const message = String(error.message ?? "").toLowerCase();
  const table = tableName.toLowerCase();
  return message.includes(table) && message.includes("could not find");
}

export function logSupabaseTableUnavailable(
  operation: string,
  tableName: string,
  error: SupabaseRequestError | PostgrestError | null | undefined
): void {
  console.warn(
    `[supabase] ${operation} on ${tableName} unavailable; returning graceful fallback.`,
    error
  );
}
