import fs from "node:fs";
import path from "node:path";
import { test, expect, type Page } from "@playwright/test";
import { authenticateAs, gotoWorkerDashboard } from "./helpers/auth";
import {
  readTestContext,
  requireSupabaseContext,
  type E2ETestContext,
} from "./helpers/test-context";

const ACTION_TIMEOUT_MS = 5_000;
const WHEEL_PAUSE_MS = 1_000;
const WHEEL_DELTA = 500;
const SCROLL_DOWN_STEPS = 3;
const SCROLL_UP_STEPS = 2;

const WORKER_PROFILE_VIDEO_PATH = path.join(
  process.cwd(),
  "test-results",
  "worker-profile-demo.webm"
);

let testContext: E2ETestContext;

async function wheelScrollDownAndUp(page: Page): Promise<void> {
  await focusScrollTarget(page);

  for (let step = 0; step < SCROLL_DOWN_STEPS; step += 1) {
    await page.mouse.wheel(0, WHEEL_DELTA);
    await page.waitForTimeout(WHEEL_PAUSE_MS);
  }

  for (let step = 0; step < SCROLL_UP_STEPS; step += 1) {
    await page.mouse.wheel(0, -WHEEL_DELTA);
    await page.waitForTimeout(WHEEL_PAUSE_MS);
  }
}

async function focusScrollTarget(page: Page): Promise<void> {
  const modal = page.locator("div.fixed.inset-0 .overflow-y-auto").last();
  if (await modal.isVisible().catch(() => false)) {
    await modal.hover({ timeout: ACTION_TIMEOUT_MS });
    return;
  }

  await page.locator("main").first().hover({ timeout: ACTION_TIMEOUT_MS });
}

async function closeOpenForm(page: Page): Promise<void> {
  const closeButton = page.getByRole("button", { name: /^close$/i }).first();
  if (await closeButton.isVisible().catch(() => false)) {
    await closeButton.click({ timeout: ACTION_TIMEOUT_MS });
    return;
  }

  const cancelButton = page.getByRole("button", { name: /^cancel$/i }).first();
  if (await cancelButton.isVisible().catch(() => false)) {
    await cancelButton.click({ timeout: ACTION_TIMEOUT_MS });
  }
}

async function recordFormWalkthrough(
  page: Page,
  open: () => Promise<void>
): Promise<void> {
  await open();
  await page.waitForTimeout(WHEEL_PAUSE_MS);

  const modalOpen = await page.locator("div.fixed.inset-0").last().isVisible().catch(() => false);
  if (modalOpen) {
    await wheelScrollDownAndUp(page);
    await closeOpenForm(page);
  }

  await page.waitForTimeout(500);
}

async function ensureWorkerProjectSelected(page: Page): Promise<void> {
  const projectSelect = page.locator("main select").first();
  if (!(await projectSelect.isVisible().catch(() => false))) return;

  const optionValue = await projectSelect
    .locator('option:not([value=""])')
    .first()
    .getAttribute("value");

  if (optionValue) {
    await projectSelect.selectOption(optionValue, { timeout: ACTION_TIMEOUT_MS });
  }
}

async function openFormsHub(page: Page): Promise<void> {
  if (
    await page
      .getByRole("heading", { name: /Forms & Safety Submissions/i })
      .isVisible()
      .catch(() => false)
  ) {
    return;
  }

  await page.getByRole("button", { name: /Forms & Safety Submissions/i }).click({
    timeout: ACTION_TIMEOUT_MS,
  });
}

async function returnToWorkerDashboard(page: Page): Promise<void> {
  const backButton = page.getByRole("button", { name: /Back to Main Dashboard/i });
  if (await backButton.isVisible().catch(() => false)) {
    await backButton.click({ timeout: ACTION_TIMEOUT_MS });
  }
}

async function saveWorkerProfileVideo(page: Page): Promise<void> {
  const video = page.video();
  if (!video) return;

  fs.mkdirSync(path.dirname(WORKER_PROFILE_VIDEO_PATH), { recursive: true });

  await Promise.race([
    video.saveAs(WORKER_PROFILE_VIDEO_PATH),
    page.waitForTimeout(3_000),
  ]).catch(async () => {
    const src = await video.path().catch(() => null);
    if (src && fs.existsSync(src)) {
      fs.copyFileSync(src, WORKER_PROFILE_VIDEO_PATH);
    }
  });
}

test.beforeAll(() => {
  testContext = readTestContext();
  requireSupabaseContext(testContext);
});

test.describe("Worker profile walkthrough recording", () => {
  test.afterEach(async ({ page }) => {
    await saveWorkerProfileVideo(page);
  });

  test("records worker profile forms walkthrough", async ({ page }) => {
    test.setTimeout(60_000);
    test.skip(!testContext.workerId, "No worker profile available for walkthrough recording.");

    const profileWorkerId = testContext.adminWorkerId ?? testContext.workerId!;

    await authenticateAs(page, "worker", testContext);
    await gotoWorkerDashboard(page, profileWorkerId);

    await expect(page.getByText(/Your dashboard|Forms & Safety Submissions/i).first()).toBeVisible({
      timeout: ACTION_TIMEOUT_MS,
    });
    await page
      .getByText(/Loading your profile/i)
      .waitFor({ state: "hidden", timeout: ACTION_TIMEOUT_MS })
      .catch(() => undefined);

    const exitCustomize = page.getByRole("button", { name: /Exit Customize/i });
    if (await exitCustomize.isVisible().catch(() => false)) {
      await exitCustomize.click({ timeout: ACTION_TIMEOUT_MS });
    }

    await ensureWorkerProjectSelected(page);
    await page.waitForTimeout(WHEEL_PAUSE_MS);

    await openFormsHub(page);
    await recordFormWalkthrough(page, async () => {
      await page.getByRole("button", { name: /Safety Walk/i }).click({
        timeout: ACTION_TIMEOUT_MS,
      });
    });

    await returnToWorkerDashboard(page);

    const swmsButton = page
      .getByRole("heading", { name: /SWMS Documents/i })
      .locator("xpath=ancestor::div[contains(@class,'rounded')][1]")
      .locator("ul button")
      .first();

    if (await swmsButton.isVisible().catch(() => false)) {
      await recordFormWalkthrough(page, async () => {
        await swmsButton.click({ timeout: ACTION_TIMEOUT_MS });
      });
    }

    await recordFormWalkthrough(page, async () => {
      const submitTimesheet = page.getByRole("button", { name: /Submit Timesheet/i });
      if (await submitTimesheet.isVisible().catch(() => false)) {
        await submitTimesheet.click({ timeout: ACTION_TIMEOUT_MS });
      } else {
        await page.getByRole("button", { name: /My Timesheets/i }).click({
          timeout: ACTION_TIMEOUT_MS,
        });
      }
    });

    await page.waitForTimeout(WHEEL_PAUSE_MS);
  });
});
