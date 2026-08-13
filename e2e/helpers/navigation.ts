import { expect, type Page } from "@playwright/test";

export const ROUTE_LOAD_TIMEOUT_MS = 15_000;

export async function gotoAppRoute(
  page: Page,
  path: string,
  options?: { timeout?: number }
): Promise<void> {
  const timeout = options?.timeout ?? ROUTE_LOAD_TIMEOUT_MS;
  await page.goto(path, { waitUntil: "domcontentloaded", timeout });
  await expect(page.locator("body")).toBeVisible({ timeout });
}

export async function openAdminReporting(page: Page): Promise<void> {
  const reportingHeading = page.getByRole("heading", { name: /^Reporting$/i });

  if (await reportingHeading.isVisible().catch(() => false)) {
    return;
  }

  const sidebar = page.locator("aside");
  const reporting = sidebar.getByRole("button", { name: /^Reporting$/i });
  const administration = sidebar.getByRole("button", { name: /^ADMINISTRATION$/i });

  if (!(await reporting.isVisible().catch(() => false))) {
    await administration.click({ timeout: ROUTE_LOAD_TIMEOUT_MS });
  }

  if (!(await reporting.isVisible().catch(() => false))) {
    await administration.click({ timeout: ROUTE_LOAD_TIMEOUT_MS });
  }

  await reporting.click({ timeout: ROUTE_LOAD_TIMEOUT_MS });
  await expect(reportingHeading).toBeVisible({ timeout: ROUTE_LOAD_TIMEOUT_MS });
}

export async function openOrganisationWorkerDirectory(page: Page): Promise<void> {
  if (
    !(await page
      .getByRole("heading", { name: /worker directory/i })
      .isVisible()
      .catch(() => false))
  ) {
    const sidebar = page.locator("aside");
    await sidebar.getByRole("button", { name: /^ORGANISATION$/i }).click({
      timeout: ROUTE_LOAD_TIMEOUT_MS,
    });
    await sidebar.getByRole("button", { name: /^Workers$/i }).last().click({
      timeout: ROUTE_LOAD_TIMEOUT_MS,
    });
  }

  await expect(page.getByRole("heading", { name: /worker directory/i })).toBeVisible({
    timeout: ROUTE_LOAD_TIMEOUT_MS,
  });
  await expect(page.getByRole("button", { name: /^edit$/i }).first()).toBeVisible({
    timeout: ROUTE_LOAD_TIMEOUT_MS,
  });
}

/** @deprecated Project tab shows assignments — use openOrganisationWorkerDirectory for Edit/pay rules. */
export async function openAssignedWorkersTab(page: Page): Promise<void> {
  await openOrganisationWorkerDirectory(page);
}

export async function crawlAppRoutes(
  page: Page,
  paths: Array<string | { path: string; timeout?: number }>,
  onRoute?: (path: string) => Promise<void>
): Promise<void> {
  for (const entry of paths) {
    const path = typeof entry === "string" ? entry : entry.path;
    const timeout = typeof entry === "string" ? ROUTE_LOAD_TIMEOUT_MS : entry.timeout;
    await gotoAppRoute(page, path, { timeout });
    if (onRoute) {
      await onRoute(path);
    }
  }
}

export function assertNoPayRatesTable404(
  badResponses: string[],
  label: string
): void {
  const payRatesErrors = badResponses.filter((entry) =>
    /pay_rates_and_rules/i.test(entry)
  );
  if (payRatesErrors.length > 0) {
    throw new Error(
      `${label} received unexpected pay_rates_and_rules HTTP errors:\n- ${payRatesErrors.join("\n- ")}`
    );
  }
}
