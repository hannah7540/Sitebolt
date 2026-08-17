"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  CalendarClock,
  FileSignature,
  Inbox,
  Loader2,
  Mail,
  Pause,
  Pencil,
  Play,
  Plus,
  Search,
  Send,
  Trash2,
  X,
} from "lucide-react";
import EmailSignatureModal from "@/components/emails/EmailSignatureModal";
import EmailTemplatesPanel from "@/components/emails/EmailTemplatesPanel";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { canAccessEmailsModule } from "@/lib/security-roles";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  composeEmail,
  deleteEmailTemplate,
  deleteScheduledEmail,
  fetchEmailMessages,
  fetchEmailTemplates,
  fetchEmailThread,
  fetchLiveEmailSignature,
  fetchUnreadEmailCount,
  markEmailThreadRead,
  processDueScheduledEmails,
  saveEmailTemplate,
  updateScheduledEmail,
  type EmailFolder,
  type EmailMessageRow,
  type EmailSignatureRow,
  type EmailTemplateRow,
} from "@/lib/email-module-client";
import {
  SIGNATURE_DIVIDER_HTML,
  wrapSignatureHtml,
} from "@/lib/email-signature-utils";
import type {
  ComposeEmailInput,
  EmailRecurrenceRule,
  EmailTargetMode,
} from "@/lib/email-module-types";
import {
  EMAIL_RECURRENCE_OPTIONS,
  EMAIL_TARGET_MODE_LABELS,
} from "@/lib/email-module-types";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type DateFilter = "all" | "today" | "last7" | "custom";

function startOfTodayIso(): string {
  const date = new Date();
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function daysAgoIso(days: number): string {
  const date = new Date();
  date.setDate(date.getDate() - days);
  date.setHours(0, 0, 0, 0);
  return date.toISOString();
}

function formatDateTime(value: string | null | undefined): string {
  if (!value) return "—";
  return new Date(value).toLocaleString();
}

function bodyPreview(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 140);
}

function wrapSelection(textarea: HTMLTextAreaElement, before: string, after: string) {
  const start = textarea.selectionStart;
  const end = textarea.selectionEnd;
  const selected = textarea.value.slice(start, end);
  const next = `${textarea.value.slice(0, start)}${before}${selected}${after}${textarea.value.slice(end)}`;
  return next;
}

export default function EmailsModulePanel() {
  const { sessionRole, workers, projects, adminWorkerId, loading: sessionLoading } =
    useAdminConsole();

  const [folder, setFolder] = useState<EmailFolder>("inbox");
  const [messages, setMessages] = useState<EmailMessageRow[]>([]);
  const [templates, setTemplates] = useState<EmailTemplateRow[]>([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [dateFilter, setDateFilter] = useState<DateFilter>("all");
  const [customFrom, setCustomFrom] = useState("");
  const [customTo, setCustomTo] = useState("");
  const [projectFilter, setProjectFilter] = useState("");
  const [workerFilter, setWorkerFilter] = useState("");
  const [selectedThreadId, setSelectedThreadId] = useState<string | null>(null);
  const [threadMessages, setThreadMessages] = useState<EmailMessageRow[]>([]);
  const [threadLoading, setThreadLoading] = useState(false);
  const [composeOpen, setComposeOpen] = useState(false);
  const [composePrefillTemplate, setComposePrefillTemplate] =
    useState<EmailTemplateRow | null>(null);
  const [signatureOpen, setSignatureOpen] = useState(false);
  const [liveSignature, setLiveSignature] = useState<EmailSignatureRow | null>(null);
  const [saving, setSaving] = useState(false);
  const { toast, showSuccess, dismissToast } = useFormToast();

  const canAccess = canAccessEmailsModule(sessionRole);

  const dateRange = useMemo(() => {
    if (dateFilter === "today") {
      return { dateFrom: startOfTodayIso(), dateTo: null };
    }
    if (dateFilter === "last7") {
      return { dateFrom: daysAgoIso(7), dateTo: null };
    }
    if (dateFilter === "custom") {
      return {
        dateFrom: customFrom ? `${customFrom}T00:00:00.000Z` : null,
        dateTo: customTo || null,
      };
    }
    return { dateFrom: null, dateTo: null };
  }, [dateFilter, customFrom, customTo]);

  const activeWorkers = useMemo(
    () =>
      workers.filter(
        (worker) =>
          !worker.is_revoked &&
          !worker.is_archived &&
          Boolean(worker.email?.trim())
      ),
    [workers]
  );

  const loadData = useCallback(async () => {
    if (!canAccess) return;
    setLoading(true);
    setError(null);

    await processDueScheduledEmails();

    const [messageResult, templateResult, unreadResult, signatureResult] = await Promise.all([
      folder === "templates"
        ? Promise.resolve({ messages: [], error: null })
        : fetchEmailMessages({
            folder,
            search,
            ...dateRange,
            projectId: projectFilter || null,
            workerId: workerFilter || null,
          }),
      fetchEmailTemplates(),
      fetchUnreadEmailCount(),
      fetchLiveEmailSignature(),
    ]);

    if (folder !== "templates") {
      setMessages(messageResult.messages);
      if (messageResult.error) setError(messageResult.error);
    }
    setTemplates(templateResult.templates);
    setUnreadCount(unreadResult.count);
    setLiveSignature(signatureResult.signature);
    setLoading(false);
  }, [
    canAccess,
    folder,
    search,
    dateRange,
    projectFilter,
    workerFilter,
  ]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const openThread = async (message: EmailMessageRow) => {
    const threadId = message.thread_id ?? message.id;
    setSelectedThreadId(threadId);
    setThreadLoading(true);
    const result = await fetchEmailThread(threadId);
    setThreadMessages(result.messages);
    setThreadLoading(false);
    if (message.direction === "inbound" && !message.is_read) {
      await markEmailThreadRead(threadId);
      void loadData();
    }
  };

  const handlePauseScheduled = async (message: EmailMessageRow) => {
    setSaving(true);
    await updateScheduledEmail(message.id, {
      status: message.status === "paused" ? "scheduled" : "paused",
      recurrence_active: message.status === "paused",
    });
    setSaving(false);
    void loadData();
  };

  const handleDeleteScheduled = async (message: EmailMessageRow) => {
    if (!window.confirm("Delete this scheduled email?")) return;
    setSaving(true);
    await deleteScheduledEmail(message.id);
    setSaving(false);
    void loadData();
  };

  const handleDeleteTemplate = async (template: EmailTemplateRow) => {
    if (!window.confirm(`Delete template "${template.title}"?`)) return;
    setSaving(true);
    await deleteEmailTemplate(template.id);
    setSaving(false);
    void loadData();
  };

  if (sessionLoading) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!canAccess) {
    return (
      <div className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        The EMAIL&apos;s module is restricted to Owner and Full Access users.
      </div>
    );
  }

  return (
    <div className="mx-auto flex max-w-7xl flex-col gap-4">
      <div>
        <h1 className="text-3xl font-bold text-slate-900">
          EMAIL&apos;s <span className="text-orange-500">Communication</span>
        </h1>
        <p className="mt-2 text-sm text-slate-500">
          Send site notices, schedule recurring reminders, and review worker replies.
        </p>
      </div>

      <div className="flex min-h-[640px] overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <aside className="flex w-64 shrink-0 flex-col border-r border-slate-200 bg-slate-50/70 p-4">
          <button
            type="button"
            onClick={() => setComposeOpen(true)}
            className="mb-4 inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-500"
          >
            <Plus className="h-4 w-4" />
            Compose New Email
          </button>

          <nav className="space-y-1">
            <FolderButton
              active={folder === "inbox"}
              icon={Inbox}
              label="Inbox"
              badge={unreadCount}
              onClick={() => {
                setFolder("inbox");
                setSelectedThreadId(null);
              }}
            />
            <FolderButton
              active={folder === "sent"}
              icon={Send}
              label="Sent"
              onClick={() => {
                setFolder("sent");
                setSelectedThreadId(null);
              }}
            />
            <FolderButton
              active={folder === "scheduled"}
              icon={CalendarClock}
              label="Scheduled"
              onClick={() => {
                setFolder("scheduled");
                setSelectedThreadId(null);
              }}
            />
            <FolderButton
              active={folder === "templates"}
              icon={Mail}
              label="Templates"
              onClick={() => {
                setFolder("templates");
                setSelectedThreadId(null);
              }}
            />
          </nav>
        </aside>

        <div className="flex min-w-0 flex-1 flex-col">
          <div className="border-b border-slate-200 p-4">
            <div className="flex flex-wrap items-center gap-3">
              <div className="relative min-w-[220px] flex-1">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Search subject, recipient, or sender"
                  className={cn(inputClass, "pl-9")}
                />
              </div>
              <select
                value={dateFilter}
                onChange={(event) => setDateFilter(event.target.value as DateFilter)}
                className={cn(inputClass, "w-auto")}
              >
                <option value="all">All dates</option>
                <option value="today">Today</option>
                <option value="last7">Last 7 days</option>
                <option value="custom">Custom range</option>
              </select>
              <select
                value={projectFilter}
                onChange={(event) => setProjectFilter(event.target.value)}
                className={cn(inputClass, "w-auto max-w-[180px]")}
              >
                <option value="">All projects</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
              <select
                value={workerFilter}
                onChange={(event) => setWorkerFilter(event.target.value)}
                className={cn(inputClass, "w-auto max-w-[180px]")}
              >
                <option value="">All workers</option>
                {activeWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {getWorkerDisplayName(worker)}
                  </option>
                ))}
              </select>
              <button
                type="button"
                onClick={() => setSignatureOpen(true)}
                className="ml-auto inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-semibold text-slate-700 shadow-sm hover:border-orange-200 hover:text-orange-600"
              >
                <FileSignature className="h-4 w-4" />
                Signature
              </button>
            </div>
            {dateFilter === "custom" ? (
              <div className="mt-3 flex flex-wrap gap-3">
                <input
                  type="date"
                  value={customFrom}
                  onChange={(event) => setCustomFrom(event.target.value)}
                  className={cn(inputClass, "w-auto")}
                />
                <input
                  type="date"
                  value={customTo}
                  onChange={(event) => setCustomTo(event.target.value)}
                  className={cn(inputClass, "w-auto")}
                />
              </div>
            ) : null}
          </div>

          {error ? (
            <div className="mx-4 mt-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          <div className="grid min-h-0 flex-1 grid-cols-1 lg:grid-cols-2">
            {folder === "templates" ? (
              <div className="lg:col-span-2">
                <EmailTemplatesPanel
                  templates={templates}
                  saving={saving}
                  onRefresh={loadData}
                  onSaved={(template) => {
                    setTemplates((current) => {
                      const existingIndex = current.findIndex((row) => row.id === template.id);
                      if (existingIndex >= 0) {
                        const next = [...current];
                        next[existingIndex] = template;
                        return next.sort((a, b) => b.updated_at.localeCompare(a.updated_at));
                      }
                      return [template, ...current];
                    });
                  }}
                  onUseInCompose={(template) => {
                    setComposePrefillTemplate(template);
                    setComposeOpen(true);
                  }}
                  onDelete={handleDeleteTemplate}
                />
              </div>
            ) : (
              <>
            <div className="overflow-y-auto border-r border-slate-200">
              {loading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
              ) : messages.length === 0 ? (
                <p className="p-6 text-sm text-slate-500">No messages in this folder.</p>
              ) : (
                <div className="divide-y divide-slate-200">
                  {messages.map((message) => (
                    <button
                      key={message.id}
                      type="button"
                      onClick={() => void openThread(message)}
                      className={cn(
                        "w-full px-4 py-3 text-left transition hover:bg-orange-50/60",
                        selectedThreadId === (message.thread_id ?? message.id) &&
                          "bg-orange-50",
                        folder === "inbox" && !message.is_read && "bg-sky-50/70"
                      )}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="min-w-0 flex items-start gap-2">
                          {folder === "inbox" && !message.is_read ? (
                            <span
                              className="mt-2 h-2.5 w-2.5 shrink-0 rounded-full bg-sky-500"
                              aria-label="Unread"
                            />
                          ) : (
                            <span className="mt-2 h-2.5 w-2.5 shrink-0" />
                          )}
                          <div className="min-w-0">
                          <p
                            className={cn(
                              "truncate text-slate-900",
                              folder === "inbox" && !message.is_read
                                ? "font-bold"
                                : "font-semibold"
                            )}
                          >
                            {message.subject}
                          </p>
                          <p className="mt-1 truncate text-sm text-slate-600">
                            {folder === "inbox"
                              ? message.sender_name || message.sender_email || "Unknown sender"
                              : message.to_emails.join(", ") || "No recipients"}
                          </p>
                          <p className="mt-1 line-clamp-2 text-xs text-slate-500">
                            {bodyPreview(message.body_html)}
                          </p>
                          </div>
                        </div>
                        <div className="shrink-0 text-right">
                          <p className="text-xs text-slate-500">
                            {formatDateTime(message.sent_at ?? message.created_at)}
                          </p>
                          {folder === "scheduled" ? (
                            <div className="mt-2 flex justify-end gap-1">
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handlePauseScheduled(message);
                                }}
                                className="rounded p-1 text-slate-500 hover:bg-slate-100"
                              >
                                {message.status === "paused" ? (
                                  <Play className="h-4 w-4" />
                                ) : (
                                  <Pause className="h-4 w-4" />
                                )}
                              </button>
                              <button
                                type="button"
                                onClick={(event) => {
                                  event.stopPropagation();
                                  void handleDeleteScheduled(message);
                                }}
                                className="rounded p-1 text-slate-500 hover:bg-red-50 hover:text-red-600"
                              >
                                <Trash2 className="h-4 w-4" />
                              </button>
                            </div>
                          ) : null}
                        </div>
                      </div>
                    </button>
                  ))}
                </div>
              )}
            </div>

            <div className="overflow-y-auto p-4">
              {!selectedThreadId ? (
                <div className="flex h-full items-center justify-center text-sm text-slate-500">
                  Select a message to view the conversation.
                </div>
              ) : threadLoading ? (
                <div className="flex items-center justify-center py-16">
                  <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
                </div>
              ) : (
                <div className="space-y-4">
                  {threadMessages.map((message) => (
                    <article
                      key={message.id}
                      className={cn(
                        cardClass,
                        "p-4",
                        message.direction === "inbound"
                          ? "border-sky-200 bg-sky-50/40"
                          : "border-orange-200 bg-orange-50/20"
                      )}
                    >
                      <div className="mb-2 flex items-center justify-between gap-3">
                        <div>
                          <p className="text-sm font-semibold text-slate-900">
                            {message.direction === "inbound"
                              ? message.sender_name || message.sender_email
                              : message.created_by_name || "SiteBolt"}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatDateTime(message.sent_at ?? message.created_at)}
                          </p>
                        </div>
                        <span className="rounded-full bg-white px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-slate-600">
                          {message.direction}
                        </span>
                      </div>
                      <h3 className="font-semibold text-slate-900">{message.subject}</h3>
                      <div
                        className="prose prose-sm mt-3 max-w-none text-slate-700"
                        dangerouslySetInnerHTML={{ __html: message.body_html }}
                      />
                      {message.attachment_urls.length > 0 ? (
                        <ul className="mt-3 space-y-1 text-sm">
                          {message.attachment_urls.map((url) => (
                            <li key={url}>
                              <a
                                href={url}
                                target="_blank"
                                rel="noopener noreferrer"
                                className="text-orange-600 hover:underline"
                              >
                                Attachment
                              </a>
                            </li>
                          ))}
                        </ul>
                      ) : null}
                    </article>
                  ))}
                </div>
              )}
            </div>
              </>
            )}
          </div>
        </div>
      </div>

      {composeOpen ? (
        <ComposeEmailModal
          workers={activeWorkers}
          projects={projects}
          templates={templates}
          adminWorkerId={adminWorkerId}
          initialTemplate={composePrefillTemplate}
          liveSignatureHtml={liveSignature?.body_html ?? ""}
          adminName={
            workers.find((worker) => worker.id === adminWorkerId)
              ? getWorkerDisplayName(
                  workers.find((worker) => worker.id === adminWorkerId)!
                )
              : "Owner"
          }
          saving={saving}
          onClose={() => {
            setComposeOpen(false);
            setComposePrefillTemplate(null);
          }}
          onSaved={async () => {
            setComposeOpen(false);
            setComposePrefillTemplate(null);
            await loadData();
          }}
          onSaveTemplate={async (input) => {
            await saveEmailTemplate(input);
            await loadData();
          }}
          onSubmit={async (input) => {
            setSaving(true);
            const result = await composeEmail(input);
            setSaving(false);
            if (result.error) {
              setError(result.error);
              return;
            }
            setComposePrefillTemplate(null);
            await loadData();
            setComposeOpen(false);
          }}
        />
      ) : null}

      <EmailSignatureModal
        open={signatureOpen}
        onClose={() => setSignatureOpen(false)}
        onSaved={async (signature, madeLive) => {
          if (madeLive) {
            showSuccess("Live email signature updated.");
          }
          const refreshed = await fetchLiveEmailSignature();
          setLiveSignature(refreshed.signature ?? signature);
        }}
      />

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}

function FolderButton({
  active,
  icon: Icon,
  label,
  badge,
  onClick,
}: {
  active: boolean;
  icon: typeof Inbox;
  label: string;
  badge?: number;
  onClick: () => void;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        "flex w-full items-center justify-between rounded-lg px-3 py-2 text-sm font-medium transition",
        active
          ? "bg-orange-500 text-white shadow-sm"
          : "text-slate-700 hover:bg-white hover:text-orange-600"
      )}
    >
      <span className="flex items-center gap-2">
        <Icon className="h-4 w-4" />
        {label}
      </span>
      {badge && badge > 0 ? (
        <span
          className={cn(
            "rounded-full px-2 py-0.5 text-[10px] font-bold",
            active ? "bg-white/20 text-white" : "bg-orange-100 text-orange-700"
          )}
        >
          {badge}
        </span>
      ) : null}
    </button>
  );
}

function ComposeEmailModal({
  workers,
  projects,
  templates,
  adminWorkerId,
  adminName,
  initialTemplate,
  liveSignatureHtml,
  saving,
  onClose,
  onSubmit,
  onSaveTemplate,
}: {
  workers: ReturnType<typeof useAdminConsole>["workers"];
  projects: ReturnType<typeof useAdminConsole>["projects"];
  templates: EmailTemplateRow[];
  adminWorkerId: string | null;
  adminName: string;
  initialTemplate?: EmailTemplateRow | null;
  liveSignatureHtml?: string;
  saving: boolean;
  onClose: () => void;
  onSaved: () => Promise<void>;
  onSubmit: (input: ComposeEmailInput) => Promise<void>;
  onSaveTemplate: (input: {
    title: string;
    subject: string;
    body: string;
  }) => Promise<void>;
}) {
  const [targetMode, setTargetMode] = useState<EmailTargetMode>("all_workers");
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [customEmails, setCustomEmails] = useState("");
  const [templateId, setTemplateId] = useState(initialTemplate?.id ?? "");
  const [subject, setSubject] = useState(initialTemplate?.subject ?? "");
  const [messageBody, setMessageBody] = useState(
    initialTemplate?.body?.replace(/<br\s*\/?>/gi, "\n") ?? ""
  );
  const [sendMode, setSendMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledFor, setScheduledFor] = useState("");
  const [recurrenceRule, setRecurrenceRule] = useState<EmailRecurrenceRule | "">("");
  const [templateName, setTemplateName] = useState("");

  const signatureHtml = liveSignatureHtml?.trim() ?? "";

  useEffect(() => {
    if (!templateId) return;
    const template = templates.find((row) => row.id === templateId);
    if (!template) return;
    setSubject(template.subject);
    setMessageBody(template.body.replace(/<br\s*\/?>/gi, "\n"));
  }, [templateId, templates]);

  const buildBodyHtml = () => {
    const messageHtml = messageBody.replace(/\n/g, "<br>");
    if (!signatureHtml) return messageHtml;
    return `${messageHtml}${SIGNATURE_DIVIDER_HTML}${wrapSignatureHtml(signatureHtml)}`;
  };

  const buildBodyText = () => {
    const base = messageBody.trimEnd();
    if (!signatureHtml) return base;
    const plainSignature = signatureHtml
      .replace(/<br\s*\/?>/gi, "\n")
      .replace(/<[^>]+>/g, "")
      .trim();
    return base ? `${base}\n-- \n${plainSignature}` : plainSignature;
  };

  const applyFormatting = (before: string, after: string) => {
    const textarea = document.getElementById("email-body-editor") as HTMLTextAreaElement | null;
    if (!textarea) return;
    const next = wrapSelection(textarea, before, after);
    setMessageBody(next);
  };

  const handleSubmit = async () => {
    const input: ComposeEmailInput = {
      subject,
      body_html: buildBodyHtml(),
      body_text: buildBodyText(),
      target_mode: targetMode,
      target_config: {
        worker_ids: selectedWorkerIds,
        project_ids: selectedProjectIds,
        custom_emails: customEmails
          .split(/[\n,;]+/)
          .map((email) => email.trim())
          .filter(Boolean),
      },
      template_id: templateId || null,
      send_mode: sendMode,
      scheduled_for:
        sendMode === "scheduled" && scheduledFor
          ? new Date(scheduledFor).toISOString()
          : null,
      recurrence_rule: recurrenceRule || null,
      created_by: adminWorkerId ?? "owner",
      created_by_name: adminName,
    };
    await onSubmit(input);
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-3xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">Compose Email</h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <p className={labelClass}>Recipient Target</p>
            <div className="mt-2 flex flex-wrap gap-2">
              {(Object.keys(EMAIL_TARGET_MODE_LABELS) as EmailTargetMode[]).map((mode) => (
                <button
                  key={mode}
                  type="button"
                  onClick={() => setTargetMode(mode)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-xs font-semibold",
                    targetMode === mode
                      ? "bg-orange-500 text-white"
                      : "bg-slate-100 text-slate-700"
                  )}
                >
                  {EMAIL_TARGET_MODE_LABELS[mode]}
                </button>
              ))}
            </div>
          </div>

          {targetMode === "selected_workers" ? (
            <div>
              <p className={labelClass}>Select Workers</p>
              <select
                multiple
                value={selectedWorkerIds}
                onChange={(event) =>
                  setSelectedWorkerIds(
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className={cn(inputClass, "min-h-32")}
              >
                {workers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {getWorkerDisplayName(worker)} ({worker.email})
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {targetMode === "by_project" ? (
            <div>
              <p className={labelClass}>Select Projects / Sites</p>
              <select
                multiple
                value={selectedProjectIds}
                onChange={(event) =>
                  setSelectedProjectIds(
                    Array.from(event.target.selectedOptions).map((option) => option.value)
                  )
                }
                className={cn(inputClass, "min-h-32")}
              >
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </div>
          ) : null}

          {targetMode === "custom_emails" ? (
            <div>
              <p className={labelClass}>Custom Email Addresses</p>
              <textarea
                value={customEmails}
                onChange={(event) => setCustomEmails(event.target.value)}
                placeholder="one@example.com, two@example.com"
                className={cn(inputClass, "min-h-24")}
              />
            </div>
          ) : null}

          <div>
            <p className={labelClass}>Template</p>
            <select
              value={templateId}
              onChange={(event) => setTemplateId(event.target.value)}
              className={inputClass}
            >
              <option value="">No template</option>
              {templates.map((template) => (
                <option key={template.id} value={template.id}>
                  {template.title}
                </option>
              ))}
            </select>
          </div>

          <div>
            <p className={labelClass}>Subject</p>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              className={inputClass}
            />
          </div>

          <div>
            <div className="mb-2 flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => applyFormatting("<strong>", "</strong>")}
                className="rounded border border-slate-200 px-2 py-1 text-xs font-semibold"
              >
                Bold
              </button>
              <button
                type="button"
                onClick={() => applyFormatting("<em>", "</em>")}
                className="rounded border border-slate-200 px-2 py-1 text-xs italic"
              >
                Italic
              </button>
              <button
                type="button"
                onClick={() => setMessageBody((current) => `${current}\n- `)}
                className="rounded border border-slate-200 px-2 py-1 text-xs"
              >
                Bullet
              </button>
            </div>
            <textarea
              id="email-body-editor"
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              className={cn(inputClass, "min-h-48 font-mono text-sm")}
            />
            {signatureHtml ? (
              <div className="mt-3 rounded-lg border border-dashed border-slate-200 bg-slate-50 p-3">
                <p className="mb-2 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  Live Signature Preview
                </p>
                <div
                  className="prose prose-sm max-w-none text-slate-700"
                  dangerouslySetInnerHTML={{ __html: signatureHtml }}
                />
              </div>
            ) : null}
          </div>

          <div className="grid gap-3 sm:grid-cols-2">
            <div>
              <p className={labelClass}>Delivery</p>
              <select
                value={sendMode}
                onChange={(event) =>
                  setSendMode(event.target.value as "immediate" | "scheduled")
                }
                className={inputClass}
              >
                <option value="immediate">Send immediately</option>
                <option value="scheduled">Schedule for later</option>
              </select>
            </div>
            {sendMode === "scheduled" ? (
              <>
                <div>
                  <p className={labelClass}>Scheduled For</p>
                  <input
                    type="datetime-local"
                    value={scheduledFor}
                    onChange={(event) => setScheduledFor(event.target.value)}
                    className={inputClass}
                  />
                </div>
                <div className="sm:col-span-2">
                  <p className={labelClass}>Recurrence</p>
                  <select
                    value={recurrenceRule}
                    onChange={(event) =>
                      setRecurrenceRule(event.target.value as EmailRecurrenceRule | "")
                    }
                    className={inputClass}
                  >
                    <option value="">One-off</option>
                    {EMAIL_RECURRENCE_OPTIONS.map((option) => (
                      <option key={option.id} value={option.id}>
                        {option.label}
                      </option>
                    ))}
                  </select>
                </div>
              </>
            ) : null}
          </div>

          <div className="rounded-lg border border-dashed border-slate-200 p-3">
            <p className={labelClass}>Save as Template</p>
            <div className="mt-2 flex gap-2">
              <input
                value={templateName}
                onChange={(event) => setTemplateName(event.target.value)}
                placeholder="Template name"
                className={inputClass}
              />
              <button
                type="button"
                onClick={() =>
                  void onSaveTemplate({
                    title: templateName.trim() || subject.trim() || "Untitled template",
                    subject,
                    body: buildBodyHtml(),
                  })
                }
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
              >
                <Pencil className="h-4 w-4" />
                Save
              </button>
            </div>
          </div>
        </div>

        <div className="flex items-center justify-end gap-2 border-t border-slate-200 px-5 py-4">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleSubmit()}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Send className="h-4 w-4" />}
            {sendMode === "scheduled" ? "Schedule Email" : "Send Email"}
          </button>
        </div>
      </div>
    </div>
  );
}
