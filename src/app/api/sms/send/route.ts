export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { composeSmsAdmin } from "@/lib/sms-module-admin";
import { requireSmsApiAccess } from "@/lib/sms-auth";
import {
  TWILIO_MISSING_CREDS_ERROR,
  getTwilioCredentials,
  logTwilioAuthCheck,
  validateTwilioCredentials,
} from "@/lib/sms-service";
import type { ComposeSmsInput, SmsTargetMode } from "@/lib/sms-types";

function asStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item ?? "").trim()).filter(Boolean);
}

export async function POST(request: Request) {
  const auth = await requireSmsApiAccess();
  if (!auth.ok) return auth.response;

  try {
    let raw: Record<string, unknown>;
    try {
      raw = (await request.json()) as Record<string, unknown>;
    } catch {
      return NextResponse.json(
        { success: false, error: "Invalid JSON body." },
        { status: 400 }
      );
    }

    const targetMode = String(raw.target_mode ?? "all_workers") as SmsTargetMode;
    const messageBody = String(raw.message_body ?? raw.body ?? "").trim();
    if (!messageBody) {
      return NextResponse.json(
        { success: false, error: "message_body is required." },
        { status: 400 }
      );
    }

    const input: ComposeSmsInput = {
      message_body: messageBody,
      target_mode: targetMode,
      worker_ids: asStringArray(raw.worker_ids ?? raw.recipients),
      project_ids: asStringArray(raw.project_ids),
      project_id: raw.project_id ? String(raw.project_id) : null,
      send_mode: raw.send_mode === "scheduled" ? "scheduled" : "immediate",
      scheduled_at: raw.scheduled_at ? String(raw.scheduled_at) : null,
      recurrence: raw.recurrence ? String(raw.recurrence) : null,
    };

    if (
      input.target_mode === "selected_workers" &&
      (!input.worker_ids || input.worker_ids.length === 0) &&
      Array.isArray(raw.recipients)
    ) {
      input.worker_ids = asStringArray(raw.recipients);
    }

    if (input.send_mode !== "scheduled") {
      const creds = validateTwilioCredentials();
      if (!creds.ok) {
        const rawCreds = getTwilioCredentials();
        logTwilioAuthCheck(rawCreds.accountSid, rawCreds.authToken);
        return NextResponse.json(
          { success: false, error: creds.error },
          { status: 500 }
        );
      }
      logTwilioAuthCheck(creds.accountSid, creds.authToken);
    }

    const result = await composeSmsAdmin(auth.admin, {
      ...input,
      created_by: auth.workerId,
    });

    const firstDispatchError = result.dispatchErrors[0];
    const twilioCode = firstDispatchError?.twilioCode ?? null;
    const success =
      !result.error &&
      result.failed === 0 &&
      (result.sent > 0 || result.queued > 0);

    if (result.error && result.messages.length === 0) {
      const status =
        result.error === TWILIO_MISSING_CREDS_ERROR ||
        result.dispatchErrors.some((item) => item.error === TWILIO_MISSING_CREDS_ERROR)
          ? 500
          : 400;
      return NextResponse.json(
        {
          success: false,
          error: result.error,
          twilioCode,
          dispatchErrors: result.dispatchErrors,
          sent: result.sent,
          failed: result.failed,
          queued: result.queued,
        },
        { status }
      );
    }

    return NextResponse.json({
      success,
      error: result.error,
      twilioCode,
      dispatchErrors: result.dispatchErrors,
      sent: result.sent,
      failed: result.failed,
      queued: result.queued,
      messages: result.messages,
    });
  } catch (error) {
    console.error("[POST /api/sms/send]", error);
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : "Failed to send SMS.",
        twilioCode: null,
      },
      { status: 500 }
    );
  }
}
