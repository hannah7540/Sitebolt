import type {
  ComposeEmailInput,
  EmailFolder,
  EmailListFilters,
  EmailMessageRow,
  EmailSignatureRow,
  EmailTemplateRow,
  SaveEmailSignatureInput,
  SaveEmailTemplateInput,
} from "./email-module-types";

async function readJson<T>(response: Response): Promise<{ data?: T; error: string | null }> {
  const payload = (await response.json()) as { error?: string } & T;
  if (!response.ok) {
    return { error: payload.error ?? "Request failed" };
  }
  return { data: payload, error: null };
}

function buildQuery(filters: Partial<EmailListFilters>): string {
  const params = new URLSearchParams();
  if (filters.folder) params.set("folder", filters.folder);
  if (filters.search?.trim()) params.set("search", filters.search.trim());
  if (filters.dateFrom) params.set("dateFrom", filters.dateFrom);
  if (filters.dateTo) params.set("dateTo", filters.dateTo);
  if (filters.projectId) params.set("projectId", filters.projectId);
  if (filters.workerId) params.set("workerId", filters.workerId);
  const query = params.toString();
  return query ? `?${query}` : "";
}

export async function fetchEmailMessages(
  filters: EmailListFilters
): Promise<{ messages: EmailMessageRow[]; error: string | null }> {
  const response = await fetch(`/api/emails/messages${buildQuery(filters)}`);
  const result = await readJson<{ messages: EmailMessageRow[] }>(response);
  return { messages: result.data?.messages ?? [], error: result.error };
}

export async function fetchEmailThread(
  threadId: string
): Promise<{ messages: EmailMessageRow[]; error: string | null }> {
  const response = await fetch(`/api/emails/messages/${encodeURIComponent(threadId)}/thread`);
  const result = await readJson<{ messages: EmailMessageRow[] }>(response);
  return { messages: result.data?.messages ?? [], error: result.error };
}

export async function fetchUnreadEmailCount(): Promise<{ count: number; error: string | null }> {
  const response = await fetch("/api/emails/unread-count");
  const result = await readJson<{ count: number }>(response);
  return { count: result.data?.count ?? 0, error: result.error };
}

export async function fetchEmailTemplates(): Promise<{
  templates: EmailTemplateRow[];
  error: string | null;
}> {
  const response = await fetch("/api/emails/templates");
  const result = await readJson<{ templates: EmailTemplateRow[] }>(response);
  return { templates: result.data?.templates ?? [], error: result.error };
}

export async function saveEmailTemplate(
  input: SaveEmailTemplateInput,
  templateId?: string | null
): Promise<{ template: EmailTemplateRow | null; error: string | null }> {
  const payload: SaveEmailTemplateInput = {
    title: input.title.trim(),
    subject: input.subject.trim(),
    body: input.body.trim(),
    ...(input.category?.trim() ? { category: input.category.trim() } : {}),
  };

  const response = await fetch(
    templateId ? `/api/emails/templates/${encodeURIComponent(templateId)}` : "/api/emails/templates",
    {
      method: templateId ? "PATCH" : "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(payload),
    }
  );
  const result = await readJson<{ template: EmailTemplateRow }>(response);
  return { template: result.data?.template ?? null, error: result.error };
}

export async function deleteEmailTemplate(templateId: string): Promise<{ error: string | null }> {
  const response = await fetch(`/api/emails/templates/${encodeURIComponent(templateId)}`, {
    method: "DELETE",
  });
  const result = await readJson<{ ok?: boolean }>(response);
  return { error: result.error };
}

export async function fetchLiveEmailSignature(): Promise<{
  signature: EmailSignatureRow | null;
  error: string | null;
}> {
  const response = await fetch("/api/emails/signatures?live=true");
  const result = await readJson<{ signature: EmailSignatureRow | null }>(response);
  return { signature: result.data?.signature ?? null, error: result.error };
}

export async function fetchEmailSignatureForEditor(): Promise<{
  signature: EmailSignatureRow | null;
  error: string | null;
}> {
  const response = await fetch("/api/emails/signatures");
  const result = await readJson<{ signature: EmailSignatureRow | null }>(response);
  return { signature: result.data?.signature ?? null, error: result.error };
}

export async function saveEmailSignature(
  input: SaveEmailSignatureInput
): Promise<{ signature: EmailSignatureRow | null; error: string | null }> {
  const response = await fetch("/api/emails/signatures", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readJson<{ signature: EmailSignatureRow }>(response);
  return { signature: result.data?.signature ?? null, error: result.error };
}

export async function uploadEmailSignatureImage(
  file: File
): Promise<{ url: string | null; error: string | null }> {
  const formData = new FormData();
  formData.append("file", file);
  const response = await fetch("/api/emails/signatures/upload", {
    method: "POST",
    body: formData,
  });
  const result = await readJson<{ url: string }>(response);
  return { url: result.data?.url ?? null, error: result.error };
}

export async function composeEmail(
  input: ComposeEmailInput
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const response = await fetch("/api/emails/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const result = await readJson<{ message: EmailMessageRow }>(response);
  return { message: result.data?.message ?? null, error: result.error };
}

export async function updateScheduledEmail(
  messageId: string,
  updates: Record<string, unknown>
): Promise<{ message: EmailMessageRow | null; error: string | null }> {
  const response = await fetch(`/api/emails/messages/${encodeURIComponent(messageId)}`, {
    method: "PATCH",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(updates),
  });
  const result = await readJson<{ message: EmailMessageRow }>(response);
  return { message: result.data?.message ?? null, error: result.error };
}

export async function deleteScheduledEmail(messageId: string): Promise<{ error: string | null }> {
  const response = await fetch(`/api/emails/messages/${encodeURIComponent(messageId)}`, {
    method: "DELETE",
  });
  const result = await readJson<{ ok?: boolean }>(response);
  return { error: result.error };
}

export async function markEmailThreadRead(threadId: string): Promise<{ error: string | null }> {
  const response = await fetch(`/api/emails/messages/${encodeURIComponent(threadId)}/read`, {
    method: "POST",
  });
  const result = await readJson<{ ok?: boolean }>(response);
  return { error: result.error };
}

export async function processDueScheduledEmails(): Promise<{
  processed: number;
  errors: string[];
  error: string | null;
}> {
  const response = await fetch("/api/emails/process-scheduled", { method: "POST" });
  const result = await readJson<{ processed: number; errors: string[] }>(response);
  return {
    processed: result.data?.processed ?? 0,
    errors: result.data?.errors ?? [],
    error: result.error,
  };
}

export type {
  EmailFolder,
  EmailMessageRow,
  EmailSignatureRow,
  EmailTemplateRow,
  ComposeEmailInput,
};
