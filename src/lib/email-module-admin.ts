import type { SupabaseClient } from "@supabase/supabase-js";
import { sendEmail } from "./email-service";
import { resolveSystemFromEmail } from "./email-config";
import type {
  ComposeEmailInput,
  EmailListFilters,
  EmailMessageRow,
  EmailRecurrenceRule,
  EmailTargetConfig,
  EmailTargetMode,
  EmailTemplateRow,
  InboundEmailWebhookPayload,
  SaveEmailTemplateInput,
} from "./email-module-types";

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

function normalizeTemplate(row: Record<string, unknown>): EmailTemplateRow {
  return {
    id: String(row.id),
    name: String(row.name ?? ""),
    subject: String(row.subject ?? ""),
    body_html: String(row.body_html ?? ""),
    body_text: row.body_text ? String(row.body_text) : null,
    created_by: row.created_by ? String(row.created_by) : null,
    created_by_name: row.created_by_name ? String(row.created_by_name) : null,
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
    body_html: String(row.body_html ?? ""),
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
  input: SaveEmailTemplateInput,
  templateId?: string | null
): Promise<{ template: EmailTemplateRow | null; error: string | null }> {
  const now = new Date().toISOString();
  const payload = {
    name: input.name.trim(),
    subject: input.subject.trim(),
    body_html: input.body_html,
    body_text: input.body_text ?? htmlToPlainText(input.body_html),
    created_by: input.created_by ?? null,
    created_by_name: input.created_by_name ?? null,
    updated_at: now,
  };

  if (templateId) {
    const { data, error } = await admin
      .from("email_templates")
      .update(payload)
      .eq("id", templateId)
      .select("*")
      .maybeSingle();
    if (error) return { template: null, error: error.message };
    return data
      ? { template: normalizeTemplate(data as Record<string, unknown>), error: null }
      : { template: null, error: "Template not found." };
  }

  const { data, error } = await admin
    .from("email_templates")
    .insert(payload)
    .select("*")
    .single();

  if (error) return { template: null, error: error.message };
  return { template: normalizeTemplate(data as Record<string, unknown>), error: null };
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
      query = query
        .eq("direction", "outbound")
        .in("status", ["scheduled", "paused"]);
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
  const text = message.body_text ?? htmlToPlainText(message.body_html);

  const sendResult = await sendEmail({
    to: recipients,
    subject: message.subject,
    html: message.body_html,
    text,
    headers: {
      "X-SiteBolt-Thread-Id": threadId,
    },
  });

  const now = new Date().toISOString();
  const nextStatus = sendResult.sent ? "sent" : "failed";

  const { data: updated, error: updateError } = await admin
    .from("email_messages")
    .update({
      thread_id: threadId,
      status: nextStatus,
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
  input: ComposeEmailInput
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const now = new Date().toISOString();
  const recipientResult = await resolveEmailRecipientsAdmin(
    admin,
    input.target_mode,
    input.target_config
  );
  if (recipientResult.error) return { message: null, error: recipientResult.error };

  const status = input.send_mode === "scheduled" ? "scheduled" : "sent";
  const payload = {
    direction: "outbound",
    status: input.send_mode === "immediate" ? "draft" : status,
    subject: input.subject.trim(),
    body_html: input.body_html,
    body_text: input.body_text ?? htmlToPlainText(input.body_html),
    from_email: resolveSystemFromEmail(),
    to_emails: recipientResult.emails,
    cc_emails: [],
    target_mode: input.target_mode,
    target_config: input.target_config,
    template_id: input.template_id ?? null,
    scheduled_for: input.send_mode === "scheduled" ? input.scheduled_for ?? null : null,
    recurrence_rule: input.recurrence_rule ?? null,
    recurrence_active: Boolean(input.recurrence_rule),
    created_by: input.created_by,
    created_by_name: input.created_by_name,
    sender_email: input.sender_email ?? null,
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

  if (input.send_mode === "immediate") {
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

export async function ingestInboundEmailAdmin(
  admin: SupabaseClient,
  payload: InboundEmailWebhookPayload
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const fromRaw = payload.from?.trim() ?? "";
  const subject = payload.subject?.trim() ?? "(No subject)";
  const bodyHtml = payload.html?.trim() || payload.text?.trim().replace(/\n/g, "<br>") || "";
  const bodyText = payload.text?.trim() || htmlToPlainText(bodyHtml);
  const senderEmail = extractEmailAddress(fromRaw);
  const headerThread =
    payload.thread_id?.trim() ||
    payload.headers?.["X-SiteBolt-Thread-Id"]?.trim() ||
    payload.headers?.["x-sitebolt-thread-id"]?.trim() ||
    null;

  let threadId = headerThread;

  if (!threadId) {
    const normalizedSubject = subject.replace(/^re:\s*/i, "").trim();
    const { data: candidates } = await admin
      .from("email_messages")
      .select("id, thread_id, subject")
      .eq("direction", "outbound")
      .order("created_at", { ascending: false })
      .limit(100);

    const match = (candidates ?? []).find((row) => {
      const outboundSubject = String((row as Record<string, unknown>).subject ?? "")
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

  const now = new Date().toISOString();
  const insertPayload = {
    thread_id: threadId,
    direction: "inbound",
    status: "sent",
    subject,
    body_html: bodyHtml,
    body_text: bodyText,
    from_email: senderEmail || fromRaw,
    to_emails: Array.isArray(payload.to)
      ? payload.to
      : payload.to
        ? [payload.to]
        : [],
    sender_email: senderEmail || fromRaw,
    sender_name: fromRaw.replace(/<.+>/, "").trim() || senderEmail,
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
}
