"use client";

import { Capacitor } from "@capacitor/core";
import {
  NATIVE_APP_COOKIE,
  resolveNativeWorkerDashboardPath,
} from "@/lib/native-app-paths";
import { isGeneralWorkerAllowedPath } from "@/lib/rbac-guards";
import { canAccessAdminConsole, normalizeSecurityRole } from "@/lib/security-roles";
import {
  isGeneralWorkerRole,
  resolveDefaultLandingPathForRole,
} from "@/lib/user-session";
import { isPlantPrestartPath } from "@/lib/plant-prestart-url";
import { isStandalonePwa } from "@/lib/pwa-standalone";

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
  options?: {
    returnPath?: string | null;
    defaultPath?: string;
    subcontractorId?: string | null;
  }
): string {
  const returnPath = options?.returnPath?.trim();
  const returnPathname = returnPath?.split("?")[0] ?? "";
  const subcontractorId = options?.subcontractorId?.trim() || null;
  const securityRole = normalizeSecurityRole(role);

  if (
    (isNativeMobileApp() || isStandalonePwa()) &&
    returnPath &&
    (isPlantPrestartPath(returnPathname) || returnPathname.startsWith("/scan/"))
  ) {
    return returnPath;
  }

  if (
    options?.defaultPath === "/select-company" ||
    returnPathname === "/select-company"
  ) {
    return "/select-company";
  }

  if (options?.defaultPath?.startsWith("/onboarding")) {
    return options.defaultPath;
  }

  if (canAccessAdminConsole(securityRole)) {
    if (
      returnPath &&
      returnPath.startsWith("/") &&
      returnPathname !== "/" &&
      returnPathname !== "/worker-dashboard" &&
      !returnPathname.startsWith("/worker-dashboard/")
    ) {
      return returnPath;
    }
    return (
      options?.defaultPath ??
      resolveDefaultLandingPathForRole(role, workerId, subcontractorId)
    );
  }

  if (isGeneralWorkerRole(role) && workerId?.trim()) {
    if (
      returnPath &&
      returnPath.startsWith("/") &&
      isGeneralWorkerAllowedPath(returnPathname)
    ) {
      return returnPath;
    }
    return resolveDefaultLandingPathForRole(role, workerId, subcontractorId);
  }

  if (subcontractorId) {
    return "/subcontractor";
  }

  return (
    options?.defaultPath ??
    resolveDefaultLandingPathForRole(role, workerId, subcontractorId)
  );
}
