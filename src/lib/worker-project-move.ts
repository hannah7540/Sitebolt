import type { SupabaseClient } from "@supabase/supabase-js";
import {
  addDays,
  formatDateOnly,
  startOfWeekMonday,
} from "@/lib/scheduler-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { computeWorkerStatusFromExpiries } from "@/lib/worker-utils";
import {
  processWorkerProjectReallocation,
  type WorkerProjectReallocationResult,
} from "@/lib/worker-project-reallocation";

export interface MoveWorkerToProjectInput {
  workerId: string;
  projectId: string;
  projectName: string;
  startDate: string;
  roleOnSite?: string | null;
  previousProjectId?: string | null;
}

export interface MoveWorkerToProjectResult {
  ok: boolean;
  error: string | null;
  reallocation: WorkerProjectReallocationResult | null;
}

type ScheduleRow = {
  id: string;
  worker_id: string;
  project_id: string;
  project_name: string;
  start_date: string;
  end_date: string;
  role_on_site: string | null;
  schedule_kind?: string | null;
  leave_request_id?: string | null;
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isProjectUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

async function resolveProjectIdWithAdmin(
  admin: SupabaseClient,
  projectIdOrSlug: string
): Promise<{ id: string | null; error: string | null }> {
  const value = projectIdOrSlug.trim();
  if (!value) return { id: null, error: "Project is required." };

  if (isProjectUuid(value)) {
    return { id: value, error: null };
  }

  const { data: bySlug, error: slugError } = await admin
    .from("projects")
    .select("id")
    .eq("slug", value)
    .maybeSingle();

  if (slugError) return { id: null, error: slugError.message };
  if (bySlug?.id) return { id: String(bySlug.id), error: null };

  const { data: byName, error: nameError } = await admin
    .from("projects")
    .select("id")
    .ilike("project_name", value)
    .maybeSingle();

  if (nameError) return { id: null, error: nameError.message };
  if (byName?.id) return { id: String(byName.id), error: null };

  return { id: null, error: "Project not found." };
}

function dayBefore(isoDate: string): string {
  const date = new Date(`${isoDate.slice(0, 10)}T12:00:00`);
  date.setDate(date.getDate() - 1);
  return formatDateOnly(date);
}

function endOfWeekForDate(isoDate: string): string {
  const monday = startOfWeekMonday(new Date(`${isoDate.slice(0, 10)}T12:00:00`));
  return formatDateOnly(addDays(monday, 6));
}

function scheduleOverlapsRange(
  entry: ScheduleRow,
  rangeStart: string,
  rangeEnd: string
): boolean {
  const start = formatDateOnly(entry.start_date);
  const end = formatDateOnly(entry.end_date);
  return start <= rangeEnd && end >= rangeStart;
}

function isLeaveSchedule(entry: ScheduleRow): boolean {
  return (
    entry.schedule_kind === "leave" ||
    Boolean(entry.leave_request_id?.trim())
  );
}

async function applyWorkerScheduleMove(
  admin: SupabaseClient,
  input: {
    workerId: string;
    projectId: string;
    projectName: string;
    startDate: string;
    endDate: string;
    roleOnSite?: string | null;
  }
): Promise<string | null> {
  const { data, error } = await admin
    .from("worker_schedule")
    .select(
      "id, worker_id, project_id, project_name, start_date, end_date, role_on_site, schedule_kind, leave_request_id"
    )
    .eq("worker_id", input.workerId)
    .gte("end_date", input.startDate);

  if (error) {
    if (isMissingTableError(error.message, "worker_schedule")) {
      return null;
    }
    return error.message;
  }

  const overlapping = ((data ?? []) as ScheduleRow[]).filter(
    (entry) =>
      !isLeaveSchedule(entry) &&
      scheduleOverlapsRange(entry, input.startDate, input.endDate)
  );

  for (const entry of overlapping) {
    const entryStart = formatDateOnly(entry.start_date);

    if (entryStart < input.startDate) {
      const truncatedEnd = dayBefore(input.startDate);
      const { error: updateError } = await admin
        .from("worker_schedule")
        .update({ end_date: truncatedEnd })
        .eq("id", entry.id);

      if (updateError) {
        return updateError.message;
      }
      continue;
    }

    const { error: deleteError } = await admin
      .from("worker_schedule")
      .delete()
      .eq("id", entry.id);

    if (deleteError) {
      return deleteError.message;
    }
  }

  const { error: insertError } = await admin.from("worker_schedule").insert([
    {
      worker_id: input.workerId,
      project_id: input.projectId,
      project_name: input.projectName,
      start_date: input.startDate,
      end_date: input.endDate,
      role_on_site: input.roleOnSite?.trim() || null,
    },
  ]);

  return insertError?.message ?? null;
}

async function resolveWorkerActiveStatus(
  admin: SupabaseClient,
  workerId: string
): Promise<"active" | "expired_ticket"> {
  const { data: workerRow } = await admin
    .from("workers")
    .select("drivers_licence_expiry")
    .eq("id", workerId)
    .maybeSingle();

  const { data: vocs } = await admin
    .from("worker_vocs")
    .select("expiry_date")
    .eq("worker_id", workerId);

  const status = computeWorkerStatusFromExpiries([
    workerRow?.drivers_licence_expiry,
    ...((vocs ?? []) as Array<{ expiry_date?: string | null }>).map(
      (row) => row.expiry_date
    ),
  ]);

  return status === "expired_ticket" ? "expired_ticket" : "active";
}

export async function moveWorkerToProject(
  input: MoveWorkerToProjectInput
): Promise<MoveWorkerToProjectResult> {
  const workerId = input.workerId.trim();
  const projectName = input.projectName.trim();
  const startDate = formatDateOnly(input.startDate);

  if (!workerId || !input.projectId.trim() || !projectName || !startDate) {
    return {
      ok: false,
      error: "Worker, project, and start date are required.",
      reallocation: null,
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      ok: false,
      error: "SUPABASE_SERVICE_ROLE_KEY is not configured.",
      reallocation: null,
    };
  }

  const admin = createSupabaseAdminClient();
  const { id: resolvedProjectId, error: projectError } =
    await resolveProjectIdWithAdmin(admin, input.projectId);

  if (projectError || !resolvedProjectId) {
    return {
      ok: false,
      error: projectError ?? "Project not found.",
      reallocation: null,
    };
  }

  const endDate = endOfWeekForDate(startDate);
  const scheduleError = await applyWorkerScheduleMove(admin, {
    workerId,
    projectId: resolvedProjectId,
    projectName,
    startDate,
    endDate,
    roleOnSite: input.roleOnSite,
  });

  if (scheduleError) {
    return { ok: false, error: scheduleError, reallocation: null };
  }

  const workerStatus = await resolveWorkerActiveStatus(admin, workerId);
  const { error: workerError } = await admin
    .from("workers")
    .update({
      assigned_project_id: resolvedProjectId,
      assigned_project_name: projectName,
      project_id: resolvedProjectId,
      project_name: projectName,
      status: workerStatus,
    })
    .eq("id", workerId);

  if (workerError) {
    return { ok: false, error: workerError.message, reallocation: null };
  }

  const reallocation = await processWorkerProjectReallocation({
    workerId,
    projectId: resolvedProjectId,
    projectName,
    effectiveDate: startDate,
    previousProjectId: input.previousProjectId ?? null,
  });

  return { ok: true, error: null, reallocation };
}
