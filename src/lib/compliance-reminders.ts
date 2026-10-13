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

export type ComplianceReminderKind = "swms" | "induction" | "voc" | "licence";
export type ComplianceNoticeMode = "assigned" | "reminder" | "expiry";

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

function isMissingColumnMessage(message: string, column?: string): boolean {
  const lower = message.toLowerCase();
  if (
    !lower.includes("column") &&
    !lower.includes("schema cache") &&
    !lower.includes("could not find")
  ) {
    return false;
  }
  if (!column) return true;
  return lower.includes(column.toLowerCase());
}

function copyForNotice(input: {
  kind: ComplianceReminderKind;
  mode: ComplianceNoticeMode;
  title: string;
  daysRemaining?: number | null;
  expiryDate?: string | null;
}): {
  heading: string;
  subject: string;
  inAppTitle: string;
  inAppType: string;
  inAppMessage: string;
  textBody: string;
  htmlBody: (deepLink: string) => string;
  smsBody: string;
} {
  const title = input.title;
  const expiryLabel = input.expiryDate?.slice(0, 10) || "the expiry date";
  const daysLabel =
    typeof input.daysRemaining === "number"
      ? input.daysRemaining < 0
        ? `expired ${Math.abs(input.daysRemaining)} day(s) ago`
        : `${input.daysRemaining} day(s) remaining`
      : "due soon";

  if (input.kind === "voc" || input.kind === "licence") {
    const noun = input.kind === "voc" ? "VOC" : "driver's licence";
    const heading =
      input.kind === "voc" ? "VOC expiring soon" : "Driver's licence expiring soon";
    return {
      heading,
      subject: `${heading}: ${title}`,
      inAppTitle: heading,
      inAppType: input.kind === "voc" ? "voc_expiry" : "licence_expiry",
      inAppMessage: `Your ${noun} (${title}) is ${daysLabel}. Please update it before ${expiryLabel}.`,
      textBody: [
        `Your ${noun} (${title}) is ${daysLabel}.`,
        `Please update your records before ${expiryLabel}.`,
      ].join("\n"),
      htmlBody: (deepLink) => `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
            <p style="margin:0 0 16px">
              Your ${escapeHtml(noun)} <strong>${escapeHtml(title)}</strong> is
              ${escapeHtml(daysLabel)}. Please update it before ${escapeHtml(expiryLabel)}.
            </p>
            <p style="margin:0 0 24px">
              <a href="${deepLink}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
                Open Worker Dashboard
              </a>
            </p>
          </div>
        `,
      smsBody: `SiteBolt: your ${noun} (${title}) is ${daysLabel}. Please update it in your worker dashboard.`,
    };
  }

  const isSwms = input.kind === "swms";
  const noun = isSwms ? "SWMS" : "induction";
  const assigned = input.mode === "assigned";
  const heading = assigned
    ? isSwms
      ? "SWMS assigned — sign-off required"
      : "Induction assigned"
    : isSwms
      ? "SWMS sign-off required"
      : "Induction incomplete";
  const subject = assigned
    ? `${noun} assigned: ${title}`
    : isSwms
      ? `SWMS sign-off required: ${title}`
      : `Induction reminder: ${title}`;
  const action = assigned
    ? `You have been assigned ${isSwms ? "a SWMS" : "an induction"}: ${title}. Please complete it.`
    : `Please complete your assigned ${noun}: ${title}.`;

  return {
    heading,
    subject,
    inAppTitle: assigned
      ? isSwms
        ? "SWMS Assigned"
        : "Induction Assigned"
      : isSwms
        ? "SWMS Incomplete"
        : "Induction Incomplete",
    inAppType: assigned
      ? isSwms
        ? "swms_assigned"
        : "induction_assigned"
      : isSwms
        ? "swms_reminder"
        : "induction_reminder",
    inAppMessage: action,
    textBody: action,
    htmlBody: (deepLink) => `
          <div style="font-family:Arial,sans-serif;line-height:1.5;color:#0f172a">
            <h2 style="margin:0 0 12px">${escapeHtml(heading)}</h2>
            <p style="margin:0 0 16px">${escapeHtml(action)}</p>
            <p style="margin:0 0 24px">
              <a href="${deepLink}" style="display:inline-block;background:#ea580c;color:#fff;padding:10px 16px;border-radius:8px;text-decoration:none;font-weight:600">
                Open Worker Dashboard
              </a>
            </p>
          </div>
        `,
    smsBody: assigned
      ? `SiteBolt: you have been assigned a ${noun} (${title}). Please complete it.`
      : `SiteBolt reminder: please complete your assigned ${noun} (${title}).`,
  };
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

export async function stampLastRemindedAt(
  admin: SupabaseClient,
  table: "swms_assignments" | "form_worker_assignments" | "worker_vocs",
  ids: string[]
): Promise<void> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from(table)
    .update({ last_reminded_at: now })
    .in("id", uniqueIds);
  if (error && !isMissingColumnMessage(error.message, "last_reminded_at")) {
    console.warn(`[compliance-reminders] stamp ${table} failed:`, error.message);
  }
}

export async function stampSwmsAssignmentsReminded(
  admin: SupabaseClient,
  input: { swmsId: string; workerIds: string[] }
): Promise<void> {
  const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))];
  const swmsId = input.swmsId.trim();
  if (!swmsId || workerIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("swms_assignments")
    .update({ last_reminded_at: now })
    .eq("swms_id", swmsId)
    .in("assignee_id", workerIds);
  if (error && isMissingColumnMessage(error.message, "assignee_id")) {
    await admin
      .from("swms_assignments")
      .update({ last_reminded_at: now })
      .eq("swms_id", swmsId)
      .in("worker_id", workerIds);
    return;
  }
  if (error && !isMissingColumnMessage(error.message, "last_reminded_at")) {
    console.warn("[compliance-reminders] stamp SWMS assignments failed:", error.message);
  }
}

export async function stampInductionAssignmentsReminded(
  admin: SupabaseClient,
  input: { formId: string; workerIds: string[] }
): Promise<void> {
  const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))];
  const formId = input.formId.trim();
  if (!formId || workerIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("form_worker_assignments")
    .update({ last_reminded_at: now })
    .eq("form_id", formId)
    .in("worker_id", workerIds);
  if (error && !isMissingColumnMessage(error.message, "last_reminded_at")) {
    console.warn("[compliance-reminders] stamp induction assignments failed:", error.message);
  }
}

export async function stampDriversLicenceRemindedAt(
  admin: SupabaseClient,
  workerIds: string[]
): Promise<void> {
  const uniqueIds = [...new Set(workerIds.map((id) => id.trim()).filter(Boolean))];
  if (uniqueIds.length === 0) return;
  const now = new Date().toISOString();
  const { error } = await admin
    .from("workers")
    .update({ drivers_licence_last_reminded_at: now })
    .in("id", uniqueIds);
  if (
    error &&
    !isMissingColumnMessage(error.message, "drivers_licence_last_reminded_at")
  ) {
    console.warn("[compliance-reminders] stamp licence reminded failed:", error.message);
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
    mode?: ComplianceNoticeMode;
    daysRemaining?: number | null;
    expiryDate?: string | null;
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

  const title =
    input.documentTitle.trim() ||
    (input.kind === "swms"
      ? "SWMS"
      : input.kind === "induction"
        ? "Induction"
        : input.kind === "voc"
          ? "VOC"
          : "Driver's licence");
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  const mode: ComplianceNoticeMode = input.mode ?? "reminder";
  const copy = copyForNotice({
    kind: input.kind,
    mode,
    title,
    daysRemaining: input.daysRemaining,
    expiryDate: input.expiryDate,
  });

  const deepLinkType =
    input.kind === "swms"
      ? "swms"
      : input.kind === "induction"
        ? "induction"
        : "details";

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
      { type: deepLinkType },
      workerId
    )}`;

    if (authUserId) {
      await insertInAppNotification(admin, {
        userId: authUserId,
        workerId,
        title: copy.inAppTitle,
        message: copy.inAppMessage,
        type: copy.inAppType,
        documentId: input.documentId?.trim() || "",
      });
      notified += 1;
    }

    if (email && email.includes("@")) {
      const result = await sendEmail({
        to: [email],
        subject: copy.subject,
        text: [copy.textBody, "", "Open your worker dashboard:", deepLink].join("\n"),
        html: copy.htmlBody(deepLink),
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
        message_body: copy.smsBody,
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

export async function notifySwmsAssignedAndStamp(
  admin: SupabaseClient,
  input: { workerIds: string[]; swmsId: string; swmsTitle?: string | null }
): Promise<{ emailed: number; sms: number; notified: number; errors: string[] }> {
  const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))];
  if (workerIds.length === 0) {
    return { emailed: 0, sms: 0, notified: 0, errors: [] };
  }

  let title = input.swmsTitle?.trim() || "";
  if (!title && input.swmsId) {
    const { data } = await admin
      .from("swms_documents")
      .select("title")
      .eq("id", input.swmsId)
      .maybeSingle();
    title = String((data as { title?: string } | null)?.title ?? "SWMS");
  }

  let result = { emailed: 0, sms: 0, notified: 0, errors: [] as string[] };
  try {
    result = await sendComplianceReminders(admin, {
      kind: "swms",
      mode: "assigned",
      workerIds,
      documentTitle: title || "SWMS",
      documentId: input.swmsId,
    });
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "SWMS assignment notify failed.";
    console.warn("[compliance-reminders] SWMS assignment notify failed:", message);
    result.errors.push(message);
  }

  if (result.emailed + result.sms + result.notified > 0) {
    await stampSwmsAssignmentsReminded(admin, {
      swmsId: input.swmsId,
      workerIds,
    });
  }
  return result;
}

export async function notifyInductionAssignedAndStamp(
  admin: SupabaseClient,
  input: { workerIds: string[]; formId: string; formTitle?: string | null }
): Promise<{ emailed: number; sms: number; notified: number; errors: string[] }> {
  const workerIds = [...new Set(input.workerIds.map((id) => id.trim()).filter(Boolean))];
  if (workerIds.length === 0) {
    return { emailed: 0, sms: 0, notified: 0, errors: [] };
  }

  let result = { emailed: 0, sms: 0, notified: 0, errors: [] as string[] };
  try {
    result = await sendComplianceReminders(admin, {
      kind: "induction",
      mode: "assigned",
      workerIds,
      documentTitle: input.formTitle?.trim() || "Induction",
      documentId: input.formId,
    });
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Induction assignment notify failed.";
    console.warn("[compliance-reminders] induction assignment notify failed:", message);
    result.errors.push(message);
  }

  if (result.emailed + result.sms + result.notified > 0) {
    await stampInductionAssignmentsReminded(admin, {
      formId: input.formId,
      workerIds,
    });
  }
  return result;
}

/** Immediate notify for pending SWMS/induction rows that have not yet been stamped. */
export async function notifyUnstampedPendingAssignments(
  admin: SupabaseClient,
  workerId: string
): Promise<void> {
  const trimmed = workerId.trim();
  if (!trimmed) return;

  const swmsSelects = [
    "id, swms_id, status, last_reminded_at, assignee_id, worker_id",
    "id, swms_id, status, assignee_id, worker_id",
    "id, swms_id, status, assignee_id",
  ];
  let swmsLookup = await admin
    .from("swms_assignments")
    .select(swmsSelects[0])
    .or(`assignee_id.eq.${trimmed},worker_id.eq.${trimmed}`)
    .eq("status", "Pending");
  if (swmsLookup.error) {
    swmsLookup = await admin
      .from("swms_assignments")
      .select(swmsSelects[2])
      .eq("assignee_id", trimmed)
      .eq("status", "Pending");
  }

  const swmsByDoc = new Map<string, true>();
  for (const raw of swmsLookup.data ?? []) {
    const row = raw as {
      swms_id?: string;
      last_reminded_at?: string | null;
    };
    if (row.last_reminded_at) continue;
    const swmsId = String(row.swms_id ?? "").trim();
    if (!swmsId || swmsByDoc.has(swmsId)) continue;
    swmsByDoc.set(swmsId, true);
    await notifySwmsAssignedAndStamp(admin, {
      workerIds: [trimmed],
      swmsId,
    });
  }

  const inductionSelects = [
    "id, form_id, form_title, status, last_reminded_at",
    "id, form_id, form_title, status",
    "id, form_id, status",
  ];
  let inductionLookup = await admin
    .from("form_worker_assignments")
    .select(inductionSelects[0])
    .eq("worker_id", trimmed);
  if (inductionLookup.error) {
    inductionLookup = await admin
      .from("form_worker_assignments")
      .select(inductionSelects[2])
      .eq("worker_id", trimmed);
  }

  const forms = new Map<string, string>();
  for (const raw of inductionLookup.data ?? []) {
    const row = raw as {
      form_id?: string;
      form_title?: string | null;
      status?: string | null;
      last_reminded_at?: string | null;
    };
    if (String(row.status ?? "").toLowerCase() === "completed") continue;
    if (row.last_reminded_at) continue;
    const formId = String(row.form_id ?? "").trim();
    if (!formId || forms.has(formId)) continue;
    forms.set(formId, String(row.form_title ?? "Induction"));
  }

  for (const [formId, formTitle] of forms) {
    await notifyInductionAssignedAndStamp(admin, {
      workerIds: [trimmed],
      formId,
      formTitle,
    });
  }
}
