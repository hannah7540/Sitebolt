"use server";

import { revalidatePath } from "next/cache";
import { z } from "zod";
import { parseMissingColumnFromError } from "@/lib/form-payload-utils";
import {
  LEAVE_REQUEST_DB_LEAVE_TYPES,
  leaveRequestDbLeaveTypeLabel,
  toLeaveRequestDbLeaveType,
  type LeaveRequestDbLeaveType,
} from "@/lib/leave-requests";
import { resolveLeaveCalendarPresentation } from "@/lib/leave-type-calendar";
import { capWaLeaveHours } from "@/lib/payroll/rules/wa";
import { LEAVE_TIMESHEET_START } from "@/lib/leave-timesheet-rules";
import { getProjectDisplayName } from "@/lib/project-resolver";
import { formatDateOnly } from "@/lib/scheduler-utils";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { WORKER_CALENDAR_EVENTS_TABLE } from "@/lib/supabase-schema-cache";
import {
  isOrganisationColumnMissing,
  stampOrganisationId,
  withOrganisationScope,
} from "@/lib/tenant-scope";
import { resolveActiveOrganisationIdFromCookies } from "@/lib/tenant-scope-server";
import { addHoursToTime } from "@/lib/timesheet-utils";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { SupabaseClient } from "@supabase/supabase-js";

const UUID_RE =
  /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i;

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

const directLeaveInputSchema = z.object({
  workerId: z.string().uuid("A valid worker is required."),
  date: z
    .string()
    .regex(DATE_RE, "A valid date is required.")
    .or(z.string().min(1)),
  leaveType: z.preprocess(
    (value) => toLeaveRequestDbLeaveType(String(value ?? "")),
    z.enum(LEAVE_REQUEST_DB_LEAVE_TYPES, {
      message:
        "Leave type must be one of: Sick, Leave, Leave without pay, RDO, Flexi RDO.",
    })
  ),
  hours: z
    .number({ message: "Hours must be between 0 and 7.6." })
    .min(0, "Hours must be between 0 and 7.6.")
    .max(7.6, "Leave hours cannot exceed 7.6 per day."),
  notes: z.string().nullable().optional(),
});

/** Worker assignment fields that must never be written to leave/timesheet rows. */
const ASSIGNED_PROJECT_PAYLOAD_KEYS = new Set([
  "assigned_project",
  "assignedproject",
  "assigned_project_id",
  "assigned_project_ids",
  "assigned_project_name",
]);

const WORKER_SELECT_WITH_PROJECT =
  "id, first_name, last_name, full_name, worker_name, email, organisation_id, assigned_project_id, assigned_project_ids, assigned_project_name, project_id, project_name";

const WORKER_SELECT_CORE =
  "id, first_name, last_name, full_name, worker_name, email, organisation_id";

export type DirectCalendarLeaveInput = {
  workerId: string;
  date: string;
  leaveType: string;
  hours: number;
  notes?: string | null;
};

export type DirectCalendarLeaveResult = {
  error: string | null;
  leaveRequestId: string | null;
  timesheetCreated: boolean;
};

function isUuid(value: string): boolean {
  return UUID_RE.test(value.trim());
}

function normalizePayloadKey(key: string): string {
  return key.trim().toLowerCase().replace(/[\s-]+/g, "_");
}

function stripNullish(row: Record<string, unknown>): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (value !== undefined && value !== null) next[key] = value;
  }
  return next;
}

function omitFields(
  row: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const next = { ...row };
  for (const key of keys) delete next[key];
  return next;
}

/** Leave/timesheet tables use project_id / project_name — never assigned_project*. */
function stripAssignedProjectFields(
  row: Record<string, unknown>
): Record<string, unknown> {
  const next: Record<string, unknown> = {};
  for (const [key, value] of Object.entries(row)) {
    if (ASSIGNED_PROJECT_PAYLOAD_KEYS.has(normalizePayloadKey(key))) continue;
    next[key] = value;
  }
  return next;
}

function parseInsertMissingColumn(message: string): string | null {
  const parsed = parseMissingColumnFromError(message);
  if (parsed) return normalizePayloadKey(parsed);

  const spaced = message.match(
    /column\s+([A-Za-z][A-Za-z0-9_ ]*?)\s+does not exist/i
  );
  if (spaced?.[1]) return normalizePayloadKey(spaced[1]);

  return null;
}

function firstUuid(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && isUuid(value)) return value.trim();
    if (Array.isArray(value)) {
      for (const item of value) {
        if (typeof item === "string" && isUuid(item)) return item.trim();
      }
    }
  }
  return null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string") {
      const trimmed = value.trim();
      if (trimmed) return trimmed;
    }
  }
  return null;
}

function resolveWorkerProject(worker: Record<string, unknown>): {
  projectId: string | null;
  projectName: string | null;
} {
  const projectId = firstUuid(
    worker.assigned_project_id,
    worker.project_id,
    worker.assigned_project_ids
  );
  const projectName =
    firstNonEmpty(
      worker.assigned_project_name,
      worker.project_name,
      projectId ? getProjectDisplayName(projectId) : null
    ) ?? null;

  return { projectId, projectName };
}

async function resolveWriteClient(): Promise<{
  client: SupabaseClient;
  userId: string | null;
  error: string | null;
}> {
  const server = await createSupabaseServerClient();
  const {
    data: { user },
    error: authError,
  } = await server.auth.getUser();

  if (authError || !user) {
    return {
      client: server,
      userId: null,
      error: "You must be signed in to add leave from the calendar.",
    };
  }

  if (isSupabaseAdminConfigured()) {
    try {
      return {
        client: createSupabaseAdminClient(),
        userId: user.id,
        error: null,
      };
    } catch (cause) {
      console.error("[direct-calendar-leave] Admin client unavailable:", cause);
    }
  }

  return { client: server, userId: user.id, error: null };
}

async function insertWithColumnFallback(
  client: SupabaseClient,
  table: string,
  payloads: Record<string, unknown>[]
): Promise<{ id: string | null; error: string | null }> {
  let lastError: string | null = null;

  for (const payload of payloads) {
    let current = stripAssignedProjectFields({ ...payload });
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const { data, error } = await client
        .from(table)
        .insert([current])
        .select("id")
        .maybeSingle();

      if (!error && data?.id) {
        return { id: String(data.id), error: null };
      }

      lastError = error?.message ?? lastError;
      if (!error) break;

      const missing = parseInsertMissingColumn(error.message);
      if (missing) {
        const matchedKey =
          Object.keys(current).find(
            (key) => normalizePayloadKey(key) === missing
          ) ?? null;

        if (matchedKey) {
          current = omitFields(current, [matchedKey]);
          continue;
        }

        if (ASSIGNED_PROJECT_PAYLOAD_KEYS.has(missing)) {
          current = stripAssignedProjectFields(current);
          continue;
        }
      }

      if (/schema cache|could not find/i.test(error.message)) {
        break;
      }

      break;
    }
  }

  return { id: null, error: lastError ?? `Failed to insert into ${table}.` };
}

/**
 * Admin calendar direct leave: inserts an already-approved leave_requests row
 * and an approved leave timesheet (hours capped at 7.6), bypassing approval queues.
 */
export async function createDirectApprovedLeave(
  input: DirectCalendarLeaveInput
): Promise<DirectCalendarLeaveResult> {
  const orgId = await resolveActiveOrganisationIdFromCookies();
  if (!orgId) {
    return {
      error: "No active organisation selected.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const resolved = await resolveWriteClient();
  if (resolved.error || !resolved.userId) {
    return {
      error: resolved.error ?? "Not authenticated.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const parsed = directLeaveInputSchema.safeParse({
    workerId: String(input.workerId ?? "").trim(),
    date: String(input.date ?? "").trim(),
    leaveType: input.leaveType,
    hours: Number(input.hours),
    notes: input.notes ?? null,
  });

  if (!parsed.success) {
    const firstIssue = parsed.error.issues[0];
    return {
      error: firstIssue?.message ?? "Invalid leave submission.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const workerId = parsed.data.workerId;
  const date = formatDateOnly(parsed.data.date);
  if (!date || !DATE_RE.test(date)) {
    return {
      error: "A valid date is required.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const leaveType = parsed.data.leaveType as LeaveRequestDbLeaveType;
  const leaveTypeLabel = leaveRequestDbLeaveTypeLabel(leaveType);
  const hours = capWaLeaveHours(parsed.data.hours);

  const client = resolved.client;
  let workerQuery = client
    .from("workers")
    .select(WORKER_SELECT_WITH_PROJECT)
    .eq("id", workerId);
  workerQuery = withOrganisationScope(workerQuery, orgId);
  let workerResult = await workerQuery.maybeSingle();

  if (
    workerResult.error &&
    (isOrganisationColumnMissing(workerResult.error.message) ||
      /assigned_project|project_name|project_id/i.test(workerResult.error.message))
  ) {
    let fallback = client
      .from("workers")
      .select(WORKER_SELECT_CORE)
      .eq("id", workerId);
    fallback = withOrganisationScope(fallback, orgId);
    workerResult = await fallback.maybeSingle();
    if (
      workerResult.error &&
      isOrganisationColumnMissing(workerResult.error.message)
    ) {
      workerResult = await client
        .from("workers")
        .select(WORKER_SELECT_CORE)
        .eq("id", workerId)
        .maybeSingle();
    }
  }

  if (workerResult.error || !workerResult.data) {
    return {
      error: workerResult.error?.message ?? "Worker not found.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const workerRow = workerResult.data as Record<string, unknown>;
  const { projectId, projectName } = resolveWorkerProject(workerRow);
  const workerName = getWorkerDisplayName(
    workerRow as {
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      worker_name?: string | null;
      email?: string | null;
    }
  );
  const reason =
    String(parsed.data.notes ?? "").trim() ||
    "Direct admin calendar leave (pre-approved)";
  const now = new Date().toISOString();

  const leaveBase = stripAssignedProjectFields(
    stampOrganisationId(
      stripNullish({
        worker_id: workerId,
        worker_name: workerName,
        leave_type: leaveType,
        start_date: date,
        first_date: date,
        end_date: date,
        last_date: date,
        number_of_days: 1,
        total_days: 1,
        effective_days_deducted: 1,
        reason,
        notes: reason,
        status: "approved",
        signature_url: null,
        project_id: projectId,
        project_name: projectName,
        created_at: now,
        updated_at: now,
      }),
      orgId
    )
  );

  const leaveInsert = await insertWithColumnFallback(client, "leave_requests", [
    leaveBase,
    omitFields(leaveBase, ["organisation_id"]),
    omitFields(leaveBase, [
      "organisation_id",
      "effective_days_deducted",
      "total_days",
      "notes",
      "signature_url",
    ]),
    stripNullish({
      worker_id: workerId,
      worker_name: workerName,
      leave_type: leaveType,
      start_date: date,
      end_date: date,
      status: "approved",
      project_id: projectId,
      project_name: projectName,
    }),
  ]);

  if (!leaveInsert.id) {
    return {
      error: leaveInsert.error ?? "Failed to create approved leave record.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const leaveRequestId = leaveInsert.id;
  const startTime = hours > 0 ? LEAVE_TIMESHEET_START : "00:00";
  const finishTime =
    hours > 0 ? addHoursToTime(LEAVE_TIMESHEET_START, hours) : "00:00";
  const dayNotes = `${leaveTypeLabel} - Auto-generated from admin calendar direct leave`;

  const timesheetBase = stripAssignedProjectFields(
    stampOrganisationId(
      stripNullish({
        worker_id: workerId,
        work_date: date,
        project_id: projectId,
        project_name: projectName,
        start_time: startTime,
        finish_time: finishTime,
        break_minutes: 0,
        total_hours: hours,
        work_hours: hours,
        daily_total_hours: hours,
        activities: [
          {
            id: "leave-direct",
            start_time: startTime,
            end_time: finishTime,
            label: leaveTypeLabel,
            category: "leave",
            duration_mode: "full",
            hours,
          },
        ],
        breaks: [],
        notes: dayNotes,
        status: "approved",
        is_draft: false,
        submitted_at: now,
        approved_at: now,
        approved_by: isUuid(resolved.userId) ? resolved.userId : null,
        leave_request_id: leaveRequestId,
        myob_export_status: "not_exported",
        form_metadata: {
          submitted_by_admin: true,
          approved_by_admin: true,
          direct_calendar_leave: true,
          worker_name: workerName,
          leave_type: leaveType,
          leave_type_label: leaveTypeLabel,
        },
        updated_at: now,
      }),
      orgId
    )
  );

  // Skip duplicate timesheet for the same worker/date when one already exists.
  const existingTimesheet = await client
    .from("worker_timesheets")
    .select("id")
    .eq("worker_id", workerId)
    .eq("work_date", date)
    .limit(1)
    .maybeSingle();

  let timesheetCreated = false;
  if (!existingTimesheet.data?.id) {
    const timesheetInsert = await insertWithColumnFallback(
      client,
      "worker_timesheets",
      [
        timesheetBase,
        omitFields(timesheetBase, ["organisation_id"]),
        omitFields(timesheetBase, [
          "organisation_id",
          "leave_request_id",
          "form_metadata",
          "myob_export_status",
          "activities",
          "breaks",
          "work_hours",
          "daily_total_hours",
        ]),
        stripNullish({
          worker_id: workerId,
          work_date: date,
          project_id: projectId,
          project_name: projectName,
          start_time: startTime,
          finish_time: finishTime,
          break_minutes: 0,
          total_hours: hours,
          notes: dayNotes,
          status: "approved",
          submitted_at: now,
          approved_at: now,
          updated_at: now,
        }),
      ]
    );
    timesheetCreated = Boolean(timesheetInsert.id);
    if (!timesheetCreated && timesheetInsert.error) {
      console.warn(
        "[direct-calendar-leave] Timesheet insert failed:",
        timesheetInsert.error
      );
      revalidatePath("/");
      revalidatePath("/admin/worker-calendar");
      return {
        error: timesheetInsert.error,
        leaveRequestId,
        timesheetCreated: false,
      };
    }
  }

  const presentation = resolveLeaveCalendarPresentation({
    leaveType,
    status: "approved",
  });

  const calendarBase = stripAssignedProjectFields(
    stampOrganisationId(
      stripNullish({
        worker_id: workerId,
        event_type: presentation.event_type,
        start_date: date,
        end_date: date,
        is_full_day: true,
        notes: reason,
        display_code: presentation.display_code,
        bg_color: presentation.bg_color,
        text_color: presentation.text_color,
        leave_kind: presentation.leave_kind,
        leave_status: presentation.leave_status,
        leave_request_id: leaveRequestId,
        project_id: projectId,
        project_name: projectName,
      }),
      orgId
    )
  );

  const calendarInsert = await insertWithColumnFallback(
    client,
    WORKER_CALENDAR_EVENTS_TABLE,
    [
      calendarBase,
      omitFields(calendarBase, ["organisation_id"]),
      omitFields(calendarBase, [
        "organisation_id",
        "leave_kind",
        "leave_status",
        "bg_color",
        "text_color",
        "is_full_day",
      ]),
      stripNullish({
        worker_id: workerId,
        event_type: presentation.event_type,
        start_date: date,
        end_date: date,
        display_code: presentation.display_code,
        leave_request_id: leaveRequestId,
        project_id: projectId,
        project_name: projectName,
      }),
    ]
  );

  if (calendarInsert.error) {
    console.warn(
      "[direct-calendar-leave] Calendar event insert failed:",
      calendarInsert.error
    );
  }

  revalidatePath("/");
  revalidatePath("/admin/worker-calendar");

  return {
    error: null,
    leaveRequestId,
    timesheetCreated,
  };
}
