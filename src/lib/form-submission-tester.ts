import { supabase, isSupabaseConfigured } from "./supabase";
import { fetchWorkerProfileNameMap } from "./worker-profile-lookup";
import { insertWithFormMetadataFallback } from "./form-metadata-consolidation";
import {
  buildTestTimesheetInsertPayload,
  enrichFormTestContext,
  resolveTimesheetTestPicklists,
  validateActBreakForTimesheetPayload,
} from "./form-test-timesheet-helpers";
import {
  buildSiteFormTestPayload,
  SITE_FORM_TEST_CHECKLIST,
  SITE_FORM_TYPES,
} from "./site-form-payload";
import { buildWorkerFullName, buildWorkerNameFields, getWorkerDisplayName } from "./worker-utils";
import { fetchTimesheetFormOptions } from "./timesheet-options";
import {
  getPostgrestErrorCode,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";

export type FormTestStatus = "pending" | "running" | "passed" | "failed" | "skipped";

export interface FormSubmissionTestResult {
  id: string;
  table: string;
  label: string;
  status: FormTestStatus;
  insertedId?: string | null;
  errorCode?: string;
  errorMessage?: string;
  fixSql?: string;
  cleanupWarning?: string;
  durationMs?: number;
}

export interface FormTestContext {
  workerId: string;
  workerName: string;
  workerFirstName?: string;
  workerLastName?: string;
  workerState?: string | null;
  projectId: string;
  projectName: string;
  plantId: string | null;
  formTemplateId: string | null;
  createdTemplateId: string | null;
  timesheetProjectId?: string | null;
  timesheetProjectName?: string;
  timesheetTaskName?: string;
}

export interface FormSubmissionTestDefinition {
  id: string;
  table: string;
  label: string;
  requires?: Array<keyof FormTestContext>;
  prepare?: (ctx: FormTestContext) => Promise<void>;
  buildPayloads: (ctx: FormTestContext) => Record<string, unknown>[];
  cleanup?: (ctx: FormTestContext, insertedId: string) => Promise<string | null>;
  verifyInsert?: (
    ctx: FormTestContext,
    insertedId: string
  ) => Promise<{ passed: boolean; message?: string; details?: string[] }>;
}

export interface FormSubmissionVerifyDefinition {
  id: string;
  table: string;
  label: string;
  run: (
    ctx: FormTestContext
  ) => Promise<{ passed: boolean; message?: string; details?: string[] }>;
}

const TEST_TAG = "FORM-TEST";
const TEST_ADMIN_NAME = `${TEST_TAG} Admin`;
const TEST_FORM_TITLE = "General Site Induction";
const TEST_VOC_TITLE = "Plumbing VOC Verification";
const TEST_FINISH_TIME = "14:30:00";
const TEST_LEGACY_FINISH_TIME = "15:30:00";
const TEST_TIMESHEET_NOTES = "Test timesheet entry";
const TEST_REPORT_FILE_NAME = "test_report.csv";
const TEST_REPORT_TITLE = "Diagnostic Test Report";
const TEST_DAILY_TOTAL_HOURS = 8.0;

async function resolveFormTestPlantId(): Promise<string | null> {
  const { data: plantRows, error: plantError } = await supabase
    .from("plant")
    .select("id")
    .limit(1);

  if (plantError || !plantRows?.[0]?.id) {
    return null;
  }

  return String(plantRows[0].id);
}

function nowIso(): string {
  return new Date().toISOString();
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

function uniqueSuffix(): string {
  return `${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
}

export function generateFixSqlFromError(
  table: string,
  error: SupabaseRequestError | null | undefined
): string | undefined {
  if (!error) return undefined;
  const message = String(error.message ?? "");
  const code = getPostgrestErrorCode(error);

  const pgColumnMatch =
    message.match(/column "([^"]+)" (?:of relation "[^"]+" )?does not exist/i) ??
    message.match(/Could not find the '([^']+)' column/i);

  if (pgColumnMatch?.[1]) {
    const column = pgColumnMatch[1];
    const columnType =
      column === "form_time"
        ? "time"
        : column === "form_date"
          ? "date"
          : column === "additional_workers"
            ? "jsonb NOT NULL DEFAULT '[]'::jsonb"
            : column.endsWith("_at")
              ? "timestamptz NOT NULL DEFAULT now()"
              : "text";
    const columnDefault =
      column === "form_time" || column === "form_date" ? "" : " -- TODO: choose correct default";
    return [
      `-- Missing column detected while testing public.${table}`,
      `ALTER TABLE public.${table}`,
      `  ADD COLUMN IF NOT EXISTS ${column} ${columnType}${columnDefault};`,
    ].join("\n");
  }

  if (
    code === "42P01" ||
    /relation "([^"]+)" does not exist/i.test(message) ||
    /Could not find the table/i.test(message)
  ) {
    return [
      `-- Table public.${table} is missing in this Supabase project.`,
      `-- Run the corresponding SiteBolt migration for "${table}" in the SQL editor.`,
    ].join("\n");
  }

  if (/violates check constraint/i.test(message)) {
    const constraintMatch = message.match(/constraint "([^"]+)"/i);
    return [
      `-- Check constraint failure on public.${table}`,
      constraintMatch?.[1]
        ? `-- Review constraint: ${constraintMatch[1]}`
        : `-- Review CHECK constraints on public.${table}`,
      `-- Error: ${message}`,
    ].join("\n");
  }

  if (/violates foreign key constraint/i.test(message)) {
    return [
      `-- Foreign key failure while testing public.${table}`,
      `-- Ensure referenced worker/project/form rows exist before submitting.`,
      `-- Error: ${message}`,
    ].join("\n");
  }

  return undefined;
}

async function tryDeleteRow(table: string, id: string): Promise<string | null> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  if (error) {
    return `Insert passed but cleanup delete failed: ${error.message}`;
  }
  return null;
}

export const FORM_SUBMISSION_TEST_DEFINITIONS: FormSubmissionTestDefinition[] = [
  {
    id: "rfis",
    table: "rfis",
    label: "RFI Register (public.rfis)",
    buildPayloads: (ctx) => {
      const stamp = uniqueSuffix();
      const now = nowIso();
      return [
        {
          rfi_number: `RFI-TEST-${stamp}`,
          rfi_code: `RFI-TEST-${stamp}`,
          title: `${TEST_TAG} RFI Subject`,
          subject: `${TEST_TAG} RFI Subject`,
          description: `${TEST_TAG} automated RFI submission test payload.`,
          request_details: `${TEST_TAG} automated RFI submission test payload.`,
          project_id: ctx.projectId,
          project_name: ctx.projectName,
          zone_area: "Zone A",
          category: "General",
          discipline: "Civil",
          priority: "Medium",
          due_date: todayIso(),
          requested_by_id: ctx.workerId,
          requested_by_name: ctx.workerName,
          raised_by: "Test Admin",
          request_signature_url: "https://example.com/form-test-signature.png",
          status: "Open",
          date_raised: new Date().toISOString().split("T")[0],
          attachments: [],
          comments: `${TEST_TAG} comment`,
          created_at: now,
          updated_at: now,
        },
        {
          rfi_number: `RFI-TEST-${stamp}-LEG`,
          title: `${TEST_TAG} RFI Legacy`,
          description: `${TEST_TAG} legacy fallback payload`,
          project_id: ctx.projectId,
          project_name: ctx.projectName,
          requested_by_id: ctx.workerId,
          requested_by_name: ctx.workerName,
          raised_by: "Test Admin",
          status: "Outstanding",
          date_raised: new Date().toISOString().split("T")[0],
          attachments: [],
          created_at: now,
          updated_at: now,
        },
      ];
    },
  },
  {
    id: "worker_requests",
    table: "worker_requests",
    label: "Worker Requests (public.worker_requests)",
    buildPayloads: (ctx) => {
      const stamp = uniqueSuffix();
      return [
        {
          request_number: `REQ-TEST-${stamp}`,
          worker_id: ctx.workerId,
          worker_name: ctx.workerName,
          project_id: ctx.projectId,
          project_name: ctx.projectName,
          request_type: "Uniform",
          uniform_items: [],
          uniform_item: "Short Sleeve Polo Shirts",
          uniform_size: "L",
          quantity: 1,
          description: "1x Short Sleeve Polo Shirts (L)",
          status: "Pending",
          created_at: nowIso(),
          updated_at: nowIso(),
        },
        {
          request_number: `REQ-TEST-${stamp}-TOOLS`,
          worker_id: ctx.workerId,
          worker_name: ctx.workerName,
          project_id: ctx.projectId,
          project_name: ctx.projectName,
          request_type: "Tools",
          uniform_items: [],
          uniform_size: "L",
          description: `${TEST_TAG} gloves and duct tape`,
          status: "Pending",
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ];
    },
  },
  {
    id: "worker_timesheets",
    table: "worker_timesheets",
    label: "Worker Timesheets (public.worker_timesheets)",
    prepare: async (ctx) => {
      const { picklists, error } = await resolveTimesheetTestPicklists();
      if (!picklists) {
        throw new Error(error ?? "No active timesheet picklists available.");
      }
      ctx.timesheetProjectId = picklists.projectId;
      ctx.timesheetProjectName = picklists.projectName;
      ctx.timesheetTaskName = picklists.taskName;
    },
    buildPayloads: (ctx) => {
      const workDate = todayIso();
      const primary = buildTestTimesheetInsertPayload({
        workerId: ctx.workerId,
        projectId: ctx.timesheetProjectId ?? ctx.projectId,
        projectName: ctx.timesheetProjectName ?? ctx.projectName,
        taskName: ctx.timesheetTaskName ?? "Labourer",
        workDate,
        notes: TEST_TIMESHEET_NOTES,
      });

      const payloads = [primary];

      const legacy = buildTestTimesheetInsertPayload({
        workerId: ctx.workerId,
        projectId: ctx.timesheetProjectId ?? ctx.projectId,
        projectName: ctx.timesheetProjectName ?? ctx.projectName,
        taskName: ctx.timesheetTaskName ?? "Labourer",
        workDate,
        notes: TEST_TIMESHEET_NOTES,
        includeBreak: false,
      });

      if (!validateActBreakForTimesheetPayload(ctx.workerState, legacy)) {
        payloads.push(legacy);
      }

      return payloads;
    },
    verifyInsert: async (_ctx, insertedId) => {
      const { data, error } = await supabase
        .from("worker_timesheets")
        .select("*")
        .eq("id", insertedId)
        .maybeSingle();

      if (error || !data) {
        return {
          passed: false,
          message: error?.message ?? "Inserted timesheet could not be reloaded.",
        };
      }

      const record = data as Record<string, unknown>;
      const workHours = Number(record.work_hours ?? 0);
      const breakHours = Number(record.break_hours ?? 0);
      const dailyTotal = Number(record.daily_total_hours ?? record.total_hours ?? 0);
      const expectedDaily = Math.max(0, Math.round((workHours - breakHours) * 100) / 100);

      if (Math.abs(dailyTotal - expectedDaily) > 0.02) {
        return {
          passed: false,
          message: "Stored daily total does not match work minus break hours.",
          details: [
            `work_hours: ${workHours}`,
            `break_hours: ${breakHours}`,
            `daily_total_hours: ${dailyTotal}`,
            `expected: ${expectedDaily}`,
          ],
        };
      }

      return {
        passed: true,
        message: "Timesheet hour totals persisted correctly.",
        details: [
          `project_name: ${String(record.project_name ?? "")}`,
          `worker_trade: ${String(record.worker_trade ?? "")}`,
          `daily_total_hours: ${dailyTotal}`,
        ],
      };
    },
  },
  {
    id: "workers_profile",
    table: "workers",
    label: "Workers Profile (first_name / last_name)",
    buildPayloads: () => {
      const stamp = uniqueSuffix();
      const firstName = "Form";
      const lastName = `Test ${stamp}`;
      const nameFields = buildWorkerNameFields(firstName, lastName);
      return [
        {
          ...nameFields,
          email: `form-test-${stamp}@example.com`,
          status: "pending_induction",
          created_at: nowIso(),
          updated_at: nowIso(),
        },
      ];
    },
    verifyInsert: async (_ctx, insertedId) => {
      const { data, error } = await supabase
        .from("workers")
        .select("first_name, last_name, full_name")
        .eq("id", insertedId)
        .maybeSingle();

      if (error || !data) {
        return {
          passed: false,
          message: error?.message ?? "Inserted worker could not be reloaded.",
        };
      }

      const record = data as Record<string, unknown>;
      const firstName = String(record.first_name ?? "").trim();
      const lastName = String(record.last_name ?? "").trim();
      const displayName = getWorkerDisplayName({
        first_name: firstName,
        last_name: lastName,
        full_name: String(record.full_name ?? ""),
      });

      if (!firstName || !lastName) {
        return {
          passed: false,
          message: "Worker first_name and last_name were not persisted.",
          details: [`first_name: ${firstName || "—"}`, `last_name: ${lastName || "—"}`],
        };
      }

      const expectedFullName = buildWorkerFullName(firstName, lastName);
      if (displayName !== expectedFullName) {
        return {
          passed: false,
          message: "Worker display name does not match first_name + last_name.",
          details: [`expected: ${expectedFullName}`, `actual: ${displayName}`],
        };
      }

      return {
        passed: true,
        message: "Worker first_name and last_name persisted and compose full name.",
        details: [displayName],
      };
    },
  },
  {
    id: "form_worker_assignments",
    table: "form_worker_assignments",
    label: "Induction Assignments (public.form_worker_assignments)",
    requires: ["formTemplateId"],
    prepare: async (ctx) => {
      await supabase
        .from("form_worker_assignments")
        .delete()
        .eq("form_id", ctx.formTemplateId!)
        .eq("worker_id", ctx.workerId);
    },
    buildPayloads: (ctx) => [
      {
        form_id: ctx.formTemplateId,
        form_template_id: ctx.formTemplateId,
        form_title: TEST_FORM_TITLE,
        worker_id: ctx.workerId,
        worker_name: ctx.workerName,
        project_id: ctx.projectId,
        project_name: ctx.projectName,
        status: "pending",
        assigned_by: ctx.workerId,
        assigned_by_name: TEST_ADMIN_NAME,
        assigned_at: nowIso(),
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
  },
  {
    id: "worker_vocs",
    table: "worker_vocs",
    label: "Worker VOCs (public.worker_vocs)",
    buildPayloads: (ctx) => [
      {
        worker_id: ctx.workerId,
        title: TEST_VOC_TITLE,
        voc_title: TEST_VOC_TITLE,
        issuing_org: "SiteBolt Test Org",
        issue_date: todayIso(),
        expiry_date: todayIso(),
        document_url: "https://example.com/form-test-voc.pdf",
        created_at: nowIso(),
      },
    ],
  },
  {
    id: "worker_tickets",
    table: "worker_tickets",
    label: "Worker Tickets (public.worker_tickets)",
    buildPayloads: (ctx) => [
      {
        worker_id: ctx.workerId,
        ticket_name: `${TEST_TAG} White Card`,
        ticket_number: `TCK-${uniqueSuffix()}`,
        issue_date: todayIso(),
        expiry_date: todayIso(),
        document_url: "https://example.com/form-test-ticket.pdf",
        created_at: nowIso(),
      },
    ],
  },
  {
    id: "generated_reports",
    table: "generated_reports",
    label: "Generated Reports (public.generated_reports)",
    buildPayloads: (ctx) => {
      const reportDate = new Date().toISOString().split("T")[0];
      return [
        {
          actioned_by_id: ctx.workerId,
          actioned_by_name: ctx.workerName,
          report_title: TEST_REPORT_TITLE,
          start_date: reportDate,
          end_date: reportDate,
          date_to: reportDate,
          selected_modules: ["rfis", "workers"],
          project_ids: [],
          project_names: [],
          file_name: TEST_REPORT_FILE_NAME,
          csv_content: "module,status\nrfis,ok",
          created_at: nowIso(),
        },
      ];
    },
  },
  {
    id: "site_forms",
    table: "site_forms",
    label: "Site Safety Forms (public.site_forms)",
    buildPayloads: (ctx) => {
      const tag = TEST_TAG;
      return SITE_FORM_TYPES.map((formType) =>
        buildSiteFormTestPayload(
          ctx,
          formType,
          {
            test: true,
            tag,
            ...SITE_FORM_TEST_CHECKLIST[formType],
          },
          tag
        )
      );
    },
  },
  {
    id: "leave_requests",
    table: "leave_requests",
    label: "Leave Requests (public.leave_requests)",
    buildPayloads: (ctx) => [
      {
        worker_id: ctx.workerId,
        project_id: ctx.projectId,
        first_date: todayIso(),
        last_date: todayIso(),
        number_of_days: 1,
        total_days: 1,
        reason: `${TEST_TAG} leave request test`,
        signature_url: "https://example.com/form-test-signature.png",
        status: "Pending",
        leave_type: "Annual Leave",
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
  },
  {
    id: "plant_prestarts",
    table: "plant_prestarts",
    label: "Plant Pre-Starts (public.plant_prestarts)",
    requires: ["plantId"],
    buildPayloads: (ctx) => [
      {
        plant_id: ctx.plantId,
        operator_name: ctx.workerName,
        operator_worker_id: ctx.workerId,
        project_id: ctx.projectId,
        current_reading: 100,
        next_service_due: 250,
        check_data: { test: true, tag: TEST_TAG },
        has_defect: false,
        defect_comments: null,
        signature_url: "https://example.com/form-test-signature.png",
        submitted_at: new Date().toISOString(),
        created_at: nowIso(),
      },
    ],
  },
  {
    id: "induction_form_templates",
    table: "induction_form_templates",
    label: "Induction Form Templates (public.induction_form_templates)",
    buildPayloads: () => [
      {
        title: `${TEST_TAG} Induction Template ${uniqueSuffix()}`,
        description: `${TEST_TAG} automated template test`,
        form_type: "Induction",
        scope: "company",
        status: "draft",
        blocks: [{ id: "block-1", type: "text", label: "Test question" }],
        created_at: nowIso(),
        updated_at: nowIso(),
      },
    ],
    cleanup: async (_ctx, insertedId) => {
      await supabase.from("induction_form_templates").delete().eq("id", insertedId);
      return null;
    },
  },
];

export const FORM_SUBMISSION_VERIFY_DEFINITIONS: FormSubmissionVerifyDefinition[] = [
  {
    id: "timesheet_projects_read",
    table: "timesheet_projects",
    label: "Timesheet Projects Picklist (public.timesheet_projects)",
    run: async () => {
      const result = await fetchTimesheetFormOptions();
      if (result.projects.length === 0) {
        return {
          passed: false,
          message:
            result.error ??
            "No active timesheet_projects rows returned. Check data and RLS SELECT policies.",
        };
      }

      const sample = result.projects[0]!;
      if (!sample.client?.trim() || !sample.project?.trim()) {
        return {
          passed: false,
          message: "Active timesheet project is missing client or project values.",
          details: [`id: ${sample.id}`],
        };
      }

      return {
        passed: true,
        message: `Readable active projects: ${result.projects.length}.`,
        details: [`sample: ${sample.client} — ${sample.project}`],
      };
    },
  },
  {
    id: "timesheet_tasks_read",
    table: "timesheet_tasks",
    label: "Timesheet Tasks Picklist (public.timesheet_tasks)",
    run: async () => {
      const result = await fetchTimesheetFormOptions();
      if (result.tasks.length === 0) {
        return {
          passed: false,
          message:
            result.error ??
            "No active timesheet_tasks rows returned. Check data and RLS SELECT policies.",
        };
      }

      const sample = result.tasks[0]!;
      if (!sample.name?.trim()) {
        return {
          passed: false,
          message: "Active timesheet task is missing a name.",
          details: [`id: ${sample.id}`],
        };
      }

      return {
        passed: true,
        message: `Readable active tasks: ${result.tasks.length}.`,
        details: [`sample: ${sample.name}`],
      };
    },
  },
];

export async function resolveFormTestContext(): Promise<
  { context: FormTestContext } | { error: string }
> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured. Form tests require a live database connection." };
  }

  const { data: workerCandidates, error: workerError } = await supabase
    .from("workers")
    .select("id, first_name, last_name, full_name")
    .limit(20);

  if (workerError || !workerCandidates?.length) {
    return {
      error: workerError?.message ?? "No workers found. Add at least one worker before testing.",
    };
  }

  const preferredWorker =
    workerCandidates.find((row) => {
      const firstName = String(row.first_name ?? "").trim();
      const lastName = String(row.last_name ?? "").trim();
      return Boolean(firstName && lastName);
    }) ?? workerCandidates[0]!;

  const workerId = String(preferredWorker.id);
  const profileRecord = preferredWorker as Record<string, unknown>;

  const workerFirstName = String(profileRecord?.first_name ?? "").trim();
  const workerLastName = String(profileRecord?.last_name ?? "").trim();
  const profileMap = await fetchWorkerProfileNameMap([workerId]);
  const workerName = getWorkerDisplayName(
    {
      first_name: workerFirstName || null,
      last_name: workerLastName || null,
      full_name: profileRecord?.full_name ? String(profileRecord.full_name) : null,
    },
    profileMap.get(workerId) ?? "Form Test Worker"
  );

  let projectId = "project-1";
  let projectName = "Form Test Project";

  const { data: projects } = await supabase.from("projects").select("*").limit(1);
  if (projects?.[0]) {
    const project = projects[0] as Record<string, unknown>;
    projectId = String(project.id ?? project.slug ?? projectId);
    projectName = String(
      project.project_name ?? project.name ?? project.title ?? projectName
    );
  }

  let plantId: string | null = await resolveFormTestPlantId();

  let formTemplateId: string | null = null;
  const { data: templates } = await supabase
    .from("induction_form_templates")
    .select("id")
    .limit(1);
  if (templates?.[0]?.id) {
    formTemplateId = String(templates[0].id);
  }

  return {
    context: {
      workerId,
      workerName,
      workerFirstName: workerFirstName || undefined,
      workerLastName: workerLastName || undefined,
      projectId,
      projectName,
      plantId,
      formTemplateId,
      createdTemplateId: null,
    },
  };
}

async function runSingleTest(
  definition: FormSubmissionTestDefinition,
  ctx: FormTestContext,
  onUpdate: (result: FormSubmissionTestResult) => void
): Promise<FormSubmissionTestResult> {
  const base: FormSubmissionTestResult = {
    id: definition.id,
    table: definition.table,
    label: definition.label,
    status: "running",
  };
  onUpdate(base);

  if (definition.requires?.some((key) => !ctx[key])) {
    const missing = definition.requires.filter((key) => !ctx[key]).join(", ");
    const result: FormSubmissionTestResult = {
      ...base,
      status: "skipped",
      errorMessage: `Missing test dependency: ${missing}`,
      fixSql: `-- Provide at least one row for ${missing} before running this test.`,
      durationMs: 0,
    };
    onUpdate(result);
    return result;
  }

  const started = performance.now();
  const payloads = definition.buildPayloads(ctx);
  let lastError: SupabaseRequestError | null = null;

  try {
    if (definition.prepare) {
      await definition.prepare(ctx);
    }
  } catch (cause) {
    const result: FormSubmissionTestResult = {
      ...base,
      status: "failed",
      errorCode: "PREPARE",
      errorMessage:
        cause instanceof Error ? cause.message : "Test preparation step failed.",
      durationMs: Math.round(performance.now() - started),
    };
    onUpdate(result);
    return result;
  }

  for (const payload of payloads) {
    let lastAttemptError: SupabaseRequestError | null = null;
    let insertedId: string | null = null;

    const result = await insertWithFormMetadataFallback(
      supabase,
      definition.table,
      payload,
      "id"
    );

    if (result.data?.id) {
      insertedId = String(result.data.id);
    } else {
      lastAttemptError = toSupabaseRequestError({ message: result.error ?? "Insert failed." });
    }

    if (!lastAttemptError && insertedId) {
      let cleanupWarning: string | null = null;

      if (definition.verifyInsert) {
        const verification = await definition.verifyInsert(ctx, insertedId);
        if (!verification.passed) {
          if (definition.cleanup) {
            cleanupWarning = await definition.cleanup(ctx, insertedId);
          } else {
            cleanupWarning = await tryDeleteRow(definition.table, insertedId);
          }

          const result: FormSubmissionTestResult = {
            ...base,
            status: "failed",
            insertedId,
            errorCode: "VERIFY",
            errorMessage: verification.message ?? "Post-insert verification failed.",
            cleanupWarning: cleanupWarning ?? undefined,
            durationMs: Math.round(performance.now() - started),
          };
          onUpdate(result);
          return result;
        }
      }

      if (definition.cleanup) {
        cleanupWarning = await definition.cleanup(ctx, insertedId);
      } else {
        cleanupWarning = await tryDeleteRow(definition.table, insertedId);
      }

      const result: FormSubmissionTestResult = {
        ...base,
        status: "passed",
        insertedId,
        cleanupWarning: cleanupWarning ?? undefined,
        durationMs: Math.round(performance.now() - started),
      };
      onUpdate(result);
      return result;
    }

    lastError = lastAttemptError;
  }

  const result: FormSubmissionTestResult = {
    ...base,
    status: "failed",
    errorCode: lastError?.code ?? "UNKNOWN",
    errorMessage: lastError?.message ?? "Insert failed with unknown error.",
    fixSql: generateFixSqlFromError(definition.table, lastError),
    durationMs: Math.round(performance.now() - started),
  };
  onUpdate(result);
  return result;
}

export async function runAllFormSubmissionTests(options?: {
  onProgress?: (results: FormSubmissionTestResult[]) => void;
}): Promise<{
  context: FormTestContext | null;
  results: FormSubmissionTestResult[];
  error: string | null;
}> {
  const resolved = await resolveFormTestContext();
  if ("error" in resolved) {
    return { context: null, results: [], error: resolved.error };
  }

  const ctx = await enrichFormTestContext(resolved.context);
  const results: FormSubmissionTestResult[] = [
    ...FORM_SUBMISSION_TEST_DEFINITIONS.map((definition) => ({
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: "pending" as const,
    })),
    ...FORM_SUBMISSION_VERIFY_DEFINITIONS.map((definition) => ({
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: "pending" as const,
    })),
  ];

  const publish = () => options?.onProgress?.([...results]);

  publish();

  for (let index = 0; index < FORM_SUBMISSION_TEST_DEFINITIONS.length; index += 1) {
    const definition = FORM_SUBMISSION_TEST_DEFINITIONS[index]!;
    const result = await runSingleTest(definition, ctx, (updated) => {
      results[index] = updated;
      publish();
    });
    results[index] = result;
    publish();
  }

  for (
    let offset = 0;
    offset < FORM_SUBMISSION_VERIFY_DEFINITIONS.length;
    offset += 1
  ) {
    const definition = FORM_SUBMISSION_VERIFY_DEFINITIONS[offset]!;
    const index = FORM_SUBMISSION_TEST_DEFINITIONS.length + offset;
    const started = performance.now();
    results[index] = {
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: "running",
    };
    publish();

    const verification = await definition.run(ctx);
    results[index] = {
      id: definition.id,
      table: definition.table,
      label: definition.label,
      status: verification.passed ? "passed" : "failed",
      errorMessage: verification.passed ? undefined : verification.message,
      durationMs: Math.round(performance.now() - started),
    };
    publish();
  }

  return { context: ctx, results, error: null };
}

export function summarizeFormTestResults(results: FormSubmissionTestResult[]): {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
} {
  return {
    passed: results.filter((row) => row.status === "passed").length,
    failed: results.filter((row) => row.status === "failed").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    total: results.length,
  };
}
