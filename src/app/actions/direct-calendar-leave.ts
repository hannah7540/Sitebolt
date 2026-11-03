"use server";

import { revalidatePath } from "next/cache";
import {
  LEAVE_TYPE_FORM_OPTIONS,
  sanitizeLeaveType,
} from "@/lib/leave-requests";
import { resolveLeaveCalendarPresentation } from "@/lib/leave-type-calendar";
import { capWaLeaveHours } from "@/lib/payroll/rules/wa";
import { LEAVE_TIMESHEET_START } from "@/lib/leave-timesheet-rules";
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
    let current = { ...payload };
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

      const match = error.message.match(
        /column ["']?([a-zA-Z0-9_]+)["']? (?:of relation .* )?does not exist/i
      );
      const missing = match?.[1];
      if (missing && missing in current) {
        current = omitFields(current, [missing]);
        continue;
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

  const workerId = String(input.workerId ?? "").trim();
  if (!isUuid(workerId)) {
    return {
      error: "A valid worker is required.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const date = formatDateOnly(input.date);
  if (!date || !DATE_RE.test(date)) {
    return {
      error: "A valid date is required.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const rawLeaveType = String(input.leaveType ?? "").trim();
  if (
    rawLeaveType &&
    !LEAVE_TYPE_FORM_OPTIONS.some(
      (option) => option.toLowerCase() === rawLeaveType.toLowerCase()
    )
  ) {
    return {
      error: "Select a valid leave type.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }
  const leaveType = sanitizeLeaveType(rawLeaveType || "Annual Leave");

  const rawHours = Number(input.hours);
  if (!Number.isFinite(rawHours) || rawHours < 0) {
    return {
      error: "Hours must be between 0 and 7.6.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }
  if (rawHours > 7.6) {
    return {
      error: "Leave hours cannot exceed 7.6 per day.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }
  const hours = capWaLeaveHours(rawHours);

  const client = resolved.client;
  let workerQuery = client
    .from("workers")
    .select("id, first_name, last_name, full_name, worker_name, email, organisation_id")
    .eq("id", workerId);
  workerQuery = withOrganisationScope(workerQuery, orgId);
  let workerResult = await workerQuery.maybeSingle();
  if (
    workerResult.error &&
    isOrganisationColumnMissing(workerResult.error.message)
  ) {
    workerResult = await client
      .from("workers")
      .select("id, first_name, last_name, full_name, worker_name, email, organisation_id")
      .eq("id", workerId)
      .maybeSingle();
  }

  if (workerResult.error || !workerResult.data) {
    return {
      error: workerResult.error?.message ?? "Worker not found.",
      leaveRequestId: null,
      timesheetCreated: false,
    };
  }

  const workerName = getWorkerDisplayName(
    workerResult.data as {
      first_name?: string | null;
      last_name?: string | null;
      full_name?: string | null;
      worker_name?: string | null;
      email?: string | null;
    }
  );
  const reason =
    String(input.notes ?? "").trim() ||
    "Direct admin calendar leave (pre-approved)";
  const now = new Date().toISOString();

  const leaveBase = stampOrganisationId(
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
      created_at: now,
      updated_at: now,
    }),
    orgId
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
  const finishTime = hours > 0 ? addHoursToTime(LEAVE_TIMESHEET_START, hours) : "00:00";
  const dayNotes = `${leaveType} - Auto-generated from admin calendar direct leave`;

  const timesheetBase = stampOrganisationId(
    stripNullish({
      worker_id: workerId,
      work_date: date,
      project_id: null,
      project_name: null,
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
          label: leaveType,
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
      },
      updated_at: now,
    }),
    orgId
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
    }
  }

  const presentation = resolveLeaveCalendarPresentation({
    leaveType,
    status: "approved",
  });

  const calendarBase = stampOrganisationId(
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
    }),
    orgId
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
