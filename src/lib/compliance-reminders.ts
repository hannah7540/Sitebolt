import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "@/lib/email-service";
import { getSiteUrl } from "@/lib/supabase/env";
import { buildWorkerDeepLinkPath } from "@/lib/worker-deep-links";
import { composeSmsAdmin } from "@/lib/sms-module-admin";
import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "@/lib/form-payload-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
} from "@/lib/supabase-errors";

export type ComplianceReminderKind = "swms" | "induction";

const OPTIONAL_NOTIFICATION_COLUMNS = [
  "worker_id",
  "recipient_id",
  "is_read",
  "read",
  "metadata",
  "type",
] as const;

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    const trimmed = typeof value === "string" ? value.trim() : "";
    if (trimmed) return trimmed;
  }
  return null;
}

async function insertInAppNotification(
  admin: SupabaseClient,
  input: {
    userId: string;
    workerId: string;
    title: string;
    message: string;
    type: string;
    documentId: string;
  }
): Promise<void> {
  let payload: Record<string, unknown> = {
    user_id: input.userId,
    recipient_id: input.userId,
    worker_id: input.workerId,
    title: input.title,
    message: input.message,
    type: input.type,
    read: false,
    is_read: false,
    metadata: {
      document_id: input.documentId,
      sent_at: new Date().toISOString(),
    },
  };

  for (let attempt = 0; attempt <= OPTIONAL_NOTIFICATION_COLUMNS.length + 2; attempt += 1) {
    const { error } = await admin.from("notifications").insert([payload]);
    if (!error) return;
    if (isSupabaseMissingColumnError(error)) {
      const parsed = parseMissingColumnFromError(error.message);
      if (parsed && parsed in payload) {
        if (parsed === "user_id" && payload.recipient_id) {
          payload = stripMissingColumn(payload, "user_id");
          continue;
        }
        payload = stripMissingColumn(payload, parsed);
        continue;
      }
    }
    if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
      return;
    }
    console.warn("[compliance-reminders] notification insert failed:", error.message);
    return;
  }
}

export async function sendComplianceReminders(
  admin: SupabaseClient,
  input: {
    kind: ComplianceReminderKind;
    workerIds: string[];
    documentTitle: string;
    documentId?: string | null;
    createdByWorkerId?: string | null;
  }
): Promise<{ emailed: number; sms: number; notified: number; errors: string[] }> {
  const uniqueIds = [
    ...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean)),
  ];
  if (uniqueIds.length === 0) {
    return { emailed: 0, sms: 0, notified: 0, errors: [] };
  }

  const workerSelectAttempts = [
    "id, email, phone, full_name, first_name, last_name, auth_user_id, user_id",
    "id, email, phone, full_name, first_name, last_name, auth_user_id",
    "id, email, phone, full_name, auth_user_id",
    "id, email, full_name, auth_user_id",
    "id, email, full_name",
    "id, email",
  ];

  let workersLookup = await admin
    .from("workers")
    .select(workerSelectAttempts[0])
    .in("id", uniqueIds);

  for (let i = 1; i < workerSelectAttempts.length && workersLookup.error; i += 1) {
    const message = workersLookup.error.message.toLowerCase();
    if (
      !message.includes("column") &&
      !message.includes("schema cache") &&
      !message.includes("could not find")
    ) {
      break;
    }
    workersLookup = await admin
      .from("workers")
      .select(workerSelectAttempts[i])
      .in("id", uniqueIds);
  }

  if (workersLookup.error) {
    return { emailed: 0, sms: 0, notified: 0, errors: [workersLookup.error.message] };
  }

  const workers = workersLookup.data;

  const title = input.documentTitle.trim() || (input.kind === "swms" ? "SWMS" : "Induction");
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const isSwms = input.kind === "swms";
  const heading = isSwms ? "SWMS sign-off required" : "Induction incomplete";
  const subject = isSwms
    ? `SWMS sign-off required: ${title}`
    : `Induction reminder: ${title}`;
  const inAppTitle = isSwms ? "SWMS Incomplete" : "Induction Incomplete";
  const inAppType = isSwms ? "swms_reminder" : "induction_reminder";

  let emailed = 0;
  let notified = 0;
  const errors: string[] = [];
  const smsWorkerIds: string[] = [];

  for (const row of workers ?? []) {
    const workerId = String((row as { id?: string }).id ?? "").trim();
    if (!workerId) continue;

    const email = String((row as { email?: string | null }).email ?? "")
      .trim()
      .toLowerCase();
    const authUserId = firstNonEmpty(
      (row as { auth_user_id?: string | null }).auth_user_id,
      (row as { user_id?: string | null }).user_id
    );
    const deepLink = `${siteUrl}${buildWorkerDeepLinkPath(
      { type: isSwms ? "swms" : "induction" },
      workerId
    )}`;

    if (authUserId) {
      await insertInAppNotification(admin, {
        userId: authUserId,
        workerId,
        title: inAppTitle,
        message: `Reminder: Please complete your assigned ${isSwms ? "SWMS" : "induction"}: ${title}`,
        type: inAppType,
        documentId: input.documentId?.trim() || "",
      });
      notified += 1;
    }

    if (email && email.includes("@")) {
      const result = await sendEmail({
        to: [email],
        subject,
        text: [
          `Please complete your assigned ${isSwms ? "SWMS" : "induction"}: ${title}.`,
          "",
          `Open your worker dashboard:`,
          deepLink,
        ].join("\n"),
        html: `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
            <p style="margin:0 0 16px">
              Please complete <strong>${escapeHtml(title)}</strong>.
            </p>
            <p style="margin:0 0 24px">
              <a href="${deepLink}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
                Open Worker Dashboard
              </a>
            </p>
          </div>
        `,
      });
      if (result.sent) emailed += 1;
      else if (result.error) errors.push(`${email}: ${result.error}`);
    }

    smsWorkerIds.push(workerId);
  }

  let sms = 0;
  if (smsWorkerIds.length > 0) {
    try {
      const smsResult = await composeSmsAdmin(admin, {
        message_body: `SiteBolt reminder: please complete your assigned ${
          isSwms ? "SWMS" : "induction"
        } (${title}).`,
        target_mode: "selected_workers",
        worker_ids: smsWorkerIds,
        send_mode: "immediate",
        created_by: input.createdByWorkerId ?? null,
      });
      sms = smsResult.sent ?? 0;
      if (smsResult.error) {
        errors.push(smsResult.error);
      }
    } catch (cause) {
      errors.push(cause instanceof Error ? cause.message : "SMS reminder failed.");
    }
  }

  return { emailed, sms, notified, errors };
}
