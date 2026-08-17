import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email-service";
import { resolveSystemFromEmail } from "./email-config";
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
  return {
    id: String(row.id),
    thread_id: row.thread_id ? String(row.thread_id) : null,
    parent_message_id: row.parent_message_id ? String(row.parent_message_id) : null,
    direction: row.direction === "inbound" ? "inbound" : "outbound",
    status: String(row.status ?? "draft") as EmailMessageRow["status"],
    subject: String(row.subject ?? ""),
    body_html: resolveMessageBodyHtml(row),
    body_text: row.body_text ? String(row.body_text) : null,
    from_email: row.from_email ? String(row.from_email) : null,
    to_emails: parseStringArray(row.to_emails),
    cc_emails: parseStringArray(row.cc_emails),
    target_mode: row.target_mode ? (String(row.target_mode) as EmailTargetMode) : null,
    target_config: parseTargetConfig(row.target_config),
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
    sender_name: row.sender_name ? String(row.sender_name) : null,
    sender_email: row.sender_email ? String(row.sender_email) : null,
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

  const { data: updated, error: updateError } = await admin
    .from("email_messages")
    .update({
      thread_id: threadId,
      status: nextStatus,
      subject: outboundSubject,
      body_html: bodyHtml,
      body_text: bodyText,
      to_emails: recipients,
      from_email: fromEmail,
      sent_at: sendResult.sent ? now : null,
      last_sent_at: sendResult.sent ? now : message.last_sent_at,
      external_message_id: sendResult.messageId ?? null,
      error_message: sendResult.error ?? null,
      updated_at: now,
    })
    .eq("id", messageId)
    .select("*")
    .single();

  if (updateError) return { message: null, error: updateError.message };
  return { message: normalizeMessage(updated as Record<string, unknown>), error: null };
}

export async function composeEmailAdmin(
  admin: SupabaseClient,
  input: ComposeEmailInput | Record<string, unknown>
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const normalized = normalizeComposeInput(input as Record<string, unknown>);
  const now = new Date().toISOString();
  const recipientResult = await resolveEmailRecipientsAdmin(
    admin,
    normalized.target_mode,
    normalized.target_config
  );
  if (recipientResult.error) return { message: null, error: recipientResult.error };

  const status = normalized.send_mode === "scheduled" ? "scheduled" : "sent";
  const payload = {
    direction: "outbound",
    status: normalized.send_mode === "immediate" ? "draft" : status,
    subject: normalized.subject.trim(),
    body_html: normalized.body_html,
    body_text: normalized.body_text ?? htmlToPlainText(normalized.body_html),
    from_email: resolveSystemFromEmail(),
    to_emails: recipientResult.emails,
    cc_emails: [],
    target_mode: normalized.target_mode,
    target_config: normalized.target_config,
    template_id: normalized.template_id ?? null,
    scheduled_for: normalized.send_mode === "scheduled" ? normalized.scheduled_for ?? null : null,
    recurrence_rule: normalized.recurrence_rule ?? null,
    recurrence_active: Boolean(normalized.recurrence_rule),
    created_by: normalized.created_by,
    created_by_name: normalized.created_by_name,
    sender_email: normalized.sender_email ?? null,
    created_at: now,
    updated_at: now,
  };

  const { data, error } = await admin
    .from("email_messages")
    .insert(payload)
    .select("*")
    .single();

  if (error) return { message: null, error: error.message };

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

    const { data, error } = await admin
      .from("email_messages")
      .insert(insertPayload)
      .select("*")
      .single();

    if (error) return { message: null, error: error.message };
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
