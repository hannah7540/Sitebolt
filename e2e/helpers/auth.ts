import type { E2ETestContext } from "./test-context";
import {
  gotoAppRoute,
  ROUTE_LOAD_TIMEOUT_MS,
} from "./navigation";

const WORKER_ID_KEY = "sitebolt_worker_id";
const ADMIN_WORKER_ID_KEY = "sitebolt_admin_worker_id";

export type E2EPersona = "admin" | "worker" | "subcontractor";

export { gotoAppRoute, ROUTE_LOAD_TIMEOUT_MS };

export function resolvePersonaWorkerId(
  persona: E2EPersona,
  context: E2ETestContext
): string {
  if (persona === "admin") {
    if (!context.adminWorkerId) {
      throw new Error("No admin worker available for E2E auth.");
    }
    return context.adminWorkerId;
  }

  if (persona === "subcontractor") {
    if (!context.subcontractorWorkerId) {
      throw new Error("No subcontractor worker available for E2E auth.");
    }
    return context.subcontractorWorkerId;
  }

  if (!context.workerId) {
    throw new Error("No general worker available for E2E auth.");
  }
  return context.workerId;
}

export async function authenticateAs(
  page: import("@playwright/test").Page,
  persona: E2EPersona,
  context: E2ETestContext
): Promise<void> {
  const workerId = resolvePersonaWorkerId(persona, context);
  const adminWorkerId = context.adminWorkerId ?? workerId;

  await page.addInitScript(
    ({ workerIdKey, adminWorkerIdKey, workerId, adminId, persona }) => {
      localStorage.setItem(workerIdKey, workerId);
      if (persona === "admin") {
        localStorage.setItem(adminWorkerIdKey, adminId);
      }
    },
    {
      workerIdKey: WORKER_ID_KEY,
      adminWorkerIdKey: ADMIN_WORKER_ID_KEY,
      workerId,
      adminId: adminWorkerId,
      persona,
    }
  );
}

export async function gotoAdminHome(page: import("@playwright/test").Page): Promise<void> {
  await gotoAppRoute(page, "/");
}

export async function gotoWorkerDashboard(
  page: import("@playwright/test").Page,
  workerId: string
): Promise<void> {
  await gotoAppRoute(
    page,
    `/worker-dashboard?worker_id=${encodeURIComponent(workerId)}`
  );
}
