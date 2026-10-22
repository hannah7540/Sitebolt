/**
 * Keep in-app navigation on the current origin.
 * Absolute https:// URLs pop iOS PWAs out to Safari.
 */
export function toRelativeAppPath(
  path: string | null | undefined,
  fallback = "/worker-dashboard"
): string {
  const trimmed = String(path ?? "").trim();
  if (!trimmed) return fallback;

  if (trimmed.startsWith("/") && !trimmed.startsWith("//") && !trimmed.includes("://")) {
    return trimmed;
  }

  try {
    const url = new URL(trimmed);
    const relative = `${url.pathname}${url.search}`;
    if (relative.startsWith("/") && !relative.startsWith("//")) {
      return relative;
    }
  } catch {
    // Ignore unparseable values and use the fallback.
  }

  return fallback;
}
