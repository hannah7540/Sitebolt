import type {
  HeaderNotificationInbox,
  HeaderNotificationItem,
  HeaderNotificationType,
} from "@/lib/header-notifications";

export type {
  HeaderNotificationInbox,
  HeaderNotificationItem,
  HeaderNotificationType,
};

export function formatNotificationTime(iso: string | null | undefined): string {
  if (!iso) return "";
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return "";
  const diffSec = Math.max(0, Math.round((Date.now() - then) / 1000));
  if (diffSec < 60) return `${Math.max(1, diffSec)}s ago`;
  const diffMin = Math.round(diffSec / 60);
  if (diffMin < 60) return `${diffMin}m ago`;
  const diffHr = Math.round(diffMin / 60);
  if (diffHr < 24) return `${diffHr}h ago`;
  const diffDay = Math.round(diffHr / 24);
  return `${diffDay}d ago`;
}

export async function fetchHeaderInbox(
  type: HeaderNotificationType
): Promise<HeaderNotificationInbox | null> {
  const response = await fetch(`/api/notifications/inbox?type=${type}&_=${Date.now()}`, {
    cache: "no-store",
  });
  if (response.status === 401 || response.status === 403) return null;
  const payload = (await response.json().catch(() => null)) as {
    count?: number;
    items?: HeaderNotificationItem[];
    error?: string;
  } | null;
  if (!response.ok) {
    throw new Error(payload?.error ?? "Failed to load notifications.");
  }
  return {
    count: typeof payload?.count === "number" ? payload.count : 0,
    items: Array.isArray(payload?.items) ? payload.items : [],
    unreadIds: [],
  };
}

export async function markHeaderNotificationRead(
  type: HeaderNotificationType,
  messageId: string
): Promise<void> {
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, messageId }),
  });
}

export async function clearHeaderNotificationsClient(
  type: HeaderNotificationType
): Promise<void> {
  await fetch("/api/notifications/read", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ type, clearAll: true }),
  });
}
