import {
  requestSubcontractorPlantAssignment,
  requestSubcontractorWorkerAssignment,
} from "@/app/actions/resource-approvals";
import {
  transferPlantToProject,
  transferWorkerToProject,
  unassignPlantFromProject,
  unassignWorkerFromProject,
} from "./project-assignments";
import { parseMissingColumnFromError, stripMissingColumn } from "./form-payload-utils";
import { formatDateOnly } from "./scheduler-utils";
import type { Worker } from "./supabase";
import { supabase } from "./supabase/client";

const PLANT_TABLES = ["plant", "plant_equipment", "subcontractor_plant"] as const;
const WORKER_CALENDAR_TABLES = ["worker_calendar", "worker_calendar_events"] as const;
const PLANT_CALENDAR_TABLES = ["plant_calendar", "plant_calendar_events"] as const;

const NO_TIMESHEET_FLAGS = {
  requires_timesheet: false,
  generate_timesheets: false,
  skip_timesheet: true,
  exclude_from_timesheets: true,
  timesheet_required: false,
  is_subcontractor: true,
  source: "subcontractor_portal",
};

function text(value: unknown): string {
  return value == null ? "" : String(value).trim();
}

async function insertWithMissingColumnRetry(
  table: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  let current = { ...payload };
  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { error } = await supabase.from(table).insert([current]);
    if (!error) return { error: null };
    const missing = parseMissingColumnFromError(error.message);
    if (missing && missing in current) {
      current = stripMissingColumn(current, missing);
      continue;
    }
    return { error: error.message };
  }
  return { error: `Could not insert into ${table}.` };
}

async function assertProjectAccess(
  subcontractorId: string,
  projectId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("project_subcontractors")
    .select("project_id")
    .eq("subcontractor_id", subcontractorId)
    .eq("project_id", projectId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "You do not have access to that project.";
  return null;
}

async function assertOwnedWorker(
  subcontractorId: string,
  workerId: string
): Promise<string | null> {
  const { data, error } = await supabase
    .from("workers")
    .select("id, subcontractor_id")
    .eq("id", workerId)
    .eq("subcontractor_id", subcontractorId)
    .maybeSingle();
  if (error) return error.message;
  if (!data) return "That worker is not in your company register.";
  return null;
}

async function assertOwnedPlant(
  subcontractorId: string,
  plantId: string
): Promise<string | null> {
  for (const table of PLANT_TABLES) {
    const { data, error } = await supabase
      .from(table)
      .select("id, subcontractor_id")
      .eq("id", plantId)
      .eq("subcontractor_id", subcontractorId)
      .maybeSingle();
    if (error) continue;
    if (data) return null;
  }
  return "That plant item is not in your company register.";
}

async function syncWorkerCalendar(input: {
  workerId: string;
  workerName: string;
  projectId: string;
  projectName: string;
  startDate: string;
}): Promise<void> {
  const payload = {
    worker_id: input.workerId,
    worker_name: input.workerName,
    project_id: input.projectId,
    project_name: input.projectName,
    start_date: input.startDate,
    event_date: input.startDate,
    end_date: null,
    status: "Assigned",
    event_type: "other",
    title: input.projectName || "Project assignment",
    notes: "Subcontractor assignment — no timesheet",
    ...NO_TIMESHEET_FLAGS,
  };
  for (const table of WORKER_CALENDAR_TABLES) {
    await insertWithMissingColumnRetry(table, payload);
  }
}

async function syncPlantCalendar(input: {
  plantId: string;
  projectId: string;
  projectName: string;
  startDate: string;
}): Promise<void> {
  const payload = {
    plant_id: input.plantId,
    project_id: input.projectId,
    project_name: input.projectName,
    start_date: input.startDate,
    event_date: input.startDate,
    end_date: null,
    status: "Assigned",
    event_type: "other",
    title: input.projectName || "Project assignment",
    notes: "Subcontractor assignment — no timesheet",
    ...NO_TIMESHEET_FLAGS,
  };
  for (const table of PLANT_CALENDAR_TABLES) {
    await insertWithMissingColumnRetry(table, payload);
  }
}

async function removeFutureCalendarRows(
  tables: readonly string[],
  column: "worker_id" | "plant_id",
  id: string,
  projectId: string,
  fromDate: string
): Promise<void> {
  for (const table of tables) {
    await supabase
      .from(table)
      .delete()
      .eq(column, id)
      .eq("project_id", projectId)
      .gte("start_date", fromDate);
    await supabase
      .from(table)
      .delete()
      .eq(column, id)
      .eq("project_id", projectId)
      .gte("event_date", fromDate);
  }
}

export async function assignSubcontractorWorkerToProject(input: {
  subcontractorId: string;
  workerId: string;
  workerName: string;
  projectId: string;
  projectName: string;
}): Promise<{ error: string | null }> {
  return requestSubcontractorWorkerAssignment(input);
}

export async function assignSubcontractorPlantToProject(input: {
  subcontractorId: string;
  plantId: string;
  projectId: string;
  projectName: string;
}): Promise<{ error: string | null }> {
  return requestSubcontractorPlantAssignment(input);
}

export async function moveSubcontractorWorkerProject(input: {
  subcontractorId: string;
  workerId: string;
  workerName: string;
  fromProjectId: string;
  toProjectId: string;
  toProjectName: string;
  effectiveFrom: string;
}): Promise<{ error: string | null }> {
  const fromAccess = await assertProjectAccess(input.subcontractorId, input.fromProjectId);
  if (fromAccess) return { error: fromAccess };
  const toAccess = await assertProjectAccess(input.subcontractorId, input.toProjectId);
  if (toAccess) return { error: toAccess };
  const ownerError = await assertOwnedWorker(input.subcontractorId, input.workerId);
  if (ownerError) return { error: ownerError };

  const moved = await transferWorkerToProject({
    worker: {
      id: input.workerId,
      full_name: input.workerName,
      assigned_project_id: input.fromProjectId,
      assigned_project_ids: [input.fromProjectId],
      security_role: "general_worker",
      accounts_access_role: "disabled",
      can_access_accounts: false,
      photo_url: null,
      trade: null,
      is_revoked: false,
      is_archived: false,
    } as unknown as Worker,
    fromProjectId: input.fromProjectId,
    toProjectId: input.toProjectId,
    effectiveFrom: input.effectiveFrom,
  });
  if (moved.error) return moved;

  await removeFutureCalendarRows(
    WORKER_CALENDAR_TABLES,
    "worker_id",
    input.workerId,
    input.fromProjectId,
    input.effectiveFrom
  );
  await syncWorkerCalendar({
    workerId: input.workerId,
    workerName: input.workerName,
    projectId: input.toProjectId,
    projectName: input.toProjectName,
    startDate: input.effectiveFrom,
  });
  return { error: null };
}

export async function moveSubcontractorPlantProject(input: {
  subcontractorId: string;
  plantId: string;
  fromProjectId: string;
  toProjectId: string;
  toProjectName: string;
  effectiveFrom: string;
}): Promise<{ error: string | null }> {
  const fromAccess = await assertProjectAccess(input.subcontractorId, input.fromProjectId);
  if (fromAccess) return { error: fromAccess };
  const toAccess = await assertProjectAccess(input.subcontractorId, input.toProjectId);
  if (toAccess) return { error: toAccess };
  const ownerError = await assertOwnedPlant(input.subcontractorId, input.plantId);
  if (ownerError) return { error: ownerError };

  const moved = await transferPlantToProject({
    plant: { id: input.plantId },
    toProjectId: input.toProjectId,
    effectiveFrom: input.effectiveFrom,
  });
  if (moved.error) return moved;

  await removeFutureCalendarRows(
    PLANT_CALENDAR_TABLES,
    "plant_id",
    input.plantId,
    input.fromProjectId,
    input.effectiveFrom
  );
  await syncPlantCalendar({
    plantId: input.plantId,
    projectId: input.toProjectId,
    projectName: input.toProjectName,
    startDate: input.effectiveFrom,
  });
  return { error: null };
}

export async function removeSubcontractorWorkerFromProject(input: {
  subcontractorId: string;
  workerId: string;
  projectId: string;
}): Promise<{ error: string | null }> {
  const accessError = await assertProjectAccess(input.subcontractorId, input.projectId);
  if (accessError) return { error: accessError };
  const ownerError = await assertOwnedWorker(input.subcontractorId, input.workerId);
  if (ownerError) return { error: ownerError };

  const removed = await unassignWorkerFromProject({ id: input.workerId }, input.projectId);
  if (removed.error) return removed;

  await removeFutureCalendarRows(
    WORKER_CALENDAR_TABLES,
    "worker_id",
    input.workerId,
    input.projectId,
    formatDateOnly(new Date())
  );
  return { error: null };
}

export async function removeSubcontractorPlantFromProject(input: {
  subcontractorId: string;
  plantId: string;
  projectId: string;
}): Promise<{ error: string | null }> {
  const accessError = await assertProjectAccess(input.subcontractorId, input.projectId);
  if (accessError) return { error: accessError };
  const ownerError = await assertOwnedPlant(input.subcontractorId, input.plantId);
  if (ownerError) return { error: ownerError };

  const removed = await unassignPlantFromProject({ id: input.plantId }, input.projectId);
  if (removed.error) return removed;

  await removeFutureCalendarRows(
    PLANT_CALENDAR_TABLES,
    "plant_id",
    input.plantId,
    input.projectId,
    formatDateOnly(new Date())
  );
  return { error: null };
}
