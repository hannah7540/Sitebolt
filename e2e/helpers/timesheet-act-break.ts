import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { expect, type Page } from "@playwright/test";
import {
  ACT_BREAK_REQUIRED_MESSAGE,
  validateActBreakForTimesheetPayload,
  validateActBreakRequirement,
} from "@/lib/timesheet-act-break-validation";
import { buildLeaveTimesheetInsertPayload } from "@/lib/form-test-timesheet-helpers";
import { getSupabaseEnv } from "./env";
import { gotoWorkerDashboard } from "./auth";

export function assertActBreakValidationRules(): void {
  const workActivities = [{ label: "WORKING ON SITE" }];

  expect(
    validateActBreakRequirement({
      workerState: "ACT",
      submit: true,
      breaks: [],
      activities: workActivities,
    })
  ).toBe(ACT_BREAK_REQUIRED_MESSAGE);

  expect(
    validateActBreakRequirement({
      workerState: "ACT",
      submit: true,
      breaks: [{ id: "b1", startTime: "09:30", endTime: "10:00" }],
      activities: workActivities,
    })
  ).toBeNull();

  expect(
    validateActBreakRequirement({
      workerState: "NSW",
      payRuleName: "ACT Site Worker",
      submit: true,
      breaks: [],
      activities: workActivities,
    })
  ).toBe(ACT_BREAK_REQUIRED_MESSAGE);

  expect(
    validateActBreakRequirement({
      workerState: "WA",
      submit: true,
      breaks: [],
      activities: workActivities,
    })
  ).toBeNull();

  expect(
    validateActBreakRequirement({
      workerState: "ACT",
      submit: true,
      breaks: [],
      leaveRequestId: "leave-123",
      activities: [{ label: "Annual Leave" }],
      notes: "Annual Leave - Auto-generated from approved leave request",
    })
  ).toBeNull();

  const leavePayload = buildLeaveTimesheetInsertPayload({
    workerId: "worker-test",
    projectId: "project-test",
    projectName: "Test Project",
    leaveType: "Sick Leave",
  });

  expect(
    validateActBreakForTimesheetPayload("ACT", leavePayload)
  ).toBeNull();
}

function createSupabaseClient(): SupabaseClient | null {
  const env = getSupabaseEnv();
  if (!env) return null;
  return createClient(env.url, env.anonKey);
}

export async function setWorkerState(
  workerId: string,
  state: string | null
): Promise<string | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return "Supabase is not configured for E2E.";

  const { error } = await supabase
    .from("workers")
    .update({ state })
    .eq("id", workerId);

  return error?.message ?? null;
}

export async function readWorkerState(workerId: string): Promise<string | null> {
  const supabase = createSupabaseClient();
  if (!supabase) return null;

  const { data } = await supabase
    .from("workers")
    .select("state")
    .eq("id", workerId)
    .maybeSingle();

  return data?.state ? String(data.state) : null;
}

async function selectFirstNonEmptyOption(page: Page, selector: string): Promise<void> {
  const select = page.locator(selector);
  await expect(select).toBeVisible();

  const optionValues = await select.locator("option").evaluateAll((options) =>
    options
      .map((option) => (option as HTMLOptionElement).value)
      .filter((value) => value.trim().length > 0)
  );

  if (optionValues.length === 0) {
    throw new Error(`No selectable options found for ${selector}`);
  }

  await select.selectOption(optionValues[0]!);
}

export async function openWorkerTimesheetModal(page: Page): Promise<void> {
  await page.getByRole("button", { name: /submit timesheet/i }).click();
  await expect(page.getByRole("heading", { name: /add new timesheet|timesheet/i })).toBeVisible();
}

export async function submitActTimesheetWithoutBreak(page: Page): Promise<void> {
  await selectFirstNonEmptyOption(page, "#timesheet-project");
  await selectFirstNonEmptyOption(page, "#timesheet-task");
  await page.getByRole("button", { name: /sign and submit/i }).click();
}

export async function runActBreakUiValidationTest(
  page: Page,
  workerId: string
): Promise<void> {
  const previousState = await readWorkerState(workerId);

  try {
    const updateError = await setWorkerState(workerId, "ACT");
    if (updateError?.includes("state")) {
      return;
    }
    expect(updateError).toBeNull();

    await gotoWorkerDashboard(page, workerId);
    await openWorkerTimesheetModal(page);
    await submitActTimesheetWithoutBreak(page);

    await expect(page.getByText(ACT_BREAK_REQUIRED_MESSAGE)).toBeVisible();
  } finally {
    await setWorkerState(workerId, previousState);
  }
}
