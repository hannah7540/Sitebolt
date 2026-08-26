"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CheckCircle2,
  Inbox,
  Loader2,
  MessageSquareText,
  Plus,
  RotateCcw,
  Send,
  X,
} from "lucide-react";
import ComposeSmsModal from "@/components/sms/ComposeSmsModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { refreshSmsUnreadCount } from "@/hooks/useSmsUnreadCount";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { canAccessSmsModule } from "@/lib/security-roles";
import {
  fetchSmsMessages,
  fetchSmsThread,
  fetchUnreadSmsCount,
  markSmsThreadRead,
  replySms,
  setSmsThreadCompleted,
  type SmsFolder,
  type SmsMessageRow,
  type SmsThreadSummary,
} from "@/lib/sms-module-client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

export default function SmsModulePanel() {
  const { sessionRole, workers, projects, loading: sessionLoading } =
    useAdminConsole();
  const canAccess = canAccessSmsModule(sessionRole);

  const [folder, setFolder] = useState<SmsFolder>("inbox");
  const [messages, setMessages] = useState<SmsMessageRow[]>([]);
  const [threads, setThreads] = useState<SmsThreadSummary[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [composeOpen, setComposeOpen] = useState(false);
  const [selectedThread, setSelectedThread] = useState<SmsThreadSummary | null>(
    null
  );
  const [threadMessages, setThreadMessages] = useState<SmsMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [replyBody, setReplyBody] = useState("");
  const [replySaving, setReplySaving] = useState(false);
  const [threadActionSaving, setThreadActionSaving] = useState(false);
  const { toast, showSuccess, showError, dismissToast } = useFormToast();

  const isThreadFolder = folder === "inbox" || folder === "completed";

  const refreshUnreadBadge = useCallback(async () => {
    const count = await fetchUnreadSmsCount();
    setUnreadCount(count);
    refreshSmsUnreadCount();
  }, []);

  const loadData = useCallback(async (folderOverride?: SmsFolder) => {
    if (!canAccess) return;
    const activeFolder = folderOverride ?? folder;
    setLoading(true);
    setError(null);
    try {
      const result = await fetchSmsMessages(activeFolder);
      if (result.error) {
        setError(result.error);
        setMessages([]);
        setThreads([]);
      } else {
        setMessages(result.messages);
        setThreads(result.threads ?? []);
      }
      await refreshUnreadBadge();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to load SMS.");
    } finally {
      setLoading(false);
    }
  }, [canAccess, folder, refreshUnreadBadge]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openThread = async (thread: SmsThreadSummary) => {
    setSelectedThread(thread);
    setThreadLoading(true);
    setReplyBody("");
    try {
      const result = await fetchSmsThread({
        workerId: thread.worker_id,
        phone: thread.phone_number,
      });
      if (result.error) {
        showError(result.error);
        setThreadMessages([]);
      } else {
        setThreadMessages(result.messages);
        await markSmsThreadRead({
          workerId: thread.worker_id,
          phone: thread.phone_number,
        });
        setSelectedThread((current) =>
          current ? { ...current, unread_count: 0 } : current
        );
        await refreshUnreadBadge();
        void loadData(folder);
      }
    } finally {
      setThreadLoading(false);
    }
  };

  const handleReply = async () => {
    if (!selectedThread || !replyBody.trim()) return;
    const body = replyBody.trim();
    setReplySaving(true);
    try {
      const result = await replySms({
        to: selectedThread.phone_number,
        message_body: body,
        worker_id: selectedThread.worker_id,
      });
      if (result.error && !result.message) {
        showError(result.error);
        return;
      }
      if (result.error) {
        showError(result.error);
      } else {
        showSuccess("Reply sent.");
      }
      setReplyBody("");
      if (result.message) {
        setThreadMessages((current) => [...current, result.message!]);
        setSelectedThread((current) =>
          current
            ? {
                ...current,
                last_message: result.message!.message_body,
                last_at: result.message!.created_at,
              }
            : current
        );
      }
      await markSmsThreadRead({
        workerId: selectedThread.worker_id,
        phone: selectedThread.phone_number,
      });
      setSelectedThread((current) =>
        current ? { ...current, unread_count: 0 } : current
      );
      await refreshUnreadBadge();
      void loadData(folder);
    } finally {
      setReplySaving(false);
    }
  };

  const handleCompleteThread = async () => {
    if (!selectedThread) return;
    setThreadActionSaving(true);
    try {
      const result = await setSmsThreadCompleted({
        workerId: selectedThread.worker_id,
        phone: selectedThread.phone_number,
        is_completed: true,
      });
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess("Conversation marked as completed.");
      setSelectedThread(null);
      setThreadMessages([]);
      void loadData("inbox");
    } finally {
      setThreadActionSaving(false);
    }
  };

  const handleReopenThread = async () => {
    if (!selectedThread) return;
    setThreadActionSaving(true);
    try {
      const result = await setSmsThreadCompleted({
        workerId: selectedThread.worker_id,
        phone: selectedThread.phone_number,
        is_completed: false,
      });
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess("Conversation moved back to Inbox.");
      setSelectedThread(null);
      setThreadMessages([]);
      void loadData("completed");
    } finally {
      setThreadActionSaving(false);
    }
  };

  const folderButtons = useMemo(
    () => [
      { id: "inbox" as const, label: "Inbox", icon: Inbox, badge: unreadCount },
      { id: "completed" as const, label: "Completed", icon: CheckCircle2, badge: 0 },
      { id: "sent" as const, label: "Sent Items", icon: Send, badge: 0 },
    ],
    [unreadCount]
  );

  if (sessionLoading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading SMS hub…
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className={cn("p-6", cardClass)}>
        <p className="text-sm text-slate-600">
          Access Denied: You do not have permission to view communications.
        </p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            SMS <span className="text-orange-500">Communication</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Two-way SMS inbox, broadcasts, and scheduled messages via Twilio.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setComposeOpen(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Compose New SMS
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {folderButtons.map((item) => {
          const Icon = item.icon;
          return (
            <button
              key={item.id}
              type="button"
              onClick={() => {
                setFolder(item.id);
                setSelectedThread(null);
                setThreadMessages([]);
              }}
              className={cn(
                "inline-flex items-center gap-2 rounded-lg border px-3 py-2 text-sm font-medium",
                folder === item.id
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              <Icon className="h-4 w-4" />
              {item.label}
              {item.badge > 0 ? (
                <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                  {item.badge > 99 ? "99+" : item.badge}
                </span>
              ) : null}
            </button>
          );
        })}
      </div>

      {error ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading messages…
        </div>
      ) : isThreadFolder ? (
        <div className="grid gap-4 lg:grid-cols-[320px_minmax(0,1fr)]">
          <div className={cn("divide-y divide-slate-100 overflow-hidden p-0", cardClass)}>
            {threads.length === 0 ? (
              <div className="p-6 text-center text-sm text-slate-500">
                <MessageSquareText className="mx-auto mb-2 h-8 w-8 text-slate-300" />
                {folder === "completed"
                  ? "No completed SMS conversations yet."
                  : "No active SMS conversations yet."}
              </div>
            ) : (
              threads.map((thread) => (
                <button
                  key={thread.threadKey}
                  type="button"
                  onClick={() => void openThread(thread)}
                  className={cn(
                    "w-full px-4 py-3 text-left transition hover:bg-orange-50",
                    selectedThread?.threadKey === thread.threadKey && "bg-orange-50"
                  )}
                >
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="truncate font-semibold text-slate-900">
                        {thread.worker_name || "Unknown worker"}
                      </p>
                      <p className="truncate text-xs text-slate-500">
                        {thread.phone_number}
                      </p>
                    </div>
                    {thread.unread_count > 0 ? (
                      <span className="rounded-full bg-orange-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                        {thread.unread_count}
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 line-clamp-2 text-sm text-slate-600">
                    {thread.last_message}
                  </p>
                  <p className="mt-1 text-[11px] text-slate-400">
                    {formatDateTime(thread.last_at)}
                  </p>
                </button>
              ))
            )}
          </div>

          <div className={cn("flex min-h-[420px] flex-col p-0", cardClass)}>
            {!selectedThread ? (
              <div className="flex flex-1 items-center justify-center p-8 text-sm text-slate-500">
                Select a conversation to view and reply.
              </div>
            ) : (
              <>
                <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {selectedThread.worker_name || "Unknown worker"}
                    </p>
                    <p className="text-xs text-slate-500">{selectedThread.phone_number}</p>
                  </div>
                  <div className="flex items-center gap-2">
                    {folder === "inbox" ? (
                      <button
                        type="button"
                        disabled={threadActionSaving}
                        onClick={() => void handleCompleteThread()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-emerald-200 bg-emerald-50 px-2.5 py-1.5 text-xs font-semibold text-emerald-700 hover:bg-emerald-100 disabled:opacity-50"
                      >
                        {threadActionSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <CheckCircle2 className="h-3.5 w-3.5" />
                        )}
                        Complete
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={threadActionSaving}
                        onClick={() => void handleReopenThread()}
                        className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {threadActionSaving ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <RotateCcw className="h-3.5 w-3.5" />
                        )}
                        Reopen / Move to Inbox
                      </button>
                    )}
                    <button
                      type="button"
                      onClick={() => setSelectedThread(null)}
                      className="rounded p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                      aria-label="Close thread"
                    >
                      <X className="h-4 w-4" />
                    </button>
                  </div>
                </div>

                <div className="flex-1 space-y-3 overflow-y-auto px-4 py-4">
                  {threadLoading ? (
                    <div className="flex items-center gap-2 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                      Loading thread…
                    </div>
                  ) : (
                    threadMessages.map((message) => (
                      <div
                        key={message.id}
                        className={cn(
                          "max-w-[85%] rounded-2xl px-3 py-2 text-sm",
                          message.direction === "inbound"
                            ? "bg-slate-100 text-slate-800"
                            : "ml-auto bg-orange-500 text-white"
                        )}
                      >
                        <p className="whitespace-pre-wrap">{message.message_body}</p>
                        <p
                          className={cn(
                            "mt-1 text-[10px]",
                            message.direction === "inbound"
                              ? "text-slate-400"
                              : "text-orange-100"
                          )}
                        >
                          {formatDateTime(message.created_at)} · {message.status}
                        </p>
                      </div>
                    ))
                  )}
                </div>

                {folder === "inbox" ? (
                  <div className="border-t border-slate-200 p-4">
                    <label className="block space-y-1">
                      <span className={labelClass}>Reply</span>
                      <textarea
                        className={cn(inputClass, "min-h-[80px]")}
                        value={replyBody}
                        onChange={(event) => setReplyBody(event.target.value)}
                        placeholder="Type a reply…"
                      />
                    </label>
                    <div className="mt-2 flex justify-end">
                      <button
                        type="button"
                        disabled={replySaving || !replyBody.trim()}
                        onClick={() => void handleReply()}
                        className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
                      >
                        {replySaving ? (
                          <Loader2 className="h-4 w-4 animate-spin" />
                        ) : (
                          <Send className="h-4 w-4" />
                        )}
                        Send Reply
                      </button>
                    </div>
                  </div>
                ) : null}
              </>
            )}
          </div>
        </div>
      ) : (
        <div className="space-y-3">
          {messages.length === 0 ? (
            <div className={cn("p-8 text-center text-sm text-slate-500", cardClass)}>
              No outbound SMS yet.
            </div>
          ) : (
            messages.map((message) => (
              <article key={message.id} className={cn("p-4", cardClass)}>
                <div className="flex flex-wrap items-start justify-between gap-2">
                  <div>
                    <p className="font-semibold text-slate-900">
                      {message.worker_name || message.to_number}
                    </p>
                    <p className="text-xs text-slate-500">To: {message.to_number}</p>
                  </div>
                  <div className="text-right text-xs text-slate-500">
                    <p>{formatDateTime(message.created_at)}</p>
                    <p className="font-semibold uppercase tracking-wide text-slate-600">
                      {message.status}
                      {message.scheduled_at ? " · scheduled" : ""}
                    </p>
                  </div>
                </div>
                <p className="mt-2 whitespace-pre-wrap text-sm text-slate-700">
                  {message.message_body}
                </p>
                {message.scheduled_at ? (
                  <p className="mt-2 text-xs text-slate-500">
                    Scheduled for {formatDateTime(message.scheduled_at)}
                    {message.recurrence ? ` · Recurs ${message.recurrence}` : ""}
                  </p>
                ) : null}
                {message.error_message ? (
                  <p className="mt-2 text-xs text-red-600">{message.error_message}</p>
                ) : null}
              </article>
            ))
          )}
        </div>
      )}

      {composeOpen ? (
        <ComposeSmsModal
          workers={workers}
          projects={projects}
          onClose={() => setComposeOpen(false)}
          onSent={(summary) => {
            setFolder("sent");
            void loadData("sent");
            void refreshUnreadBadge();
            if (summary?.warning) {
              showError(summary.warning);
              return;
            }
            const parts: string[] = [];
            if (summary?.sent) parts.push(`${summary.sent} sent`);
            if (summary?.queued) parts.push(`${summary.queued} scheduled`);
            showSuccess(
              parts.length > 0 ? `SMS dispatch complete (${parts.join(", ")}).` : "SMS sent."
            );
          }}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
