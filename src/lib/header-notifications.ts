import type { SupabaseClient } from "@supabase/supabase-js";
import { messageBodyPreview } from "@/lib/email-payload-utils";
import { getWorkerDisplayName } from "@/lib/worker-utils";

export type HeaderNotificationType = "sms" | "email";

export type HeaderNotificationItem = {
  id: string;
  type: HeaderNotificationType;
  title: string;
  snippet: string;
  createdAt: string;
  href: string;
};

export type HeaderNotificationInbox = {
  count: number;
  items: HeaderNotificationItem[];
  unreadIds: string[];
};

const PREVIEW_LIMIT = 12;
const SCAN_LIMIT = 200;

function truncate(value: string, limit = 90): string {
  const clean = value.replace(/\s+/g, " ").trim();
  if (clean.length <= limit) return clean;
  return `${clean.slice(0, limit - 1)}…`;
}

function stripHtml(value: string): string {
  return value.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim();
}

async function fetchReadIds(
  admin: SupabaseClient,
  userId: string,
  type: HeaderNotificationType,
  messageIds: string[]
): Promise<Set<string>> {
  if (messageIds.length === 0) return new Set();
  const { data, error } = await admin
    .from("user_notification_reads")
    .select("message_id")
    .eq("user_id", userId)
    .eq("type", type)
    .in("message_id", messageIds);

  if (error) {
    console.warn("[header-notifications] read lookup failed:", error.message);
    return new Set();
  }

  return new Set(
    (data ?? [])
      .map((row) => String((row as { message_id?: string }).message_id ?? "").trim())
      .filter(Boolean)
  );
}

async function loadWorkerLabels(
  admin: SupabaseClient,
  workerIds: string[]
): Promise<Map<string, string>> {
  const unique = [...new Set(workerIds.filter(Boolean))];
  const labels = new Map<string, string>();
  if (unique.length === 0) return labels;

  const { data } = await admin
    .from("workers")
    .select("id, first_name, last_name, full_name, preferred_name")
    .in("id", unique);

  for (const row of data ?? []) {
    const id = String((row as { id?: string }).id ?? "").trim();
    if (!id) continue;
    labels.set(id, getWorkerDisplayName(row as { first_name?: string; last_name?: string; full_name?: string; preferred_name?: string }));
  }
  return labels;
}

export async function fetchHeaderNotificationInbox(
  admin: SupabaseClient,
  userId: string,
  type: HeaderNotificationType
): Promise<HeaderNotificationInbox> {
  if (type === "sms") {
    type SmsInboxRow = {
      id?: string;
      from_number?: string;
      to_number?: string;
      message_body?: string;
      worker_id?: string | null;
      created_at?: string;
      direction?: string;
      is_completed?: boolean | null;
    };

    let data: SmsInboxRow[] | null = null;
    let error: { message: string } | null = null;

    const primary = await admin
      .from("sms_messages")
      .select("id, from_number, to_number, message_body, worker_id, created_at, direction, is_completed")
      .eq("direction", "inbound")
      .order("created_at", { ascending: false })
      .limit(SCAN_LIMIT);
    data = (primary.data as SmsInboxRow[] | null) ?? null;
    error = primary.error;

    if (error && /is_completed/i.test(error.message)) {
      const fallback = await admin
        .from("sms_messages")
        .select("id, from_number, to_number, message_body, worker_id, created_at, direction")
        .eq("direction", "inbound")
        .order("created_at", { ascending: false })
        .limit(SCAN_LIMIT);
      data = (fallback.data as SmsInboxRow[] | null) ?? null;
      error = fallback.error;
    }
    if (error) {
      console.warn("[header-notifications] sms inbox failed:", error.message);
      return { count: 0, items: [], unreadIds: [] };
    }

    const rows = (data ?? []).filter((row) => {
      const completed = (row as { is_completed?: boolean }).is_completed;
      return completed !== true;
    });
    const ids = rows.map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean);
    const readIds = await fetchReadIds(admin, userId, "sms", ids);
    const unread = rows.filter((row) => !readIds.has(String((row as { id?: string }).id ?? "")));
    const labels = await loadWorkerLabels(
      admin,
      unread.map((row) => String((row as { worker_id?: string | null }).worker_id ?? ""))
    );

    const items = unread.slice(0, PREVIEW_LIMIT).map((row) => {
      const id = String((row as { id?: string }).id ?? "");
      const workerId = String((row as { worker_id?: string | null }).worker_id ?? "").trim();
      const phone = String((row as { from_number?: string }).from_number ?? "").trim();
      const title = labels.get(workerId) || phone || "SMS";
      const params = new URLSearchParams();
      params.set("threadId", phone || (workerId ? `worker:${workerId}` : id));
      if (phone) params.set("phone", phone);
      if (workerId) params.set("workerId", workerId);
      return {
        id,
        type: "sms" as const,
        title,
        snippet: truncate(String((row as { message_body?: string }).message_body ?? "")),
        createdAt: String((row as { created_at?: string }).created_at ?? ""),
        href: `/sms?${params.toString()}`,
      };
    });

    return {
      count: unread.length,
      items,
      unreadIds: unread.map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean),
    };
  }

  const { data, error } = await admin
    .from("email_messages")
    .select(
      "id, thread_id, subject, body_text, body_html, from_email, sender_name, sender_email, created_at, direction"
    )
    .eq("direction", "inbound")
    .order("created_at", { ascending: false })
    .limit(SCAN_LIMIT);

  if (error) {
    console.warn("[header-notifications] email inbox failed:", error.message);
    return { count: 0, items: [], unreadIds: [] };
  }

  const rows = data ?? [];
  const ids = rows.map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean);
  const readIds = await fetchReadIds(admin, userId, "email", ids);
  const unread = rows.filter((row) => !readIds.has(String((row as { id?: string }).id ?? "")));

  const items = unread.slice(0, PREVIEW_LIMIT).map((row) => {
    const id = String((row as { id?: string }).id ?? "");
    const threadId = String((row as { thread_id?: string | null }).thread_id ?? "").trim() || id;
    const title =
      String((row as { sender_name?: string | null }).sender_name ?? "").trim() ||
      String((row as { sender_email?: string | null }).sender_email ?? "").trim() ||
      String((row as { from_email?: string | null }).from_email ?? "").trim() ||
      String((row as { subject?: string }).subject ?? "").trim() ||
      "Email";
    const text =
      String((row as { body_text?: string | null }).body_text ?? "").trim() ||
      messageBodyPreview(
        String(
          (row as { body_html?: string | null }).body_html ??
            (row as { body?: string | null }).body ??
            ""
        )
      ) ||
      stripHtml(String((row as { subject?: string }).subject ?? ""));
    return {
      id,
      type: "email" as const,
      title,
      snippet: truncate(text),
      createdAt: String((row as { created_at?: string }).created_at ?? ""),
      href: `/emails?threadId=${encodeURIComponent(threadId)}`,
    };
  });

  return {
    count: unread.length,
    items,
    unreadIds: unread.map((row) => String((row as { id?: string }).id ?? "")).filter(Boolean),
  };
}

export async function markHeaderNotificationsRead(
  admin: SupabaseClient,
  userId: string,
  type: HeaderNotificationType,
  messageIds: string[]
): Promise<{ updated: number; error: string | null }> {
  const unique = [...new Set(messageIds.map((id) => id.trim()).filter(Boolean))];
  if (unique.length === 0) return { updated: 0, error: null };

  const now = new Date().toISOString();
  const rows = unique.map((messageId) => ({
    user_id: userId,
    message_id: messageId,
    type,
    read_at: now,
  }));

  const { error } = await admin
    .from("user_notification_reads")
    .upsert(rows, { onConflict: "user_id,message_id,type" });

  if (error) return { updated: 0, error: error.message };
  return { updated: unique.length, error: null };
}

export async function clearHeaderNotifications(
  admin: SupabaseClient,
  userId: string,
  type: HeaderNotificationType
): Promise<{ updated: number; error: string | null }> {
  const inbox = await fetchHeaderNotificationInbox(admin, userId, type);
  return markHeaderNotificationsRead(admin, userId, type, inbox.unreadIds);
}
