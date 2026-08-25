import type {
  ComposeSmsInput,
  SmsFolder,
  SmsMessageRow,
  SmsThreadSummary,
} from "@/lib/sms-types";

async function parseJson<T>(response: Response): Promise<T & { error?: string }> {
  return (await response.json().catch(() => ({}))) as T & { error?: string };
}

export async function fetchUnreadSmsCount(): Promise<number> {
  const response = await fetch(`/api/sms/unread-count?_=${Date.now()}`, {
    cache: "no-store",
  });
  const payload = await parseJson<{ count?: number }>(response);
  if (!response.ok) return 0;
  return typeof payload.count === "number" ? payload.count : 0;
}

export async function fetchSmsMessages(folder: SmsFolder): Promise<{
  messages: SmsMessageRow[];
  threads?: SmsThreadSummary[];
  error: string | null;
}> {
  const response = await fetch(`/api/sms/messages?folder=${folder}&_=${Date.now()}`, {
    cache: "no-store",
  });
  const payload = await parseJson<{
    messages?: SmsMessageRow[];
    threads?: SmsThreadSummary[];
    error?: string;
  }>(response);
  if (!response.ok) {
    return { messages: [], error: payload.error ?? "Failed to load SMS messages." };
  }
  return {
    messages: payload.messages ?? [],
    threads: payload.threads,
    error: null,
  };
}

export async function fetchSmsThread(input: {
  workerId?: string | null;
  phone?: string | null;
}): Promise<{ messages: SmsMessageRow[]; error: string | null }> {
  const params = new URLSearchParams();
  if (input.workerId) params.set("workerId", input.workerId);
  if (input.phone) params.set("phone", input.phone);
  params.set("_", String(Date.now()));
  const response = await fetch(`/api/sms/thread?${params.toString()}`, {
    cache: "no-store",
  });
  const payload = await parseJson<{ messages?: SmsMessageRow[]; error?: string }>(
    response
  );
  if (!response.ok) {
    return { messages: [], error: payload.error ?? "Failed to load thread." };
  }
  return { messages: payload.messages ?? [], error: null };
}

export async function markSmsThreadRead(input: {
  workerId?: string | null;
  phone?: string | null;
}): Promise<{ error: string | null }> {
  const response = await fetch("/api/sms/mark-read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) return { error: payload.error ?? "Failed to mark as read." };
  return { error: null };
}

export async function composeSms(input: ComposeSmsInput): Promise<{
  error: string | null;
  sent?: number;
  failed?: number;
  queued?: number;
}> {
  const response = await fetch("/api/sms/send", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{
    error?: string;
    sent?: number;
    failed?: number;
    queued?: number;
  }>(response);
  if (!response.ok) {
    return { error: payload.error ?? "Failed to send SMS." };
  }
  return {
    error: null,
    sent: payload.sent,
    failed: payload.failed,
    queued: payload.queued,
  };
}

export async function replySms(input: {
  to: string;
  message_body: string;
  worker_id?: string | null;
  project_id?: string | null;
}): Promise<{ error: string | null }> {
  const response = await fetch("/api/sms/reply", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify(input),
  });
  const payload = await parseJson<{ error?: string }>(response);
  if (!response.ok) return { error: payload.error ?? "Failed to send reply." };
  return { error: null };
}

export type { SmsMessageRow, SmsThreadSummary, ComposeSmsInput, SmsFolder };
