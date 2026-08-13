import { supabase, isSupabaseConfigured, type Worker } from "./supabase";
import type { LeaveRequest, LeaveRequestStatus, LeaveType } from "./supabase";
import { getProjectDisplayName, resolveProjectId } from "./project-resolver";
import { formatDateOnly } from "./scheduler-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";
import { fetchWorkerProfileDisplayName } from "./worker-profile-lookup";
import { syncPendingLeaveCalendarEvent } from "./worker-calendar-events";
import { broadcastLeaveRequestsUpdated } from "./leave-events";
import type { WorkerCalendarEvent } from "./worker-calendar-events";
import { WORKER_CALENDAR_EVENTS_TABLE } from "./supabase-schema-cache";
import { resolveLeaveCalendarPresentation } from "./leave-type-calendar";
import {
  formatLeaveTimesheetApprovalToast,
  generateTimesheetsForApprovedLeave,
} from "./leave-timesheet-generator";

export const LEAVE_REQUESTS_TABLE = "leave_requests";

export type LeaveWorkerRef = Pick<
  Worker,
  "full_name" | "name" | "first_name" | "last_name" | "worker_name"
>;

export interface SubmitLeaveRequestInput {
  workerId: string;
  projectId: string;
  firstDate: string;
  lastDate: string;
  numberOfDays: number;
  reason: string;
  signatureUrl: string | null;
  leaveType?: LeaveType | string | null;
  workerName?: string;
  worker?: LeaveWorkerRef | null;
}

export function resolveWorkerName(
  worker?: LeaveWorkerRef | null,
  explicitName?: string | null
): string {
  const fromExplicit = explicitName?.trim();
  if (fromExplicit) return fromExplicit;

  const fromFirstLast = `${worker?.first_name || ""} ${worker?.last_name || ""}`.trim();
  if (fromFirstLast) return fromFirstLast;

  return (
    worker?.full_name?.trim() ||
    worker?.name?.trim() ||
    worker?.worker_name?.trim() ||
    "Worker"
  );
}

/** Postgres-safe leave_type values allowed by leave_requests_leave_type_check. */
export const ALLOWED_LEAVE_TYPES = [
  "Sick Leave",
  "Personal Leave",
  "Carers Leave",
  "Annual Leave",
  "Leave",
  "Leave without pay",
  "RDO",
  "Flexi RDO",
  "Public Holiday",
  "Sick",
] as const;

/** Dropdown options for leave request forms and filters. */
export const LEAVE_TYPE_FORM_OPTIONS = [
  "Annual Leave",
  "Personal Leave",
  "Carers Leave",
  "Sick Leave",
  "RDO",
  "Flexi RDO",
  "Leave without pay",
  "Public Holiday",
] as const;

export type SanitizedLeaveType = (typeof ALLOWED_LEAVE_TYPES)[number];

/**
 * Map UI / modal labels to values that satisfy leave_requests_leave_type_check.
 */
export function sanitizeLeaveType(leaveType?: string | null): SanitizedLeaveType {
  const raw = String(leaveType ?? "Annual Leave")
    .trim()
    .toLowerCase()
    .replace(/\s+/g, " ");

  if (!raw) return "Annual Leave";

  if (raw.includes("sick")) return "Sick Leave";
  if (raw.includes("carer")) return "Carers Leave";
  if (raw.includes("personal")) return "Personal Leave";
  if (raw.includes("public holiday") || (raw.includes("public") && raw.includes("holiday"))) {
    return "Public Holiday";
  }
  if (raw.includes("annual") || (raw.includes("holiday") && !raw.includes("public"))) {
    return "Annual Leave";
  }
  if (raw === "leave") return "Leave";
  if (raw.includes("without pay") || raw.includes("unpaid")) return "Leave without pay";
  if (raw.includes("flexi") && raw.includes("rdo")) return "Flexi RDO";
  if (raw === "rdo") return "RDO";

  if (raw === "sick leave") return "Sick Leave";
  if (raw === "personal leave") return "Personal Leave";
  if (raw === "carers leave") return "Carers Leave";
  if (raw === "personal/carers leave") return "Personal Leave";

  return "Annual Leave";
}

function buildDayCountFields(daysCount: number) {
  return {
    total_days: daysCount,
    number_of_days: daysCount,
    days: daysCount,
    duration_days: daysCount,
  };
}

function stripNullishFields(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) {
      next[key] = value;
    }
  }
  return next;
}

function sanitizeOptionalText(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function omitFields(
  row: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const next = { ...row };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

function normalizeLeaveStatus(value: unknown): LeaveRequestStatus {
  const status = String(value ?? "pending").trim().toLowerCase();
  if (status === "approved") return "approved";
  if (status === "declined" || status === "rejected") return "declined";
  return "pending";
}

/** Normalize DB row — accepts either first_date or start_date naming. */
export function normalizeLeaveRequestRow(
  row: Record<string, unknown>
): LeaveRequest {
  const firstDate = formatDateOnly(
    (row.first_date as string | undefined) ?? (row.start_date as string | undefined)
  );
  const lastDate = formatDateOnly(
    (row.last_date as string | undefined) ?? (row.end_date as string | undefined)
  );
  const reason = String(row.reason ?? row.notes ?? "").trim();
  const totalDays = Number(
    row.number_of_days ?? row.total_days ?? row.days ?? row.duration_days ?? 0
  );

  return {
    id: String(row.id ?? ""),
    worker_id: String(row.worker_id ?? ""),
    worker_name: row.worker_name ? String(row.worker_name) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    first_date: firstDate,
    last_date: lastDate,
    number_of_days: totalDays,
    reason,
    signature_url: row.signature_url ? String(row.signature_url) : null,
    status: normalizeLeaveStatus(row.status),
    leave_type: row.leave_type ? (String(row.leave_type) as LeaveType) : null,
    schedule_entry_id: row.schedule_entry_id ? String(row.schedule_entry_id) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

export function getLeaveStartDate(
  row: Pick<LeaveRequest, "first_date"> | Record<string, unknown>
): string {
  if ("first_date" in row && row.first_date) {
    return formatDateOnly(row.first_date as string);
  }
  return formatDateOnly((row as Record<string, unknown>).start_date as string);
}

export function getLeaveEndDate(
  row: Pick<LeaveRequest, "last_date"> | Record<string, unknown>
): string {
  if ("last_date" in row && row.last_date) {
    return formatDateOnly(row.last_date as string);
  }
  return formatDateOnly((row as Record<string, unknown>).end_date as string);
}

export function getLeaveReason(
  row: Pick<LeaveRequest, "reason"> | Record<string, unknown>
): string {
  if ("reason" in row && row.reason) {
    return String(row.reason).trim();
  }
  return String((row as Record<string, unknown>).notes ?? "").trim();
}

function buildDualDateLeavePayload(
  input: SubmitLeaveRequestInput & { projectId: string; workerName: string }
) {
  const startDateStr = formatDateOnly(input.firstDate);
  const endDateStr = formatDateOnly(input.lastDate);
  const reasonText = input.reason.trim() || "";
  const calculatedDays = input.numberOfDays > 0 ? input.numberOfDays : 1;
  const leaveType = sanitizeLeaveType(input.leaveType);

  const projectId = sanitizeOptionalText(input.projectId);
  const projectName = sanitizeOptionalText(getProjectDisplayName(input.projectId));

  return stripNullishFields({
    worker_id: input.workerId,
    worker_name: input.workerName,
    project_id: projectId,
    project_name: projectName,
    leave_type: leaveType,
    start_date: startDateStr,
    first_date: startDateStr,
    end_date: endDateStr,
    last_date: endDateStr,
    ...buildDayCountFields(calculatedDays),
    reason: reasonText,
    notes: reasonText,
    signature_url: input.signatureUrl,
    status: "pending",
  });
}

function buildMinimalSafeLeavePayload(payload: Record<string, unknown>) {
  return stripNullishFields({
    worker_id: payload.worker_id,
    worker_name: payload.worker_name || "Worker",
    start_date: payload.start_date,
    end_date: payload.end_date,
    leave_type: sanitizeLeaveType(payload.leave_type as string | null | undefined),
    status: "pending",
  });
}

async function insertLeaveRequestRow(
  payload: Record<string, unknown>
): Promise<{ data: LeaveRequest | null; error: SupabaseRequestError | null }> {
  try {
    const { data, error } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .insert([payload])
      .select("*")
      .single();

    if (!error) {
      return {
        data: normalizeLeaveRequestRow(data as Record<string, unknown>),
        error: null,
      };
    }

    return { data: null, error: toSupabaseRequestError(error) };
  } catch (error) {
    console.error(
      "Error saving leave request (exception):",
      JSON.stringify(error, null, 2),
      error
    );
    const message = error instanceof Error ? error.message : "Unknown insert error";
    return {
      data: null,
      error: { message, code: "", details: "", hint: "" },
    };
  }
}

/**
 * Resilient insert — full alias payload, strip optional project fields, then minimal safe fallback.
 */
export async function insertLeaveRequestResilient(
  input: SubmitLeaveRequestInput & { projectId: string; workerName: string }
): Promise<{ error: string | null; data: LeaveRequest | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", data: null };
  }

  const fullPayload = buildDualDateLeavePayload(input);
  const withoutProjectPayload = omitFields(fullPayload, ["project_id", "project_name"]);
  const minimalPayload = buildMinimalSafeLeavePayload(fullPayload);

  const attempts: Record<string, unknown>[] = [
    fullPayload,
    withoutProjectPayload,
    minimalPayload,
  ];

  let lastError: SupabaseRequestError | null = null;

  for (const payload of attempts) {
    const result = await insertLeaveRequestRow(payload);
    if (result.data) {
      return { error: null, data: result.data };
    }

    lastError = result.error;
    console.error(
      "Error saving leave request:",
      JSON.stringify(result.error, null, 2),
      result.error
    );

    if (!isSupabaseSchemaOrConstraintError(result.error)) {
      break;
    }
  }

  return {
    error: lastError?.message ?? "Failed to save leave request.",
    data: null,
  };
}

async function resolveWorkerNameForSubmit(
  input: SubmitLeaveRequestInput
): Promise<string> {
  const fromInput = resolveWorkerName(input.worker, input.workerName);
  if (fromInput !== "Worker") return fromInput;

  try {
    const resolvedName = await fetchWorkerProfileDisplayName(
      input.workerId,
      "Worker"
    );
    if (resolvedName !== "Unknown Worker") {
      return resolvedName;
    }
  } catch (error) {
    console.warn("[leave-requests] Worker name lookup failed:", error);
  }

  return "Worker";
}

async function syncCalendarForLeaveRequest(input: {
  leaveRequest: LeaveRequest;
  workerId: string;
  workerName: string;
  projectId: string;
  startDate: string;
  endDate: string;
  notes: string;
}): Promise<void> {
  try {
    await syncPendingLeaveCalendarEvent({
      leaveRequestId: input.leaveRequest.id,
      workerId: input.workerId,
      workerName: input.workerName,
      projectId: input.projectId,
      projectName: getProjectDisplayName(input.projectId) ?? "Project",
      startDate: input.startDate,
      endDate: input.endDate,
      notes: input.notes,
      leaveType: input.leaveRequest.leave_type,
    });
  } catch (syncError) {
    console.warn("[leave-requests] Calendar sync failed (non-blocking):", syncError);
  }
}

function isProjectUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(
    value.trim()
  );
}

/** Submit a worker leave request and sync the pending calendar badge. */
export async function submitLeaveRequest(
  input: SubmitLeaveRequestInput
): Promise<{ error: string | null; data: LeaveRequest | null }> {
  if (!input.reason.trim()) {
    return { error: "Please provide a reason for leave.", data: null };
  }
  if (input.numberOfDays <= 0) {
    return { error: "Last date must be on or after the first date.", data: null };
  }
  if (!input.signatureUrl) {
    return { error: "Please sign your leave request.", data: null };
  }

  let projectId = input.projectId;
  if (!isProjectUuid(projectId)) {
    const { id, error: projectError } = await resolveProjectId(projectId);
    if (projectError || !id) {
      return { error: projectError ?? "Invalid project.", data: null };
    }
    projectId = id;
  }

  const workerName = await resolveWorkerNameForSubmit(input);

  const insertResult = await insertLeaveRequestResilient({
    ...input,
    projectId,
    workerName,
  });

  if (insertResult.error || !insertResult.data) {
    return insertResult;
  }

  const leaveRow = insertResult.data;
  const startDate = getLeaveStartDate(leaveRow);
  const endDate = getLeaveEndDate(leaveRow);
  const notes = getLeaveReason(leaveRow);

  try {
    await syncCalendarForLeaveRequest({
      leaveRequest: leaveRow,
      workerId: input.workerId,
      workerName,
      projectId,
      startDate,
      endDate,
      notes,
    });
  } catch (syncError) {
    console.warn(
      "[leave-requests] Calendar sync failed after submit (non-blocking):",
      syncError
    );
  }

  return { error: null, data: leaveRow };
}

/** @alias submitLeaveRequest */
export const insertLeaveRequest = submitLeaveRequest;

export async function fetchLeaveRequestsNormalized(options?: {
  workerId?: string;
  projectId?: string;
  status?: LeaveRequestStatus;
}): Promise<LeaveRequest[]> {
  if (!isSupabaseConfigured()) return [];

  let query = supabase.from(LEAVE_REQUESTS_TABLE).select("*").order("created_at", {
    ascending: false,
  });

  if (options?.workerId) {
    query = query.eq("worker_id", options.workerId);
  }
  if (options?.status) {
    query = query.eq("status", options.status);
  }
  if (options?.projectId) {
    query = query.eq("project_id", options.projectId);
  }

  const { data, error } = await query;

  if (error) {
    if (!error.message.toLowerCase().includes("leave_requests")) {
      console.error("Failed to fetch leave requests:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) =>
    normalizeLeaveRequestRow(row as Record<string, unknown>)
  );
}

export function isLeaveRequestPending(status: unknown): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === "pending";
}

export function isLeaveRequestApproved(status: unknown): boolean {
  return String(status ?? "")
    .trim()
    .toLowerCase() === "approved";
}

export async function fetchLeaveRequestById(
  leaveRequestId: string
): Promise<LeaveRequest | null> {
  if (!isSupabaseConfigured()) return null;

  const { data, error } = await supabase
    .from(LEAVE_REQUESTS_TABLE)
    .select("*")
    .eq("id", leaveRequestId)
    .maybeSingle();

  if (error || !data) return null;
  return normalizeLeaveRequestRow(data as Record<string, unknown>);
}

export async function fetchPendingLeaveRequests(options?: {
  workerId?: string;
  projectId?: string;
}): Promise<LeaveRequest[]> {
  if (!isSupabaseConfigured()) return [];

  let query = supabase
    .from(LEAVE_REQUESTS_TABLE)
    .select("*")
    .order("created_at", { ascending: false });

  if (options?.workerId) {
    query = query.eq("worker_id", options.workerId);
  }

  if (options?.projectId) {
    query = query.or(`project_id.eq.${options.projectId},project_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch pending leave requests:", error.message);
    return [];
  }

  return (data ?? [])
    .map((row) => normalizeLeaveRequestRow(row as Record<string, unknown>))
    .filter((row) => isLeaveRequestPending(row.status));
}

/** All leave requests for a project dashboard (includes unscoped project_id rows). */
export async function fetchProjectLeaveRequests(projectId: string): Promise<LeaveRequest[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from(LEAVE_REQUESTS_TABLE)
    .select("*")
    .or(`project_id.eq.${projectId},project_id.is.null`)
    .order("created_at", { ascending: false });

  if (error) {
    console.error("Failed to fetch project leave requests:", error.message);
    return [];
  }

  return (data ?? []).map((row) =>
    normalizeLeaveRequestRow(row as Record<string, unknown>)
  );
}

/** Pending + approved leave requests overlapping a calendar date range. */
export async function fetchLeaveRequestsForCalendarRange(
  startDate: string,
  endDate: string,
  options?: { projectId?: string }
): Promise<LeaveRequest[]> {
  if (!isSupabaseConfigured()) return [];

  let query = supabase.from(LEAVE_REQUESTS_TABLE).select("*");

  if (options?.projectId) {
    query = query.or(`project_id.eq.${options.projectId},project_id.is.null`);
  }

  const { data, error } = await query;

  if (error) {
    console.error("Failed to fetch calendar leave requests:", error.message);
    return [];
  }

  const rangeStart = formatDateOnly(startDate);
  const rangeEnd = formatDateOnly(endDate);

  return (data ?? [])
    .map((row) => normalizeLeaveRequestRow(row as Record<string, unknown>))
    .filter((row) => {
      if (!isLeaveRequestPending(row.status) && !isLeaveRequestApproved(row.status)) {
        return false;
      }
      const leaveStart = getLeaveStartDate(row);
      const leaveEnd = getLeaveEndDate(row);
      return leaveStart <= rangeEnd && leaveEnd >= rangeStart;
    });
}

const PENDING_STATUS_VARIANTS = ["pending", "Pending"];
const APPROVED_STATUS_VALUES = ["approved", "Approved"];
const REJECTED_STATUS_VALUES = ["declined", "Declined", "rejected", "Rejected"];

async function updateLeaveRequestStatusResilient(
  leaveRequestId: string,
  statusValues: string[],
  extraFields: Record<string, unknown> = {}
): Promise<{ error: string | null }> {
  let lastError: SupabaseRequestError | null = null;

  for (const statusValue of statusValues) {
    const payload = {
      ...extraFields,
      status: statusValue,
      updated_at: new Date().toISOString(),
    };

    for (const pendingStatus of PENDING_STATUS_VARIANTS) {
      const { error } = await supabase
        .from(LEAVE_REQUESTS_TABLE)
        .update(payload)
        .eq("id", leaveRequestId)
        .eq("status", pendingStatus);

      if (!error) return { error: null };
      lastError = toSupabaseRequestError(error);
    }

    const { error: openUpdateError } = await supabase
      .from(LEAVE_REQUESTS_TABLE)
      .update(payload)
      .eq("id", leaveRequestId);

    if (!openUpdateError) return { error: null };
    lastError = toSupabaseRequestError(openUpdateError);
  }

  return { error: lastError?.message ?? "Failed to update leave request status." };
}

async function updateLeaveRequestStatusDirect(
  requestId: string,
  statusValues: string[]
): Promise<{ error: string | null }> {
  let lastError: SupabaseRequestError | null = null;

  for (const status of statusValues) {
    for (const payload of [
      { status },
      { status, updated_at: new Date().toISOString() },
    ]) {
      const { error } = await supabase
        .from(LEAVE_REQUESTS_TABLE)
        .update(payload)
        .eq("id", requestId);

      if (!error) return { error: null };

      lastError = toSupabaseRequestError(error);
      if (isSupabaseMissingColumnError(error) && "updated_at" in payload) {
        continue;
      }
      if (!isSupabaseSchemaOrConstraintError(error)) {
        console.error("Error updating leave request status:", error);
      }
    }
  }

  return { error: lastError?.message ?? "Failed to update leave request status." };
}

async function upsertApprovedLeaveCalendarEventDirect(input: {
  requestId: string;
  workerId: string;
  startDate: string;
  endDate: string;
  leaveType?: string | null;
}): Promise<void> {
  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);
  const presentation = resolveLeaveCalendarPresentation({
    leaveType: input.leaveType,
    status: "approved",
  });

  const fullPayload = stripNullishFields({
    worker_id: input.workerId,
    event_type: presentation.event_type,
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    leave_status: presentation.leave_status,
    leave_kind: presentation.leave_kind,
    start_date: startDate,
    end_date: endDate,
    is_full_day: true,
    leave_request_id: input.requestId,
  });

  const withoutOptionalColumns = omitFields(fullPayload, [
    "leave_request_id",
    "leave_status",
    "leave_kind",
  ]);

  const corePayload = stripNullishFields({
    worker_id: input.workerId,
    event_type: presentation.event_type,
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    start_date: startDate,
    end_date: endDate,
    is_full_day: true,
  });

  const minimalPayload = stripNullishFields({
    worker_id: input.workerId,
    event_type: presentation.event_type === "RDO" ? "RDO" : "Leave",
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    start_date: startDate,
    end_date: endDate,
    is_full_day: true,
  });

  const updatePayloads = [fullPayload, withoutOptionalColumns, corePayload, minimalPayload];

  try {
    const { data: byRequestRows, error: byRequestError } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .select("id")
      .eq("leave_request_id", input.requestId);

    if (!byRequestError && (byRequestRows?.length ?? 0) > 0) {
      for (const payload of updatePayloads) {
        const { error } = await supabase
          .from(WORKER_CALENDAR_EVENTS_TABLE)
          .update(payload)
          .eq("leave_request_id", input.requestId);

        if (!error) return;
        if (!isSupabaseMissingColumnError(error)) {
          console.warn("[leave-requests] Approved calendar update by leave_request_id failed:", error.message);
        }
      }
    }
  } catch {
    // leave_request_id column may be missing — fall through to worker/date matching
  }

  for (const payload of updatePayloads) {
    const { data, error } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .update(payload)
      .eq("worker_id", input.workerId)
      .eq("start_date", startDate)
      .eq("end_date", endDate)
      .select("id");

    if (!error && (data?.length ?? 0) > 0) return;
    if (error && !isSupabaseMissingColumnError(error)) {
      console.warn("[leave-requests] Approved calendar update by worker/date failed:", error.message);
    }
  }

  for (const payload of updatePayloads) {
    const { error } = await supabase.from(WORKER_CALENDAR_EVENTS_TABLE).insert([payload]);
    if (!error) return;
    if (!isSupabaseMissingColumnError(error)) {
      console.warn("[leave-requests] Approved calendar insert failed:", error.message);
      return;
    }
  }
}

async function deleteLeaveCalendarEventDirect(input: {
  requestId: string;
  workerId: string;
  startDate: string;
  endDate: string;
}): Promise<void> {
  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);

  let deletedByRequestId = false;

  try {
    const { data, error } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .delete()
      .eq("leave_request_id", input.requestId)
      .select("id");

    if (!error && (data?.length ?? 0) > 0) {
      deletedByRequestId = true;
    } else if (error && !isSupabaseMissingColumnError(error)) {
      console.warn(
        "[leave-requests] leave_request_id delete skipped:",
        error.message
      );
    }
  } catch {
    // Column missing or transient failure — use worker/date fallback below
  }

  if (deletedByRequestId) return;

  try {
    const { error: byRangeError } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .delete()
      .eq("worker_id", input.workerId)
      .gte("start_date", startDate)
      .lte("end_date", endDate)
      .in("event_type", ["Holiday Pending", "Holiday Approved", "Leave", "RDO"]);

    if (byRangeError && !isSupabaseMissingColumnError(byRangeError)) {
      console.warn("[leave-requests] Calendar delete by worker/date failed:", byRangeError.message);
    }
  } catch {
    // Best-effort cleanup only
  }
}

export interface LeaveApprovalResult {
  error: string | null;
  timesheetsGenerated?: number;
  toastMessage?: string | null;
}

/** Direct approve — update leave_requests + upsert calendar badge + leave timesheets. */
export async function approveLeaveRequestAction(input: {
  requestId: string;
  workerId: string;
  startDate: string;
  endDate: string;
}): Promise<LeaveApprovalResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  try {
    const statusUpdate = await updateLeaveRequestStatusDirect(
      input.requestId,
      APPROVED_STATUS_VALUES
    );

    if (statusUpdate.error) {
      return statusUpdate;
    }

    const row = await fetchLeaveRequestById(input.requestId);

    await upsertApprovedLeaveCalendarEventDirect({
      ...input,
      leaveType: row?.leave_type,
    });

    const timesheetResult = await generateTimesheetsForApprovedLeave({
      leaveRequestId: input.requestId,
      workerId: input.workerId,
      startDate: input.startDate,
      endDate: input.endDate,
      leaveType: row?.leave_type,
      projectId: row?.project_id,
    });

    if (timesheetResult.error) {
      console.warn(
        "[leave-requests] Auto timesheet generation failed (non-blocking):",
        timesheetResult.error
      );
    }

    broadcastLeaveRequestsUpdated();
    return {
      error: null,
      timesheetsGenerated: timesheetResult.generated,
      toastMessage: formatLeaveTimesheetApprovalToast(
        timesheetResult.generated,
        row?.leave_type
      ),
    };
  } catch (err) {
    console.error("Approve failed:", err);
    return { error: err instanceof Error ? err.message : "Approve failed." };
  }
}

/** Direct reject — update leave_requests + remove calendar badge. */
export async function rejectLeaveRequestAction(input: {
  requestId: string;
  workerId: string;
  startDate: string;
  endDate: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  try {
    const statusUpdate = await updateLeaveRequestStatusDirect(
      input.requestId,
      REJECTED_STATUS_VALUES
    );

    if (statusUpdate.error) {
      return statusUpdate;
    }

    await deleteLeaveCalendarEventDirect(input);
    broadcastLeaveRequestsUpdated();
    return { error: null };
  } catch (err) {
    console.error("Reject failed:", err);
    return { error: err instanceof Error ? err.message : "Reject failed." };
  }
}

export async function approveLeaveRequestWorkflow(input: {
  leaveRequestId: string;
  leaveType?: LeaveType | string | null;
}): Promise<LeaveApprovalResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const row = await fetchLeaveRequestById(input.leaveRequestId);
  if (!row) return { error: "Leave request not found." };
  if (!isLeaveRequestPending(row.status)) {
    return { error: "This leave request has already been reviewed." };
  }

  const result = await approveLeaveRequestAction({
    requestId: row.id,
    workerId: row.worker_id,
    startDate: getLeaveStartDate(row),
    endDate: getLeaveEndDate(row),
  });

  if (result.error) return result;

  const leaveType = sanitizeLeaveType(input.leaveType ?? row.leave_type ?? "Annual Leave");
  const projectId = row.project_id?.trim() || null;

  if (projectId) {
    const projectName = getProjectDisplayName(projectId) ?? "Project";
    const leaveStartDate = getLeaveStartDate(row);
    const leaveEndDate = getLeaveEndDate(row);

    const { error: scheduleError } = await supabase.from("worker_schedule").insert([
      {
        worker_id: row.worker_id,
        project_id: projectId,
        project_name: projectName,
        start_date: leaveStartDate,
        end_date: leaveEndDate,
        role_on_site: leaveType,
        schedule_kind: "leave",
        leave_request_id: row.id,
      },
    ]);

    if (scheduleError) {
      console.warn(
        "[leave-requests] Optional schedule insert failed during approval:",
        scheduleError.message
      );
    }
  }

  return {
    error: null,
    timesheetsGenerated: result.timesheetsGenerated,
    toastMessage: result.toastMessage,
  };
}

export async function rejectLeaveRequestWorkflow(
  leaveRequestId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const row = await fetchLeaveRequestById(leaveRequestId);
  if (!row) return { error: "Leave request not found." };
  if (!isLeaveRequestPending(row.status)) {
    return { error: "This leave request has already been reviewed." };
  }

  return rejectLeaveRequestAction({
    requestId: row.id,
    workerId: row.worker_id,
    startDate: getLeaveStartDate(row),
    endDate: getLeaveEndDate(row),
  });
}

export function leaveRequestToCalendarEvent(
  request: LeaveRequest,
  workerName?: string | null
): WorkerCalendarEvent {
  const pending = isLeaveRequestPending(request.status);
  const approved = isLeaveRequestApproved(request.status);
  const presentation = resolveLeaveCalendarPresentation({
    leaveType: request.leave_type,
    status: pending ? "pending" : "approved",
  });

  return {
    id: `leave-request-${request.id}`,
    worker_id: request.worker_id,
    worker_name: workerName ?? null,
    project_id: request.project_id,
    project_name: request.project_id
      ? getProjectDisplayName(request.project_id)
      : null,
    event_type: pending
      ? presentation.event_type
      : approved
        ? presentation.event_type
        : "Leave",
    start_date: getLeaveStartDate(request),
    end_date: getLeaveEndDate(request),
    is_full_day: true,
    start_time: null,
    end_time: null,
    notes: getLeaveReason(request) || null,
    trade: null,
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    leave_kind: presentation.leave_kind,
    leave_status: pending ? "Pending" : approved ? "Approved" : null,
    leave_request_id: request.id,
  };
}

export function mergeLeaveRequestsIntoCalendarEvents(
  calendarEvents: WorkerCalendarEvent[],
  leaveRequests: LeaveRequest[],
  workerNameById?: Map<string, string>
): WorkerCalendarEvent[] {
  const leaveRequestById = new Map(leaveRequests.map((row) => [row.id, row]));
  const seenLeaveRequestIds = new Set<string>();

  const merged = calendarEvents.map((event) => {
    if (!event.leave_request_id) return event;
    const request = leaveRequestById.get(event.leave_request_id);
    if (!request) return event;
    seenLeaveRequestIds.add(request.id);
    return leaveRequestToCalendarEvent(
      request,
      event.worker_name ?? workerNameById?.get(request.worker_id)
    );
  });

  for (const request of leaveRequests) {
    if (seenLeaveRequestIds.has(request.id)) continue;
    if (!isLeaveRequestPending(request.status) && !isLeaveRequestApproved(request.status)) {
      continue;
    }
    merged.push(
      leaveRequestToCalendarEvent(
        request,
        workerNameById?.get(request.worker_id) ?? null
      )
    );
  }

  return merged;
}
