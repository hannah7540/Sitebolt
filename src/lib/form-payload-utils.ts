/** Returns `null` when value is undefined, null, or whitespace-only. */
export function nullIfBlank(value: string | null | undefined): string | null {
  const trimmed = value?.trim();
  return trimmed ? trimmed : null;
}

/** Returns empty string when value is undefined, null, or whitespace-only. */
export function emptyStringIfBlank(value: string | null | undefined): string {
  return value?.trim() ?? "";
}

export function parseMissingColumnFromError(message: string): string | null {
  const pgrestMatch = message.match(/Could not find the '([^']+)' column/i);
  if (pgrestMatch?.[1]) return pgrestMatch[1];

  const postgresMatch = message.match(
    /column "([^"]+)" (?:of relation "[^"]+" )?does not exist/i
  );
  if (postgresMatch?.[1]) {
    const full = postgresMatch[1];
    const parts = full.split(".");
    return parts[parts.length - 1] ?? full;
  }

  const postgresUnquotedMatch = message.match(/column ([^\s"]+) does not exist/i);
  if (postgresUnquotedMatch?.[1]) {
    const full = postgresUnquotedMatch[1];
    const parts = full.split(".");
    return parts[parts.length - 1] ?? full;
  }

  return null;
}

export function isSchemaCacheColumnError(message: string, column?: string): boolean {
  const lower = message.toLowerCase();
  const hasColumnHint =
    !column ||
    lower.includes(column.toLowerCase()) ||
    lower.includes(`'${column.toLowerCase()}'`);
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
