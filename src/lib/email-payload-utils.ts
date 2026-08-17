import type { ComposeEmailInput, SaveEmailTemplateInput } from "./email-module-types";
import type { EmailMessageRow, EmailTargetMode } from "./email-module-types";

export type RawRecord = Record<string, unknown>;

function pickString(...values: unknown[]): string {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return "";
}

function plainTextToHtml(text: string): string {
  if (!text) return "";
  if (/<[a-z][\s\S]*>/i.test(text)) return text;
  return text.replace(/\n/g, "<br>");
}

export function normalizeSaveTemplateInput(raw: RawRecord): SaveEmailTemplateInput {
  const title = pickString(raw.title, raw.name) || "Untitled Template";
  const subject = pickString(raw.subject);
  const bodySource = pickString(raw.body, raw.content, raw.body_html, raw.bodyHtml, raw.text);
  const body = plainTextToHtml(bodySource);
  const category = (pickString(raw.category) || "general").toLowerCase();

  return {
    title,
    subject,
    body,
    category,
    created_by: raw.created_by ? String(raw.created_by) : null,
  };
}

export function buildTemplateAliasPayload(
  input: SaveEmailTemplateInput
): Record<string, string | null> {
  const title = input.title.trim() || "Untitled Template";
  const subject = input.subject.trim();
  const body = input.body.trim();
  const category = (input.category?.trim() || "general").toLowerCase();

  return {
    title,
    name: title,
    subject,
    body,
    body_html: body,
    content: body,
    category,
    created_by: input.created_by ?? null,
  };
}

const RECIPIENT_TYPE_ALIASES: Record<string, EmailTargetMode> = {
  all_workers: "all_workers",
  selected_workers: "selected_workers",
  selected_projects: "by_project",
  by_project: "by_project",
  specific_users: "custom_emails",
  custom_emails: "custom_emails",
};

export function normalizeComposeInput(raw: RawRecord): ComposeEmailInput {
  const subject = pickString(raw.subject);
  const bodySource = pickString(
    raw.body_html,
    raw.bodyHtml,
    raw.body,
    raw.content,
    raw.body_text,
    raw.bodyText
  );
  const bodyHtml = plainTextToHtml(bodySource);
  const bodyText =
    pickString(raw.body_text, raw.bodyText, raw.body, raw.content) ||
    bodyHtml.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim();

  const recipientType = pickString(raw.recipient_type, raw.recipientType, raw.target_mode);
  const targetMode =
    RECIPIENT_TYPE_ALIASES[recipientType] ??
    (recipientType as EmailTargetMode) ??
    "all_workers";

  const recipientEmails = Array.isArray(raw.recipient_emails)
    ? raw.recipient_emails.map(String).filter(Boolean)
    : Array.isArray(raw.recipientEmails)
      ? raw.recipientEmails.map(String).filter(Boolean)
      : [];

  const filterIds = Array.isArray(raw.recipient_filter_ids)
    ? raw.recipient_filter_ids.map(String).filter(Boolean)
    : Array.isArray(raw.recipientFilterIds)
      ? raw.recipientFilterIds.map(String).filter(Boolean)
      : [];

  const existingConfig =
    raw.target_config && typeof raw.target_config === "object"
      ? (raw.target_config as Record<string, unknown>)
      : {};

  const targetConfig = {
    worker_ids:
      targetMode === "selected_workers"
        ? filterIds.length
          ? filterIds
          : Array.isArray(existingConfig.worker_ids)
            ? existingConfig.worker_ids.map(String)
            : []
        : Array.isArray(existingConfig.worker_ids)
          ? existingConfig.worker_ids.map(String)
          : undefined,
    project_ids:
      targetMode === "by_project"
        ? filterIds.length
          ? filterIds
          : Array.isArray(existingConfig.project_ids)
            ? existingConfig.project_ids.map(String)
            : []
        : Array.isArray(existingConfig.project_ids)
          ? existingConfig.project_ids.map(String)
          : undefined,
    custom_emails:
      targetMode === "custom_emails"
        ? recipientEmails.length
          ? recipientEmails
          : Array.isArray(existingConfig.custom_emails)
            ? existingConfig.custom_emails.map(String)
            : []
        : Array.isArray(existingConfig.custom_emails)
          ? existingConfig.custom_emails.map(String)
          : undefined,
  };

  const isScheduled =
    raw.status === "scheduled" ||
    raw.send_mode === "scheduled" ||
    Boolean(raw.scheduled_for ?? raw.scheduledFor);

  const isRecurring = raw.is_recurring === true || raw.isRecurring === true;
  const recurrenceRule = pickString(raw.recurrence_rule, raw.recurrenceRule) || null;

  return {
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    target_mode: targetMode,
    target_config: targetConfig,
    template_id: raw.template_id ? String(raw.template_id) : null,
    send_mode: isScheduled ? "scheduled" : "immediate",
    scheduled_for: isScheduled
      ? pickString(raw.scheduled_for, raw.scheduledFor) || null
      : null,
    recurrence_rule:
      isRecurring && recurrenceRule
        ? (recurrenceRule as ComposeEmailInput["recurrence_rule"])
        : null,
    created_by: pickString(raw.created_by) || "owner",
    created_by_name: pickString(raw.created_by_name, raw.created_byName) || "Owner",
    sender_email: pickString(raw.sender_email, raw.senderEmail) || null,
  };
}

export function resolveMessageBodyHtml(message: EmailMessageRow | RawRecord): string {
  const record = message as RawRecord;
  return String(record.body_html ?? record.body ?? record.content ?? "");
}

export function resolveMessageBodyText(message: EmailMessageRow | RawRecord): string {
  const record = message as RawRecord;
  const html = resolveMessageBodyHtml(message);
  return String(
    record.body_text ??
      record.bodyText ??
      html.replace(/<br\s*\/?>/gi, "\n").replace(/<[^>]+>/g, "").trim()
  );
}

export function messageBodyPreview(html: string, limit = 140): string {
  return resolveMessageBodyHtml({ body_html: html })
    .replace(/<[^>]+>/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, limit);
}
