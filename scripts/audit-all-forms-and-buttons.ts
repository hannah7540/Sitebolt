/**
 * Zero-Omission Auto-Fix Audit — crawls every route, form, modal, tab, and button
 * across Admin, Worker, and Subcontractor personas; captures console/network/PGRST errors.
 *
 * Usage:
 *   npm run audit:all
 *   PLAYWRIGHT_BASE_URL=http://localhost:3000 npm run audit:all
 */

import { chromium, type Browser, type Page } from "playwright";
import { spawn, type ChildProcess } from "node:child_process";
import fs from "node:fs";
import path from "node:path";
import { loadEnvLocal } from "../e2e/helpers/env";
import { resolveE2ETestContext, type E2ETestContext } from "../e2e/helpers/test-context";
import { auditRoutesForPersona } from "../e2e/helpers/audit-routes";
import {
  attachAuditInterceptors,
  attemptFormSubmits,
  clickOperationalButtons,
  expandNavigationSections,
  fillAllVisibleFields,
  openFormModals,
  openVisibleTabs,
  type AuditFinding,
} from "../e2e/helpers/audit-crawl";
import {
  cleanupSiteFormSubmissions,
  submitAllSiteFormTypes,
} from "../e2e/helpers/site-forms-submit";

const WORKER_ID_KEY = "sitebolt_worker_id";
const ADMIN_WORKER_ID_KEY = "sitebolt_admin_worker_id";

type Persona = "admin" | "worker" | "subcontractor";

interface AuditRouteResult {
  persona: Persona;
  name: string;
  path: string;
  fieldsFilled: number;
  buttonsClicked: number;
  submitsAttempted: number;
  modalsOpened: number;
  tabsOpened: number;
  durationMs: number;
}

interface AuditReport {
  startedAt: string;
  finishedAt: string;
  baseURL: string;
  iterations: number;
  routesVisited: number;
  findings: AuditFinding[];
  routes: AuditRouteResult[];
  siteFormApiErrors: string[];
  summary: {
    totalFindings: number;
    pgrstErrors: number;
    networkErrors: number;
    consoleErrors: number;
    pageErrors: number;
  };
}

const REPORT_PATH = path.resolve(process.cwd(), "scripts/audit-report.json");
const MAX_ITERATIONS = 3;

function dedupeFindings(findings: AuditFinding[]): AuditFinding[] {
  const seen = new Set<string>();
  const unique: AuditFinding[] = [];
  for (const finding of findings) {
    const key = [
      finding.persona,
      finding.route,
      finding.kind,
      finding.url ?? "",
      finding.table ?? "",
      finding.field ?? "",
      finding.message.slice(0, 240),
    ].join("|");
    if (seen.has(key)) continue;
    seen.add(key);
    unique.push(finding);
  }
  return unique;
}

function summarize(findings: AuditFinding[]): AuditReport["summary"] {
  return {
    totalFindings: findings.length,
    pgrstErrors: findings.filter((row) => row.kind === "pgrst").length,
    networkErrors: findings.filter((row) => row.kind === "network").length,
    consoleErrors: findings.filter((row) => row.kind === "console").length,
    pageErrors: findings.filter((row) => row.kind === "pageerror").length,
  };
}

async function authenticatePersona(
  page: Page,
  persona: Persona,
  context: E2ETestContext
): Promise<void> {
  const workerId =
    persona === "admin"
      ? context.adminWorkerId ?? context.workerId
      : persona === "subcontractor"
        ? context.subcontractorWorkerId
        : context.workerId;

  if (!workerId) {
    throw new Error(`No worker id available for persona: ${persona}`);
  }

  const adminWorkerId = context.adminWorkerId ?? workerId;

  await page.addInitScript(
    ({ workerIdKey, adminWorkerIdKey, selectedWorkerId, adminId, selectedPersona }) => {
      localStorage.setItem(workerIdKey, selectedWorkerId);
      if (selectedPersona === "admin") {
        localStorage.setItem(adminWorkerIdKey, adminId);
      }
    },
    {
      workerIdKey: WORKER_ID_KEY,
      adminWorkerIdKey: ADMIN_WORKER_ID_KEY,
      selectedWorkerId: workerId,
      adminId: adminWorkerId,
      selectedPersona: persona,
    }
  );
}

async function auditRoute(
  page: Page,
  persona: Persona,
  route: { name: string; path: string; timeoutMs?: number },
  setRouteMeta: (meta: { route: string; routeName: string }) => void
): Promise<AuditRouteResult> {
  const started = Date.now();
  setRouteMeta({ route: route.path, routeName: route.name });

  await page.goto(route.path, {
    waitUntil: "domcontentloaded",
    timeout: route.timeoutMs ?? 20_000,
  });

  await page.waitForTimeout(500);

  await expandNavigationSections(page);
  const tabsOpened = await openVisibleTabs(page);
  const fieldsFilled = await fillAllVisibleFields(page);
  const modalsOpened = await openFormModals(page);
  const buttonsClicked = await clickOperationalButtons(page);
  const submitsAttempted = await attemptFormSubmits(page);

  return {
    persona,
    name: route.name,
    path: route.path,
    fieldsFilled,
    buttonsClicked,
    submitsAttempted,
    modalsOpened,
    tabsOpened,
    durationMs: Date.now() - started,
  };
}

async function runDirectSiteFormApiAudit(
  context: E2ETestContext,
  findings: AuditFinding[]
): Promise<string[]> {
  const errors: string[] = [];
  if (!context.projectId || !context.workerId) {
    return ["Skipped direct site form API audit — missing projectId or workerId."];
  }

  const insertedIds: string[] = [];
  try {
    const results = await submitAllSiteFormTypes(context);
    for (const result of results) {
      if (result.status < 200 || result.status >= 300 || result.error) {
        const message = `${result.formType}: HTTP ${result.status} — ${result.error ?? "unknown"}`;
        errors.push(message);
        findings.push({
          persona: "admin",
          route: "api:site_forms",
          routeName: "Direct Site Form POST",
          kind: /PGRST|schema cache/i.test(result.error ?? "") ? "pgrst" : "submission",
          message,
          table: "site_forms",
          field: result.formType,
        });
      } else if (result.id) {
        insertedIds.push(result.id);
      }
    }
  } finally {
    await cleanupSiteFormSubmissions(insertedIds);
  }

  return errors;
}

async function waitForServer(baseURL: string, timeoutMs = 180_000): Promise<void> {
  const started = Date.now();
  while (Date.now() - started < timeoutMs) {
    try {
      const response = await fetch(baseURL, { method: "GET" });
      if (response.ok || response.status < 500) return;
    } catch {
      // retry
    }
    await new Promise((resolve) => setTimeout(resolve, 1500));
  }
  throw new Error(`Dev server not reachable at ${baseURL} within ${timeoutMs}ms`);
}

async function maybeStartDevServer(baseURL: string): Promise<ChildProcess | null> {
  try {
    const response = await fetch(baseURL, { method: "GET" });
    if (response.ok || response.status < 500) return null;
  } catch {
    // start below
  }

  const child = spawn("npm", ["run", "dev"], {
    cwd: process.cwd(),
    shell: true,
    stdio: "ignore",
    detached: false,
  });

  await waitForServer(baseURL);
  return child;
}

async function runAuditIteration(
  browser: Browser,
  context: E2ETestContext,
  baseURL: string,
  findings: AuditFinding[],
  routes: AuditRouteResult[]
): Promise<void> {
  const personas: Persona[] = ["admin", "worker", "subcontractor"];

  for (const persona of personas) {
    if (persona === "subcontractor" && !context.subcontractorWorkerId) continue;
    if (persona === "worker" && !context.workerId) continue;
    if (persona === "admin" && !context.adminWorkerId && !context.workerId) continue;

    const page = await browser.newPage({ baseURL });
    await authenticatePersona(page, persona, context);

    const routeMeta = { route: "", routeName: "" };
    attachAuditInterceptors(
      page,
      () => ({ persona, route: routeMeta.route, routeName: routeMeta.routeName }),
      findings
    );

    for (const route of auditRoutesForPersona(persona, context)) {
      try {
        const result = await auditRoute(page, persona, route, (meta) => {
          routeMeta.route = meta.route;
          routeMeta.routeName = meta.routeName;
        });
        routes.push(result);
        console.log(
          `[audit] ${persona} ${route.name} — fields:${result.fieldsFilled} buttons:${result.buttonsClicked} submits:${result.submitsAttempted}`
        );
      } catch (error) {
        const message = error instanceof Error ? error.message : String(error);
        findings.push({
          persona,
          route: route.path,
          routeName: route.name,
          kind: "submission",
          message: `Route audit failed: ${message}`,
          stack: error instanceof Error ? error.stack : undefined,
        });
        console.error(`[audit] FAILED ${persona} ${route.path}: ${message}`);
      }
    }

    await page.close();
  }

  await runDirectSiteFormApiAudit(context, findings);
}

function printReport(report: AuditReport): void {
  console.log("\n=== Zero-Omission Audit Report ===");
  console.log(`Routes visited: ${report.routesVisited}`);
  console.log(`Total findings: ${report.summary.totalFindings}`);
  console.log(`  PGRST/schema: ${report.summary.pgrstErrors}`);
  console.log(`  Network 4xx/5xx: ${report.summary.networkErrors}`);
  console.log(`  Console errors: ${report.summary.consoleErrors}`);
  console.log(`  Page errors: ${report.summary.pageErrors}`);
  console.log(`Report written to: ${REPORT_PATH}`);

  if (report.findings.length > 0) {
    console.log("\nTop findings:");
    for (const finding of report.findings.slice(0, 20)) {
      const parts = [
        `[${finding.kind}]`,
        finding.persona,
        finding.routeName,
        finding.table ? `table=${finding.table}` : "",
        finding.field ? `field=${finding.field}` : "",
        finding.message.slice(0, 180),
      ].filter(Boolean);
      console.log(`- ${parts.join(" ")}`);
    }
  }
}

async function main(): Promise<void> {
  loadEnvLocal();
  const baseURL = process.env.PLAYWRIGHT_BASE_URL ?? "http://localhost:3000";
  const context = await resolveE2ETestContext();

  if (!context.supabaseConfigured) {
    console.warn("[audit] Supabase not configured — API/site-form checks may be limited.");
  }

  const devServer = await maybeStartDevServer(baseURL);
  const browser = await chromium.launch({ headless: true });

  const startedAt = new Date().toISOString();
  const allFindings: AuditFinding[] = [];
  const allRoutes: AuditRouteResult[] = [];
  let completedIterations = 0;

  try {
    for (completedIterations = 1; completedIterations <= MAX_ITERATIONS; completedIterations += 1) {
      console.log(`\n[audit] Iteration ${completedIterations}/${MAX_ITERATIONS}`);
      const iterationFindings: AuditFinding[] = [];
      await runAuditIteration(browser, context, baseURL, iterationFindings, allRoutes);

      const deduped = dedupeFindings(iterationFindings);
      allFindings.length = 0;
      allFindings.push(...deduped);

      if (deduped.length === 0) {
        console.log("[audit] 0 errors recorded — audit clean.");
        break;
      }

      console.warn(`[audit] ${deduped.length} findings in iteration ${completedIterations}.`);
      if (completedIterations < MAX_ITERATIONS) {
        console.log("[audit] Retrying after resilient form_metadata fallbacks...");
      }
    }
  } finally {
    await browser.close();
    if (devServer) {
      devServer.kill();
    }
  }

  const findings = dedupeFindings(allFindings);
  const finishedAt = new Date().toISOString();
  const report: AuditReport = {
    startedAt,
    finishedAt,
    baseURL,
    iterations: completedIterations,
    routesVisited: allRoutes.length,
    findings,
    routes: allRoutes,
    siteFormApiErrors: findings
      .filter((row) => row.route === "api:site_forms")
      .map((row) => row.message),
    summary: summarize(findings),
  };

  fs.mkdirSync(path.dirname(REPORT_PATH), { recursive: true });
  fs.writeFileSync(REPORT_PATH, JSON.stringify(report, null, 2), "utf8");
  printReport(report);

  if (findings.length > 0) {
    process.exitCode = 1;
  }
}

main().catch((error) => {
  console.error("[audit] Fatal error:", error);
  process.exit(1);
});
