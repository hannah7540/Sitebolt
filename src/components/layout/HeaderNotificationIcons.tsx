"use client";

import { useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Mail, MessageSquareText } from "lucide-react";
import { useHeaderNotifications } from "@/hooks/useHeaderNotifications";
import {
  clearHeaderNotificationsClient,
  formatNotificationTime,
  markHeaderNotificationRead,
  type HeaderNotificationItem,
  type HeaderNotificationType,
} from "@/lib/header-notifications-client";
import { cn } from "@/lib/utils";

function Badge({ count }: { count: number }) {
  if (count <= 0) return null;
  return (
    <span className="absolute -right-1 -top-1 inline-flex min-w-4 items-center justify-center rounded-full bg-red-500 px-1 text-[10px] font-bold leading-4 text-white">
      {count > 99 ? "99+" : count}
    </span>
  );
}

function NotificationPopover({
  type,
  title,
  items,
  count,
  onClose,
  onChanged,
}: {
  type: HeaderNotificationType;
  title: string;
  items: HeaderNotificationItem[];
  count: number;
  onClose: () => void;
  onChanged: () => Promise<void>;
}) {
  const router = useRouter();
  const [saving, setSaving] = useState(false);

  const openItem = async (item: HeaderNotificationItem) => {
    setSaving(true);
    try {
      await markHeaderNotificationRead(type, item.id);
      await onChanged();
      onClose();
      router.push(item.href);
    } finally {
      setSaving(false);
    }
  };

  const clearAll = async () => {
    setSaving(true);
    try {
      await clearHeaderNotificationsClient(type);
      await onChanged();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-80 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">{title}</p>
          <p className="text-xs text-slate-500">
            {count} unread
          </p>
        </div>
        {saving ? <Loader2 className="h-4 w-4 animate-spin text-orange-500" /> : null}
      </div>
      <div className="max-h-80 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">No new messages</p>
        ) : (
          items.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => void openItem(item)}
              className="flex w-full flex-col gap-0.5 border-b border-slate-50 px-3 py-2.5 text-left hover:bg-orange-50"
            >
              <div className="flex items-center justify-between gap-2">
                <span className="truncate text-sm font-semibold text-slate-900">{item.title}</span>
                <span className="shrink-0 text-[11px] text-slate-400">
                  {formatNotificationTime(item.createdAt)}
                </span>
              </div>
              <span className="line-clamp-2 text-xs text-slate-500">{item.snippet || "—"}</span>
            </button>
          ))
        )}
      </div>
      <div className="border-t border-slate-100 px-3 py-2">
        <button
          type="button"
          onClick={() => void clearAll()}
          disabled={saving || count === 0}
          className="w-full rounded-lg px-3 py-1.5 text-xs font-semibold text-slate-600 hover:bg-slate-50 disabled:opacity-50"
        >
          Clear All
        </button>
      </div>
    </div>
  );
}

export default function HeaderNotificationIcons() {
  const { allowed, sms, email, refresh } = useHeaderNotifications();
  const [open, setOpen] = useState<HeaderNotificationType | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  if (!allowed) return null;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => (current === "email" ? null : "email"))}
          className={cn(
            "relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-orange-600",
            open === "email" && "bg-orange-50 text-orange-600"
          )}
          aria-label="Email notifications"
        >
          <Mail className="h-5 w-5" />
          <Badge count={email.count} />
        </button>
        {open === "email" ? (
          <NotificationPopover
            type="email"
            title="Email Notifications"
            items={email.items}
            count={email.count}
            onClose={() => setOpen(null)}
            onChanged={refresh}
          />
        ) : null}
      </div>
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => (current === "sms" ? null : "sms"))}
          className={cn(
            "relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-orange-600",
            open === "sms" && "bg-orange-50 text-orange-600"
          )}
          aria-label="SMS notifications"
        >
          <MessageSquareText className="h-5 w-5" />
          <Badge count={sms.count} />
        </button>
        {open === "sms" ? (
          <NotificationPopover
            type="sms"
            title="SMS Notifications"
            items={sms.items}
            count={sms.count}
            onClose={() => setOpen(null)}
            onChanged={refresh}
          />
        ) : null}
      </div>
    </div>
  );
}
