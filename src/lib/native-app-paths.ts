/** Server-safe native app path rules (no Capacitor imports). */

export const NATIVE_WORKER_HOME_PATH = "/worker-dashboard";

export const NATIVE_ALLOWED_PATH_PREFIXES = [
  "/worker-dashboard",
  "/login",
  "/privacy",
  "/auth/",
  "/accept-invite",
  "/update-password",
  "/reset-password",
  "/account/",
  "/settings/account",
  "/onboarding",
  "/portal/",
  "/swms/sign/",
  "/prestart/",
  "/scan/",
  "/worker/",
] as const;

export const NATIVE_BLOCKED_PATH_PREFIXES = [
  "/admin",
  "/projects",
  "/organisation",
  "/accounts",
  "/emails",
  "/billing",
  "/settings",
] as const;

export const NATIVE_APP_COOKIE = "sitebolt_native";

export function resolveNativeWorkerDashboardPath(
  workerId?: string | null
): string {
  const trimmed = workerId?.trim();
  if (trimmed) {
    return `${NATIVE_WORKER_HOME_PATH}?worker_id=${encodeURIComponent(trimmed)}`;
  }
  return NATIVE_WORKER_HOME_PATH;
}

export function isNativeAllowedPath(pathname: string): boolean {
  if (pathname === NATIVE_WORKER_HOME_PATH) return true;
  return NATIVE_ALLOWED_PATH_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(prefix)
  );
}

export function isNativeBlockedPath(pathname: string): boolean {
  if (pathname === "/") return true;
  return NATIVE_BLOCKED_PATH_PREFIXES.some(
    (prefix) =>
      pathname === prefix ||
      pathname.startsWith(`${prefix}/`) ||
      pathname.startsWith(prefix)
  );
}

export function shouldRedirectNativePath(pathname: string): boolean {
  if (isNativeAllowedPath(pathname)) return false;
  return isNativeBlockedPath(pathname) || pathname === "/";
}
