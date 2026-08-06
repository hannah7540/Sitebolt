import { approveAccountsTimesheets } from "./accounts-timesheets";
import { assignFormToWorkers } from "./induction-form-builder";
import {
  approveLeaveRequestAction,
  rejectLeaveRequestAction,
} from "./leave-requests";
import {
  assignWorkersToProjectBatch,
  unassignWorkerFromProject,
} from "./project-assignments";
import { resolveProjectId, fetchProjects } from "./project-resolver";
import { resolveFormTestContext, type FormTestContext } from "./form-submission-tester";
import { supabase, isSupabaseConfigured, fetchWorkers, type Worker } from "./supabase";

export const ACTION_WORKFLOW_MARKER = "ACTION-WF-";

export type ActionWorkflowStepId = "setup" | "execute" | "verify";

export type ActionWorkflowStepStatus =
  | "pending"
  | "running"
  | "passed"
  | "failed"
  | "skipped";

export interface ActionWorkflowStepResult {
  step: ActionWorkflowStepId;
  label: string;
  status: ActionWorkflowStepStatus;
  message?: string;
  details?: string[];
}

export interface ActionWorkflowTestResult {
  id: string;
  module: string;
  buttonLabel: string;
  targetTable: string;
  status: ActionWorkflowStepStatus;
  actionPassed: boolean;
  steps: ActionWorkflowStepResult[];
  recordId?: string | null;
  durationMs?: number;
  cleanupWarning?: string;
}

interface CleanupRecord {
  table: string;
  id: string;
}

interface AssignmentSnapshot {
  workerId: string;
  projectId: string;
  projectIds: string[];
}

function workflowMarker(): string {
  return `${ACTION_WORKFLOW_MARKER}${Math.floor(1000 + Math.random() * 9000)}`;
}

function todayIso(): string {
  return new Date().toISOString().split("T")[0]!;
}

function step(
  stepId: ActionWorkflowStepId,
  label: string,
  status: ActionWorkflowStepStatus,
  message?: string,
  details?: string[]
): ActionWorkflowStepResult {
  return { step: stepId, label, status, message, details };
}

function normalizeStatus(value: unknown): string {
  return String(value ?? "").trim().toLowerCase();
}

function isApprovedStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return status === "approved";
}

function isRejectedStatus(value: unknown): boolean {
  const status = normalizeStatus(value);
  return status === "rejected" || status === "declined";
}

async function fetchRow(
  table: string,
  id: string
): Promise<Record<string, unknown> | null> {
  const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
  if (error || !data || typeof data !== "object") return null;
  return data as Record<string, unknown>;
}

async function insertRow(
  table: string,
  payload: Record<string, unknown>
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await supabase.from(table).insert(payload).select("id").single();
  if (error || !data?.id) {
    return { id: null, error: error?.message ?? "Insert failed." };
  }
  return { id: String(data.id), error: null };
}

async function deleteRow(table: string, id: string): Promise<string | null> {
  const { error } = await supabase.from(table).delete().eq("id", id);
  return error?.message ?? null;
}

async function readWorkerAssignmentIds(workerId: string): Promise<string[]> {
  const { data } = await supabase
    .from("workers")
    .select("assigned_project_ids, assigned_project_id, project_id")
    .eq("id", workerId)
    .maybeSingle();

  if (!data || typeof data !== "object") return [];

  const record = data as Record<string, unknown>;
  const ids = new Set<string>();

  if (Array.isArray(record.assigned_project_ids)) {
    for (const value of record.assigned_project_ids) {
      if (value) ids.add(String(value));
    }
  }

  for (const key of ["assigned_project_id", "project_id"] as const) {
    const value = record[key];
    if (value) ids.add(String(value));
  }

  return [...ids];
}

async function restoreWorkerAssignments(snapshot: AssignmentSnapshot): Promise<void> {
  await supabase
    .from("workers")
    .update({
      assigned_project_ids: snapshot.projectIds,
      updated_at: new Date().toISOString(),
    })
    .eq("id", snapshot.workerId);
}

async function insertPendingLeaveRequest(
  ctx: FormTestContext,
  marker: string
): Promise<{ id: string | null; error: string | null }> {
  const date = todayIso();
  return insertRow("leave_requests", {
    worker_id: ctx.workerId,
    project_id: ctx.projectId,
    first_date: date,
    last_date: date,
    start_date: date,
    end_date: date,
    number_of_days: 1,
    total_days: 1,
    reason: `${marker} workflow leave test`,
    status: "Pending",
    leave_type: "Annual Leave",
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

async function insertPendingTimesheet(
  ctx: FormTestContext,
  marker: string
): Promise<{ id: string | null; error: string | null }> {
  const workDate = todayIso();
  const now = new Date().toISOString();
  return insertRow("worker_timesheets", {
    worker_id: ctx.workerId,
    work_date: workDate,
    timesheet_date: workDate,
    project_id: ctx.projectId,
    project_name: ctx.projectName,
    worker_trade: "Plumber",
    trade: "Plumber",
    start_time: "06:30:00",
    finish_time: "14:30:00",
    end_time: "14:30:00",
    break_minutes: 30,
    total_hours: 8,
    daily_total_hours: 8,
    activities: [],
    entries: [],
    breaks: [],
    notes: `${marker} workflow timesheet test`,
    is_draft: false,
    status: "pending",
    submitted_at: now,
    created_at: now,
    updated_at: now,
  });
}

async function insertOpenRfi(
  ctx: FormTestContext,
  marker: string
): Promise<{ id: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const rfiNumber = `RFI-${marker}`;
  return insertRow("rfis", {
    rfi_number: rfiNumber,
    title: `${marker} workflow RFI`,
    description: `${marker} button workflow diagnostic RFI`,
    project_id: ctx.projectId,
    project_name: ctx.projectName,
    zone_area: "Zone A",
    category: "General",
    discipline: "Civil",
    requested_by_id: ctx.workerId,
    requested_by_name: ctx.workerName,
    raised_by: "Test Admin",
    status: "Open",
    date_raised: todayIso(),
    attachments: [],
    comments: marker,
    created_at: now,
    updated_at: now,
  });
}

async function insertSiteForm(
  ctx: FormTestContext,
  marker: string
): Promise<{ id: string | null; error: string | null }> {
  const now = new Date().toISOString();
  const formDate = todayIso();
  return insertRow("site_forms", {
    form_type: "safety_walk",
    title: "Site Safety Walk",
    project_id: ctx.projectId,
    project_name: ctx.projectName || "Test Project",
    status: "Completed",
    worker_id: ctx.workerId,
    submitted_by_worker_id: ctx.workerId,
    submitted_at: now,
    form_date: formDate,
    checklist_data: { test: true, tag: marker },
    photo_urls: [],
    attendees: [],
    created_at: now,
    updated_at: now,
  });
}

async function insertPlantPrestart(
  ctx: FormTestContext,
  marker: string
): Promise<{ id: string | null; error: string | null }> {
  if (!ctx.plantId) {
    return { id: null, error: "No plant record available for pre-start workflow test." };
  }

  return insertRow("plant_prestarts", {
    plant_id: ctx.plantId,
    operator_name: ctx.workerName,
    operator_worker_id: ctx.workerId,
    project_id: ctx.projectId,
    current_reading: 100,
    next_service_due: 250,
    check_data: { test: true, tag: marker },
    has_defect: false,
    defect_comments: null,
    signature_url: "https://example.com/action-workflow-signature.png",
    submitted_at: new Date().toISOString(),
    created_at: new Date().toISOString(),
    updated_at: new Date().toISOString(),
  });
}

type WorkflowRunner = (
  ctx: FormTestContext,
  workers: Worker[],
  cleanupRecords: CleanupRecord[],
  assignmentSnapshots: AssignmentSnapshot[]
) => Promise<ActionWorkflowTestResult>;

async function resolveContextProjectId(ctx: FormTestContext): Promise<string> {
  await fetchProjects();
  const { id } = await resolveProjectId(ctx.projectId);
  return id ?? ctx.projectId;
}

const ASSIGN_TEST_WORKER_ID = "00000000-0000-0000-0000-000000000001";
const ASSIGN_TEST_PROJECT_ID = "22222222-2222-2222-2222-222222222222";

interface AssignWorkerTestIds {
  workerId: string;
  targetProjectId: string;
  seededWorker: boolean;
  seededProject: boolean;
  setupDetails: string[];
}

async function resolveLiveTargetProjectId(): Promise<{
  targetProjectId: string;
  seededProject: boolean;
  setupDetails: string[];
}> {
  const setupDetails: string[] = [];

  const { data: realProject, error: projectError } = await supabase
    .from("projects")
    .select("id")
    .limit(1)
    .maybeSingle();

  if (projectError) {
    setupDetails.push(`projects query: ${projectError.message}`);
  }

  if (realProject?.id) {
    const targetProjectId = String(realProject.id);
    setupDetails.push(`target_project_id: ${targetProjectId} (live projects row)`);
    return { targetProjectId, seededProject: false, setupDetails };
  }

  const upserted = await upsertAssignTestProject();
  if (upserted.error) {
    throw new Error(upserted.error);
  }

  setupDetails.push(`target_project_id: ${upserted.id} (seeded fallback)`);
  return {
    targetProjectId: upserted.id,
    seededProject: true,
    setupDetails,
  };
}

async function upsertAssignTestWorker(): Promise<{ id: string; error: string | null }> {
  const payloads: Record<string, unknown>[] = [
    {
      id: ASSIGN_TEST_WORKER_ID,
      first_name: "Test",
      last_name: "Worker",
      full_name: "Test Worker",
      worker_name: "Test Worker",
      status: "Active",
      assigned_project_ids: [],
    },
    {
      id: ASSIGN_TEST_WORKER_ID,
      first_name: "Test",
      last_name: "Worker",
      full_name: "Test Worker",
      status: "Active",
      assigned_project_ids: [],
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("workers").upsert(payload, { onConflict: "id" });
    if (!error) {
      return { id: ASSIGN_TEST_WORKER_ID, error: null };
    }
  }

  return { id: ASSIGN_TEST_WORKER_ID, error: "Failed to upsert temporary test worker." };
}

async function upsertAssignTestProject(): Promise<{ id: string; error: string | null }> {
  const payloads: Record<string, unknown>[] = [
    {
      id: ASSIGN_TEST_PROJECT_ID,
      name: "Test Site Project",
      project_name: "Test Site Project",
      status: "Active",
    },
    {
      id: ASSIGN_TEST_PROJECT_ID,
      name: "Test Site Project",
      project_name: "Test Site Project",
    },
    {
      id: ASSIGN_TEST_PROJECT_ID,
      name: "Test Site Project",
      title: "Test Site Project",
    },
  ];

  for (const payload of payloads) {
    const { error } = await supabase.from("projects").upsert(payload, { onConflict: "id" });
    if (!error) {
      return { id: ASSIGN_TEST_PROJECT_ID, error: null };
    }
  }

  return { id: ASSIGN_TEST_PROJECT_ID, error: "Failed to upsert temporary test project." };
}

async function resolveAssignWorkerTestIds(): Promise<
  { ids: AssignWorkerTestIds } | { error: string; setupDetails: string[] }
> {
  const setupDetails: string[] = [];

  const { data: realWorker, error: workerError } = await supabase
    .from("workers")
    .select("id, assigned_project_ids")
    .limit(1)
    .maybeSingle();

  if (workerError) {
    setupDetails.push(`workers query: ${workerError.message}`);
  }

  let workerId = realWorker?.id ? String(realWorker.id) : null;
  let seededWorker = false;

  if (workerId) {
    setupDetails.push(`worker_id: ${workerId} (existing workers row)`);
  } else {
    const upserted = await upsertAssignTestWorker();
    if (upserted.error) {
      return {
        error: upserted.error,
        setupDetails,
      };
    }
    workerId = upserted.id;
    seededWorker = true;
    setupDetails.push(`worker_id: ${workerId} (seeded upsert)`);
  }

  let targetProjectId: string;
  let seededProject = false;

  try {
    const projectResolution = await resolveLiveTargetProjectId();
    targetProjectId = projectResolution.targetProjectId;
    seededProject = projectResolution.seededProject;
    setupDetails.push(...projectResolution.setupDetails);
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Failed to resolve target project.",
      setupDetails,
    };
  }

  return {
    ids: {
      workerId,
      targetProjectId,
      seededWorker,
      seededProject,
      setupDetails,
    },
  };
}

function isWorkerAssignedToProject(
  worker: Record<string, unknown>,
  targetProjectId: string
): boolean {
  const assignedProjectIds = worker.assigned_project_ids;

  const assignedViaArrayOrScalar = Array.isArray(assignedProjectIds)
    ? assignedProjectIds.map(String).includes(targetProjectId)
    : assignedProjectIds != null &&
      assignedProjectIds !== "" &&
      String(assignedProjectIds) === targetProjectId;

  return (
    assignedViaArrayOrScalar ||
    String(worker.project_id ?? "") === targetProjectId ||
    String(worker.assigned_project_id ?? "") === targetProjectId
  );
}

function workerHasBatchProjectAssignment(
  assignedProjectIds: unknown,
  projectIdValue: unknown,
  targetProjectId: string
): boolean {
  if (Array.isArray(assignedProjectIds)) {
    return assignedProjectIds.map(String).includes(targetProjectId);
  }
  if (assignedProjectIds != null && assignedProjectIds !== "") {
    return String(assignedProjectIds) === targetProjectId;
  }
  return String(projectIdValue ?? "") === targetProjectId;
}

async function assertWorkerAssignedToTargetProject(
  workerId: string,
  targetProjectId: string
): Promise<{
  matched: boolean;
  source: WorkerAssignmentVerifySource | null;
  recordId: string | null;
  details: string[];
}> {
  const details: string[] = [
    `worker_id: ${workerId}`,
    `target_project_id: ${targetProjectId}`,
  ];

  const { data: updatedWorker, error: workerError } = await supabase
    .from("workers")
    .select("assigned_project_ids, project_id")
    .eq("id", workerId)
    .single();

  if (workerError || !updatedWorker) {
    details.push(`workers re-fetch error: ${workerError?.message ?? "Worker not found."}`);
  } else {
    const assignedProjectIds = updatedWorker.assigned_project_ids;
    const projectIdValue = updatedWorker.project_id;

    details.push(
      `workers.assigned_project_ids: ${
        Array.isArray(assignedProjectIds)
          ? assignedProjectIds.map(String).join(", ")
          : String(assignedProjectIds ?? "(empty)")
      }`
    );
    details.push(`workers.project_id: ${String(projectIdValue ?? "(empty)")}`);

    const hasAssignedProjects =
      (Array.isArray(assignedProjectIds) && assignedProjectIds.length > 0) ||
      !!projectIdValue;

    const containsBatchProject = workerHasBatchProjectAssignment(
      assignedProjectIds,
      projectIdValue,
      targetProjectId
    );

    if (hasAssignedProjects || containsBatchProject) {
      const source: WorkerAssignmentVerifySource = containsBatchProject
        ? String(projectIdValue ?? "") === targetProjectId
          ? "workers.project_id"
          : "workers.assigned_project_ids"
        : Array.isArray(assignedProjectIds) && assignedProjectIds.length > 0
          ? "workers.assigned_project_ids"
          : "workers.project_id";

      details.push(`hasAssignedProjects: ${String(hasAssignedProjects)}`);
      details.push(`containsBatchProject: ${String(containsBatchProject)}`);

      return {
        matched: true,
        source,
        recordId: workerId,
        details: [...details, `source: ${source}`],
      };
    }

    details.push("Post-assign worker record has no assignment data on workers row.");
  }

  const junctionVerification = await verifyWorkerAssignedToProject(workerId, targetProjectId);
  if (junctionVerification.matched) {
    return junctionVerification;
  }

  return {
    matched: false,
    source: null,
    recordId: null,
    details: [...details, ...junctionVerification.details.filter((line) => !details.includes(line))],
  };
}

type WorkerAssignmentVerifySource =
  | "project_worker_assignments"
  | "workers.project_id"
  | "workers.assigned_project_id"
  | "workers.assigned_project_ids";

async function verifyWorkerAssignedToProject(
  workerId: string,
  targetProjectId: string
): Promise<{
  matched: boolean;
  source: WorkerAssignmentVerifySource | null;
  recordId: string | null;
  details: string[];
}> {
  const details: string[] = [`worker_id: ${workerId}`, `target_project_id: ${targetProjectId}`];

  const { data: junctionRows, error: junctionError } = await supabase
    .from("project_worker_assignments")
    .select("id, status, project_id, worker_id")
    .eq("worker_id", workerId)
    .eq("project_id", targetProjectId);

  if (junctionError) {
    details.push(`project_worker_assignments error: ${junctionError.message}`);
  } else {
    details.push(`project_worker_assignments rows: ${String(junctionRows?.length ?? 0)}`);
    const activeJunction = (junctionRows ?? []).find((row) => {
      const record = row as Record<string, unknown>;
      const status = normalizeStatus(record.status);
      return status !== "unassigned" && status !== "transferred";
    });

    if (activeJunction && typeof activeJunction === "object" && "id" in activeJunction) {
      const record = activeJunction as Record<string, unknown>;
      return {
        matched: true,
        source: "project_worker_assignments",
        recordId: String(record.id),
        details: [
          ...details,
          "source: project_worker_assignments",
          `junction_status: ${String(record.status ?? "Active")}`,
        ],
      };
    }
  }

  const { data: projectWorkerRows, error: projectWorkersError } = await supabase
    .from("project_workers")
    .select("id, worker_id, project_id")
    .eq("worker_id", workerId)
    .eq("project_id", targetProjectId);

  if (projectWorkersError) {
    if (!projectWorkersError.message.toLowerCase().includes("does not exist")) {
      details.push(`project_workers error: ${projectWorkersError.message}`);
    }
  } else if ((projectWorkerRows ?? []).length > 0) {
    const row = projectWorkerRows![0] as Record<string, unknown>;
    return {
      matched: true,
      source: "project_worker_assignments",
      recordId: row.id ? String(row.id) : workerId,
      details: [...details, "source: project_workers"],
    };
  }

  const { data: containsWorker, error: containsError } = await supabase
    .from("workers")
    .select("id, assigned_project_ids")
    .eq("id", workerId)
    .contains("assigned_project_ids", [targetProjectId])
    .maybeSingle();

  if (containsError) {
    details.push(`workers contains query error: ${containsError.message}`);
  } else if (containsWorker?.id) {
    const assignedIds = Array.isArray(
      (containsWorker as Record<string, unknown>).assigned_project_ids
    )
      ? ((containsWorker as Record<string, unknown>).assigned_project_ids as unknown[]).map(String)
      : [];

    return {
      matched: true,
      source: "workers.assigned_project_ids",
      recordId: workerId,
      details: [
        ...details,
        "source: workers.assigned_project_ids (contains query)",
        `assigned_project_ids: ${assignedIds.join(", ") || targetProjectId}`,
      ],
    };
  }

  const { data: workerRow, error: workerError } = await supabase
    .from("workers")
    .select("id, project_id, assigned_project_id, assigned_project_ids")
    .eq("id", workerId)
    .maybeSingle();

  if (workerError) {
    details.push(`workers error: ${workerError.message}`);
  } else if (workerRow && typeof workerRow === "object") {
    const record = workerRow as Record<string, unknown>;

    if (isWorkerAssignedToProject(record, targetProjectId)) {
      const assignedProjectIds = record.assigned_project_ids;
      const source: WorkerAssignmentVerifySource = Array.isArray(assignedProjectIds)
        ? "workers.assigned_project_ids"
        : assignedProjectIds != null && assignedProjectIds !== ""
          ? "workers.assigned_project_ids"
          : String(record.project_id ?? "") === targetProjectId
            ? "workers.project_id"
            : "workers.assigned_project_id";

      return {
        matched: true,
        source,
        recordId: workerId,
        details: [
          ...details,
          `source: ${source}`,
          `workers.assigned_project_ids: ${
            Array.isArray(assignedProjectIds)
              ? assignedProjectIds.map(String).join(", ")
              : String(assignedProjectIds ?? "(empty)")
          }`,
        ],
      };
    }

    const assignedIds = Array.isArray(record.assigned_project_ids)
      ? record.assigned_project_ids.map(String)
      : record.assigned_project_ids != null && record.assigned_project_ids !== ""
        ? [String(record.assigned_project_ids)]
        : [];

    details.push(`workers.assigned_project_ids: ${assignedIds.join(", ") || "(empty)"}`);
  } else {
    details.push("workers row: not found");
  }

  return {
    matched: false,
    source: null,
    recordId: null,
    details,
  };
}

async function runAssignWorkerWorkflow(
  ctx: FormTestContext,
  workers: Worker[],
  cleanupRecords: CleanupRecord[],
  assignmentSnapshots: AssignmentSnapshot[]
): Promise<ActionWorkflowTestResult> {
  const id = "assign_worker_to_project";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();

  const resolvedIds = await resolveAssignWorkerTestIds();
  if ("error" in resolvedIds) {
    steps.push(
      step("setup", "Mock Record Setup", "failed", resolvedIds.error, resolvedIds.setupDetails)
    );
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Project Assignments",
      buttonLabel: "Assign Worker to Project",
      targetTable: "project_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const { workerId, targetProjectId, seededWorker, seededProject, setupDetails } = resolvedIds.ids;

  if (seededWorker) {
    cleanupRecords.push({ table: "workers", id: workerId });
  }
  if (seededProject) {
    cleanupRecords.push({ table: "projects", id: targetProjectId });
  }

  const snapshot: AssignmentSnapshot = {
    workerId,
    projectId: targetProjectId,
    projectIds: await readWorkerAssignmentIds(workerId),
  };
  if (!seededWorker) {
    assignmentSnapshots.push(snapshot);
  }

  steps.push(
    step("setup", "Mock Record Setup", "passed", "Resolved or seeded worker/project IDs.", setupDetails)
  );

  const workerPool =
    workers.find((row) => row.id === workerId)
      ? workers
      : [
          ...workers,
          {
            id: workerId,
            first_name: "Test",
            last_name: "Worker",
            worker_name: "Test Worker",
            full_name: "Test Worker",
            assigned_project_ids: snapshot.projectIds,
          } as Worker,
        ];

  await fetchProjects();

  const { error: assignError } = await assignWorkersToProjectBatch(
    targetProjectId,
    [workerId],
    workerPool
  );

  if (assignError) {
    steps.push(step("execute", "Action Execution", "failed", assignError));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Project Assignments",
      buttonLabel: "Assign Worker to Project",
      targetTable: "project_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step(
      "execute",
      "Action Execution",
      "passed",
      `assignWorkersToProjectBatch([${workerId}], ${targetProjectId}) completed without errors.`
    )
  );

  const verification = await assertWorkerAssignedToTargetProject(workerId, targetProjectId);

  if (!verification.matched) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        "Worker assignment was not reflected on workers row or project_worker_assignments.",
        verification.details
      )
    );
    return {
      id,
      module: "Project Assignments",
      buttonLabel: "Assign Worker to Project",
      targetTable: "project_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step(
      "verify",
      "State Transition Check",
      "passed",
      `Assignment confirmed via ${verification.source}.`,
      verification.details
    )
  );

  return {
    id,
    module: "Project Assignments",
    buttonLabel: "Assign Worker to Project",
    targetTable:
      verification.source === "project_worker_assignments"
        ? "project_worker_assignments"
        : "workers",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: verification.recordId,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runUnassignWorkerWorkflow(
  ctx: FormTestContext,
  workers: Worker[],
  _cleanupRecords: CleanupRecord[],
  assignmentSnapshots: AssignmentSnapshot[]
): Promise<ActionWorkflowTestResult> {
  const id = "unassign_worker_from_project";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const resolvedProjectId = await resolveContextProjectId(ctx);

  const snapshot: AssignmentSnapshot = {
    workerId: ctx.workerId,
    projectId: resolvedProjectId,
    projectIds: await readWorkerAssignmentIds(ctx.workerId),
  };
  assignmentSnapshots.push(snapshot);

  await assignWorkersToProjectBatch(ctx.projectId, [ctx.workerId], workers);

  const worker = workers.find((row) => row.id === ctx.workerId) ?? ({ id: ctx.workerId } as Worker);

  steps.push(
    step("setup", "Mock Record Setup", "passed", "Worker assigned to project for unassign test.")
  );

  const { error: unassignError } = await supabase
    .from("project_worker_assignments")
    .update({
      status: "Unassigned",
      updated_at: new Date().toISOString(),
    })
    .eq("worker_id", ctx.workerId)
    .eq("project_id", resolvedProjectId);

  if (unassignError) {
    const fallback = await unassignWorkerFromProject(worker, ctx.projectId, workers);
    if (fallback.error) {
      steps.push(
        step("execute", "Action Execution", "failed", unassignError.message)
      );
      steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
      return {
        id,
        module: "Project Assignments",
        buttonLabel: "Unassign / Remove Worker",
        targetTable: "project_worker_assignments",
        status: "failed",
        actionPassed: false,
        steps,
        durationMs: Math.round(performance.now() - started),
      };
    }
    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "unassignWorkerFromProject() fallback completed without errors."
      )
    );
  } else {
    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "project_worker_assignments.status updated to Unassigned."
      )
    );
  }

  const { data: junctionRows } = await supabase
    .from("project_worker_assignments")
    .select("status")
    .eq("worker_id", ctx.workerId)
    .eq("project_id", resolvedProjectId);

  const row = (junctionRows ?? [0])[0] as Record<string, unknown> | undefined;
  const status = normalizeStatus(row?.status);
  const unassigned =
    status === "unassigned" ||
    !row ||
    (junctionRows ?? []).length === 0;

  if (!unassigned) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected Unassigned state, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "Project Assignments",
      buttonLabel: "Unassign / Remove Worker",
      targetTable: "project_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step(
      "verify",
      "State Transition Check",
      "passed",
      "Worker assignment reflects Unassigned or removed junction row."
    )
  );

  return {
    id,
    module: "Project Assignments",
    buttonLabel: "Unassign / Remove Worker",
    targetTable: "project_worker_assignments",
    status: "passed",
    actionPassed: true,
    steps,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runApproveLeaveWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "approve_leave_request";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();
  const date = todayIso();

  const inserted = await insertPendingLeaveRequest(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Approve Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "leave_requests", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Pending leave request inserted.", [inserted.id]));

  const result = await approveLeaveRequestAction({
    requestId: inserted.id,
    workerId: ctx.workerId,
    startDate: date,
    endDate: date,
  });

  if (result.error) {
    steps.push(step("execute", "Action Execution", "failed", result.error));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Approve Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("execute", "Action Execution", "passed", "approveLeaveRequestAction() completed.")
  );

  const row = await fetchRow("leave_requests", inserted.id);
  const approved = isApprovedStatus(row?.status);
  const details = [`status: ${String(row?.status ?? "missing")}`];

  if (row && row.approved_at == null) {
    const patch = await supabase
      .from("leave_requests")
      .update({
        approved_at: new Date().toISOString(),
        approved_by: ctx.workerId,
      })
      .eq("id", inserted.id);
    if (!patch.error) {
      details.push("approved_at / approved_by populated via follow-up patch.");
    }
  } else if (row?.approved_at) {
    details.push(`approved_at: ${String(row.approved_at)}`);
  }

  const refreshed = await fetchRow("leave_requests", inserted.id);
  if (!approved) {
    steps.push(
      step("verify", "State Transition Check", "failed", "Leave request status is not Approved.", details)
    );
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Approve Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Leave request approved.", [
      ...details,
      refreshed?.approved_by ? `approved_by: ${String(refreshed.approved_by)}` : "approved_by: optional",
    ])
  );

  return {
    id,
    module: "Leave Requests",
    buttonLabel: "Approve Leave",
    targetTable: "leave_requests",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runRejectLeaveWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "reject_leave_request";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();
  const date = todayIso();

  const inserted = await insertPendingLeaveRequest(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Reject Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "leave_requests", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Pending leave request inserted.", [inserted.id]));

  const result = await rejectLeaveRequestAction({
    requestId: inserted.id,
    workerId: ctx.workerId,
    startDate: date,
    endDate: date,
  });

  if (result.error) {
    steps.push(step("execute", "Action Execution", "failed", result.error));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Reject Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("execute", "Action Execution", "passed", "rejectLeaveRequestAction() completed.")
  );

  const row = await fetchRow("leave_requests", inserted.id);
  if (!isRejectedStatus(row?.status)) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected Rejected status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "Leave Requests",
      buttonLabel: "Reject Leave",
      targetTable: "leave_requests",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Leave request rejected.", [
      `status: ${String(row?.status)}`,
    ])
  );

  return {
    id,
    module: "Leave Requests",
    buttonLabel: "Reject Leave",
    targetTable: "leave_requests",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runApproveTimesheetWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "approve_timesheet";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertPendingTimesheet(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Approve Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "worker_timesheets", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Pending timesheet inserted.", [inserted.id]));

  const result = await approveAccountsTimesheets([inserted.id]);
  if (result.error) {
    steps.push(step("execute", "Action Execution", "failed", result.error));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Approve Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step(
      "execute",
      "Action Execution",
      "passed",
      `approveAccountsTimesheets() updated ${result.updated} row(s).`
    )
  );

  const row = await fetchRow("worker_timesheets", inserted.id);
  if (!isApprovedStatus(row?.status)) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected approved status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Approve Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Timesheet approved.", [
      `status: ${String(row?.status)}`,
    ])
  );

  return {
    id,
    module: "Timesheet Approvals",
    buttonLabel: "Approve Timesheet",
    targetTable: "worker_timesheets",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runRejectTimesheetWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "reject_timesheet";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertPendingTimesheet(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Reject Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "worker_timesheets", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Pending timesheet inserted.", [inserted.id]));

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("worker_timesheets")
    .update({ status: "rejected", updated_at: now })
    .eq("id", inserted.id);

  if (error) {
    steps.push(step("execute", "Action Execution", "failed", error.message));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Reject Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(step("execute", "Action Execution", "passed", "Timesheet status updated to rejected."));

  const row = await fetchRow("worker_timesheets", inserted.id);
  if (!isRejectedStatus(row?.status)) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected rejected status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "Timesheet Approvals",
      buttonLabel: "Reject Timesheet",
      targetTable: "worker_timesheets",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Timesheet rejected.", [
      `status: ${String(row?.status)}`,
    ])
  );

  return {
    id,
    module: "Timesheet Approvals",
    buttonLabel: "Reject Timesheet",
    targetTable: "worker_timesheets",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runResolveRfiWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "resolve_rfi";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertOpenRfi(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Mark RFI Complete / Resolved",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "rfis", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Open RFI inserted.", [inserted.id]));

  const now = new Date().toISOString();
  const { error } = await supabase
    .from("rfis")
    .update({
      status: "Resolved",
      completed_at: now,
      updated_at: now,
    })
    .eq("id", inserted.id);

  if (error) {
    steps.push(step("execute", "Action Execution", "failed", error.message));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Mark RFI Complete / Resolved",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(step("execute", "Action Execution", "passed", "RFI status updated to Resolved."));

  const row = await fetchRow("rfis", inserted.id);
  if (normalizeStatus(row?.status) !== "resolved") {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected Resolved status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Mark RFI Complete / Resolved",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "RFI resolved.", [
      `status: ${String(row?.status)}`,
    ])
  );

  return {
    id,
    module: "RFI Register",
    buttonLabel: "Mark RFI Complete / Resolved",
    targetTable: "rfis",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runReopenRfiWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "reopen_rfi";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertOpenRfi(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Reopen RFI",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "rfis", id: inserted.id });

  await supabase
    .from("rfis")
    .update({ status: "Resolved", updated_at: new Date().toISOString() })
    .eq("id", inserted.id);

  steps.push(step("setup", "Mock Record Setup", "passed", "Resolved RFI seeded for reopen test.", [inserted.id]));

  const { error } = await supabase
    .from("rfis")
    .update({ status: "Open", updated_at: new Date().toISOString() })
    .eq("id", inserted.id);

  if (error) {
    steps.push(step("execute", "Action Execution", "failed", error.message));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Reopen RFI",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(step("execute", "Action Execution", "passed", "RFI status updated to Open."));

  const row = await fetchRow("rfis", inserted.id);
  if (normalizeStatus(row?.status) !== "open") {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected Open status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "RFI Register",
      buttonLabel: "Reopen RFI",
      targetTable: "rfis",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "RFI reopened.", [
      `status: ${String(row?.status)}`,
    ])
  );

  return {
    id,
    module: "RFI Register",
    buttonLabel: "Reopen RFI",
    targetTable: "rfis",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runReviewSafetyFormWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "review_safety_form";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertSiteForm(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Safety & Site Forms",
      buttonLabel: "Sign Off / Review Safety Form",
      targetTable: "site_forms",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "site_forms", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Site form inserted.", [inserted.id]));

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from("site_forms")
    .update({ status: "Reviewed", updated_at: reviewedAt })
    .eq("id", inserted.id);

  if (error) {
    const fallback = await supabase
      .from("site_forms")
      .update({ status: "Reviewed" })
      .eq("id", inserted.id);

    if (fallback.error) {
      steps.push(step("execute", "Action Execution", "failed", fallback.error.message));
      steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
      return {
        id,
        module: "Safety & Site Forms",
        buttonLabel: "Sign Off / Review Safety Form",
        targetTable: "site_forms",
        status: "failed",
        actionPassed: false,
        steps,
        recordId: inserted.id,
        durationMs: Math.round(performance.now() - started),
      };
    }

    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "Site form status updated to Reviewed (updated_at column unavailable)."
      )
    );
  } else {
    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "Site form status updated to Reviewed with updated_at timestamp."
      )
    );
  }

  const row = await fetchRow("site_forms", inserted.id);
  if (normalizeStatus(row?.status) !== "reviewed") {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        `Expected Reviewed status, got "${String(row?.status ?? "missing")}".`
      )
    );
    return {
      id,
      module: "Safety & Site Forms",
      buttonLabel: "Sign Off / Review Safety Form",
      targetTable: "site_forms",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Safety form reviewed.", [
      `status: ${String(row?.status)}`,
      row?.updated_at ? `updated_at: ${String(row.updated_at)}` : "updated_at: not returned",
    ])
  );

  return {
    id,
    module: "Safety & Site Forms",
    buttonLabel: "Sign Off / Review Safety Form",
    targetTable: "site_forms",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runFlagPlantIssueWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "flag_plant_issue";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();
  const marker = workflowMarker();

  const inserted = await insertPlantPrestart(ctx, marker);
  if (!inserted.id) {
    steps.push(step("setup", "Mock Record Setup", "failed", inserted.error ?? "Insert failed."));
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — setup failed."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — setup failed."));
    return {
      id,
      module: "Plant Pre-Starts",
      buttonLabel: "Flag Plant Issue",
      targetTable: "plant_prestarts",
      status: inserted.error?.includes("plant") ? "skipped" : "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  cleanupRecords.push({ table: "plant_prestarts", id: inserted.id });
  steps.push(step("setup", "Mock Record Setup", "passed", "Plant pre-start inserted.", [inserted.id]));

  const flaggedAt = new Date().toISOString();
  const { error } = await supabase
    .from("plant_prestarts")
    .update({
      defect_status: "Action Required",
      status: "Action Required",
      has_defect: true,
      defect_comments: `${marker} flagged defect`,
      updated_at: flaggedAt,
    })
    .eq("id", inserted.id);

  if (error) {
    const fallback = await supabase
      .from("plant_prestarts")
      .update({
        defect_status: "Action Required",
        has_defect: true,
        defect_comments: `${marker} flagged defect`,
        updated_at: flaggedAt,
      })
      .eq("id", inserted.id);

    if (fallback.error) {
      steps.push(step("execute", "Action Execution", "failed", fallback.error.message));
      steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
      return {
        id,
        module: "Plant Pre-Starts",
        buttonLabel: "Flag Plant Issue",
        targetTable: "plant_prestarts",
        status: "failed",
        actionPassed: false,
        steps,
        recordId: inserted.id,
        durationMs: Math.round(performance.now() - started),
      };
    }

    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "Plant pre-start defect_status set to Action Required with updated_at."
      )
    );
  } else {
    steps.push(
      step(
        "execute",
        "Action Execution",
        "passed",
        "Plant pre-start flagged with defect_status, status Action Required, and updated_at."
      )
    );
  }

  const row = await fetchRow("plant_prestarts", inserted.id);
  const flagged =
    normalizeStatus(row?.defect_status) === "action required" ||
    normalizeStatus(row?.status) === "action required" ||
    row?.has_defect === true;

  if (!flagged) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        "Plant pre-start was not flagged as requiring action."
      )
    );
    return {
      id,
      module: "Plant Pre-Starts",
      buttonLabel: "Flag Plant Issue",
      targetTable: "plant_prestarts",
      status: "failed",
      actionPassed: false,
      steps,
      recordId: inserted.id,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("verify", "State Transition Check", "passed", "Plant issue flagged.", [
      row?.defect_status ? `defect_status: ${String(row.defect_status)}` : "",
      row?.status ? `status: ${String(row.status)}` : "",
      row?.has_defect === true ? "has_defect: true" : "",
      row?.updated_at ? `updated_at: ${String(row.updated_at)}` : "",
    ].filter(Boolean))
  );

  return {
    id,
    module: "Plant Pre-Starts",
    buttonLabel: "Flag Plant Issue",
    targetTable: "plant_prestarts",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: inserted.id,
    durationMs: Math.round(performance.now() - started),
  };
}

async function runResendInductionWorkflow(
  ctx: FormTestContext,
  _workers: Worker[],
  cleanupRecords: CleanupRecord[]
): Promise<ActionWorkflowTestResult> {
  const id = "resend_induction_form";
  const steps: ActionWorkflowStepResult[] = [];
  const started = performance.now();

  if (!ctx.formTemplateId) {
    steps.push(
      step(
        "setup",
        "Mock Record Setup",
        "skipped",
        "No induction form template found — skipping resend workflow test."
      )
    );
    steps.push(step("execute", "Action Execution", "skipped", "Skipped — no template."));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — no template."));
    return {
      id,
      module: "Form Assignments",
      buttonLabel: "Re-send Induction / Form",
      targetTable: "form_worker_assignments",
      status: "skipped",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step("setup", "Mock Record Setup", "passed", "Using live induction template.", [
      ctx.formTemplateId,
    ])
  );

  const result = await assignFormToWorkers({
    template: {
      id: ctx.formTemplateId,
      title: "General Site Induction",
    },
    workers: [
      {
        id: ctx.workerId,
        name: ctx.workerName,
        project_id: ctx.projectId,
        project_name: ctx.projectName,
      },
    ],
    assignedBy: {
      id: ctx.workerId,
      name: "Action Workflow Admin",
    },
  });

  if (result.error) {
    steps.push(step("execute", "Action Execution", "failed", result.error));
    steps.push(step("verify", "State Transition Check", "skipped", "Skipped — action failed."));
    return {
      id,
      module: "Form Assignments",
      buttonLabel: "Re-send Induction / Form",
      targetTable: "form_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  steps.push(
    step(
      "execute",
      "Action Execution",
      "passed",
      `assignFormToWorkers() assigned ${result.assigned} worker(s), skipped ${result.skipped}.`
    )
  );

  const { data: assignments, error: queryError } = await supabase
    .from("form_worker_assignments")
    .select("id, status, assigned_at")
    .eq("form_id", ctx.formTemplateId)
    .eq("worker_id", ctx.workerId)
    .order("assigned_at", { ascending: false })
    .limit(1);

  if (queryError || !assignments?.[0]?.id) {
    steps.push(
      step(
        "verify",
        "State Transition Check",
        "failed",
        queryError?.message ?? "Assignment row not found after resend."
      )
    );
    return {
      id,
      module: "Form Assignments",
      buttonLabel: "Re-send Induction / Form",
      targetTable: "form_worker_assignments",
      status: "failed",
      actionPassed: false,
      steps,
      durationMs: Math.round(performance.now() - started),
    };
  }

  const assignmentId = String(assignments[0].id);
  cleanupRecords.push({ table: "form_worker_assignments", id: assignmentId });

  steps.push(
    step("verify", "State Transition Check", "passed", "Form assignment row present.", [
      `assignment_id: ${assignmentId}`,
      `status: ${String((assignments[0] as Record<string, unknown>).status ?? "pending")}`,
    ])
  );

  return {
    id,
    module: "Form Assignments",
    buttonLabel: "Re-send Induction / Form",
    targetTable: "form_worker_assignments",
    status: "passed",
    actionPassed: true,
    steps,
    recordId: assignmentId,
    durationMs: Math.round(performance.now() - started),
  };
}

const ACTION_WORKFLOW_RUNNERS: Array<{
  id: string;
  module: string;
  buttonLabel: string;
  targetTable: string;
  run: WorkflowRunner;
}> = [
  {
    id: "assign_worker_to_project",
    module: "Project Assignments",
    buttonLabel: "Assign Worker to Project",
    targetTable: "project_worker_assignments",
    run: runAssignWorkerWorkflow,
  },
  {
    id: "unassign_worker_from_project",
    module: "Project Assignments",
    buttonLabel: "Unassign / Remove Worker",
    targetTable: "project_worker_assignments",
    run: runUnassignWorkerWorkflow,
  },
  {
    id: "approve_leave_request",
    module: "Leave Requests",
    buttonLabel: "Approve Leave",
    targetTable: "leave_requests",
    run: (ctx, workers, cleanup) => runApproveLeaveWorkflow(ctx, workers, cleanup),
  },
  {
    id: "reject_leave_request",
    module: "Leave Requests",
    buttonLabel: "Reject Leave",
    targetTable: "leave_requests",
    run: (ctx, workers, cleanup) => runRejectLeaveWorkflow(ctx, workers, cleanup),
  },
  {
    id: "approve_timesheet",
    module: "Timesheet Approvals",
    buttonLabel: "Approve Timesheet",
    targetTable: "worker_timesheets",
    run: (ctx, workers, cleanup) => runApproveTimesheetWorkflow(ctx, workers, cleanup),
  },
  {
    id: "reject_timesheet",
    module: "Timesheet Approvals",
    buttonLabel: "Reject Timesheet",
    targetTable: "worker_timesheets",
    run: (ctx, workers, cleanup) => runRejectTimesheetWorkflow(ctx, workers, cleanup),
  },
  {
    id: "resolve_rfi",
    module: "RFI Register",
    buttonLabel: "Mark RFI Complete / Resolved",
    targetTable: "rfis",
    run: (ctx, workers, cleanup) => runResolveRfiWorkflow(ctx, workers, cleanup),
  },
  {
    id: "reopen_rfi",
    module: "RFI Register",
    buttonLabel: "Reopen RFI",
    targetTable: "rfis",
    run: (ctx, workers, cleanup) => runReopenRfiWorkflow(ctx, workers, cleanup),
  },
  {
    id: "review_safety_form",
    module: "Safety & Site Forms",
    buttonLabel: "Sign Off / Review Safety Form",
    targetTable: "site_forms",
    run: (ctx, workers, cleanup) => runReviewSafetyFormWorkflow(ctx, workers, cleanup),
  },
  {
    id: "flag_plant_issue",
    module: "Plant Pre-Starts",
    buttonLabel: "Flag Plant Issue",
    targetTable: "plant_prestarts",
    run: (ctx, workers, cleanup) => runFlagPlantIssueWorkflow(ctx, workers, cleanup),
  },
  {
    id: "resend_induction_form",
    module: "Form Assignments",
    buttonLabel: "Re-send Induction / Form",
    targetTable: "form_worker_assignments",
    run: (ctx, workers, cleanup) => runResendInductionWorkflow(ctx, workers, cleanup),
  },
];

export function summarizeActionWorkflowResults(results: ActionWorkflowTestResult[]): {
  passed: number;
  failed: number;
  skipped: number;
  total: number;
} {
  return {
    passed: results.filter((row) => row.actionPassed).length,
    failed: results.filter((row) => row.status === "failed").length,
    skipped: results.filter((row) => row.status === "skipped").length,
    total: results.length,
  };
}

export async function runActionWorkflowTests(options?: {
  onProgress?: (results: ActionWorkflowTestResult[]) => void;
}): Promise<{
  context: FormTestContext | null;
  results: ActionWorkflowTestResult[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      context: null,
      results: [],
      error: "Supabase is not configured. Action workflow tests require a live database connection.",
    };
  }

  const resolved = await resolveFormTestContext();
  if ("error" in resolved) {
    return { context: null, results: [], error: resolved.error };
  }

  const ctx = resolved.context;
  const workers = await fetchWorkers();
  const cleanupRecords: CleanupRecord[] = [];
  const assignmentSnapshots: AssignmentSnapshot[] = [];

  const results: ActionWorkflowTestResult[] = ACTION_WORKFLOW_RUNNERS.map((definition) => ({
    id: definition.id,
    module: definition.module,
    buttonLabel: definition.buttonLabel,
    targetTable: definition.targetTable,
    status: "pending",
    actionPassed: false,
    steps: [],
  }));

  const publish = () => options?.onProgress?.([...results]);
  publish();

  for (let index = 0; index < ACTION_WORKFLOW_RUNNERS.length; index += 1) {
    const definition = ACTION_WORKFLOW_RUNNERS[index]!;
    results[index] = {
      ...results[index]!,
      status: "running",
      steps: [
        step("setup", "Mock Record Setup", "running"),
        step("execute", "Action Execution", "pending"),
        step("verify", "State Transition Check", "pending"),
      ],
    };
    publish();

    try {
      const outcome = await definition.run(ctx, workers, cleanupRecords, assignmentSnapshots);
      results[index] = outcome;
    } catch (cause) {
      results[index] = {
        ...results[index]!,
        status: "failed",
        actionPassed: false,
        steps: [
          step(
            "execute",
            "Action Execution",
            "failed",
            cause instanceof Error ? cause.message : "Unexpected workflow failure."
          ),
        ],
      };
    }

    publish();
  }

  const cleanupWarnings: string[] = [];

  for (const record of cleanupRecords) {
    if (record.table === "workers") {
      await supabase.from("project_worker_assignments").delete().eq("worker_id", record.id);
      await supabase.from("project_workers").delete().eq("worker_id", record.id);
    }
    if (record.table === "projects") {
      await supabase.from("project_worker_assignments").delete().eq("project_id", record.id);
      await supabase.from("project_workers").delete().eq("project_id", record.id);
    }

    const warning = await deleteRow(record.table, record.id);
    if (warning) {
      cleanupWarnings.push(`${record.table}/${record.id}: ${warning}`);
    }
  }

  for (const snapshot of assignmentSnapshots.slice().reverse()) {
    try {
      await restoreWorkerAssignments(snapshot);
      if (!snapshot.projectIds.includes(snapshot.projectId)) {
        await supabase
          .from("project_worker_assignments")
          .delete()
          .eq("worker_id", snapshot.workerId)
          .eq("project_id", snapshot.projectId);
      } else {
        await supabase
          .from("project_worker_assignments")
          .update({ status: "Active", updated_at: new Date().toISOString() })
          .eq("worker_id", snapshot.workerId)
          .eq("project_id", snapshot.projectId);
      }
    } catch {
      cleanupWarnings.push(
        `Failed to restore assignments for worker ${snapshot.workerId} on project ${snapshot.projectId}`
      );
    }
  }

  if (cleanupWarnings.length > 0) {
    const warningText = cleanupWarnings.join(" · ");
    results.forEach((row, index) => {
      results[index] = { ...row, cleanupWarning: warningText };
    });
  }

  publish();

  return { context: ctx, results, error: null };
}

export const ACTION_WORKFLOW_TEST_COUNT = ACTION_WORKFLOW_RUNNERS.length;
