/** Returns `null` when value is undefined, null, or whitespace-only. */
export function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Alias for date/timestamp inputs stored as Postgres date columns. */
export function nullIfBlankDate(value: string | null | undefined): string | null {
  return nullIfBlank(value);
}

const DEFAULT_WRITE_DATE_FIELD_PATTERN = /(^dob$|_date$|_expiry$)/;

export interface SanitizeWritePayloadOptions {
  omitKeys?: readonly string[];
  requiredTextKeys?: readonly string[];
  dateFieldPattern?: RegExp;
}

/** Normalize optional write payloads: strip omitted keys, blank strings → null, trim text. */
export function sanitizeWritePayload(
  payload: Record<string, unknown>,
  options: SanitizeWritePayloadOptions = {}
): Record<string, unknown> {
  const omitKeys = new Set(options.omitKeys ?? []);
  const requiredTextKeys = new Set(options.requiredTextKeys ?? []);
  const datePattern = options.dateFieldPattern ?? DEFAULT_WRITE_DATE_FIELD_PATTERN;

  const next = { ...payload };
  for (const key of omitKeys) {
    delete next[key];
  }

  for (const [key, value] of Object.entries(next)) {
    if (Array.isArray(value)) continue;
    if (typeof value === "boolean" || typeof value === "number") continue;

    if (value === "") {
      next[key] = null;
      continue;
    }

    if (value == null) continue;

    if (typeof value !== "string") continue;

    const trimmed = value.trim();
    if (datePattern.test(key)) {
      next[key] = trimmed || null;
      continue;
    }

    if (requiredTextKeys.has(key)) {
      next[key] = trimmed;
      continue;
    }

    next[key] = trimmed || null;
  }

  return next;
}

/** Returns empty string when value is undefined, null, or whitespace-only. */
export function emptyStringIfBlank(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

function toSchemaColumnName(value: string): string {
  return value.trim().replace(/\s+/g, "_");
}

export function parseMissingColumnFromError(message: string): string | null {
  const pgrestMatch = message.match(/Could not find the '([^']+)' column/i);
  if (pgrestMatch?.[1]) return toSchemaColumnName(pgrestMatch[1]);

  const pgrestUnquotedMatch = message.match(
    /could not find the ([a-z0-9_ ]+?) column of/i
  );
  if (pgrestUnquotedMatch?.[1]) {
    return toSchemaColumnName(pgrestUnquotedMatch[1]);
  }

  const postgresMatch = message.match(
    /column "([^"]+)" (?:of relation "[^"]+" )?does not exist/i
  );
  if (postgresMatch?.[1]) {
    const full = postgresMatch[1];
    const parts = full.split(".");
    return toSchemaColumnName(parts[parts.length - 1] ?? full);
  }

  const postgresUnquotedMatch = message.match(/column ([^\s"]+) does not exist/i);
  if (postgresUnquotedMatch?.[1]) {
    const full = postgresUnquotedMatch[1];
    const parts = full.split(".");
    return toSchemaColumnName(parts[parts.length - 1] ?? full);
  }

  return null;
}

export function isSchemaCacheColumnError(message: string, column?: string): boolean {
  const lower = message.toLowerCase();
  const columnLower = column?.toLowerCase() ?? "";
  const spaced = columnLower.replace(/_/g, " ");
  const hasColumnHint =
    !column ||
    lower.includes(columnLower) ||
    lower.includes(spaced) ||
    lower.includes(`'${columnLower}'`);
  return (
    hasColumnHint &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

/** Removes a missing column from the payload and retries (for PostgREST/PGRST204). */
export function stripMissingColumn(
  payload: Record<string, unknown>,
  column: string
): Record<string, unknown> {
  if (!(column in payload)) return payload;
  const { [column]: _removed, ...rest } = payload;
  return rest;
}
