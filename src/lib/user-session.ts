import { MASTER_ADMIN_EMAIL, MASTER_ADMIN_FULL_NAME } from "./master-admin-config";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
} from "./security-roles";

/** Placeholder admin display name until auth profile resolves. */
export const DEFAULT_ADMIN_PROFILE_NAME = MASTER_ADMIN_FULL_NAME;
export const DEFAULT_ADMIN_EMAIL = MASTER_ADMIN_EMAIL;

/** Project dashboard — default landing for non-general-worker roles. */
export const PROJECT_DASHBOARD_HOME_PATH = "/";

export const WORKER_ID_KEY = "sitebolt_worker_id";
export const ADMIN_WORKER_ID_KEY = "sitebolt_admin_worker_id";
export const DASHBOARD_LOADING_TIMEOUT_MS = 3000;

export function getStoredWorkerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(WORKER_ID_KEY);
}

export function setStoredWorkerId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(WORKER_ID_KEY, id);
}

export function getAdminWorkerId(): string | null {
  if (typeof window === "undefined") return null;
  return localStorage.getItem(ADMIN_WORKER_ID_KEY);
}

export function setAdminWorkerId(id: string): void {
  if (typeof window === "undefined") return;
  localStorage.setItem(ADMIN_WORKER_ID_KEY, id);
}

export function workerDashboardUrl(
  workerId: string,
  options?: { fromAdmin?: boolean }
): string {
  const params = new URLSearchParams({ worker_id: workerId });
  if (options?.fromAdmin) params.set("from", "admin");
  return `/worker-dashboard?${params.toString()}`;
}

/** Worker self-service dashboard for the signed-in profile card. */
export function workerProfileDashboardPath(
  workerId: string | null | undefined,
  options?: { fromAdmin?: boolean }
): string {
  const trimmed = workerId?.trim();
  if (!trimmed) return "/worker-dashboard";
  return workerDashboardUrl(trimmed, options);
}

/**
 * Resolve the worker profile for the dashboard from explicit props, URL query,
 * or storage tied to an authenticated session. Never falls back to arbitrary DB rows.
 */
export async function resolveDashboardWorkerId(options?: {
  propWorkerId?: string | null;
  queryWorkerId?: string | null;
  preferAdmin?: boolean;
  sessionWorkerId?: string | null;
}): Promise<string | null> {
  const fromProp = options?.propWorkerId?.trim();
  if (fromProp) {
    setStoredWorkerId(fromProp);
    if (options?.preferAdmin) setAdminWorkerId(fromProp);
    return fromProp;
  }

  const fromQuery = options?.queryWorkerId?.trim();
  if (fromQuery) {
    setStoredWorkerId(fromQuery);
    if (options?.preferAdmin) setAdminWorkerId(fromQuery);
    return fromQuery;
  }

  const sessionWorkerId = options?.sessionWorkerId?.trim();
  if (sessionWorkerId) {
    setStoredWorkerId(sessionWorkerId);
    if (options?.preferAdmin) setAdminWorkerId(sessionWorkerId);
    return sessionWorkerId;
  }

  if (options?.preferAdmin) {
    const adminId = getAdminWorkerId()?.trim();
    if (adminId) return adminId;
  }

  const stored = getStoredWorkerId()?.trim();
  if (stored) return stored;

  const adminId = getAdminWorkerId()?.trim();
  if (adminId) return adminId;

  return null;
}

export function isGeneralWorkerRole(role: string | null | undefined): boolean {
  return normalizeSecurityRole(role) === "general_worker";
}

/** Post-login / post-setup default route from security role. */
export function resolveDefaultLandingPathForRole(
  role: string | null | undefined,
  workerId?: string | null
): string {
  const normalized = normalizeSecurityRole(role);

  if (isGeneralWorkerRole(normalized)) {
    const trimmedId = workerId?.trim();
    if (trimmedId) return workerDashboardUrl(trimmedId);
    return "/worker-dashboard";
  }

  if (canAccessAdminConsole(normalized)) {
    return PROJECT_DASHBOARD_HOME_PATH;
  }

  const trimmedId = workerId?.trim();
  if (trimmedId) return workerDashboardUrl(trimmedId);
  return "/worker-dashboard";
}
