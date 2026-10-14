/** Admin/utility accounts that should not appear as field workers in ops lists. */

export const MISSING_TIMESHEET_EXCLUDED_EMAILS = [
  "hannah@site-bolt.com.au",
  "ipads@aplusplumbing.net.au",
  "tom.paton@aplusplumbing.net.au",
  "nicola.paton@aplusplumbing.net.au",
] as const;

export const ACTIVE_WORKERS_EXCLUDED_EMAILS = ["hannah@site-bolt.com.au"] as const;

export function normalizeAccountEmail(email: string | null | undefined): string {
  return (email ?? "").trim().toLowerCase();
}

export function isExcludedAccountEmail(
  email: string | null | undefined,
  excluded: readonly string[]
): boolean {
  const normalized = normalizeAccountEmail(email);
  if (!normalized) return false;
  return excluded.some((item) => normalizeAccountEmail(item) === normalized);
}

/** PostgREST `.not('email', 'in', ...)` value, e.g. `("a@x.com","b@x.com")`. */
export function toSupabaseEmailInFilter(emails: readonly string[]): string {
  return `(${emails.map((email) => `"${normalizeAccountEmail(email)}"`).join(",")})`;
}
