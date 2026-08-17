import type { InboundEmailWebhookPayload } from "./email-module-types";

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function readString(value: unknown): string | undefined {
  if (typeof value === "string" && value.trim()) return value.trim();
  return undefined;
}

function normalizeHeaders(raw: unknown): Record<string, string> {
  if (!raw || typeof raw !== "object") return {};
  const headers: Record<string, string> = {};
  for (const [key, value] of Object.entries(raw as Record<string, unknown>)) {
    if (typeof value === "string") headers[key] = value;
  }
  return headers;
}

function parseAttachments(raw: unknown): InboundEmailWebhookPayload["attachments"] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      const record = asRecord(item);
      if (!record) return null;
      const filename = readString(record.filename) ?? readString(record.name) ?? "attachment";
      const content =
        readString(record.content) ??
        readString(record.data) ??
        readString(record.base64);
      if (!content) return null;
      return {
        filename,
        contentType: readString(record.contentType) ?? readString(record.type),
        content,
      };
    })
    .filter(Boolean) as InboundEmailWebhookPayload["attachments"];
}

/** Normalize provider-specific inbound webhook payloads into a common shape. */
export function parseInboundEmailWebhook(body: unknown): InboundEmailWebhookPayload {
  const record = asRecord(body);
  if (!record) return {};

  const data = asRecord(record.data) ?? record;
  const resendEmail = asRecord(data.email) ?? data;

  const from =
    readString(resendEmail.from) ??
    readString(data.from) ??
    readString(record.from) ??
    readString(asRecord(data.envelope)?.from);

  const toRaw =
    resendEmail.to ??
    data.to ??
    record.to ??
    asRecord(data.envelope)?.to ??
    asRecord(record.envelope)?.to;

  let to: string | string[] | undefined;
  if (Array.isArray(toRaw)) {
    to = toRaw.map((item) => String(item));
  } else if (typeof toRaw === "string") {
    to = toRaw;
  }

  const subject =
    readString(resendEmail.subject) ??
    readString(data.subject) ??
    readString(record.subject);

  const html =
    readString(resendEmail.html) ??
    readString(data.html) ??
    readString(record.html) ??
    readString(asRecord(data.content)?.html);

  const text =
    readString(resendEmail.text) ??
    readString(data.text) ??
    readString(record.text) ??
    readString(asRecord(data.content)?.text) ??
    readString(record.plain);

  const headers =
    normalizeHeaders(resendEmail.headers) ||
    normalizeHeaders(data.headers) ||
    normalizeHeaders(record.headers);

  const thread_id =
    readString(record.thread_id) ??
    readString(data.thread_id) ??
    headers["X-SiteBolt-Thread-Id"] ??
    headers["x-sitebolt-thread-id"];

  const attachments = parseAttachments(
    record.attachments ?? data.attachments ?? resendEmail.attachments
  );

  return {
    from,
    to,
    subject,
    html,
    text,
    headers,
    thread_id,
    attachments,
  };
}

/** Parse SendGrid / Mailgun multipart form fields into inbound payload. */
export async function parseInboundEmailFormData(
  formData: FormData
): Promise<InboundEmailWebhookPayload> {
  const from = String(formData.get("from") ?? formData.get("sender") ?? "").trim() || undefined;
  const to = String(formData.get("to") ?? formData.get("recipient") ?? "").trim() || undefined;
  const subject = String(formData.get("subject") ?? "").trim() || undefined;
  const html = String(formData.get("html") ?? "").trim() || undefined;
  const text =
    String(formData.get("text") ?? formData.get("plain") ?? "").trim() || undefined;

  let headers: Record<string, string> = {};
  const headersRaw = String(formData.get("headers") ?? "").trim();
  if (headersRaw) {
    try {
      headers = JSON.parse(headersRaw) as Record<string, string>;
    } catch {
      for (const line of headersRaw.split("\n")) {
        const index = line.indexOf(":");
        if (index > 0) {
          headers[line.slice(0, index).trim()] = line.slice(index + 1).trim();
        }
      }
    }
  }

  const attachments: InboundEmailWebhookPayload["attachments"] = [];
  for (const [key, value] of formData.entries()) {
    if (!(value instanceof File) || value.size === 0) continue;
    if (!key.toLowerCase().includes("attachment")) continue;
    attachments.push({
      filename: value.name || "attachment",
      contentType: value.type || "application/octet-stream",
      content: Buffer.from(await value.arrayBuffer()).toString("base64"),
    });
  }

  return {
    from,
    to,
    subject,
    html,
    text,
    headers,
    thread_id:
      headers["X-SiteBolt-Thread-Id"] ??
      headers["x-sitebolt-thread-id"] ??
      undefined,
    attachments,
  };
}

export function extractThreadIdFromReplyAddress(address: string): string | null {
  const normalized = address.trim().toLowerCase();
  const threadMatch = normalized.match(/thread-([a-f0-9-]{36})@/i);
  if (threadMatch?.[1]) return threadMatch[1];
  const genericMatch = normalized.match(/\+([a-f0-9-]{36})@/i);
  return genericMatch?.[1] ?? null;
}
