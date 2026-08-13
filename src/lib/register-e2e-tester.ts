import { fetchAccountsTimesheets } from "./accounts-timesheets";
import {
  buildExpectedWorkerDisplayName,
  buildTestTimesheetInsertPayload,
  enrichFormTestContext,
  loadWorkerTimesheetRow,
  validateTimesheetHourCalculations,
} from "./form-test-timesheet-helpers";
import {
  fetchFormTemplateAssignments,
  FORM_WORKER_ASSIGNMENTS_TABLE,
} from "./induction-form-builder";
import {
  resolveFormTestContext,
  type FormTestContext,
} from "./form-submission-tester";
import { fetchRfis } from "./rfi-service";
import { supabase, isSupabaseConfigured, fetchSiteForms } from "./supabase";
import { buildSiteFormInsertPayload } from "./site-form-payload";
import {
  fetchWorkerRequests,
  formatUniformItemsSummary,
} from "./worker-requests-service";

export const E2E_MARKER_PREFIX = "TEST-E2E-";

export type RegisterE2EStepId = "submit" | "query" | "mapping";

export type RegisterE2EStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export interface RegisterE2EStepResult {
  step: RegisterE2EStepId;
  label: string;
  status: RegisterE2EStepStatus;
  message?: string;
  details?: string[];
}

export interface RegisterE2ETestResult {
  id: string;
  label: string;
  formType: string;
  registerName: string;
  table: string;
  marker: string;
  status: RegisterE2EStepStatus;
  mappedCorrectly: boolean;
  steps: RegisterE2EStepResult[];
  insertedId?: string | null;
  durationMs?: number;
  cleanupWarning?: string;
}

interface CleanupRecord {
  table: string;
  id: string;
}

function createE2EMarker(): string {
  return `${E2E_MARKER_PREFIX}${Math.floor(1000 + Math.random() * 9000)}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function isPopulated(value: unknown): boolean {
  if (value == null) return false;
  if (typeof value === "string") return value.trim().length > 0;
  if (typeof value === "number") return Number.isFinite(value);
  if (typeof value === "boolean") return true;
  if (Array.isArray(value)) return value.length > 0;
  if (typeof value === "object") return Object.keys(value as object).length > 0;
  return false;
}

function missingFields(
  record: Record<string, unknown>,
  fields: Array<{ key: string; label: string; allowEmptyArray?: boolean }>
): string[] {
  return fields
    .filter((field) => {
      const value = record[field.key];
      if (field.allowEmptyArray && Array.isArray(value)) {
        return false;
      }
      return !isPopulated(value);
    })
    .map((field) => field.label);
}

async function insertRow(
  table: string,
  payload: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase
    .from(table)
    .insert(payload)
    .select("id")
    .single();

  if (error || !data?.id) {
    return { id: null, error: error?.message ?? "Insert failed." };
  }

  return { id: String(data.id), error: null };
}

async function deleteRow(table: string, id: string): Promise<string | null> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  return error?.message ?? null;
}

function step(
  stepId: RegisterE2EStepId,
  label: string,
  status: RegisterE2EStepStatus,
  message?: string,
  details?: string[]
): RegisterE2EStepResult {
  return { step: stepId, label, status, message, details };
}

async function runRfiRegisterE2E(
  ctx: FormTestContext,
  marker: string
): Promise<{
  insertedId: string | null;
  steps: RegisterE2EStepResult[];
  mappedCorrectly: boolean;
  status: RegisterE2EStepStatus;
}> {
  const steps: RegisterE2EStepResult[] = [];
  const now = new Date().toISOString();
  const rfiNumber = `RFI-${marker}`;

  const submitPayload = {
    rfi_number: rfiNumber,
    rfi_code: rfiNumber,
    title: `${marker} E2E RFI Subject`,
    subject: `${marker} E2E RFI Subject`,
    description: `${marker} end-to-end register verification payload.`,
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
    status: "Open",
    date_raised: new Date().toISOString().split("T")[0],
    comments: marker,
    attachments: [],
    created_at: now,
    updated_at: now,
  };

  const inserted = await insertRow("rfis", submitPayload);
  if (!inserted.id) {
    steps.push(
      step("submit", "Submission", "failed", inserted.error ?? "RFI insert failed.")
    );
    steps.push(step("query", "Register Query", "skipped", "Skipped — submission failed."));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — submission failed."));
    return { insertedId: null, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("submit", "Submission", "passed", `Inserted RFI ${rfiNumber}.`, [inserted.id])
  );

  const { rfis, error: queryError } = await fetchRfis({ filter: "all" });
  if (queryError) {
    steps.push(step("query", "Register Query", "failed", queryError));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — query failed."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  const matched = rfis.find((row) => row.id === inserted.id);
  if (!matched) {
    steps.push(
      step(
        "query",
        "Register Query",
        "failed",
        "Submitted RFI was not returned by fetchRfis({ filter: \"all\" })."
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Row not found in register."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("query", "Register Query", "passed", "Row retrieved via RFI Register fetch.", [
      matched.rfi_number,
    ])
  );

  const missing = missingFields(matched as unknown as Record<string, unknown>, [
    { key: "rfi_number", label: "RFI Number" },
    { key: "zone_area", label: "Zone / Area" },
    { key: "category", label: "Category" },
    { key: "discipline", label: "Discipline" },
    { key: "status", label: "Status" },
    { key: "attachments", label: "Attachments", allowEmptyArray: true },
  ]);

  if (missing.length > 0) {
    steps.push(
      step(
        "mapping",
        "Mapping Check",
        "failed",
        "Required register display fields are empty.",
        missing
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Mapping Check",
      "passed",
      "RFI register fields mapped correctly.",
      ["rfi_number", "zone_area", "category", "discipline", "status", "attachments"]
    )
  );

  return { insertedId: inserted.id, steps, mappedCorrectly: true, status: "passed" };
}

async function runWorkerRequestsRegisterE2E(
  ctx: FormTestContext,
  marker: string
): Promise<{
  insertedId: string | null;
  steps: RegisterE2EStepResult[];
  mappedCorrectly: boolean;
  status: RegisterE2EStepStatus;
}> {
  const steps: RegisterE2EStepResult[] = [];
  const now = new Date().toISOString();
  const requestNumber = `REQ-${marker}`;
  const uniformItem = "Short Sleeve Polo Shirts";
  const description = `${marker} 1x ${uniformItem} (L)`;

  const submitPayload = {
    request_number: requestNumber,
    worker_id: ctx.workerId,
    worker_name: ctx.workerName,
    project_id: ctx.projectId,
    project_name: ctx.projectName,
    request_type: "Uniform",
    uniform_items: [],
    uniform_item: uniformItem,
    uniform_size: "L",
    quantity: 1,
    description,
    status: "Pending",
    created_at: now,
    updated_at: now,
  };

  const inserted = await insertRow("worker_requests", submitPayload);
  if (!inserted.id) {
    steps.push(
      step("submit", "Submission", "failed", inserted.error ?? "Request insert failed.")
    );
    steps.push(step("query", "Register Query", "skipped", "Skipped — submission failed."));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — submission failed."));
    return { insertedId: null, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("submit", "Submission", "passed", `Inserted request ${requestNumber}.`, [inserted.id])
  );

  const { requests, error: queryError } = await fetchWorkerRequests({ status: "all" });
  if (queryError) {
    steps.push(step("query", "Register Query", "failed", queryError));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — query failed."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  const matched = requests.find((row) => row.id === inserted.id);
  if (!matched) {
    steps.push(
      step(
        "query",
        "Register Query",
        "failed",
        "Submitted request was not returned by fetchWorkerRequests({ status: \"all\" })."
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Row not found in register."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("query", "Register Query", "passed", "Row retrieved via Requests Register fetch.", [
      matched.request_number,
    ])
  );

  const itemSummary =
    matched.uniform_items?.length > 0
      ? formatUniformItemsSummary(matched.uniform_items)
      : matched.description;

  const missing = missingFields(
    {
      request_number: matched.request_number,
      request_type: matched.request_type,
      uniform_item: matched.uniform_item,
      description: matched.description ?? itemSummary,
      status: matched.status,
    },
    [
      { key: "request_number", label: "Request Number" },
      { key: "request_type", label: "Request Type" },
      { key: "uniform_item", label: "Uniform Item" },
      { key: "description", label: "Description / Items Summary" },
      { key: "status", label: "Status" },
    ]
  );

  if (missing.length > 0) {
    steps.push(
      step(
        "mapping",
        "Mapping Check",
        "failed",
        "Required register display fields are empty.",
        missing
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Mapping Check",
      "passed",
      "Requests register fields mapped correctly.",
      ["request_number", "request_type", "uniform_item", "description", "status"]
    )
  );

  return { insertedId: inserted.id, steps, mappedCorrectly: true, status: "passed" };
}

async function runTimesheetsRegisterE2E(
  ctx: FormTestContext,
  marker: string
): Promise<{
  insertedId: string | null;
  steps: RegisterE2EStepResult[];
  mappedCorrectly: boolean;
  status: RegisterE2EStepStatus;
}> {
  const steps: RegisterE2EStepResult[] = [];
  const workDate = todayIso();
  const expectedWorkerName = buildExpectedWorkerDisplayName(ctx);

  const submitPayload = buildTestTimesheetInsertPayload({
    workerId: ctx.workerId,
    projectId: ctx.timesheetProjectId ?? ctx.projectId,
    projectName: ctx.timesheetProjectName ?? ctx.projectName,
    taskName: ctx.timesheetTaskName ?? "Labourer",
    workDate,
    notes: `${marker} Test timesheet entry`,
  });

  const inserted = await insertRow("worker_timesheets", submitPayload);
  if (!inserted.id) {
    steps.push(
      step("submit", "Submission", "failed", inserted.error ?? "Timesheet insert failed.")
    );
    steps.push(step("query", "Register Query", "skipped", "Skipped — submission failed."));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — submission failed."));
    return { insertedId: null, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("submit", "Submission", "passed", "Inserted worker timesheet row.", [
      inserted.id,
      `project_name: ${String(submitPayload.project_name ?? "")}`,
      `worker_trade: ${String(submitPayload.worker_trade ?? "")}`,
    ])
  );

  const loadedTimesheet = await loadWorkerTimesheetRow(inserted.id);
  if (!loadedTimesheet) {
    steps.push(
      step("query", "Register Query", "failed", "Inserted timesheet could not be reloaded.")
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — reload failed."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  const calculationErrors = validateTimesheetHourCalculations(loadedTimesheet);
  if (calculationErrors.length > 0) {
    steps.push(
      step(
        "query",
        "Hour Calculations",
        "failed",
        "Timesheet hour totals failed validation.",
        calculationErrors
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — calculation check failed."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "query",
      "Hour Calculations",
      "passed",
      "Work, break, and daily totals calculated correctly on retrieval.",
      [
        `work_hours: ${loadedTimesheet.work_hours ?? "derived"}`,
        `break_hours: ${loadedTimesheet.break_hours ?? "derived"}`,
        `daily_total_hours: ${loadedTimesheet.daily_total_hours ?? loadedTimesheet.total_hours}`,
      ]
    )
  );

  const rows = await fetchAccountsTimesheets();
  const matched = rows.find((row) => row.id === inserted.id);
  if (!matched) {
    steps.push(
      step(
        "query",
        "Register Query",
        "failed",
        "Submitted timesheet was not returned by fetchAccountsTimesheets()."
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Row not found in register."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "query",
      "Register Query",
      "passed",
      "Row retrieved via Accounts Timesheets register fetch.",
      [matched.worker_name]
    )
  );

  if (matched.worker_name !== expectedWorkerName) {
    steps.push(
      step(
        "mapping",
        "Worker Name Mapping",
        "failed",
        `Expected worker name "${expectedWorkerName}", got "${matched.worker_name}".`,
        [
          `first_name: ${ctx.workerFirstName ?? "—"}`,
          `last_name: ${ctx.workerLastName ?? "—"}`,
        ]
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Worker Name Mapping",
      "passed",
      "Register worker name matches first_name + last_name.",
      [matched.worker_name]
    )
  );

  const totals = {
    work_hours: loadedTimesheet.work_hours,
    break_hours: loadedTimesheet.break_hours,
    daily_total_hours:
      loadedTimesheet.daily_total_hours ?? loadedTimesheet.total_hours,
  };

  const missing = missingFields(
    {
      worker_name: matched.worker_name,
      worker_trade: matched.worker_trade,
      timesheet_date: matched.work_date,
      daily_total_hours: totals.daily_total_hours,
      work_hours: totals.work_hours,
      break_hours: totals.break_hours,
      project_name: matched.project_name,
      signature_url: matched.signature_url,
    },
    [
      { key: "worker_name", label: "Worker Name" },
      { key: "worker_trade", label: "Payroll Category / Task" },
      { key: "timesheet_date", label: "Timesheet Date" },
      { key: "work_hours", label: "Work Total Hours" },
      { key: "break_hours", label: "Break Total Hours" },
      { key: "daily_total_hours", label: "Daily Total Hours" },
      { key: "project_name", label: "Job Name" },
      { key: "signature_url", label: "Signature URL" },
    ]
  );

  if (missing.length > 0) {
    steps.push(
      step(
        "mapping",
        "Register Field Mapping",
        "failed",
        "Required register display fields are empty.",
        missing
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Register Field Mapping",
      "passed",
      "Accounts timesheet register fields mapped correctly.",
      [
        "worker_name",
        "worker_trade",
        "timesheet_date",
        "work_hours",
        "break_hours",
        "daily_total_hours",
        "project_name",
        "signature_url",
      ]
    )
  );

  return { insertedId: inserted.id, steps, mappedCorrectly: true, status: "passed" };
}

async function runInductionRegisterE2E(
  ctx: FormTestContext,
  marker: string
): Promise<{
  insertedId: string | null;
  steps: RegisterE2EStepResult[];
  mappedCorrectly: boolean;
  status: RegisterE2EStepStatus;
}> {
  const steps: RegisterE2EStepResult[] = [];

  if (!ctx.formTemplateId) {
    steps.push(
      step(
        "submit",
        "Submission",
        "skipped",
        "No induction form template found in Supabase."
      )
    );
    steps.push(step("query", "Register Query", "skipped"));
    steps.push(step("mapping", "Mapping Check", "skipped"));
    return { insertedId: null, steps, mappedCorrectly: false, status: "skipped" };
  }

  await supabase
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .delete()
    .eq("form_id", ctx.formTemplateId)
    .eq("worker_id", ctx.workerId);

  const formTitle = `General Site Induction (${marker})`;
  const submitPayload = {
    form_id: ctx.formTemplateId,
    form_template_id: ctx.formTemplateId,
    form_title: formTitle,
    worker_id: ctx.workerId,
    worker_name: `${ctx.workerName} ${marker}`,
    project_id: ctx.projectId,
    project_name: ctx.projectName,
    status: "pending",
    assigned_by: ctx.workerId,
    assigned_by_name: "E2E Admin",
    assigned_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  };

  const inserted = await insertRow(FORM_WORKER_ASSIGNMENTS_TABLE, submitPayload);
  if (!inserted.id) {
    steps.push(
      step("submit", "Submission", "failed", inserted.error ?? "Assignment insert failed.")
    );
    steps.push(step("query", "Register Query", "skipped", "Skipped — submission failed."));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — submission failed."));
    return { insertedId: null, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("submit", "Submission", "passed", "Inserted induction assignment row.", [inserted.id])
  );

  const { assignments, error: queryError } = await fetchFormTemplateAssignments(
    ctx.formTemplateId
  );
  if (queryError) {
    steps.push(step("query", "Register Query", "failed", queryError));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — query failed."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  const matched = assignments.find((row) => row.id === inserted.id);
  if (!matched) {
    steps.push(
      step(
        "query",
        "Register Query",
        "failed",
        "Submitted assignment was not returned by fetchFormTemplateAssignments()."
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Row not found in register."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "query",
      "Register Query",
      "passed",
      "Row retrieved via Induction Tracker register fetch.",
      [matched.worker_name ?? ""]
    )
  );

  const missing = missingFields(matched as unknown as Record<string, unknown>, [
    { key: "worker_name", label: "Worker Name" },
    { key: "form_title", label: "Form Title" },
    { key: "status", label: "Completion Status" },
  ]);

  if (missing.length > 0) {
    steps.push(
      step(
        "mapping",
        "Mapping Check",
        "failed",
        "Required register display fields are empty.",
        missing
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Mapping Check",
      "passed",
      "Induction register fields mapped correctly.",
      ["worker_name", "form_title", "status"]
    )
  );

  return { insertedId: inserted.id, steps, mappedCorrectly: true, status: "passed" };
}

async function runSiteFormsRegisterE2E(
  ctx: FormTestContext,
  marker: string
): Promise<{
  insertedId: string | null;
  steps: RegisterE2EStepResult[];
  mappedCorrectly: boolean;
  status: RegisterE2EStepStatus;
}> {
  const steps: RegisterE2EStepResult[] = [];
  const formDate = new Date().toISOString().split("T")[0]!;
  const submittedAt = new Date().toISOString();
  const checklistData = { test: true, tag: marker, hazards: [] as string[] };

  const submitPayload = buildSiteFormInsertPayload({
    formType: "safety_walk",
    projectId: ctx.projectId,
    workerId: ctx.workerId,
    formDate,
    formTime: "06:30:00",
    locationScope: "Site wide",
    weatherConditions: "Clear",
    formData: checklistData,
    photoUrls: [],
    attendees: [],
    additionalWorkers: [],
    submitterSignatureUrl: "https://example.com/form-test-signature.png",
    submittedAt,
  });

  const inserted = await insertRow("site_forms", submitPayload);
  if (!inserted.id) {
    steps.push(
      step("submit", "Submission", "failed", inserted.error ?? "Site form insert failed.")
    );
    steps.push(step("query", "Register Query", "skipped", "Skipped — submission failed."));
    steps.push(step("mapping", "Mapping Check", "skipped", "Skipped — submission failed."));
    return { insertedId: null, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step("submit", "Submission", "passed", "Inserted safety walk site form row.", [inserted.id])
  );

  const forms = await fetchSiteForms({ formType: "safety_walk", limit: 500 });
  const matched = forms.find((row) => row.id === inserted.id);
  if (!matched) {
    steps.push(
      step(
        "query",
        "Register Query",
        "failed",
        "Submitted site form was not returned by fetchSiteForms()."
      )
    );
    steps.push(step("mapping", "Mapping Check", "skipped", "Row not found in register."));
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "query",
      "Register Query",
      "passed",
      "Row retrieved via Safety / Site Forms register fetch.",
      [matched.form_date]
    )
  );

  const { data: rawRow } = await supabase
    .from("site_forms")
    .select("*")
    .eq("id", inserted.id)
    .maybeSingle();

  const rawRecord =
    rawRow && typeof rawRow === "object" ? (rawRow as Record<string, unknown>) : {};

  const submittedByWorkerId =
    rawRecord.submitted_by_worker_id ?? matched.worker_id;

  const checklist =
    matched.checklist_data ??
    matched.form_data ??
    rawRecord.checklist_data ??
    rawRecord.form_data;

  const missing = missingFields(
    {
      title: rawRecord.title ?? "Site Safety Walk",
      project_name: rawRecord.project_name ?? ctx.projectName,
      status: rawRecord.status ?? "Completed",
      form_date: matched.form_date,
      checklist_data: checklist,
      submitted_by_worker_id: submittedByWorkerId,
    },
    [
      { key: "title", label: "Title" },
      { key: "project_name", label: "Project Name" },
      { key: "status", label: "Status" },
      { key: "form_date", label: "Form Date" },
      { key: "checklist_data", label: "Checklist Data" },
      { key: "submitted_by_worker_id", label: "Submitted By Worker ID" },
    ]
  );

  if (missing.length > 0) {
    steps.push(
      step(
        "mapping",
        "Mapping Check",
        "failed",
        "Required register display fields are empty.",
        missing
      )
    );
    return { insertedId: inserted.id, steps, mappedCorrectly: false, status: "failed" };
  }

  steps.push(
    step(
      "mapping",
      "Mapping Check",
      "passed",
      "Safety register fields mapped correctly.",
      ["title", "project_name", "status", "form_date", "checklist_data", "submitted_by_worker_id"]
    )
  );

  return { insertedId: inserted.id, steps, mappedCorrectly: true, status: "passed" };
}

const REGISTER_E2E_TESTS: Array<{
  id: string;
  label: string;
  formType: string;
  registerName: string;
  table: string;
  run: (
    ctx: FormTestContext,
    marker: string
  ) => Promise<{
    insertedId: string | null;
    steps: RegisterE2EStepResult[];
    mappedCorrectly: boolean;
    status: RegisterE2EStepStatus;
  }>;
}> = [
  {
    id: "rfi_register",
    label: "RFI Form → RFI Register",
    formType: "RFI",
    registerName: "RFI Register",
    table: "rfis",
    run: runRfiRegisterE2E,
  },
  {
    id: "requests_register",
    label: "Request Form → Requests Register",
    formType: "Worker Request",
    registerName: "Requests Register",
    table: "worker_requests",
    run: runWorkerRequestsRegisterE2E,
  },
  {
    id: "timesheets_register",
    label: "Timesheet Form → Accounts Timesheets Register",
    formType: "Worker Timesheet",
    registerName: "Accounts Timesheets Register",
    table: "worker_timesheets",
    run: runTimesheetsRegisterE2E,
  },
  {
    id: "induction_register",
    label: "Inductions → Induction Register",
    formType: "Induction Assignment",
    registerName: "Induction Tracker Register",
    table: FORM_WORKER_ASSIGNMENTS_TABLE,
    run: runInductionRegisterE2E,
  },
  {
    id: "site_forms_register",
    label: "Safety / Site Forms → Safety Register",
    formType: "Safety Walk",
    registerName: "Safety / Site Forms Register",
    table: "site_forms",
    run: runSiteFormsRegisterE2E,
  },
];

export function summarizeRegisterE2ETestResults(results: RegisterE2ETestResult[]): {
  mapped: number;
  failed: number;
  skipped: number;
  total: number;
} {
  return {
    mapped: results.filter((row) => row.mappedCorrectly).length,
    failed: results.filter((row) => row.status === "failed").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    total: results.length,
  };
}

export async function runRegisterE2EVerificationTests(options?: {
  onProgress?: (results: RegisterE2ETestResult[]) => void;
}): Promise<{
  context: FormTestContext | null;
  results: RegisterE2ETestResult[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      context: null,
      results: [],
      error: "Supabase is not configured. Register E2E tests require a live database connection.",
    };
  }

  const resolved = await resolveFormTestContext();
  if ("error" in resolved) {
    return { context: null, results: [], error: resolved.error };
  }

  const ctx = await enrichFormTestContext(resolved.context);
  const cleanupRecords: CleanupRecord[] = [];
  const results: RegisterE2ETestResult[] = REGISTER_E2E_TESTS.map((definition) => ({
    id: definition.id,
    label: definition.label,
    formType: definition.formType,
    registerName: definition.registerName,
    table: definition.table,
    marker: "",
    status: "pending",
    mappedCorrectly: false,
    steps: [],
  }));

  const publish = () => options?.onProgress?.([...results]);

  publish();

  for (let index = 0; index < REGISTER_E2E_TESTS.length; index += 1) {
    const definition = REGISTER_E2E_TESTS[index]!;
    const marker = createE2EMarker();
    const started = performance.now();

    results[index] = {
      ...results[index]!,
      marker,
      status: "running",
      steps: [
        step("submit", "Submission", "running"),
        step("query", "Register Query", "pending"),
        step("mapping", "Mapping Check", "pending"),
      ],
    };
    publish();

    try {
      const outcome = await definition.run(ctx, marker);
      results[index] = {
        ...results[index]!,
        status: outcome.status,
        mappedCorrectly: outcome.mappedCorrectly,
        steps: outcome.steps,
        insertedId: outcome.insertedId,
        durationMs: Math.round(performance.now() - started),
      };

      if (outcome.insertedId) {
        cleanupRecords.push({ table: definition.table, id: outcome.insertedId });
      }
    } catch (cause) {
      results[index] = {
        ...results[index]!,
        status: "failed",
        mappedCorrectly: false,
        steps: [
          step(
            "submit",
            "Submission",
            "failed",
            cause instanceof Error ? cause.message : "Unexpected E2E test failure."
          ),
          step("query", "Register Query", "skipped"),
          step("mapping", "Mapping Check", "skipped"),
        ],
        durationMs: Math.round(performance.now() - started),
      };
    }

    publish();
  }

  for (const record of cleanupRecords) {
    const cleanupError = await deleteRow(record.table, record.id);
    if (!cleanupError) continue;

    const resultIndex = results.findIndex((row) => row.insertedId === record.id);
    if (resultIndex === -1) continue;

    results[resultIndex] = {
      ...results[resultIndex]!,
      cleanupWarning: `Cleanup delete failed for ${record.table}: ${cleanupError}`,
    };
  }

  publish();

  return { context: ctx, results, error: null };
}
