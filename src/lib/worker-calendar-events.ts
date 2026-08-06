import { supabase, isSupabaseConfigured, type Worker } from "./supabase";
import { getWorkerDisplayName } from "./worker-utils";
import { resolveProjectId, getProjectDisplayName, getCachedProjects } from "./project-resolver";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";
import {
  warmSupabaseSchemaCache,
  WORKER_CALENDAR_EVENTS_TABLE,
} from "./supabase-schema-cache";
import { formatDateOnly } from "./scheduler-utils";
import {
  type CalendarLeaveKind,
  getLeaveTypeOption,
  HOLIDAY_APPROVED_STYLE,
  HOLIDAY_PENDING_STYLE,
  RDO_EVENT_STYLE,
} from "./calendar-event-styles";
import { normalizeLeaveTypeLabel, resolveLeaveCalendarPresentation } from "./leave-type-calendar";

export type WorkerCalendarEventType =
  | "RDO"
  | "Leave"
  | "Holiday Pending"
  | "Holiday Approved";

export type LeaveCalendarStatus = "Pending" | "Approved" | "Rejected";

export interface WorkerCalendarEvent {
  id: string;
  worker_id: string;
  worker_name: string | null;
  project_id: string | null;
  project_name: string | null;
  event_type: WorkerCalendarEventType;
  start_date: string;
  end_date: string;
  is_full_day: boolean;
  start_time: string | null;
  end_time: string | null;
  notes: string | null;
  trade: string | null;
  display_code: string | null;
  bg_color: string | null;
  text_color: string | null;
  leave_kind: CalendarLeaveKind | null;
  leave_status: LeaveCalendarStatus | null;
  leave_request_id: string | null;
  created_at?: string;
}

export function isLeaveCalendarEvent(event: WorkerCalendarEvent): boolean {
  return (
    event.event_type === "Leave" ||
    event.event_type === "Holiday Pending" ||
    event.event_type === "Holiday Approved"
  );
}

function normalizeEventType(value: unknown): WorkerCalendarEventType {
  const raw = String(value ?? "").trim();
  if (raw === "Holiday Pending") return "Holiday Pending";
  if (raw === "Holiday Approved") return "Holiday Approved";
  if (raw === "Leave") return "Leave";
  return "RDO";
}

function normalizeLeaveStatus(value: unknown): LeaveCalendarStatus | null {
  const status = String(value ?? "").trim();
  if (status === "Pending" || status === "Approved" || status === "Rejected") {
    return status;
  }
  return null;
}

function normalizeLeaveKind(value: unknown): CalendarLeaveKind | null {
  const kind = String(value ?? "").trim();
  if (
    kind === "sick" ||
    kind === "personal" ||
    kind === "carers" ||
    kind === "holiday_pending" ||
    kind === "holiday_approved" ||
    kind === "public_holiday" ||
    kind === "rdo" ||
    kind === "flexi_rdo" ||
    kind === "leave_without_pay" ||
    kind === "other"
  ) {
    return kind;
  }
  return null;
}

function normalizeEvent(row: Record<string, unknown>): WorkerCalendarEvent {
  const eventType = normalizeEventType(row.event_type);
  const leaveKind = normalizeLeaveKind(row.leave_kind);

  return {
    id: String(row.id ?? ""),
    worker_id: String(row.worker_id ?? ""),
    worker_name: row.worker_name ? String(row.worker_name) : null,
    project_id: row.project_id ? String(row.project_id) : null,
    project_name: row.project_name ? String(row.project_name) : null,
    event_type: eventType,
    start_date: formatDateOnly(row.start_date as string),
    end_date: formatDateOnly(row.end_date as string),
    is_full_day: row.is_full_day !== false,
    start_time: row.start_time ? String(row.start_time).slice(0, 5) : null,
    end_time: row.end_time ? String(row.end_time).slice(0, 5) : null,
    notes: row.notes ? String(row.notes) : null,
    trade: row.trade ? String(row.trade) : null,
    display_code: row.display_code ? String(row.display_code) : null,
    bg_color: row.bg_color ? String(row.bg_color) : null,
    text_color: row.text_color ? String(row.text_color) : null,
    leave_kind: leaveKind,
    leave_status: normalizeLeaveStatus(row.leave_status),
    leave_request_id: row.leave_request_id ? String(row.leave_request_id) : null,
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

function buildRdoRow(
  worker: Worker,
  input: {
    startDate: string;
    endDate: string;
    isFullDay: boolean;
    startTime?: string | null;
    endTime?: string | null;
    projectId: string;
    projectName: string;
    notes?: string | null;
  }
) {
  return {
    worker_id: String(worker.id).trim(),
    worker_name: getWorkerDisplayName(worker),
    project_id: input.projectId,
    project_name: input.projectName,
    event_type: "RDO" as const,
    start_date: input.startDate,
    end_date: input.endDate,
    is_full_day: input.isFullDay,
    start_time: input.isFullDay ? null : input.startTime ?? null,
    end_time: input.isFullDay ? null : input.endTime ?? null,
    notes: input.notes?.trim() || null,
    trade: worker.trade?.trim() || null,
    display_code: RDO_EVENT_STYLE.displayCode,
    bg_color: RDO_EVENT_STYLE.bgColor,
    text_color: RDO_EVENT_STYLE.textColor,
    leave_kind: null,
    leave_request_id: null,
  };
}

function buildLeaveRow(
  worker: Worker,
  input: {
    startDate: string;
    endDate: string;
    projectId?: string | null;
    projectName?: string | null;
    notes?: string | null;
    leaveKind: CalendarLeaveKind;
    leaveRequestId?: string | null;
  }
) {
  const preset =
    input.leaveKind === "holiday_pending"
      ? HOLIDAY_PENDING_STYLE
      : getLeaveTypeOption(input.leaveKind);

  return {
    worker_id: String(worker.id).trim(),
    worker_name: getWorkerDisplayName(worker),
    project_id: input.projectId ?? null,
    project_name: input.projectName ?? null,
    event_type: "Leave" as const,
    start_date: input.startDate,
    end_date: input.endDate,
    is_full_day: true,
    start_time: null,
    end_time: null,
    notes: input.notes?.trim() || null,
    trade: worker.trade?.trim() || null,
    display_code: preset.displayCode,
    bg_color: preset.bgColor,
    text_color: preset.textColor,
    leave_kind: input.leaveKind,
    leave_request_id: input.leaveRequestId ?? null,
  };
}

function warnCalendarTableFallback(operation: string, error: unknown): void {
  console.warn(
    `[worker-calendar] ${operation}: worker_calendar_events unavailable; using empty fallback. Run migrations 051 and 052 in Supabase.`,
    error
  );
}

export async function primeWorkerCalendarEventsSchema(): Promise<void> {
  if (!isSupabaseConfigured()) return;
  try {
    await warmSupabaseSchemaCache(supabase);
  } catch (error) {
    warnCalendarTableFallback("primeWorkerCalendarEventsSchema", error);
  }
}

export async function fetchWorkerCalendarEvents(
  startDate: string,
  endDate: string
): Promise<WorkerCalendarEvent[]> {
  if (!isSupabaseConfigured()) return [];

  const viewStartDate = formatDateOnly(startDate);
  const viewEndDate = formatDateOnly(endDate);
  if (!viewStartDate || !viewEndDate) return [];

  try {
    await primeWorkerCalendarEventsSchema();

    const { data, error } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .select("*")
      .order("start_date");

    console.log(">>> ALL CALENDAR EVENTS:", data);

    if (error) {
      warnCalendarTableFallback("fetchWorkerCalendarEvents", error);
      return [];
    }

    return (data ?? [])
      .map((row) => normalizeEvent(row as Record<string, unknown>))
      .filter((event) => {
        const startDateStr = formatDateOnly(event.start_date);
        const endDateStr = formatDateOnly(event.end_date);
        return startDateStr <= viewEndDate && endDateStr >= viewStartDate;
      });
  } catch (error) {
    warnCalendarTableFallback("fetchWorkerCalendarEvents", error);
    return [];
  }
}

export interface BulkRdoInput {
  startDate: string;
  endDate: string;
  isFullDay: boolean;
  startTime?: string | null;
  endTime?: string | null;
  projectId: string;
  projectName: string;
  workers: Worker[];
  notes?: string | null;
}

export interface BulkRdoInsertResult {
  error: string | null;
  created: number;
  unavailable?: boolean;
  data?: WorkerCalendarEvent[];
}

export async function insertBulkRdoEvents(
  input: BulkRdoInput
): Promise<BulkRdoInsertResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", created: 0 };
  }

  if (input.workers.length === 0) {
    return { error: "Select at least one worker.", created: 0 };
  }

  const validWorkers = input.workers.filter((worker) => isValidWorkerUuid(worker?.id));
  if (validWorkers.length === 0) {
    return { error: "Select at least one worker with a valid ID.", created: 0 };
  }

  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    return { error: "Start date must be on or before end date.", created: 0 };
  }

  let resolvedProjectId: string | null = input.projectId;
  if (input.projectId) {
    const resolved = await resolveProjectId(input.projectId);
    if (resolved.error) {
      return { error: resolved.error, created: 0 };
    }
    resolvedProjectId = resolved.id ?? input.projectId;
  }

  await primeWorkerCalendarEventsSchema();

  const rows = validWorkers.map((worker) =>
    buildRdoRow(worker, {
      startDate,
      endDate,
      isFullDay: input.isFullDay,
      startTime: input.startTime,
      endTime: input.endTime,
      projectId: resolvedProjectId ?? input.projectId,
      projectName: input.projectName,
      notes: input.notes,
    })
  );

  return insertCalendarEventRows(rows, "insertBulkRdoEvents");
}

export interface BulkLeaveInput {
  startDate: string;
  endDate: string;
  leaveKind: CalendarLeaveKind;
  workers: Worker[];
  notes?: string | null;
  projectId?: string | null;
  projectName?: string | null;
}

export async function insertBulkLeaveEvents(
  input: BulkLeaveInput
): Promise<BulkRdoInsertResult> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured.", created: 0 };
  }

  if (input.workers.length === 0) {
    return { error: "Select at least one worker.", created: 0 };
  }

  const validWorkers = input.workers.filter((worker) => isValidWorkerUuid(worker?.id));
  if (validWorkers.length === 0) {
    return { error: "Select at least one worker with a valid ID.", created: 0 };
  }

  const startDate = formatDateOnly(input.startDate);
  const endDate = formatDateOnly(input.endDate);
  if (!startDate || !endDate || startDate > endDate) {
    return { error: "Start date must be on or before end date.", created: 0 };
  }

  let projectId = input.projectId ?? null;
  if (projectId) {
    const { id, error: projectError } = await resolveProjectId(projectId);
    if (projectError) {
      return { error: projectError, created: 0 };
    }
    projectId = id ?? projectId;
  }

  await primeWorkerCalendarEventsSchema();

  const rows = validWorkers.map((worker) =>
    buildLeaveRow(worker, {
      startDate,
      endDate,
      projectId,
      projectName: input.projectName ?? null,
      notes: input.notes,
      leaveKind: input.leaveKind,
    })
  );

  return insertCalendarEventRows(rows, "insertBulkLeaveEvents");
}

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function isValidWorkerUuid(value: unknown): value is string {
  const id = String(value ?? "").trim();
  return UUID_RE.test(id);
}

function stripNullishFields(
  row: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) {
      next[key] = value;
    }
  }
  return next;
}

function sanitizeOptionalProjectId(value?: string | null): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed || null;
}

function omitPayloadFields(
  row: Record<string, unknown>,
  fields: string[]
): Record<string, unknown> {
  const next = { ...row };
  for (const field of fields) {
    delete next[field];
  }
  return next;
}

/** Canonical leave calendar columns with legacy aliases for older/newer schemas. */
function buildLeaveCalendarSyncPayloadVariants(input: {
  workerId: string;
  workerName: string;
  projectId: string | null;
  projectName: string | null;
  startDate: string;
  endDate: string;
  notes: string;
  leaveRequestId: string;
  leaveType?: string | null;
  presentation: ReturnType<typeof resolveLeaveCalendarPresentation>;
}): Record<string, unknown>[] {
  const title = normalizeLeaveTypeLabel(input.leaveType);
  const status = input.presentation.leave_status;
  const eventType = input.presentation.event_type;
  const safeNotes = input.notes.trim();

  const canonical = stripNullishFields({
    worker_id: input.workerId,
    event_type: eventType,
    title,
    start_date: input.startDate,
    end_date: input.endDate,
    is_full_day: true,
    status,
    leave_request_id: input.leaveRequestId,
    worker_name: input.workerName,
    project_id: input.projectId,
    project_name: input.projectName,
    notes: safeNotes,
    display_code: input.presentation.display_code,
    bg_color: input.presentation.bg_color,
    text_color: input.presentation.text_color,
    leave_kind: input.presentation.leave_kind,
    leave_status: status,
  });

  const withoutAliasColumns = omitPayloadFields(canonical, ["title", "status"]);
  const withoutFullDay = omitPayloadFields(withoutAliasColumns, ["is_full_day"]);
  const withoutProject = omitPayloadFields(withoutFullDay, ["project_id", "project_name"]);
  const withoutPresentation = omitPayloadFields(withoutProject, [
    "bg_color",
    "text_color",
    "leave_kind",
    "leave_status",
  ]);
  const withoutLeaveRequestId = omitPayloadFields(withoutPresentation, ["leave_request_id"]);
  const coreRow = stripNullishFields({
    worker_id: input.workerId,
    worker_name: input.workerName,
    start_date: input.startDate,
    end_date: input.endDate,
    event_type: eventType,
    display_code: input.presentation.display_code,
    notes: safeNotes,
  });
  const minimalRow = stripNullishFields({
    worker_id: input.workerId,
    worker_name: input.workerName,
    start_date: input.startDate,
    end_date: input.endDate,
    event_type: eventType === "RDO" ? "RDO" : "Leave",
    display_code: input.presentation.display_code,
  });

  return [
    canonical,
    withoutAliasColumns,
    withoutFullDay,
    withoutProject,
    withoutPresentation,
    withoutLeaveRequestId,
    coreRow,
    minimalRow,
  ];
}

async function findCalendarEventIdByLeaveRequest(
  leaveRequestId: string
): Promise<string | null> {
  try {
    const { data, error } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .select("id")
      .eq("leave_request_id", leaveRequestId)
      .maybeSingle();

    if (error) {
      if (
        isSupabaseMissingColumnError(error) ||
        isSupabaseSchemaOrConstraintError(error)
      ) {
        return null;
      }
      console.warn(
        "[worker-calendar] leave_request_id lookup failed (non-blocking):",
        error.message
      );
      return null;
    }

    return data?.id ? String(data.id) : null;
  } catch (error) {
    console.warn("[worker-calendar] leave_request_id lookup threw (non-blocking):", error);
    return null;
  }
}

async function persistLeaveCalendarSyncPayloads(
  payloads: Record<string, unknown>[],
  options: { existingId?: string | null; operation: string }
): Promise<boolean> {
  for (const row of payloads) {
    try {
      const response = options.existingId
        ? await supabase
            .from(WORKER_CALENDAR_EVENTS_TABLE)
            .update(row)
            .eq("id", options.existingId)
        : await supabase.from(WORKER_CALENDAR_EVENTS_TABLE).insert([row]);

      if (!response.error) {
        return true;
      }

      console.warn(
        `[worker-calendar] ${options.operation} payload rejected; trying slimmer variant:`,
        response.error.message
      );

      if (
        !isSupabaseMissingColumnError(response.error) &&
        !isSupabaseSchemaOrConstraintError(response.error)
      ) {
        continue;
      }
    } catch (error) {
      console.warn(
        `[worker-calendar] ${options.operation} payload threw; trying slimmer variant:`,
        error
      );
    }
  }

  return false;
}

function buildCoreInsertPayload(row: Record<string, unknown>): Record<string, unknown> {
  const eventType = normalizeEventType(row.event_type);
  const displayCode =
    (row.display_code ? String(row.display_code).trim() : "") ||
    (eventType === "RDO" ? RDO_EVENT_STYLE.displayCode : "L");

  return stripNullishFields({
    worker_id: String(row.worker_id ?? "").trim(),
    worker_name: String(row.worker_name ?? "").trim(),
    event_type: eventType,
    start_date: formatDateOnly(row.start_date as string),
    end_date: formatDateOnly(row.end_date as string),
    notes: row.notes ? String(row.notes).trim() : "",
    display_code: displayCode,
    leave_status: row.leave_status ? String(row.leave_status) : undefined,
  });
}

function omitPayloadField(
  rows: Record<string, unknown>[],
  field: string
): Record<string, unknown>[] {
  return rows.map((row) => {
    const next = { ...row };
    delete next[field];
    return next;
  });
}

async function insertCalendarEventRows(
  rows: Record<string, unknown>[],
  operation: string
): Promise<BulkRdoInsertResult> {
  try {
    await primeWorkerCalendarEventsSchema();

    const corePayload = rows.map((row) => buildCoreInsertPayload(row));
    let lastError: SupabaseRequestError | null = null;

    for (const mode of ["with_leave_status", "without_leave_status", "base_only"] as const) {
      const payload =
        mode === "with_leave_status"
          ? corePayload
          : mode === "without_leave_status"
            ? omitPayloadField(corePayload, "leave_status")
            : corePayload.map((row) =>
                stripNullishFields({
                  worker_id: row.worker_id,
                  worker_name: row.worker_name,
                  event_type: row.event_type,
                  start_date: row.start_date,
                  end_date: row.end_date,
                  notes: row.notes ?? "",
                })
              );

      const { data, error } = await supabase
        .from(WORKER_CALENDAR_EVENTS_TABLE)
        .insert(payload)
        .select("*");

      if (!error) {
        const saved = (data ?? []).map((row) =>
          normalizeEvent(row as Record<string, unknown>)
        );
        console.log("Saved Event:", saved);
        return { error: null, created: saved.length, data: saved };
      }

      lastError = toSupabaseRequestError(error);
      console.error(
        "Error saving calendar event:",
        JSON.stringify(error, null, 2),
        error
      );

      if (mode === "with_leave_status" && isSupabaseMissingColumnError(error)) {
        continue;
      }

      if (mode === "without_leave_status" && isSupabaseMissingColumnError(error)) {
        continue;
      }

      break;
    }

    if (lastError && isSupabaseTableUnavailableError(lastError, WORKER_CALENDAR_EVENTS_TABLE)) {
      warnCalendarTableFallback(operation, lastError);
      return { error: null, created: 0, unavailable: true };
    }

    return {
      error: lastError?.message ?? "Failed to save calendar events.",
      created: 0,
    };
  } catch (error) {
    console.error(
      "Error saving calendar event:",
      JSON.stringify(error, null, 2),
      error
    );
    warnCalendarTableFallback(operation, error);
    return { error: null, created: 0, unavailable: true };
  }
}

export async function syncPendingLeaveCalendarEvent(input: {
  leaveRequestId: string;
  workerId: string;
  workerName: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  notes?: string | null;
  leaveType?: string | null;
}): Promise<void> {
  if (!isSupabaseConfigured()) return;

  try {
    await primeWorkerCalendarEventsSchema();

    const startDate = formatDateOnly(input.startDate);
    const endDate = formatDateOnly(input.endDate);
    if (!startDate || !endDate) return;

    const presentation = resolveLeaveCalendarPresentation({
      leaveType: input.leaveType,
      status: "pending",
    });

    const payloads = buildLeaveCalendarSyncPayloadVariants({
      workerId: input.workerId,
      workerName: input.workerName,
      projectId: sanitizeOptionalProjectId(input.projectId),
      projectName: sanitizeOptionalProjectId(input.projectName),
      startDate,
      endDate,
      notes: input.notes?.trim() ?? "",
      leaveRequestId: input.leaveRequestId,
      leaveType: input.leaveType,
      presentation,
    });

    const existingId = await findCalendarEventIdByLeaveRequest(input.leaveRequestId);
    const saved = await persistLeaveCalendarSyncPayloads(payloads, {
      existingId,
      operation: existingId
        ? "syncPendingLeaveCalendarEvent.update"
        : "syncPendingLeaveCalendarEvent.insert",
    });

    if (!saved) {
      console.warn(
        "[worker-calendar] syncPendingLeaveCalendarEvent: all payload variants failed (non-blocking)"
      );
    }
  } catch (error) {
    console.warn("[worker-calendar] syncPendingLeaveCalendarEvent failed (non-blocking):", error);
  }
}

export async function syncApprovedLeaveCalendarEvent(
  leaveRequestId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await primeWorkerCalendarEventsSchema();

  const {
    fetchLeaveRequestById,
    getLeaveEndDate,
    getLeaveReason,
    getLeaveStartDate,
  } = await import("./leave-requests");

  const leaveRow = await fetchLeaveRequestById(leaveRequestId);
  if (!leaveRow) return;

  const startDate = formatDateOnly(getLeaveStartDate(leaveRow));
  const endDate = formatDateOnly(getLeaveEndDate(leaveRow));
  const projectId = sanitizeOptionalProjectId(leaveRow.project_id);
  const projectName = projectId ? sanitizeOptionalProjectId(getProjectDisplayName(projectId)) : null;
  const presentation = resolveLeaveCalendarPresentation({
    leaveType: leaveRow.leave_type,
    status: "approved",
  });

  const fullRow = stripNullishFields({
    worker_id: leaveRow.worker_id,
    project_id: projectId,
    project_name: projectName,
    event_type: presentation.event_type,
    start_date: startDate,
    end_date: endDate,
    is_full_day: true,
    notes: getLeaveReason(leaveRow) || "",
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    leave_kind: presentation.leave_kind,
    leave_status: presentation.leave_status,
    leave_request_id: leaveRequestId,
  });

  const withoutProjectRow = omitPayloadFields(fullRow, ["project_id", "project_name"]);

  const coreRow = stripNullishFields({
    worker_id: leaveRow.worker_id,
    start_date: startDate,
    end_date: endDate,
    event_type: presentation.event_type,
    display_code: presentation.display_code,
    bg_color: presentation.bg_color,
    text_color: presentation.text_color,
    leave_request_id: leaveRequestId,
  });

  const minimalRow = stripNullishFields({
    worker_id: leaveRow.worker_id,
    start_date: startDate,
    end_date: endDate,
    event_type: presentation.event_type === "RDO" ? "RDO" : "Leave",
    display_code: presentation.display_code,
    leave_request_id: leaveRequestId,
  });

  const updatePayloads = [
    fullRow,
    withoutProjectRow,
    coreRow,
    minimalRow,
  ].map((row) => {
    const { leave_request_id: _ignored, ...updateFields } = row;
    return updateFields;
  });

  const existing = await supabase
    .from(WORKER_CALENDAR_EVENTS_TABLE)
    .select("id")
    .eq("leave_request_id", leaveRequestId)
    .maybeSingle();

  if (existing.data?.id) {
    for (const payload of updatePayloads) {
      const { error } = await supabase
        .from(WORKER_CALENDAR_EVENTS_TABLE)
        .update(payload)
        .eq("leave_request_id", leaveRequestId);

      if (!error) return;

      console.error(
        "Error updating approved leave calendar event:",
        JSON.stringify(error, null, 2),
        error
      );

      if (!isSupabaseMissingColumnError(error)) return;
    }
    return;
  }

  const insertPayloads = [fullRow, withoutProjectRow, coreRow, minimalRow];
  for (const row of insertPayloads) {
    const { error } = await supabase.from(WORKER_CALENDAR_EVENTS_TABLE).insert([row]);
    if (!error) return;

    console.error(
      "Error inserting approved leave calendar event:",
      JSON.stringify(error, null, 2),
      error
    );

    if (!isSupabaseMissingColumnError(error)) return;
  }
}

export async function syncRejectedLeaveCalendarEvent(
  leaveRequestId: string
): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await primeWorkerCalendarEventsSchema();

  const { error: markError } = await supabase
    .from(WORKER_CALENDAR_EVENTS_TABLE)
    .update({ leave_status: "Rejected" })
    .eq("leave_request_id", leaveRequestId);

  if (markError) {
    console.warn(
      "Could not mark leave calendar event rejected; removing instead:",
      markError
    );
  }

  await removeLeaveCalendarEvents(leaveRequestId);
}

export async function removeLeaveCalendarEvents(leaveRequestId: string): Promise<void> {
  if (!isSupabaseConfigured()) return;

  await supabase
    .from(WORKER_CALENDAR_EVENTS_TABLE)
    .delete()
    .eq("leave_request_id", leaveRequestId);
}

export async function deleteWorkerCalendarEvent(
  eventId: string
): Promise<{ error: string | null; unavailable?: boolean }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  try {
    const { error } = await supabase
      .from(WORKER_CALENDAR_EVENTS_TABLE)
      .delete()
      .eq("id", eventId)
      .select("id");

    if (error) {
      if (isSupabaseTableUnavailableError(error, WORKER_CALENDAR_EVENTS_TABLE)) {
        warnCalendarTableFallback("deleteWorkerCalendarEvent", error);
        return { error: null, unavailable: true };
      }
      return { error: error.message ?? "Failed to delete calendar event." };
    }

    return { error: null };
  } catch (error) {
    warnCalendarTableFallback("deleteWorkerCalendarEvent", error);
    return { error: null, unavailable: true };
  }
}

export function resolveProjectName(projectId: string | null | undefined): string {
  if (!projectId) return "—";
  const projects = getCachedProjects();
  return projects.find((project) => project.id === projectId)?.name ?? projectId;
}

export type { CalendarLeaveKind };
