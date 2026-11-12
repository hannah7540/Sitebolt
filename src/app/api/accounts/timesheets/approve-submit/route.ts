export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  sanitizeTimesheetActivityCategory,
  submitApprovedTimesheetsAdmin,
  type AdminTimesheetSubmitInput,
} from "@/lib/admin-timesheet-submit";
import { resolveAccountsTimesheetCallerContext } from "@/lib/accounts-api-auth";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { isProjectUuid } from "@/lib/project-resolver";
import {
  createDefaultLineItem,
  isLeaveLineCategory,
  migrateActivityToLineItem,
  syncLineItemFields,
} from "@/lib/timesheet-line-items";
import type { TimesheetActivitySlot, TimesheetBreakSlot } from "@/lib/timesheet-utils";
import type { TimesheetProject } from "@/lib/timesheet-options";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readUuid(value: unknown): string | null {
  const raw = readString(value);
  return isProjectUuid(raw) ? raw : null;
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
}

function parseTimesheetProject(raw: unknown): TimesheetProject | null {
  if (!raw || typeof raw !== "object") return null;
  const project = raw as Record<string, unknown>;
  const projectId = readUuid(project.id);
  if (!projectId) return null;
  return {
    id: projectId,
    client: readString(project.client),
    project: readString(project.project),
    address: readString(project.address),
  };
}

function parseActivities(raw: unknown): TimesheetActivitySlot[] {
  if (!Array.isArray(raw) || raw.length === 0) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const startTime = readString(row.startTime ?? row.start_time) || "06:30";
      const endTime = readString(row.endTime ?? row.end_time) || "14:30";
      const label = readString(row.label) || "WORKING ON SITE";
      const category = sanitizeTimesheetActivityCategory(
        readString(row.category ?? row.leaveType ?? row.leave_type) || label
      );
      return migrateActivityToLineItem({
        id: readString(row.id) || `activity-${startTime}`,
        startTime,
        endTime,
        label,
        category,
      });
    })
    .filter((item): item is TimesheetActivitySlot => item !== null);
}

function parseBreaks(raw: unknown): TimesheetBreakSlot[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const startTime = readString(row.startTime ?? row.start_time);
      const endTime = readString(row.endTime ?? row.end_time);
      if (!startTime || !endTime) return null;
      return {
        id: readString(row.id) || `break-${startTime}`,
        startTime,
        endTime,
      } satisfies TimesheetBreakSlot;
    })
    .filter((item): item is TimesheetBreakSlot => item !== null);
}

function buildActivityFromEntry(entry: Record<string, unknown>): TimesheetActivitySlot {
  const category = sanitizeTimesheetActivityCategory(
    readString(entry.category ?? entry.leaveType ?? entry.leave_type) || "work"
  );
  const isLeave = isLeaveLineCategory(category);
  const startTime =
    readString(entry.startTime ?? entry.start_time) || (isLeave ? "06:30" : "06:30");
  const endTime =
    readString(entry.endTime ?? entry.end_time) || (isLeave ? "14:30" : "14:30");

  return syncLineItemFields({
    ...createDefaultLineItem(category),
    id: readString(entry.id) || `entry-${startTime}`,
    startTime,
    endTime,
    category,
    durationMode: isLeave ? "full_day" : "partial",
  });
}

function parseEntryInputs(
  raw: Record<string, unknown>,
  shared: Omit<
    AdminTimesheetSubmitInput,
    "projectId" | "timesheetProject" | "activities" | "breaks" | "breakMinutes"
  >
): AdminTimesheetSubmitInput[] {
  const entriesRaw = raw.entries;
  if (Array.isArray(entriesRaw) && entriesRaw.length > 0) {
    const parsed: AdminTimesheetSubmitInput[] = [];
    for (const item of entriesRaw) {
      if (!item || typeof item !== "object") continue;
      const entry = item as Record<string, unknown>;
      const timesheetProject = parseTimesheetProject(entry.timesheetProject);
      const projectId = readUuid(entry.projectId) ?? timesheetProject?.id ?? null;
      if (!projectId) continue;

      const activitiesFromArray = parseActivities(entry.activities);
      const activities =
        activitiesFromArray.length > 0
          ? activitiesFromArray
          : [buildActivityFromEntry(entry)];

      parsed.push({
        ...shared,
        projectId,
        timesheetProject: timesheetProject ?? undefined,
        activities,
        breaks: parseBreaks(entry.breaks),
        breakMinutes: readNumber(entry.breakMinutes, 0),
        notes: readString(entry.notes) || shared.notes || null,
      });
      if (parsed.length >= 2) break;
    }
    return parsed;
  }

  const activities = parseActivities(raw.activities);
  if (activities.length === 0) return [];

  const timesheetProject = parseTimesheetProject(raw.timesheetProject);
  return [
    {
      ...shared,
      projectId: readUuid(raw.projectId) ?? timesheetProject?.id ?? null,
      timesheetProject: timesheetProject ?? undefined,
      activities,
      breaks: parseBreaks(raw.breaks),
      breakMinutes: readNumber(raw.breakMinutes, 0),
    },
  ];
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server configuration error." },
      { status: 500 }
    );
  }

  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    return NextResponse.json({ error: "Not authenticated." }, { status: 401 });
  }

  const admin = createSupabaseAdminClient();
  const caller = await resolveAccountsTimesheetCallerContext(admin, user);

  if (
    !caller.canManage &&
    caller.securityRole !== "project_team" &&
    caller.accountsAccessRole !== "full_access"
  ) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const workerId = readUuid(raw.workerId);
  const requestedWorkerName = readString(raw.workerName);
  if (!workerId) {
    return NextResponse.json(
      {
        error:
          "Worker is required. Select a worker from the list rather than typing a name.",
      },
      { status: 400 }
    );
  }

  const shared = {
    workerId,
    workerName: requestedWorkerName || null,
    workDate: readString(raw.workDate),
    timesheetTaskName: readString(raw.timesheetTaskName) || null,
    workerTrade:
      readString(raw.workerTrade) || readString(raw.timesheetTaskName) || null,
    notes: readString(raw.notes) || null,
    workerState: readString(raw.workerState) || null,
    approvedBy: user.id,
    createdBy: user.id,
    submittedBy: user.id,
    approvedByName: caller.approverName,
    submittedByAdmin: true,
  };

  const inputs = parseEntryInputs(raw, shared);
  if (inputs.length === 0) {
    return NextResponse.json(
      { error: "At least one timesheet entry is required." },
      { status: 400 }
    );
  }

  const result = await submitApprovedTimesheetsAdmin(admin, inputs);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { data: workerRow } = await admin
    .from("workers")
    .select("first_name, last_name, full_name, worker_name, email")
    .eq("id", workerId)
    .maybeSingle();

  const resolvedWorkerName = workerRow
    ? getWorkerDisplayName(workerRow as Parameters<typeof getWorkerDisplayName>[0])
    : requestedWorkerName || "Worker";

  return NextResponse.json({
    success: true,
    timesheets: result.data,
    timesheet: result.data[0] ?? null,
    entryCount: result.data.length,
    workerName: resolvedWorkerName,
  });
}
