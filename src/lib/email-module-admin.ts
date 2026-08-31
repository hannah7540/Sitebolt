import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email-service";
import {
  DEFAULT_SYSTEM_FROM_ADDRESS,
  DEFAULT_SYSTEM_FROM_NAME,
  resolveSystemFromEmail,
} from "./email-config";
import { extractThreadIdFromReplyAddress } from "./email-inbound-parser";
import {
  appendSignatureHtml,
  appendSignatureText,
  hasEmbeddedSignature,
  htmlToPlainText as signatureHtmlToPlainText,
} from "./email-signature-utils";
import {
  normalizeComposeInput,
  normalizeSaveTemplateInput,
  resolveMessageBodyHtml,
} from "./email-payload-utils";
import type {
  ComposeEmailInput,
  EmailListFilters,
  EmailMessageRow,
  EmailRecurrenceRule,
  EmailSignatureRow,
  EmailTargetConfig,
  EmailTargetMode,
  EmailTemplateRow,
  InboundEmailWebhookPayload,
  SaveEmailSignatureInput,
  SaveEmailTemplateInput,
} from "./email-module-types";

const EMAIL_ATTACHMENTS_BUCKET = "email-attachments";

function buildReplyToAddress(threadId: string): string | undefined {
  const replyDomain = process.env.EMAIL_INBOUND_REPLY_DOMAIN?.trim();
  if (replyDomain) {
    return `thread-${threadId}@${replyDomain}`;
  }
  return process.env.EMAIL_REPLY_TO?.trim() || undefined;
}

function buildOutboundSubject(subject: string, threadId: string): string {
  const marker = `[Ref:${threadId.slice(0, 8)}]`;
  if (subject.includes(marker)) return subject;
  return `${marker} ${subject}`;
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

/** Columns that may be absent depending on which email_messages schema is live. */
const OPTIONAL_EMAIL_MESSAGE_COLUMNS = [
  "cc_emails",
  "bcc_emails",
  "attachment_urls",
  "parent_message_id",
  "recurrence_rule",
  "recurrence_active",
  "sender_worker_id",
  "sender_name",
  "sender_email",
  "external_message_id",
  "error_message",
  "created_by_name",
  "created_by",
  "is_read",
  "read_at",
  "last_sent_at",
  "to_emails",
  "recipient_emails",
  "recipient_type",
  "recipient_filter_ids",
  "target_mode",
  "target_config",
  "template_id",
  "scheduled_for",
  "body",
  "content",
  "body_text",
  "from",
  "from_name",
  "from_email",
  "thread_id",
] as const;

function isMissingEmailMessageColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    lower.includes(col) &&
    (lower.includes("schema cache") ||
      lower.includes("could not find") ||
      lower.includes("does not exist") ||
      (lower.includes("column") && lower.includes(col)))
  );
}

function extractMissingColumnName(message: string): string | null {
  const patterns = [
    /could not find the ['"]([^'"]+)['"] column/i,
    /column ['"]([^'"]+)['"] of relation/i,
    /column ([a-z0-9_]+) does not exist/i,
  ];
  for (const pattern of patterns) {
    const match = message.match(pattern);
    if (match?.[1]) return match[1];
  }
  return null;
}

function parseSenderIdentity(input?: string | null): { email: string; name: string } {
  const raw = String(input ?? "").trim() || resolveSystemFromEmail();
  const angled = raw.match(/^(.*?)<([^>]+)>\s*$/);
  if (angled) {
    const name =
      angled[1].trim().replace(/^["']|["']$/g, "") || DEFAULT_SYSTEM_FROM_NAME;
    return { email: angled[2].trim(), name };
  }
  if (raw.includes("@")) {
    return { email: raw, name: DEFAULT_SYSTEM_FROM_NAME };
  }
  return { email: DEFAULT_SYSTEM_FROM_ADDRESS, name: raw || DEFAULT_SYSTEM_FROM_NAME };
}

function mapRecipientTypeLabel(mode: EmailTargetMode | null | undefined): string {
  switch (mode) {
    case "all_workers":
      return "all_workers";
    case "by_project":
      return "project";
    case "custom_emails":
      return "custom";
    case "selected_workers":
    default:
      return "worker";
  }
}

function resolveRecipientFilterIds(config: EmailTargetConfig): string[] {
  if (config.worker_ids?.length) return config.worker_ids;
  if (config.project_ids?.length) return config.project_ids;
  return [];
}

/**
 * Build an outbound email_messages row mapped to the live Communications schema,
 * with legacy aliases included for dual-schema compatibility (stripped on miss).
 */
function buildOutboundEmailMessageRecord(input: {
  subject: string;
  htmlBody: string;
  textBody?: string | null;
  recipientEmails: string[];
  recipientType?: string | null;
  recipientFilterIds?: string[];
  targetMode?: EmailTargetMode | null;
  targetConfig?: EmailTargetConfig;
  templateId?: string | null;
  ccEmails?: string[] | null;
  bccEmails?: string[] | null;
  senderEmail?: string | null;
  senderName?: string | null;
  status: "sent" | "pending" | "scheduled" | "draft";
  scheduledFor?: string | null;
  recurrenceRule?: EmailRecurrenceRule | null;
  createdBy?: string | null;
  createdByName?: string | null;
  threadId?: string | null;
  sentAt?: string | null;
}): Record<string, unknown> {
  const now = new Date().toISOString();
  const textBody = String(input.textBody ?? "").trim() || htmlToPlainText(input.htmlBody);
  const htmlBody = input.htmlBody;
  const recipientEmails = Array.isArray(input.recipientEmails)
    ? input.recipientEmails.filter(Boolean)
    : [];
  const ccEmails = Array.isArray(input.ccEmails) ? input.ccEmails.filter(Boolean) : [];
  const bccEmails = Array.isArray(input.bccEmails) ? input.bccEmails.filter(Boolean) : [];
  const sender = parseSenderIdentity(input.senderEmail);
  const senderName = input.senderName?.trim() || sender.name || "SiteBolt";
  const senderEmail = sender.email;
  const recipientType =
    input.recipientType?.trim() || mapRecipientTypeLabel(input.targetMode);
  const filterIds =
    input.recipientFilterIds ??
    resolveRecipientFilterIds(input.targetConfig ?? {});

  // Prefer live Communications schema fields; dual-write legacy aliases.
  const status = input.status;

  return {
    direction: "outbound",
    status,
    subject: input.subject,
    body_html: htmlBody,
    body_text: textBody || "",
    body: textBody || htmlBody,
    content: textBody || htmlBody,
    sender_email: senderEmail,
    sender_name: senderName,
    from_email: senderEmail,
    from: senderEmail,
    from_name: senderName,
    recipient_emails: recipientEmails,
    recipient_type: recipientType,
    recipient_filter_ids: filterIds,
    // Legacy / dual-schema aliases
    to_emails: recipientEmails,
    target_mode: input.targetMode ?? null,
    target_config: input.targetConfig ?? {},
    template_id: input.templateId ?? null,
    cc_emails: ccEmails,
    bcc_emails: bccEmails,
    sent_at: input.sentAt ?? (status === "sent" ? now : null),
    thread_id: input.threadId ?? null,
    scheduled_for: input.scheduledFor ?? null,
    recurrence_rule: input.recurrenceRule ?? null,
    recurrence_active: Boolean(input.recurrenceRule),
    created_by: input.createdBy ?? null,
    created_by_name: input.createdByName ?? null,
    created_at: now,
    updated_at: now,
  };
}

/**
 * Insert into email_messages, stripping optional/unknown columns reported missing
 * by PostgREST schema cache.
 */
async function insertEmailMessageAdmin(
  admin: SupabaseClient,
  payload: Record<string, unknown>
): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  let current: Record<string, unknown> = { ...payload };

  for (let attempt = 0; attempt < 40; attempt++) {
    const { data, error } = await admin
      .from("email_messages")
      .insert(current)
      .select("*")
      .single();

    if (!error) {
      return { data: (data as Record<string, unknown> | null) ?? null, error: null };
    }

    const extracted = extractMissingColumnName(error.message);
    const missingColumn =
      (extracted && extracted in current ? extracted : null) ||
      OPTIONAL_EMAIL_MESSAGE_COLUMNS.find(
        (column) =>
          column in current && isMissingEmailMessageColumnError(error.message, column)
      );

    if (missingColumn && missingColumn in current) {
      const { [missingColumn]: _removed, ...rest } = current;
      current = rest;
      continue;
    }

    // Live schema may only allow sent|pending.
    const lower = error.message.toLowerCase();
    if (
      lower.includes("status") &&
      (current.status === "scheduled" ||
        current.status === "draft" ||
        current.status === "failed")
    ) {
      current = {
        ...current,
        status: current.status === "failed" ? "pending" : "pending",
      };
      continue;
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "Failed to insert email message." };
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function parseTargetConfig(value: unknown): EmailTargetConfig {
  if (!value || typeof value !== "object") return {};
  const record = value as Record<string, unknown>;
  return {
    worker_ids: parseStringArray(record.worker_ids),
    project_ids: parseStringArray(record.project_ids),
    custom_emails: parseStringArray(record.custom_emails),
  };
}

function normalizeTemplateCategory(value: unknown): string {
  const raw = String(value ?? "general").trim();
  if (!raw) return "general";
  return raw.charAt(0).toUpperCase() + raw.slice(1).toLowerCase();
}

function normalizeTemplate(row: Record<string, unknown>): EmailTemplateRow {
  const title = String(row.title ?? row.name ?? "");
  const body = String(row.body ?? row.body_html ?? row.content ?? "");
  return {
    id: String(row.id),
    title,
    subject: String(row.subject ?? ""),
    body,
    category: normalizeTemplateCategory(row.category),
    created_by: row.created_by ? String(row.created_by) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function normalizeMessage(row: Record<string, unknown>): EmailMessageRow {
  const recipients = parseStringArray(
    row.recipient_emails ?? row.to_emails ?? row.recipients
  );
  return {
    id: String(row.id),
    thread_id: row.thread_id ? String(row.thread_id) : null,
    parent_message_id: row.parent_message_id ? String(row.parent_message_id) : null,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    status: String(row.status ?? "draft") as EmailMessageRow["status"],
    subject: String(row.subject ?? ""),
    body_html: resolveMessageBodyHtml(row),
    body_text: row.body_text
      ? String(row.body_text)
      : row.body
        ? String(row.body)
        : null,
    from_email: row.from_email
      ? String(row.from_email)
      : row.from
        ? String(row.from)
        : null,
    to_emails: recipients,
    cc_emails: parseStringArray(row.cc_emails),
    target_mode: row.target_mode
      ? (String(row.target_mode) as EmailTargetMode)
      : row.recipient_type
        ? (String(row.recipient_type) as EmailTargetMode)
        : null,
    target_config: parseTargetConfig(row.target_config ?? {
      worker_ids: parseStringArray(row.recipient_filter_ids),
    }),
    template_id: row.template_id ? String(row.template_id) : null,
    scheduled_for: row.scheduled_for ? String(row.scheduled_for) : null,
    recurrence_rule: row.recurrence_rule
      ? (String(row.recurrence_rule) as EmailRecurrenceRule)
      : null,
    recurrence_active: row.recurrence_active !== false,
    last_sent_at: row.last_sent_at ? String(row.last_sent_at) : null,
    sent_at: row.sent_at ? String(row.sent_at) : null,
    is_read: row.is_read === true,
    read_at: row.read_at ? String(row.read_at) : null,
    sender_worker_id: row.sender_worker_id ? String(row.sender_worker_id) : null,
    sender_name: row.sender_name
      ? String(row.sender_name)
      : row.from_name
        ? String(row.from_name)
        : null,
    sender_email: row.sender_email
      ? String(row.sender_email)
      : row.from_email
        ? String(row.from_email)
        : null,
    external_message_id: row.external_message_id ? String(row.external_message_id) : null,
    error_message: row.error_message ? String(row.error_message) : null,
    attachment_urls: parseStringArray(row.attachment_urls),
    created_by: row.created_by ? String(row.created_by) : null,
    created_by_name: row.created_by_name ? String(row.created_by_name) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

function htmlToPlainText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<li>/gi, "- ")
    .replace(/<[^>]+>/g, "")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function addRecurrence(base: Date, rule: EmailRecurrenceRule): Date {
  const next = new Date(base);
  switch (rule) {
    case "daily":
      next.setDate(next.getDate() + 1);
      break;
    case "weekly":
      next.setDate(next.getDate() + 7);
      break;
    case "fortnightly":
      next.setDate(next.getDate() + 14);
      break;
    case "monthly":
      next.setMonth(next.getMonth() + 1);
      break;
  }
  return next;
}

export async function resolveEmailRecipientsAdmin(
  admin: SupabaseClient,
  targetMode: EmailTargetMode,
  targetConfig: EmailTargetConfig
): Promise<{ emails: string[]; error: string | null }> {
  const emails = new Set<string>();

  if (targetMode === "custom_emails") {
    for (const email of targetConfig.custom_emails ?? []) {
      emails.add(email.toLowerCase());
    }
    return { emails: [...emails], error: null };
  }

  const { data: workers, error } = await admin
    .from("workers")
    .select("id, email, status, is_revoked, is_archived, assigned_project_ids");

  if (error) {
    return { emails: [], error: error.message };
  }

  const activeWorkers = (workers ?? []).filter((worker) => {
    const record = worker as Record<string, unknown>;
    if (record.is_revoked === true || record.is_archived === true) return false;
    const status = String(record.status ?? "active");
    return status !== "Revoked";
  });

  if (targetMode === "all_workers") {
    for (const worker of activeWorkers) {
      const email = String((worker as Record<string, unknown>).email ?? "").trim();
      if (email) emails.add(email.toLowerCase());
    }
    return { emails: [...emails], error: null };
  }

  if (targetMode === "selected_workers") {
    const selected = new Set(targetConfig.worker_ids ?? []);
    for (const worker of activeWorkers) {
      const record = worker as Record<string, unknown>;
      if (!selected.has(String(record.id))) continue;
      const email = String(record.email ?? "").trim();
      if (email) emails.add(email.toLowerCase());
    }
    return { emails: [...emails], error: null };
  }

  if (targetMode === "by_project") {
    const projectIds = new Set(targetConfig.project_ids ?? []);
    const { data: assignments } = await admin
      .from("project_worker_assignments")
      .select("project_id, worker_id, status");

    const workerIds = new Set<string>();
    for (const row of assignments ?? []) {
      const record = row as Record<string, unknown>;
      if (record.status === "Transferred") continue;
      if (!projectIds.has(String(record.project_id))) continue;
      workerIds.add(String(record.worker_id));
    }

    for (const worker of activeWorkers) {
      const record = worker as Record<string, unknown>;
      const workerId = String(record.id);
      const assigned = parseStringArray(record.assigned_project_ids);
      const matchesProject =
        workerIds.has(workerId) ||
        assigned.some((projectId) => projectIds.has(projectId));
      if (!matchesProject) continue;
      const email = String(record.email ?? "").trim();
      if (email) emails.add(email.toLowerCase());
    }
  }

  return { emails: [...emails], error: null };
}

export async function fetchEmailTemplatesAdmin(
  admin: SupabaseClient
): Promise<{ templates: EmailTemplateRow[]; error: string | null }> {
  try {
    const { data, error } = await admin
      .from("email_templates")
      .select("*")
      .order("updated_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message, "email_templates")) {
        return { templates: [], error: null };
      }
      return { templates: [], error: error.message };
    }

    return {
      templates: (data ?? []).map((row) => normalizeTemplate(row as Record<string, unknown>)),
      error: null,
    };
  } catch (error) {
    return {
      templates: [],
      error: error instanceof Error ? error.message : "Failed to load templates.",
    };
  }
}

export async function saveEmailTemplateAdmin(
  admin: SupabaseClient,
  input: SaveEmailTemplateInput | Record<string, unknown>,
  templateId?: string | null
): Promise<{ template: EmailTemplateRow | null; error: string | null }> {
  try {
    const normalized = normalizeSaveTemplateInput(input as Record<string, unknown>);
    const subject = normalized.subject;
    const body = normalized.body;
    const title = normalized.title || subject || "Untitled Template";

    if (!subject) {
      return { template: null, error: "Subject is required." };
    }
    if (!body) {
      return { template: null, error: "Body is required." };
    }

    const now = new Date().toISOString();
    const category = (normalized.category?.trim() || "general").toLowerCase();
    const payload: Record<string, unknown> = {
      title,
      subject,
      body,
      category,
      created_by: normalized.created_by ?? null,
      updated_at: now,
    };

    const writeTemplate = async (writePayload: Record<string, unknown>) => {
      if (templateId) {
        return admin
          .from("email_templates")
          .update(writePayload)
          .eq("id", templateId)
          .select("*")
          .maybeSingle();
      }

      return admin
        .from("email_templates")
        .insert({ ...writePayload, created_at: now })
        .select("*")
        .single();
    };

    let { data, error } = await writeTemplate(payload);

    if (error && isLegacyTemplateColumnError(error.message)) {
      const legacyPayload: Record<string, unknown> = {
        name: title,
        subject,
        body_html: body,
        body_text: htmlToPlainText(body),
        category: normalizeTemplateCategory(category),
        created_by: normalized.created_by ?? null,
        updated_at: now,
      };
      ({ data, error } = await writeTemplate(legacyPayload));
    }

    if (error) {
      if (isMissingTableError(error.message, "email_templates")) {
        return {
          template: null,
          error: "Email templates table is not available. Apply migration 116.",
        };
      }
      return { template: null, error: error.message };
    }

    return data
      ? { template: normalizeTemplate(data as Record<string, unknown>), error: null }
      : { template: null, error: templateId ? "Template not found." : "Failed to save template." };
  } catch (error) {
    console.error("[saveEmailTemplateAdmin] Failed to save template:", error);
    return {
      template: null,
      error: error instanceof Error ? error.message : "Failed to save template.",
    };
  }
}

function isLegacyTemplateColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  if (lower.includes("body is required") || lower.includes("subject is required")) {
    return false;
  }
  return (
    (lower.includes("column") &&
      (lower.includes("title") ||
        lower.includes("body_html") ||
        (lower.includes("'body'") && !lower.includes("body_text")))) ||
    lower.includes("schema cache") ||
    (lower.includes("could not find") && lower.includes("column"))
  );
}

export async function deleteEmailTemplateAdmin(
  admin: SupabaseClient,
  templateId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.from("email_templates").delete().eq("id", templateId);
  return { error: error?.message ?? null };
}

export async function fetchEmailMessagesAdmin(
  admin: SupabaseClient,
  filters: EmailListFilters
): Promise<{ messages: EmailMessageRow[]; error: string | null }> {
  try {
    let query = admin.from("email_messages").select("*");

    if (filters.folder === "inbox") {
      query = query.eq("direction", "inbound");
    } else if (filters.folder === "sent") {
      query = query.eq("direction", "outbound").eq("status", "sent");
    } else if (filters.folder === "scheduled") {
      query = query.eq("direction", "outbound").eq("status", "scheduled");
    }

    if (filters.dateFrom) {
      query = query.gte("created_at", filters.dateFrom);
    }
    if (filters.dateTo) {
      query = query.lte("created_at", `${filters.dateTo}T23:59:59.999Z`);
    }

    const { data, error } = await query.order("created_at", { ascending: false });

    if (error) {
      if (isMissingTableError(error.message, "email_messages")) {
        return { messages: [], error: null };
      }
      return { messages: [], error: error.message };
    }

    let messages = (data ?? []).map((row) =>
      normalizeMessage(row as Record<string, unknown>)
    );

    if (filters.search?.trim()) {
      const term = filters.search.trim().toLowerCase();
      messages = messages.filter((message) => {
        const haystack = [
          message.subject,
          message.body_text ?? "",
          message.body_html ?? "",
          message.sender_name ?? "",
          message.sender_email ?? "",
          ...message.to_emails,
        ]
          .join(" ")
          .toLowerCase();
        return haystack.includes(term);
      });
    }

    if (filters.workerId) {
      messages = messages.filter((message) => {
        const config = message.target_config;
        if (config.worker_ids?.includes(filters.workerId!)) return true;
        return message.sender_worker_id === filters.workerId;
      });
    }

    if (filters.projectId) {
      messages = messages.filter((message) =>
        message.target_config.project_ids?.includes(filters.projectId!)
      );
    }

    if (filters.folder === "inbox") {
      messages.sort((a, b) =>
        (b.sent_at ?? b.created_at).localeCompare(a.sent_at ?? a.created_at)
      );
      const threadMap = new Map<string, EmailMessageRow>();
      for (const message of messages) {
        const key = message.thread_id ?? message.id;
        const existing = threadMap.get(key);
        if (!existing || message.created_at > existing.created_at) {
          threadMap.set(key, message);
        }
      }
      messages = [...threadMap.values()].sort((a, b) =>
        b.created_at.localeCompare(a.created_at)
      );
    }

    return { messages, error: null };
  } catch (error) {
    return {
      messages: [],
      error: error instanceof Error ? error.message : "Failed to load messages.",
    };
  }
}

export async function fetchEmailThreadAdmin(
  admin: SupabaseClient,
  threadId: string
): Promise<{ messages: EmailMessageRow[]; error: string | null }> {
  const { data, error } = await admin
    .from("email_messages")
    .select("*")
    .or(`thread_id.eq.${threadId},id.eq.${threadId}`)
    .order("created_at", { ascending: true });

  if (error) return { messages: [], error: error.message };
  return {
    messages: (data ?? []).map((row) => normalizeMessage(row as Record<string, unknown>)),
    error: null,
  };
}

export async function fetchUnreadInboundCountAdmin(
  admin: SupabaseClient
): Promise<{ count: number; error: string | null }> {
  const { count, error } = await admin
    .from("email_messages")
    .select("id", { count: "exact", head: true })
    .eq("direction", "inbound")
    .eq("is_read", false);

  if (error) {
    if (isMissingTableError(error.message, "email_messages")) {
      return { count: 0, error: null };
    }
    return { count: 0, error: error.message };
  }

  return { count: count ?? 0, error: null };
}

async function dispatchOutboundMessageAdmin(
  admin: SupabaseClient,
  messageId: string
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const { data: row, error: fetchError } = await admin
    .from("email_messages")
    .select("*")
    .eq("id", messageId)
    .maybeSingle();

  if (fetchError) return { message: null, error: fetchError.message };
  if (!row) return { message: null, error: "Email message not found." };

  const message = normalizeMessage(row as Record<string, unknown>);
  const targetMode = message.target_mode ?? "custom_emails";
  const recipientResult = await resolveEmailRecipientsAdmin(
    admin,
    targetMode,
    message.target_config
  );
  if (recipientResult.error) return { message: null, error: recipientResult.error };

  const recipients =
    recipientResult.emails.length > 0 ? recipientResult.emails : message.to_emails;

  if (recipients.length === 0) {
    return { message: null, error: "No recipients resolved for this email." };
  }

  const threadId = message.thread_id ?? message.id;
  const fromEmail = resolveSystemFromEmail();

  let bodyHtml = message.body_html;
  let bodyText = message.body_text ?? htmlToPlainText(message.body_html);

  if (!hasEmbeddedSignature(bodyHtml)) {
    const liveSignature = await fetchLiveEmailSignatureAdmin(admin);
    if (liveSignature.signature?.body_html.trim()) {
      bodyHtml = appendSignatureHtml(bodyHtml, liveSignature.signature.body_html);
      bodyText = appendSignatureText(
        bodyText,
        liveSignature.signature.body_text ??
          signatureHtmlToPlainText(liveSignature.signature.body_html)
      );
    }
  }

  const text = bodyText;
  const outboundSubject = buildOutboundSubject(message.subject, threadId);
  const replyTo = buildReplyToAddress(threadId);

  const sendResult = await sendEmail({
    to: recipients,
    subject: outboundSubject,
    html: bodyHtml,
    text,
    replyTo,
    headers: {
      "X-SiteBolt-Thread-Id": threadId,
      "Reply-To": replyTo ?? fromEmail,
    },
  });

  const now = new Date().toISOString();
  const nextStatus = sendResult.sent ? "sent" : "failed";
  const sender = parseSenderIdentity(fromEmail);

  const updatePayload: Record<string, unknown> = {
    thread_id: threadId,
    status: sendResult.sent ? "sent" : "pending",
    subject: outboundSubject,
    body_html: bodyHtml,
    body_text: bodyText,
    body: bodyText || bodyHtml,
    content: bodyText || bodyHtml,
    recipient_emails: recipients,
    to_emails: recipients,
    from_email: sender.email,
    from: sender.email,
    from_name: sender.name,
    sender_email: sender.email,
    sender_name: sender.name,
    sent_at: sendResult.sent ? now : null,
    last_sent_at: sendResult.sent ? now : message.last_sent_at,
    external_message_id: sendResult.messageId ?? null,
    error_message: sendResult.error ?? null,
    updated_at: now,
  };

  // Prefer live status values; fall back if CHECK rejects 'failed'.
  let currentUpdate = { ...updatePayload };
  let updated: Record<string, unknown> | null = null;
  let updateErrorMessage: string | null = null;

  for (let attempt = 0; attempt < 30; attempt++) {
    const { data, error } = await admin
      .from("email_messages")
      .update(currentUpdate)
      .eq("id", messageId)
      .select("*")
      .single();

    if (!error) {
      updated = data as Record<string, unknown>;
      updateErrorMessage = null;
      break;
    }

    updateErrorMessage = error.message;
    const extracted = extractMissingColumnName(error.message);
    const missingColumn =
      (extracted && extracted in currentUpdate ? extracted : null) ||
      OPTIONAL_EMAIL_MESSAGE_COLUMNS.find(
        (column) =>
          column in currentUpdate &&
          isMissingEmailMessageColumnError(error.message, column)
      );

    if (missingColumn && missingColumn in currentUpdate) {
      const { [missingColumn]: _removed, ...rest } = currentUpdate;
      currentUpdate = rest;
      continue;
    }

    // Some schemas only allow sent|pending — map failed -> pending.
    if (
      currentUpdate.status === "pending" &&
      nextStatus === "failed" &&
      error.message.toLowerCase().includes("status")
    ) {
      currentUpdate = { ...currentUpdate, status: "pending" };
      continue;
    }

    break;
  }

  if (updateErrorMessage || !updated) {
    return { message: null, error: updateErrorMessage ?? "Failed to update email message." };
  }
  return { message: normalizeMessage(updated), error: null };
}

export async function composeEmailAdmin(
  admin: SupabaseClient,
  input: ComposeEmailInput | Record<string, unknown>
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const normalized = normalizeComposeInput(input as Record<string, unknown>);
  const recipientResult = await resolveEmailRecipientsAdmin(
    admin,
    normalized.target_mode,
    normalized.target_config
  );
  if (recipientResult.error) return { message: null, error: recipientResult.error };

  const recipientEmails = recipientResult.emails;
  if (recipientEmails.length === 0) {
    return { message: null, error: "No recipients resolved for this email." };
  }

  const rawInput = input as Record<string, unknown>;
  const ccEmails = parseStringArray(rawInput.cc_emails ?? rawInput.ccEmails);
  const bccEmails = parseStringArray(rawInput.bcc_emails ?? rawInput.bccEmails);
  const textBody =
    normalized.body_text ?? htmlToPlainText(normalized.body_html);

  const isImmediate = normalized.send_mode === "immediate";
  const payload = buildOutboundEmailMessageRecord({
    subject: normalized.subject.trim(),
    htmlBody: normalized.body_html,
    textBody,
    recipientEmails,
    recipientType: mapRecipientTypeLabel(normalized.target_mode),
    recipientFilterIds: resolveRecipientFilterIds(normalized.target_config),
    targetMode: normalized.target_mode,
    targetConfig: normalized.target_config,
    templateId: normalized.template_id ?? null,
    ccEmails,
    bccEmails,
    senderEmail: normalized.sender_email ?? resolveSystemFromEmail(),
    senderName: normalized.created_by_name || "SiteBolt",
    status: "pending",
    scheduledFor:
      normalized.send_mode === "scheduled" ? normalized.scheduled_for ?? null : null,
    recurrenceRule: normalized.recurrence_rule ?? null,
    createdBy: normalized.created_by,
    createdByName: normalized.created_by_name,
    sentAt: null,
  });

  // Keep legacy scheduled status when the live CHECK constraint supports it.
  if (!isImmediate) {
    payload.status = "scheduled";
  }

  const { data, error } = await insertEmailMessageAdmin(admin, payload);

  if (error) return { message: null, error };

  let message = normalizeMessage(data as Record<string, unknown>);

  const { data: threaded, error: threadError } = await admin
    .from("email_messages")
    .update({ thread_id: message.id })
    .eq("id", message.id)
    .select("*")
    .single();

  if (!threadError && threaded) {
    message = normalizeMessage(threaded as Record<string, unknown>);
  }

  if (normalized.send_mode === "immediate") {
    return dispatchOutboundMessageAdmin(admin, message.id);
  }

  return { message, error: null };
}

export async function updateScheduledEmailAdmin(
  admin: SupabaseClient,
  messageId: string,
  updates: Partial<{
    subject: string;
    body_html: string;
    scheduled_for: string | null;
    recurrence_rule: EmailRecurrenceRule | null;
    recurrence_active: boolean;
    status: EmailMessageRow["status"];
    target_mode: EmailTargetMode;
    target_config: EmailTargetConfig;
  }>
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const payload: Record<string, unknown> = {
    ...updates,
    updated_at: new Date().toISOString(),
  };

  if (updates.target_mode && updates.target_config) {
    const recipientResult = await resolveEmailRecipientsAdmin(
      admin,
      updates.target_mode,
      updates.target_config
    );
    if (recipientResult.error) return { message: null, error: recipientResult.error };
    payload.to_emails = recipientResult.emails;
  }

  const { data, error } = await admin
    .from("email_messages")
    .update(payload)
    .eq("id", messageId)
    .select("*")
    .maybeSingle();

  if (error) return { message: null, error: error.message };
  return data
    ? { message: normalizeMessage(data as Record<string, unknown>), error: null }
    : { message: null, error: "Scheduled email not found." };
}

export async function deleteScheduledEmailAdmin(
  admin: SupabaseClient,
  messageId: string
): Promise<{ error: string | null }> {
  const { error } = await admin.from("email_messages").delete().eq("id", messageId);
  return { error: error?.message ?? null };
}

export async function markEmailThreadReadAdmin(
  admin: SupabaseClient,
  threadId: string
): Promise<{ error: string | null }> {
  const now = new Date().toISOString();
  const { error } = await admin
    .from("email_messages")
    .update({ is_read: true, read_at: now, updated_at: now })
    .eq("direction", "inbound")
    .or(`thread_id.eq.${threadId},id.eq.${threadId}`);

  return { error: error?.message ?? null };
}

export async function processDueScheduledEmailsAdmin(
  admin: SupabaseClient
): Promise<{ processed: number; errors: string[] }> {
  const nowIso = new Date().toISOString();
  const { data, error } = await admin
    .from("email_messages")
    .select("*")
    .eq("direction", "outbound")
    .eq("status", "scheduled")
    .eq("recurrence_active", true)
    .lte("scheduled_for", nowIso);

  if (error) {
    return { processed: 0, errors: [error.message] };
  }

  let processed = 0;
  const errors: string[] = [];

  for (const row of data ?? []) {
    const message = normalizeMessage(row as Record<string, unknown>);
    const dispatch = await dispatchOutboundMessageAdmin(admin, message.id);
    if (dispatch.error) {
      errors.push(dispatch.error);
      continue;
    }
    processed += 1;

    if (message.recurrence_rule && message.scheduled_for) {
      const nextScheduled = addRecurrence(
        new Date(message.scheduled_for),
        message.recurrence_rule
      ).toISOString();
      await admin
        .from("email_messages")
        .update({
          status: "scheduled",
          scheduled_for: nextScheduled,
          updated_at: new Date().toISOString(),
        })
        .eq("id", message.id);
    }
  }

  return { processed, errors };
}

function extractEmailAddress(value: string): string {
  const match = value.match(/<([^>]+)>/);
  return (match?.[1] ?? value).trim().toLowerCase();
}

function extractDisplayName(value: string): string {
  const trimmed = value.trim();
  const match = trimmed.match(/^(.+?)\s*<[^>]+>$/);
  return match?.[1]?.replace(/"/g, "").trim() || trimmed;
}

async function uploadInboundAttachmentsAdmin(
  admin: SupabaseClient,
  threadId: string | null,
  attachments: InboundEmailWebhookPayload["attachments"]
): Promise<string[]> {
  if (!attachments?.length) return [];

  const urls: string[] = [];
  const prefix = threadId ?? "unthreaded";

  for (const attachment of attachments) {
    try {
      const buffer = Buffer.from(attachment.content, "base64");
      const safeName = attachment.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
      const path = `${prefix}/${Date.now()}-${safeName}`;
      const { error } = await admin.storage.from(EMAIL_ATTACHMENTS_BUCKET).upload(path, buffer, {
        contentType: attachment.contentType || "application/octet-stream",
        upsert: false,
      });
      if (error) continue;
      const { data } = admin.storage.from(EMAIL_ATTACHMENTS_BUCKET).getPublicUrl(path);
      if (data.publicUrl) urls.push(data.publicUrl);
    } catch {
      // Skip failed attachment uploads without blocking inbound ingest.
    }
  }

  return urls;
}

async function matchWorkerByEmailAdmin(
  admin: SupabaseClient,
  email: string
): Promise<{ id: string; full_name: string } | null> {
  if (!email) return null;
  const { data } = await admin
    .from("workers")
    .select("id, full_name, email")
    .ilike("email", email)
    .limit(1)
    .maybeSingle();

  if (!data) return null;
  return {
    id: String((data as Record<string, unknown>).id),
    full_name: String((data as Record<string, unknown>).full_name ?? ""),
  };
}

export async function ingestInboundEmailAdmin(
  admin: SupabaseClient,
  payload: InboundEmailWebhookPayload
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  try {
    const fromRaw = payload.from?.trim() ?? "";
    const subject = payload.subject?.trim() ?? "(No subject)";
    const bodyHtml =
      payload.html?.trim() || payload.text?.trim().replace(/\n/g, "<br>") || "";
    const bodyText = payload.text?.trim() || htmlToPlainText(bodyHtml);
    const senderEmail = extractEmailAddress(fromRaw);
    const headerThread =
      payload.thread_id?.trim() ||
      payload.headers?.["X-SiteBolt-Thread-Id"]?.trim() ||
      payload.headers?.["x-sitebolt-thread-id"]?.trim() ||
      null;

    const toValues = Array.isArray(payload.to)
      ? payload.to
      : payload.to
        ? [payload.to]
        : [];

    let threadId = headerThread;
    if (!threadId) {
      for (const address of toValues) {
        const extracted = extractThreadIdFromReplyAddress(String(address));
        if (extracted) {
          threadId = extracted;
          break;
        }
      }
    }

    if (!threadId) {
      const normalizedSubject = subject
        .replace(/^re:\s*/i, "")
        .replace(/\[ref:[^\]]+\]\s*/i, "")
        .trim();
      const { data: candidates } = await admin
        .from("email_messages")
        .select("id, thread_id, subject")
        .eq("direction", "outbound")
        .order("created_at", { ascending: false })
        .limit(100);

      const match = (candidates ?? []).find((row) => {
        const outboundSubject = String((row as Record<string, unknown>).subject ?? "")
          .replace(/\[ref:[^\]]+\]\s*/i, "")
          .trim()
          .toLowerCase();
        return (
          outboundSubject === normalizedSubject.toLowerCase() ||
          normalizedSubject.toLowerCase().endsWith(outboundSubject)
        );
      });

      if (match) {
        threadId = String((match as Record<string, unknown>).thread_id ?? match.id);
      }
    }

    const matchedWorker = await matchWorkerByEmailAdmin(admin, senderEmail);
    const attachmentUrls = await uploadInboundAttachmentsAdmin(
      admin,
      threadId,
      payload.attachments
    );

    const now = new Date().toISOString();
    const insertPayload = {
      thread_id: threadId,
      direction: "inbound",
      status: "received",
      subject,
      body_html: bodyHtml,
      body_text: bodyText,
      from_email: senderEmail || fromRaw,
      to_emails: toValues,
      sender_email: senderEmail || fromRaw,
      sender_name:
        matchedWorker?.full_name ||
        extractDisplayName(fromRaw) ||
        senderEmail ||
        "Unknown sender",
      sender_worker_id: matchedWorker?.id ?? null,
      attachment_urls: attachmentUrls,
      is_read: false,
      sent_at: now,
      created_at: now,
      updated_at: now,
    };

    const { data, error } = await insertEmailMessageAdmin(admin, insertPayload);

    if (error) return { message: null, error };
    return { message: normalizeMessage(data as Record<string, unknown>), error: null };
  } catch (error) {
    return {
      message: null,
      error: error instanceof Error ? error.message : "Failed to ingest inbound email.",
    };
  }
}

function normalizeEmailSignature(row: Record<string, unknown>): EmailSignatureRow {
  return {
    id: String(row.id),
    name: String(row.name ?? "Email Signature"),
    body_html: String(row.body_html ?? ""),
    body_text: row.body_text ? String(row.body_text) : null,
    is_live: row.is_live === true,
    created_by: row.created_by ? String(row.created_by) : null,
    created_by_name: row.created_by_name ? String(row.created_by_name) : null,
    created_at: String(row.created_at ?? new Date().toISOString()),
    updated_at: String(row.updated_at ?? new Date().toISOString()),
  };
}

export async function fetchLiveEmailSignatureAdmin(
  admin: SupabaseClient
): Promise<{ signature: EmailSignatureRow | null; error: string | null }> {
  try {
    const { data, error } = await admin
      .from("user_email_signatures")
      .select("*")
      .eq("is_live", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, "user_email_signatures")) {
        return { signature: null, error: null };
      }
      return { signature: null, error: error.message };
    }

    return data
      ? { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null }
      : { signature: null, error: null };
  } catch (error) {
    return {
      signature: null,
      error: error instanceof Error ? error.message : "Failed to load email signature.",
    };
  }
}

export async function fetchEmailSignatureForEditorAdmin(
  admin: SupabaseClient
): Promise<{ signature: EmailSignatureRow | null; error: string | null }> {
  const liveResult = await fetchLiveEmailSignatureAdmin(admin);
  if (liveResult.signature) return liveResult;

  try {
    const { data, error } = await admin
      .from("user_email_signatures")
      .select("*")
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (error) {
      if (isMissingTableError(error.message, "user_email_signatures")) {
        return { signature: null, error: null };
      }
      return { signature: null, error: error.message };
    }

    return data
      ? { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null }
      : { signature: null, error: null };
  } catch (error) {
    return {
      signature: null,
      error: error instanceof Error ? error.message : "Failed to load email signature.",
    };
  }
}

export async function saveEmailSignatureAdmin(
  admin: SupabaseClient,
  input: SaveEmailSignatureInput & { created_by?: string | null; created_by_name?: string | null }
): Promise<{ signature: EmailSignatureRow | null; error: string | null }> {
  try {
    const now = new Date().toISOString();
    const bodyHtml = input.body_html.trim();
    const bodyText =
      input.body_text?.trim() || signatureHtmlToPlainText(bodyHtml);
    const makeLive = input.make_live === true;

    const payload = {
      name: input.name?.trim() || "Email Signature",
      body_html: bodyHtml,
      body_text: bodyText,
      is_live: makeLive,
      created_by: input.created_by ?? null,
      created_by_name: input.created_by_name ?? null,
      updated_at: now,
    };

    let signatureId = input.id?.trim() || null;

    if (signatureId) {
      const { data, error } = await admin
        .from("user_email_signatures")
        .update(payload)
        .eq("id", signatureId)
        .select("*")
        .maybeSingle();

      if (error) return { signature: null, error: error.message };
      if (!data) signatureId = null;
      else if (makeLive) {
        await admin
          .from("user_email_signatures")
          .update({ is_live: false, updated_at: now })
          .neq("id", signatureId);
        await admin
          .from("user_email_signatures")
          .update({ is_live: true, updated_at: now })
          .eq("id", signatureId);
        const refreshed = await admin
          .from("user_email_signatures")
          .select("*")
          .eq("id", signatureId)
          .single();
        return refreshed.data
          ? {
              signature: normalizeEmailSignature(refreshed.data as Record<string, unknown>),
              error: null,
            }
          : { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null };
      }

      return data
        ? { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null }
        : { signature: null, error: "Signature not found." };
    }

    const { data, error } = await admin
      .from("user_email_signatures")
      .insert({ ...payload, created_at: now })
      .select("*")
      .single();

    if (error) return { signature: null, error: error.message };
    signatureId = String((data as Record<string, unknown>).id);

    if (makeLive) {
      await admin
        .from("user_email_signatures")
        .update({ is_live: false, updated_at: now })
        .neq("id", signatureId);
      await admin
        .from("user_email_signatures")
        .update({ is_live: true, updated_at: now })
        .eq("id", signatureId);
      const refreshed = await admin
        .from("user_email_signatures")
        .select("*")
        .eq("id", signatureId)
        .single();
      return refreshed.data
        ? {
            signature: normalizeEmailSignature(refreshed.data as Record<string, unknown>),
            error: null,
          }
        : { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null };
    }

    return { signature: normalizeEmailSignature(data as Record<string, unknown>), error: null };
  } catch (error) {
    return {
      signature: null,
      error: error instanceof Error ? error.message : "Failed to save email signature.",
    };
  }
}

export async function uploadEmailSignatureImageAdmin(
  admin: SupabaseClient,
  file: { filename: string; contentType: string; buffer: Buffer }
): Promise<{ url: string | null; error: string | null }> {
  try {
    const safeName = file.filename.replace(/[^a-zA-Z0-9._-]/g, "_");
    const path = `signatures/${Date.now()}-${safeName}`;
    const { error } = await admin.storage.from(EMAIL_ATTACHMENTS_BUCKET).upload(path, file.buffer, {
      contentType: file.contentType || "image/png",
      upsert: false,
    });
    if (error) return { url: null, error: error.message };
    const { data } = admin.storage.from(EMAIL_ATTACHMENTS_BUCKET).getPublicUrl(path);
    return { url: data.publicUrl ?? null, error: null };
  } catch (error) {
    return {
      url: null,
      error: error instanceof Error ? error.message : "Failed to upload signature image.",
    };
  }
}
