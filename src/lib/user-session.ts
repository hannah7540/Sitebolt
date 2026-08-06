import { getWorkerDisplayName, type WorkerNameFields } from "./worker-utils";

/** Placeholder admin display name until auth is wired. */
export const DEFAULT_ADMIN_PROFILE_NAME = "J. Miller";

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

/** Resolve the admin user's linked worker profile from storage or the worker list. */
export function resolveAdminWorkerFromList(
  workers: ({ id: string } & WorkerNameFields)[]
): string | null {
  const stored = getAdminWorkerId();
  if (stored && workers.some((w) => w.id === stored)) return stored;

  const target = DEFAULT_ADMIN_PROFILE_NAME.toLowerCase();
  const match = workers.find((w) => {
    const displayName = getWorkerDisplayName(w).toLowerCase();
    return displayName === target || displayName.includes("miller");
  });
  return match?.id ?? null;
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
 * Resolve the worker profile for the dashboard:
 * props → URL query → admin/localStorage → first worker in Supabase.
 */
export async function resolveDashboardWorkerId(options?: {
  propWorkerId?: string | null;
  queryWorkerId?: string | null;
  preferAdmin?: boolean;
}): Promise<string | null> {
  const { fetchFirstWorkerId } = await import("./supabase");

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

  if (options?.preferAdmin) {
    const adminId = getAdminWorkerId()?.trim();
    if (adminId) return adminId;
  }

  const stored = getStoredWorkerId()?.trim();
  if (stored) return stored;

  const adminId = getAdminWorkerId()?.trim();
  if (adminId) return adminId;

  const first = await fetchFirstWorkerId();
  if (first) {
    setStoredWorkerId(first);
    if (options?.preferAdmin) setAdminWorkerId(first);
  }
  return first;
}
