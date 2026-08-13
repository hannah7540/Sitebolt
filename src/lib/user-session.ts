import { MASTER_ADMIN_EMAIL, MASTER_ADMIN_FULL_NAME } from "./master-admin-config";

/** Placeholder admin display name until auth profile resolves. */
export const DEFAULT_ADMIN_PROFILE_NAME = MASTER_ADMIN_FULL_NAME;
export const DEFAULT_ADMIN_EMAIL = MASTER_ADMIN_EMAIL;

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
