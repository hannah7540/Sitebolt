"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { useRouter } from "next/navigation";
import { Bell, Check, Loader2, Mail, MessageSquareText } from "lucide-react";
import {
  approveResourceAssignment,
  listPendingResourceApprovals,
} from "@/app/actions/resource-approvals";
import { useHeaderNotifications } from "@/hooks/useHeaderNotifications";
import {
  clearHeaderNotificationsClient,
  formatNotificationTime,
  markHeaderNotificationRead,
  type HeaderNotificationItem,
  type HeaderNotificationType,
} from "@/lib/header-notifications-client";
import type { PendingResourceApproval } from "@/lib/resource-approval";
import { cn } from "@/lib/utils";

type HeaderMenu = HeaderNotificationType | "approvals";

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

function ApprovalsPopover({
  items,
  approvingId,
  error,
  onApprove,
}: {
  items: PendingResourceApproval[];
  approvingId: string | null;
  error: string | null;
  onApprove: (item: PendingResourceApproval) => Promise<void>;
}) {
  return (
    <div className="absolute right-0 top-full z-50 mt-2 w-96 overflow-hidden rounded-xl border border-slate-200 bg-white shadow-xl">
      <div className="flex items-center justify-between border-b border-slate-100 px-3 py-2.5">
        <div>
          <p className="text-sm font-semibold text-slate-900">Pending Approvals</p>
          <p className="text-xs text-slate-500">
            {items.length} waiting
          </p>
        </div>
      </div>
      {error ? (
        <p role="alert" className="border-b border-red-100 bg-red-50 px-3 py-2 text-xs text-red-700">
          {error}
        </p>
      ) : null}
      <div className="max-h-96 overflow-y-auto">
        {items.length === 0 ? (
          <p className="px-3 py-8 text-center text-sm text-slate-500">
            No pending subcontractor requests
          </p>
        ) : (
          items.map((item) => {
            const busy = approvingId === item.id;
            return (
              <div
                key={item.id}
                className="flex items-start justify-between gap-3 border-b border-slate-50 px-3 py-2.5"
              >
                <div className="min-w-0">
                  <p className="truncate text-sm font-semibold text-slate-900">
                    {item.resourceName}
                  </p>
                  <p className="truncate text-xs text-slate-500">
                    {item.kind === "worker" ? "Worker" : "Plant"} · {item.projectName}
                  </p>
                </div>
                <button
                  type="button"
                  disabled={busy}
                  onClick={() => void onApprove(item)}
                  className="inline-flex shrink-0 items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                  Approve
                </button>
              </div>
            );
          })
        )}
      </div>
    </div>
  );
}

export default function HeaderNotificationIcons() {
  const router = useRouter();
  const { allowed, sms, email, refresh } = useHeaderNotifications();
  const [open, setOpen] = useState<HeaderMenu | null>(null);
  const [approvals, setApprovals] = useState<PendingResourceApproval[]>([]);
  const [approvingId, setApprovingId] = useState<string | null>(null);
  const [approvalError, setApprovalError] = useState<string | null>(null);
  const rootRef = useRef<HTMLDivElement>(null);

  const loadApprovals = useCallback(async () => {
    try {
      const items = await listPendingResourceApprovals();
      setApprovals(items);
    } catch (cause) {
      console.warn("[header-approvals] load failed:", cause);
    }
  }, []);

  useEffect(() => {
    void loadApprovals();
    const timer = window.setInterval(() => void loadApprovals(), 30_000);
    return () => window.clearInterval(timer);
  }, [loadApprovals]);

  useEffect(() => {
    const onPointerDown = (event: MouseEvent) => {
      if (!rootRef.current?.contains(event.target as Node)) {
        setOpen(null);
      }
    };
    window.addEventListener("mousedown", onPointerDown);
    return () => window.removeEventListener("mousedown", onPointerDown);
  }, []);

  const handleApprove = async (item: PendingResourceApproval) => {
    setApprovingId(item.id);
    setApprovalError(null);
    try {
      const result = await approveResourceAssignment({
        kind: item.kind,
        resourceId: item.resourceId,
        projectId: item.projectId,
        projectName: item.projectName,
        resourceName: item.resourceName,
        subcontractorId: item.subcontractorId,
      });
      if (result.error) {
        setApprovalError(result.error);
        return;
      }
      setApprovals((current) => current.filter((row) => row.id !== item.id));
      await loadApprovals();
      router.refresh();
    } finally {
      setApprovingId(null);
    }
  };

  if (!allowed && approvals.length === 0) return null;

  return (
    <div ref={rootRef} className="relative flex items-center gap-1">
      {allowed ? (
        <>
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
        </>
      ) : null}
      <div className="relative">
        <button
          type="button"
          onClick={() => setOpen((current) => (current === "approvals" ? null : "approvals"))}
          className={cn(
            "relative rounded-lg p-2 text-slate-600 hover:bg-slate-100 hover:text-orange-600",
            open === "approvals" && "bg-orange-50 text-orange-600"
          )}
          aria-label="Pending approvals"
        >
          <Bell className="h-5 w-5" />
          <Badge count={approvals.length} />
        </button>
        {open === "approvals" ? (
          <ApprovalsPopover
            items={approvals}
            approvingId={approvingId}
            error={approvalError}
            onApprove={handleApprove}
          />
        ) : null}
      </div>
    </div>
  );
}
