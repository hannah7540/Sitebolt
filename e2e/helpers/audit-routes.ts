import type { E2ETestContext } from "./test-context";
import {
  STATIC_ADMIN_ROUTES,
  buildDynamicRoutes,
  resolveRoutePath,
  type AppRoute,
} from "./routes";

export const EXTRA_AUDIT_ROUTES: AppRoute[] = [
  {
    name: "New Induction Form",
    path: "/admin/forms/inductions/new",
    personas: ["admin"],
  },
  {
    name: "Worker Onboarding Portal",
    path: (ctx) =>
      ctx.workerId
        ? `/portal/onboarding/${encodeURIComponent(ctx.workerId)}`
        : "/portal/onboarding/demo-worker",
    personas: ["admin", "worker"],
  },
];

export function allAuditRoutes(ctx: E2ETestContext): AppRoute[] {
  return [...STATIC_ADMIN_ROUTES, ...buildDynamicRoutes(ctx), ...EXTRA_AUDIT_ROUTES];
}

export function auditRoutesForPersona(
  persona: "admin" | "worker" | "subcontractor",
  ctx: E2ETestContext
): Array<{ name: string; path: string; timeoutMs?: number }> {
  return allAuditRoutes(ctx)
    .filter((route) => !route.personas || route.personas.includes(persona))
    .map((route) => ({
      name: route.name,
      path: resolveRoutePath(route, ctx),
      timeoutMs: route.timeoutMs,
    }));
}
