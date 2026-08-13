/**
 * Temporary seed script — payroll CSV export & pay rule engine test data.
 *
 * Usage:
 *   npm run seed:payroll-test
 *   npm run seed:payroll-test -- --cleanup
 *
 * Creates 3 NSW workers with NSW Site Worker pay rules and one Mon–Fri week of
 * diverse pending timesheets visible under Accounts → Timesheets.
 */

import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { loadEnvLocal, getSupabaseEnv } from "../e2e/helpers/env";
import type { TimesheetActivitySlot, TimesheetBreakSlot } from "../src/lib/timesheet-utils";
import type { TimesheetLineCategory } from "../src/lib/timesheet-line-items";
import { syncLineItemFields } from "../src/lib/timesheet-line-items";
import { calculateDailyTotalsFromSlots, addHoursToTime } from "../src/lib/timesheet-utils";

loadEnvLocal();

export const SEED_TAG = "PAYROLL-TEST-SEED";
const SEED_EMAIL_DOMAIN = "payroll-test.sitebolt.local";

interface SeedWorkerSpec {
  key: string;
  firstName: string;
  lastName: string;
  email: string;
  workerCode: string;
}

const SEED_WORKERS: SeedWorkerSpec[] = [
  {
    key: "john",
    firstName: "John",
    lastName: "Smith",
    email: `john.smith@${SEED_EMAIL_DOMAIN}`,
    workerCode: "SEED-JOHN-SMITH",
  },
  {
    key: "david",
    firstName: "David",
    lastName: "Miller",
    email: `david.miller@${SEED_EMAIL_DOMAIN}`,
    workerCode: "SEED-DAVID-MILLER",
  },
  {
    key: "sarah",
    firstName: "Sarah",
    lastName: "Taylor",
    email: `sarah.taylor@${SEED_EMAIL_DOMAIN}`,
    workerCode: "SEED-SARAH-TAYLOR",
  },
];

function formatIsoDate(date: Date): string {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, "0");
  const day = String(date.getDate()).padStart(2, "0");
  return `${year}-${month}-${day}`;
}

/** Previous Mon–Sun week relative to today (for Accounts date filters). */
export function getSeedWeekDates(reference = new Date()): string[] {
  const monday = new Date(reference);
  const day = monday.getDay();
  const diff = day === 0 ? -6 : 1 - day;
  monday.setDate(monday.getDate() + diff - 7);

  return Array.from({ length: 7 }, (_, index) => {
    const date = new Date(monday);
    date.setDate(monday.getDate() + index);
    return formatIsoDate(date);
  });
}

function lineId(prefix: string): string {
  return `${prefix}-${Date.now()}-${Math.random().toString(36).slice(2, 7)}`;
}

function buildActivity(
  category: TimesheetLineCategory,
  startTime: string,
  endTime: string,
  durationMode: "full_day" | "partial" = "partial"
): TimesheetActivitySlot {
  return syncLineItemFields({
    id: lineId("activity"),
    category,
    durationMode,
    startTime,
    endTime,
    label: "",
  });
}

function serializeActivities(activities: TimesheetActivitySlot[]): Array<Record<string, unknown>> {
  return activities.map((row) => {
    const synced = syncLineItemFields(row);
    return {
      id: synced.id,
      start_time: synced.startTime,
      end_time: synced.endTime,
      label: synced.label,
      category: synced.category,
      duration_mode: synced.durationMode,
      hours: synced.hours,
    };
  });
}

function buildTimesheetPayload(options: {
  workerId: string;
  workDate: string;
  projectId: string;
  projectName: string;
  taskName: string;
  activities: TimesheetActivitySlot[];
  breaks?: TimesheetBreakSlot[];
  notes: string;
}): Record<string, unknown> {
  const breaks = options.breaks ?? [];
  const totals = calculateDailyTotalsFromSlots(options.activities, breaks);
  const serializedActivities = serializeActivities(options.activities);
  const now = new Date().toISOString();
  const first = options.activities[0];
  const last = options.activities[options.activities.length - 1];

  return {
    worker_id: options.workerId,
    work_date: options.workDate,
    project_id: options.projectId,
    project_name: options.projectName,
    worker_trade: options.taskName,
    start_time: first?.startTime ?? "06:30",
    finish_time: last?.endTime ?? "14:30",
    break_minutes: Math.round(totals.breakHours * 60),
    work_hours: totals.workHours,
    break_hours: totals.breakHours,
    daily_total_hours: totals.dailyTotalHours,
    total_hours: totals.dailyTotalHours,
    activities: serializedActivities,
    breaks: breaks.map((row) => ({
      id: row.id,
      start_time: row.startTime,
      end_time: row.endTime,
    })),
    notes: `${options.notes} [${SEED_TAG}]`,
    signature_url: "https://example.com/payroll-seed-signature.png",
    is_draft: false,
    status: "pending",
    submitted_at: now,
    updated_at: now,
  };
}

function buildStandardWorkDay(
  workerId: string,
  workDate: string,
  projectId: string,
  projectName: string,
  taskName: string,
  notes: string
): Record<string, unknown> {
  return buildTimesheetPayload({
    workerId,
    workDate,
    projectId,
    projectName,
    taskName,
    notes,
    activities: [buildActivity("work", "06:30", "14:30")],
    breaks: [],
  });
}

function buildLongWorkDay(
  workerId: string,
  workDate: string,
  projectId: string,
  projectName: string,
  taskName: string,
  paidWorkHours: number,
  notes: string,
  breakSlot?: TimesheetBreakSlot
): Record<string, unknown> {
  const breakHours = breakSlot ? 0.5 : 0;
  const grossHours = paidWorkHours + breakHours;
  const endTime = addHoursToTime("06:30", grossHours);

  return buildTimesheetPayload({
    workerId,
    workDate,
    projectId,
    projectName,
    taskName,
    notes,
    activities: [buildActivity("work", "06:30", endTime)],
    breaks: breakSlot ? [breakSlot] : [],
  });
}

function buildLeaveDay(
  workerId: string,
  workDate: string,
  projectId: string,
  projectName: string,
  taskName: string,
  category: TimesheetLineCategory,
  notes: string
): Record<string, unknown> {
  return buildTimesheetPayload({
    workerId,
    workDate,
    projectId,
    projectName,
    taskName,
    notes,
    activities: [buildActivity(category, "06:30", "14:30", "full_day")],
    breaks: [],
  });
}

function buildSplitWorkLeaveDay(
  workerId: string,
  workDate: string,
  projectId: string,
  projectName: string,
  taskName: string,
  notes: string
): Record<string, unknown> {
  return buildTimesheetPayload({
    workerId,
    workDate,
    projectId,
    projectName,
    taskName,
    notes,
    activities: [
      buildActivity("work", "06:30", "10:30"),
      buildActivity("personal_leave", "10:30", "14:30"),
    ],
    breaks: [],
  });
}

async function fetchNswPayRuleIds(supabase: SupabaseClient): Promise<{
  payRateId: string | null;
  payRuleTemplateId: string | null;
}> {
  const { data: rateRows, error: rateError } = await supabase
    .from("pay_rates_and_rules")
    .select("*");

  if (rateError) {
    console.warn(`pay_rates_and_rules unavailable: ${rateError.message}`);
    return { payRateId: null, payRuleTemplateId: null };
  }

  const rates = (rateRows ?? []) as Array<Record<string, unknown>>;
  const nswRate =
    rates.find((row) => {
      const ruleName = String(row.rule_name ?? row.name ?? "").toLowerCase();
      const preset = String(row.preset_key ?? "").toLowerCase();
      return ruleName.includes("nsw site worker") || preset === "nsw_site_worker";
    }) ?? rates[0];

  const { data: templateRows } = await supabase
    .from("pay_rule_templates")
    .select("id,name")
    .ilike("name", "%NSW Site Worker%")
    .limit(1);

  const templateId =
    templateRows?.[0] && typeof templateRows[0] === "object"
      ? String((templateRows[0] as { id: string }).id)
      : null;

  if (!nswRate?.id) {
    console.warn(
      "No NSW pay rate row found. Workers will be seeded without pay_rate_id — apply migrations 073–077 or assign a rule in Accounts → Rates & Rules, then re-run."
    );
    return { payRateId: null, payRuleTemplateId: templateId };
  }

  return { payRateId: String(nswRate.id), payRuleTemplateId: templateId };
}

async function resolveSeedProject(supabase: SupabaseClient): Promise<{
  projectId: string;
  projectName: string;
  taskName: string;
  workerProjectId: string | null;
}> {
  const { fetchTimesheetFormOptions, formatTimesheetProjectDisplayName } = await import(
    "../src/lib/timesheet-options"
  );
  const { fetchProjects, isProjectUuid } = await import("../src/lib/project-resolver");

  const [picklists, projects] = await Promise.all([
    fetchTimesheetFormOptions(),
    fetchProjects(),
  ]);

  const workerProject =
    projects.find((row) => isProjectUuid(row.id)) ?? projects[0] ?? null;
  const workerProjectId =
    workerProject && isProjectUuid(workerProject.id) ? workerProject.id : null;

  if (picklists.projects.length > 0 && picklists.tasks.length > 0) {
    const project = picklists.projects[0]!;
    const task = picklists.tasks[0]!;
    return {
      projectId: project.id,
      projectName: formatTimesheetProjectDisplayName(project),
      taskName: task.name,
      workerProjectId,
    };
  }

  if (workerProject) {
    return {
      projectId: workerProject.id,
      projectName: workerProject.name,
      taskName: "Labourer",
      workerProjectId,
    };
  }

  throw new Error(
    "No active timesheet project/task picklists or projects found. Add at least one project."
  );
}

async function upsertSeedWorker(
  supabase: SupabaseClient,
  spec: SeedWorkerSpec,
  payRateId: string | null,
  payRuleTemplateId: string | null,
  workerProjectId: string | null
): Promise<string> {
  const { data: existing } = await supabase
    .from("workers")
    .select("id")
    .eq("email", spec.email)
    .maybeSingle();

  const payloadVariants: Record<string, unknown>[] = [
    {
      first_name: spec.firstName,
      last_name: spec.lastName,
      full_name: `${spec.firstName} ${spec.lastName}`,
      email: spec.email,
      worker_code: spec.workerCode,
      status: "active",
      security_role: "general_worker",
      state: "NSW",
      assigned_project_id: workerProjectId,
      trade: "Labourer",
      pay_rate_id: payRateId,
      pay_rule_template_id: payRuleTemplateId,
      pay_rule_id: payRuleTemplateId,
      updated_at: new Date().toISOString(),
    },
    {
      first_name: spec.firstName,
      last_name: spec.lastName,
      full_name: `${spec.firstName} ${spec.lastName}`,
      email: spec.email,
      status: "active",
      state: "NSW",
      assigned_project_id: workerProjectId,
      pay_rate_id: payRateId,
      updated_at: new Date().toISOString(),
    },
    {
      first_name: spec.firstName,
      last_name: spec.lastName,
      full_name: `${spec.firstName} ${spec.lastName}`,
      email: spec.email,
      status: "active",
      updated_at: new Date().toISOString(),
    },
  ];

  for (const payload of payloadVariants) {
    const cleaned = Object.fromEntries(
      Object.entries(payload).filter(([, value]) => value !== null && value !== undefined)
    );

    if (existing?.id) {
      const { error } = await supabase.from("workers").update(cleaned).eq("id", existing.id);
      if (!error) return String(existing.id);
      if (!String(error.message).includes("schema cache")) {
        throw new Error(`Update worker ${spec.email}: ${error.message}`);
      }
      continue;
    }

    const { data, error } = await supabase.from("workers").insert([cleaned]).select("id").single();
    if (!error && data?.id) return String(data.id);
    if (!error) break;
    if (!String(error.message).includes("schema cache")) {
      throw new Error(`Insert worker ${spec.email}: ${error.message}`);
    }
  }

  throw new Error(`Could not upsert worker ${spec.email} with any payload variant.`);
}

async function cleanupSeedData(supabase: SupabaseClient): Promise<void> {
  const emails = SEED_WORKERS.map((row) => row.email);
  const { data: workers } = await supabase.from("workers").select("id").in("email", emails);
  const workerIds = (workers ?? []).map((row) => String((row as { id: string }).id));

  if (workerIds.length > 0) {
    const { error: tsError } = await supabase
      .from("worker_timesheets")
      .delete()
      .in("worker_id", workerIds);
    if (tsError) console.warn("Timesheet cleanup:", tsError.message);

    const { error: workerError } = await supabase.from("workers").delete().in("id", workerIds);
    if (workerError) console.warn("Worker cleanup:", workerError.message);
  }

  console.log(`Removed seed workers/timesheets for ${workerIds.length} worker(s).`);
}

async function deleteExistingSeedTimesheets(
  supabase: SupabaseClient,
  workerIds: string[],
  weekDates: string[]
): Promise<void> {
  if (workerIds.length === 0) return;

  const { error } = await supabase
    .from("worker_timesheets")
    .delete()
    .in("worker_id", workerIds)
    .gte("work_date", weekDates[0]!)
    .lte("work_date", weekDates[weekDates.length - 1]!);

  if (error) {
    console.warn("Could not clear prior seed week timesheets:", error.message);
  }
}

function buildSeedTimesheets(
  workerIds: Record<string, string>,
  weekDates: string[],
  projectId: string,
  projectName: string,
  taskName: string
): Record<string, unknown>[] {
  const [mon, tue, wed, thu, fri] = weekDates;
  const john = workerIds.john!;
  const david = workerIds.david!;
  const sarah = workerIds.sarah!;

  return [
    // John Smith — Mon–Wed standard 8h work
    buildStandardWorkDay(john, mon!, projectId, projectName, taskName, "Mon standard 8h work shift"),
    buildStandardWorkDay(john, tue!, projectId, projectName, taskName, "Tue standard 8h work shift"),
    buildStandardWorkDay(john, wed!, projectId, projectName, taskName, "Wed standard 8h work shift"),
    // Thu 11h — 8 base + 3 OT + meal + travel + site + productivity
    buildLongWorkDay(
      john,
      thu!,
      projectId,
      projectName,
      taskName,
      11,
      "Thu 11h shift with overtime, meal, travel, site & productivity allowances",
      {
        id: lineId("break"),
        startTime: "12:00",
        endTime: "12:30",
      }
    ),
    // Fri split 4h work + 4h personal leave
    buildSplitWorkLeaveDay(
      john,
      fri!,
      projectId,
      projectName,
      taskName,
      "Fri split shift — 4h work + 4h personal leave"
    ),

    // David Miller — leave Mon–Wed, work Thu–Fri
    buildLeaveDay(
      david,
      mon!,
      projectId,
      projectName,
      taskName,
      "annual_leave",
      "Mon annual leave with loading"
    ),
    buildLeaveDay(
      david,
      tue!,
      projectId,
      projectName,
      taskName,
      "sick_leave",
      "Tue sick leave (personal leave pay)"
    ),
    buildLeaveDay(david, wed!, projectId, projectName, taskName, "rdo", "Wed RDO taken"),
    buildStandardWorkDay(
      david,
      thu!,
      projectId,
      projectName,
      taskName,
      "Thu standard 8h work shift"
    ),
    buildStandardWorkDay(
      david,
      fri!,
      projectId,
      projectName,
      taskName,
      "Fri standard 8h work shift"
    ),

    // Sarah Taylor — PH Monday, 10.5h Tue–Fri
    buildLeaveDay(
      sarah,
      mon!,
      projectId,
      projectName,
      taskName,
      "public_holiday",
      "Mon public holiday pay"
    ),
    buildLongWorkDay(
      sarah,
      tue!,
      projectId,
      projectName,
      taskName,
      10.5,
      "Tue 10.5h shift — site allowance & overtime test"
    ),
    buildLongWorkDay(
      sarah,
      wed!,
      projectId,
      projectName,
      taskName,
      10.5,
      "Wed 10.5h shift — site allowance & overtime test"
    ),
    buildLongWorkDay(
      sarah,
      thu!,
      projectId,
      projectName,
      taskName,
      10.5,
      "Thu 10.5h shift — site allowance & overtime test"
    ),
    buildLongWorkDay(
      sarah,
      fri!,
      projectId,
      projectName,
      taskName,
      10.5,
      "Fri 10.5h shift — site allowance & overtime test"
    ),
  ];
}

export async function runPayrollTestSeed(options: {
  supabase: SupabaseClient;
  cleanup?: boolean;
}): Promise<void> {
  if (options.cleanup) {
    await cleanupSeedData(options.supabase);
    return;
  }

  const weekDates = getSeedWeekDates();
  const { payRateId, payRuleTemplateId } = await fetchNswPayRuleIds(options.supabase);
  const { projectId, projectName, taskName, workerProjectId } =
    await resolveSeedProject(options.supabase);

  const workerIds: Record<string, string> = {};
  for (const spec of SEED_WORKERS) {
    workerIds[spec.key] = await upsertSeedWorker(
      options.supabase,
      spec,
      payRateId,
      payRuleTemplateId,
      workerProjectId
    );
  }

  await deleteExistingSeedTimesheets(options.supabase, Object.values(workerIds), weekDates);

  const payloads = buildSeedTimesheets(workerIds, weekDates, projectId, projectName, taskName);

  let insertedCount = 0;
  for (const payload of payloads) {
    const attempts = [
      payload,
      {
        worker_id: payload.worker_id,
        work_date: payload.work_date,
        project_id: payload.project_id,
        project_name: payload.project_name,
        start_time: payload.start_time,
        finish_time: payload.finish_time,
        break_minutes: payload.break_minutes,
        total_hours: payload.total_hours,
        activities: payload.activities,
        breaks: payload.breaks,
        notes: payload.notes,
        status: payload.status,
        submitted_at: payload.submitted_at,
        updated_at: payload.updated_at,
      },
    ];

    let saved = false;
    for (const attempt of attempts) {
      const { error } = await options.supabase.from("worker_timesheets").insert([attempt]);
      if (!error) {
        insertedCount += 1;
        saved = true;
        break;
      }
      if (!String(error.message).includes("schema cache")) {
        throw new Error(
          `Insert timesheet ${String(payload.worker_id)} ${String(payload.work_date)}: ${error.message}`
        );
      }
    }

    if (!saved) {
      throw new Error(
        `Insert timesheet ${String(payload.worker_id)} ${String(payload.work_date)}: schema mismatch`
      );
    }
  }

  console.log("\nPayroll test seed complete.\n");
  console.log(`Week: ${weekDates[0]} → ${weekDates[weekDates.length - 1]}`);
  console.log(`Project: ${projectName}`);
  console.log(`NSW pay rule: ${payRateId ?? "(none — assign in Accounts → Rates & Rules)"}`);
  console.log(`Timesheets inserted: ${insertedCount}`);
  console.log("\nWorkers:");
  for (const spec of SEED_WORKERS) {
    console.log(`  • ${spec.firstName} ${spec.lastName} (${spec.email}) → ${workerIds[spec.key]}`);
  }
  console.log("\nOpen Accounts → Timesheets and export Payroll V2 CSV for this week.\n");
}

async function main(): Promise<void> {
  const env = getSupabaseEnv();
  if (!env) {
    console.error("Missing NEXT_PUBLIC_SUPABASE_URL / NEXT_PUBLIC_SUPABASE_ANON_KEY in .env.local");
    process.exit(1);
  }

  const cleanup = process.argv.includes("--cleanup");
  const supabase = createClient(env.url, env.anonKey);

  try {
    await runPayrollTestSeed({ supabase, cleanup });
  } catch (error) {
    console.error(error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

void main();
