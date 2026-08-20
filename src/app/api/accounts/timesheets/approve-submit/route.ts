export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  submitApprovedTimesheetAdmin,
  type AdminTimesheetSubmitInput,
} from "@/lib/admin-timesheet-submit";
import { resolveAccountsTimesheetCallerContext } from "@/lib/accounts-api-auth";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  migrateActivityToLineItem,
  type TimesheetLineCategory,
} from "@/lib/timesheet-line-items";
import type { TimesheetActivitySlot, TimesheetBreakSlot } from "@/lib/timesheet-utils";

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function readNumber(value: unknown, fallback = 0): number {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : fallback;
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
      const category = readString(row.category) as TimesheetLineCategory | "";
      return migrateActivityToLineItem({
        id: readString(row.id) || `activity-${startTime}`,
        startTime,
        endTime,
        label,
        category: category || "work",
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

  if (!caller.canManage) {
    return NextResponse.json({ error: "Not authorized." }, { status: 403 });
  }

  const body = await req.json().catch(() => null);
  if (!body || typeof body !== "object") {
    return NextResponse.json({ error: "Invalid request body." }, { status: 400 });
  }

  const raw = body as Record<string, unknown>;
  const workerId = readString(raw.workerId);
  if (!workerId) {
    return NextResponse.json({ error: "Worker is required." }, { status: 400 });
  }

  const activities = parseActivities(raw.activities);
  if (activities.length === 0) {
    return NextResponse.json({ error: "At least one activity is required." }, { status: 400 });
  }

  const input: AdminTimesheetSubmitInput = {
    workerId,
    workDate: readString(raw.workDate),
    projectId: readString(raw.projectId) || null,
    timesheetTaskName: readString(raw.timesheetTaskName) || null,
    workerTrade: readString(raw.workerTrade) || readString(raw.timesheetTaskName) || null,
    activities,
    breaks: parseBreaks(raw.breaks),
    breakMinutes: readNumber(raw.breakMinutes, 0),
    notes: readString(raw.notes) || null,
    workerState: readString(raw.workerState) || null,
    approvedBy: caller.approverName,
    submittedByAdmin: true,
  };

  if (raw.timesheetProject && typeof raw.timesheetProject === "object") {
    const project = raw.timesheetProject as Record<string, unknown>;
    input.timesheetProject = {
      id: readString(project.id),
      client: readString(project.client),
      project: readString(project.project),
      address: readString(project.address),
    };
    input.projectId = input.timesheetProject.id;
  }

  const result = await submitApprovedTimesheetAdmin(admin, input);

  if (result.error) {
    return NextResponse.json({ error: result.error }, { status: 400 });
  }

  const { data: workerRow } = await admin
    .from("workers")
    .select("first_name, last_name, full_name, worker_name, email")
    .eq("id", workerId)
    .maybeSingle();

  const workerName = workerRow
    ? getWorkerDisplayName(workerRow as Parameters<typeof getWorkerDisplayName>[0])
    : "Worker";

  return NextResponse.json({
    success: true,
    timesheet: result.data,
    workerName,
  });
}
