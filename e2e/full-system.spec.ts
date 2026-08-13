import { test, expect } from "@playwright/test";
import {
  authenticateAs,
  gotoAdminHome,
  gotoWorkerDashboard,
} from "./helpers/auth";
import { createPageMonitor } from "./helpers/monitor";
import {
  assertNoPayRatesTable404,
  crawlAppRoutes,
  gotoAppRoute,
  openOrganisationWorkerDirectory,
} from "./helpers/navigation";
import {
  readTestContext,
  requireSupabaseContext,
  type E2ETestContext,
} from "./helpers/test-context";
import { crawlEntriesForPersona } from "./helpers/routes";
import {
  clickSafeOperationalButtons,
  dismissVisibleModals,
} from "./helpers/ui-crawl";
import {
  cleanupSiteFormSubmissions,
  submitAllSiteFormTypes,
} from "./helpers/site-forms-submit";
import {
  assertActBreakValidationRules,
  runActBreakUiValidationTest,
} from "./helpers/timesheet-act-break";

let testContext: E2ETestContext;

test.beforeAll(() => {
  testContext = readTestContext();
  requireSupabaseContext(testContext);
});

test.describe("Full System E2E", () => {
  test.describe("Admin persona", () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAs(page, "admin", testContext);
    });

    test("submits every site form type with complete metadata payloads", async () => {
      test.skip(
        !testContext.projectId || !testContext.workerId,
        "Missing project or worker context for site form submissions."
      );

      const insertedIds: string[] = [];

      try {
        const results = await submitAllSiteFormTypes(testContext);

        for (const result of results) {
          expect(
            result.status,
            `${result.formType} POST failed: ${result.error ?? "unknown error"}`
          ).toBeGreaterThanOrEqual(200);
          expect(result.status).toBeLessThan(300);
          expect(result.error).toBeNull();
          expect(result.id).toBeTruthy();

          const errorText = result.error ?? "";
          expect(errorText).not.toMatch(/PGRST|schema cache|could not find the/i);

          if (result.id) insertedIds.push(result.id);
        }

        expect(results.map((row) => row.formType)).toEqual([
          "daily_prestart",
          "toolbox_talk",
          "safety_walk",
        ]);
      } finally {
        await cleanupSiteFormSubmissions(insertedIds);
      }
    });

    test("accounts timesheets table renders, sorts, totals, and exports CSV", async ({
      page,
    }) => {
      const monitor = createPageMonitor(page);
      monitor.attach();

      await gotoAppRoute(page, "/accounts/timesheets");
      await expect(page.getByText(/accounts.*timesheets/i).first()).toBeVisible();

      const table = page.locator("table").first();
      await expect(table).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /worker/i })).toBeVisible();
      await expect(table.getByRole("columnheader", { name: /daily total/i })).toBeVisible();

      const workerHeader = table.getByRole("button", { name: /worker/i }).first();
      if (await workerHeader.isVisible().catch(() => false)) {
        await workerHeader.click();
        await expect(workerHeader).toHaveAttribute("aria-sort", /ascending|descending/);
      }

      const dailyTotalHeader = table
        .getByRole("button", { name: /daily total/i })
        .first();
      if (await dailyTotalHeader.isVisible().catch(() => false)) {
        await dailyTotalHeader.click();
      }

      const exportButton = page.getByRole("button", { name: /export csv/i });
      if (await exportButton.isEnabled().catch(() => false)) {
        const downloadPromise = page.waitForEvent("download");
        await exportButton.click();
        const download = await downloadPromise;
        expect(download.suggestedFilename()).toMatch(/\.csv$/i);
      } else {
        await expect(exportButton).toBeVisible();
      }

      assertNoPayRatesTable404(monitor.badResponses, "Accounts timesheets");
      monitor.assertClean("Accounts timesheets");
    });

    test("worker directory edit flow exposes admin pay rule assignment", async ({
      page,
    }) => {
      const monitor = createPageMonitor(page);
      monitor.attach();

      await gotoAdminHome(page);
      await openOrganisationWorkerDirectory(page);

      const editButton = page.getByRole("button", { name: /^edit$/i }).first();
      await editButton.click();

      await page.getByRole("button", { name: /financial information/i }).click();
      await expect(page.getByText(/assign pay rule/i)).toBeVisible();

      await dismissVisibleModals(page);
      monitor.assertClean("Worker directory pay rule assignment");
    });

    test("crawls admin routes and safe action buttons without runtime errors", async ({
      page,
    }) => {
      test.setTimeout(180_000);

      const monitor = createPageMonitor(page);
      monitor.attach();

      const paths = crawlEntriesForPersona("admin", testContext);

      await crawlAppRoutes(page, paths, async () => {
        await clickSafeOperationalButtons(page);
        await dismissVisibleModals(page);
      });

      monitor.assertClean("Admin route crawl");
    });
  });

  test.describe("Worker persona", () => {
    test.beforeEach(async ({ page }) => {
      test.skip(!testContext.workerId, "No worker profile available for E2E auth.");
      await authenticateAs(page, "worker", testContext);
    });

    test("worker dashboard loads forms shell without errors", async ({ page }) => {
      const monitor = createPageMonitor(page);
      monitor.attach();

      await gotoWorkerDashboard(page, testContext.workerId!);
      await expect(page.getByText(/toolbox talks|safety walk|pre-start|timesheet/i).first()).toBeVisible();
      await clickSafeOperationalButtons(page);
      monitor.assertClean("Worker dashboard");
    });

    test("ACT workers must record a break before submitting work timesheets", async ({
      page,
    }) => {
      assertActBreakValidationRules();
      await runActBreakUiValidationTest(page, testContext.workerId!);
    });

    test("crawls worker routes without runtime errors", async ({ page }) => {
      test.setTimeout(120_000);

      const monitor = createPageMonitor(page);
      monitor.attach();

      const paths = crawlEntriesForPersona("worker", testContext);

      await crawlAppRoutes(page, paths, async () => {
        await clickSafeOperationalButtons(page);
        await dismissVisibleModals(page);
      });

      monitor.assertClean("Worker route crawl");
    });
  });

  test.describe("Subcontractor persona", () => {
    test.beforeEach(async ({ page }) => {
      test.skip(
        !testContext.subcontractorWorkerId,
        "No subcontractor worker available for E2E auth."
      );
      await authenticateAs(page, "subcontractor", testContext);
    });

    test("subcontractor worker dashboard loads without errors", async ({ page }) => {
      const monitor = createPageMonitor(page);
      monitor.attach();

      await gotoWorkerDashboard(page, testContext.subcontractorWorkerId!);
      await expect(page.locator("body")).toContainText(/dashboard|forms|worker/i);
      monitor.assertClean("Subcontractor worker dashboard");
    });
  });

  test.describe("Cross-cutting workflow pages", () => {
    test.beforeEach(async ({ page }) => {
      await authenticateAs(page, "admin", testContext);
    });

    test("admin forms pages render RFI, requests, and induction routes", async ({
      page,
    }) => {
      const monitor = createPageMonitor(page);
      monitor.attach();

      const formRoutes = [
        "/admin/forms/rfi",
        "/admin/forms/requests",
        "/admin/forms/inductions",
        "/admin/forms/competencies",
      ];

      await crawlAppRoutes(page, formRoutes);

      monitor.assertClean("Admin forms routes");
    });
  });
});
