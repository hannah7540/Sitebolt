import type { E2ETestContext } from "./test-context";

export interface AppRoute {
  name: string;
  path: string | ((ctx: E2ETestContext) => string);
  personas?: Array<"admin" | "worker" | "subcontractor">;
  timeoutMs?: number;
}

export const STATIC_ADMIN_ROUTES: AppRoute[] = [
  { name: "Admin Home", path: "/" },
  { name: "Accounts Timesheets", path: "/accounts/timesheets" },
  { name: "Accounts Pay Rules", path: "/accounts/pay-rules" },
  { name: "Accounts Rates & Rules", path: "/accounts/rates-and-rules" },
  { name: "Admin RFI Forms", path: "/admin/forms/rfi" },
  { name: "Admin Requests Forms", path: "/admin/forms/requests" },
  { name: "Admin Induction Forms", path: "/admin/forms/inductions" },
  { name: "Admin Competencies", path: "/admin/forms/competencies" },
  { name: "Organisation Fleet", path: "/organisation/fleet" },
];

export function buildDynamicRoutes(ctx: E2ETestContext): AppRoute[] {
  const routes: AppRoute[] = [];

  if (ctx.workerId) {
    routes.push({
      name: "Worker Dashboard",
      path: `/worker-dashboard?worker_id=${encodeURIComponent(ctx.workerId)}`,
      personas: ["worker", "admin"],
    });
    routes.push({
      name: "Worker Profile",
      path: `/worker/${encodeURIComponent(ctx.workerId)}`,
      personas: ["admin"],
      timeoutMs: 25_000,
    });
  }

  if (ctx.projectId) {
    routes.push({
      name: "Project ITPs/ITCs",
      path: `/projects/${encodeURIComponent(ctx.projectId)}/itps-itcs`,
      personas: ["admin"],
    });
  }

  if (ctx.plantId) {
    routes.push({
      name: "Plant Prestart",
      path: `/prestart/${encodeURIComponent(ctx.plantId)}`,
      personas: ["admin", "worker"],
    });
  }

  return routes;
}

export function resolveRoutePath(
  route: AppRoute,
  ctx: E2ETestContext
): string {
  return typeof route.path === "function" ? route.path(ctx) : route.path;
}

export function routesForPersona(
  persona: "admin" | "worker" | "subcontractor",
  ctx: E2ETestContext
): AppRoute[] {
  const all = [...STATIC_ADMIN_ROUTES, ...buildDynamicRoutes(ctx)];
  return all.filter((route) => !route.personas || route.personas.includes(persona));
}

export function crawlEntriesForPersona(
  persona: "admin" | "worker" | "subcontractor",
  ctx: E2ETestContext
): Array<{ path: string; timeout?: number }> {
  return routesForPersona(persona, ctx).map((route) => ({
    path: resolveRoutePath(route, ctx),
    timeout: route.timeoutMs,
  }));
}
