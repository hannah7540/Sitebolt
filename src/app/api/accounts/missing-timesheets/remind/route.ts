export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { createSupabaseServerClient } from "@/lib/supabase/server";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveAccountsTimesheetCallerContext } from "@/lib/accounts-api-auth";
import { canAccessAccountsArea, canViewAccountsTimesheets } from "@/lib/security-roles";
import { composeSmsAdmin } from "@/lib/sms-module-admin";
import {
  buildMissingTimesheetReminderMessage,
} from "@/lib/missing-timesheets";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export async function POST(request: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { success: false, error: "Server configuration error." },
      { status: 500 }
    );
  }

  const server = await createSupabaseServerClient();
  const {
    data: { user },
  } = await server.auth.getUser();

  if (!user) {
    return NextResponse.json(
      { success: false, error: "Not authenticated." },
      { status: 401 }
    );
  }

  const admin = createSupabaseAdminClient();
  const caller = await resolveAccountsTimesheetCallerContext(admin, user);
  const canAccess =
    canViewAccountsTimesheets(caller.securityRole) ||
    canAccessAccountsArea({
      securityRole: caller.securityRole,
      accountsAccessRole: caller.accountsAccessRole,
    });

  if (!canAccess) {
    return NextResponse.json(
      { success: false, error: "Not authorized." },
      { status: 403 }
    );
  }

  let raw: Record<string, unknown>;
  try {
    raw = (await request.json()) as Record<string, unknown>;
  } catch {
    return NextResponse.json(
      { success: false, error: "Invalid JSON body." },
      { status: 400 }
    );
  }

  const workerId = String(raw.worker_id ?? raw.workerId ?? "").trim();
  const workerName = String(raw.worker_name ?? raw.workerName ?? "worker").trim();
  const missingDayNames = asStringArray(raw.missing_day_names ?? raw.missingDays);
  const projectIds = asStringArray(raw.project_ids ?? raw.projectIds);
  const payWeekStart = String(raw.pay_week_start ?? raw.payWeekStart ?? "").trim() || null;
  const payWeekEnd = String(raw.pay_week_end ?? raw.payWeekEnd ?? "").trim() || null;

  if (!workerId) {
    return NextResponse.json(
      { success: false, error: "worker_id is required." },
      { status: 400 }
    );
  }

  if (missingDayNames.length === 0) {
    return NextResponse.json(
      { success: false, error: "No missing days to notify." },
      { status: 400 }
    );
  }

  const messageBody = buildMissingTimesheetReminderMessage(missingDayNames);

  const sms = await composeSmsAdmin(admin, {
    message_body: messageBody,
    target_mode: "selected_workers",
    worker_ids: [workerId],
    project_ids: projectIds,
    project_id: projectIds[0] ?? null,
    send_mode: "immediate",
    created_by: caller.callerWorkerId,
  });

  const smsOk = !sms.error && sms.failed === 0 && (sms.sent > 0 || sms.queued > 0);
  if (!smsOk) {
    return NextResponse.json(
      {
        success: false,
        error:
          sms.error ||
          sms.dispatchErrors[0]?.error ||
          "Failed to send reminder notification.",
        dispatchErrors: sms.dispatchErrors,
      },
      { status: 400 }
    );
  }

  const reminderPayload = {
    worker_id: workerId,
    missing_days: missingDayNames,
    pay_week_start: payWeekStart,
    pay_week_end: payWeekEnd,
    message_body: messageBody,
    project_ids: projectIds,
    sent_by: caller.callerWorkerId,
  };

  const { error: reminderError } = await admin.from("timesheet_reminders").insert(reminderPayload);

  if (reminderError) {
    const { sent_by: _removed, ...withoutSender } = reminderPayload;
    const retry = await admin.from("timesheet_reminders").insert(withoutSender);
    if (retry.error) {
      console.warn("[timesheet_reminders] insert failed:", retry.error.message);
    }
  }

  return NextResponse.json({
    success: true,
    message: `Reminder sent to ${workerName}`,
    message_body: messageBody,
    sent: sms.sent,
    queued: sms.queued,
  });
}
