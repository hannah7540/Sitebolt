"use client";

import { Capacitor } from "@capacitor/core";
import {
  NATIVE_APP_COOKIE,
  resolveNativeWorkerDashboardPath,
  shouldRedirectNativePath,
} from "@/lib/native-app-paths";
import { resolveDefaultLandingPathForRole } from "@/lib/user-session";

export {
  NATIVE_WORKER_HOME_PATH,
  resolveNativeWorkerDashboardPath,
  isNativeAllowedPath,
  isNativeBlockedPath,
  shouldRedirectNativePath,
} from "@/lib/native-app-paths";

/** True when running inside the Capacitor Android/iOS shell. */
export function isNativeMobileApp(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return Capacitor.isNativePlatform();
  } catch {
    return false;
  }
}

/** Persist native mode for server-side proxy redirects on subsequent requests. */
export function markNativeAppCookie(): void {
  if (typeof document === "undefined" || !isNativeMobileApp()) return;
  const secure = window.location.protocol === "https:" ? "; Secure" : "";
  document.cookie = `${NATIVE_APP_COOKIE}=1; path=/; max-age=${60 * 60 * 24 * 365}; SameSite=Lax${secure}`;
}

export function resolveNativeAppLandingPath(workerId?: string | null): string {
  return resolveNativeWorkerDashboardPath(workerId);
}

export function resolvePostLoginPath(
  role: string | null | undefined,
  workerId: string | null | undefined,
  options?: { returnPath?: string | null; defaultPath?: string }
): string {
  if (isNativeMobileApp()) {
    return resolveNativeWorkerDashboardPath(workerId);
  }

  const returnPath = options?.returnPath?.trim();
  if (returnPath && returnPath.startsWith("/") && !shouldRedirectNativePath(returnPath)) {
    return returnPath;
  }

  return (
    options?.defaultPath ??
    resolveDefaultLandingPathForRole(role, workerId)
  );
}
