"use client";

import { useState } from "react";
import { Loader2, Pencil, Plus, Send, Trash2, X } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import type { EmailTemplateRow, SaveEmailTemplateInput } from "@/lib/email-module-types";
import {
  EMAIL_TEMPLATE_CATEGORIES,
  EMAIL_TEMPLATE_PLACEHOLDERS,
  categoryBadgeClass,
} from "@/lib/email-template-utils";
import { saveEmailTemplate } from "@/lib/email-module-client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

function htmlToEditorText(html: string): string {
  return html
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .trim();
}

function editorTextToHtml(text: string): string {
  return text.replace(/\n/g, "<br>");
}

function bodyPreview(html: string): string {
  return html.replace(/<[^>]+>/g, " ").replace(/\s+/g, " ").trim().slice(0, 160);
}

interface EmailTemplatesPanelProps {
  templates: EmailTemplateRow[];
  saving: boolean;
  adminWorkerId: string | null;
  adminName: string;
  onRefresh: () => Promise<void>;
  onUseInCompose: (template: EmailTemplateRow) => void;
  onDelete: (template: EmailTemplateRow) => Promise<void>;
  onSaved?: (template: EmailTemplateRow) => void;
}

export default function EmailTemplatesPanel({
  templates,
  saving,
  adminWorkerId,
  adminName,
  onRefresh,
  onUseInCompose,
  onDelete,
  onSaved,
}: EmailTemplatesPanelProps) {
  const [modalOpen, setModalOpen] = useState(false);
  const [editing, setEditing] = useState<EmailTemplateRow | null>(null);
  const [localSaving, setLocalSaving] = useState(false);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const openCreate = () => {
    setEditing(null);
    setModalOpen(true);
  };

  const openEdit = (template: EmailTemplateRow) => {
    setEditing(template);
    setModalOpen(true);
  };

  const handleSave = async (input: SaveEmailTemplateInput) => {
    setLocalSaving(true);
    try {
      const result = await saveEmailTemplate(input, editing?.id ?? null);
      if (result.error) {
        console.error("[EmailTemplatesPanel] Failed to save template:", result.error);
        showError(result.error || "Failed to save template");
        return;
      }

      if (result.template) {
        onSaved?.(result.template);
      }

      showSuccess("Template saved successfully.");
      setModalOpen(false);
      setEditing(null);
      await onRefresh();
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to save template";
      console.error("[EmailTemplatesPanel] Failed to save template:", error);
      showError(message);
    } finally {
      setLocalSaving(false);
    }
  };

  return (
    <div className="flex min-h-0 flex-1 flex-col">
      <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
        <div>
          <h2 className="text-sm font-semibold text-slate-900">Email Templates</h2>
          <p className="text-xs text-slate-500">
            Reusable notices for safety, timesheets, and site communications.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Add Template
        </button>
      </div>

      <div className="flex-1 overflow-y-auto p-4">
        {templates.length === 0 ? (
          <div className="rounded-lg border border-dashed border-slate-200 bg-slate-50 p-8 text-center">
            <p className="text-sm font-medium text-slate-700">No templates yet</p>
            <p className="mt-1 text-sm text-slate-500">
              Create your first template for wet weather notices, timesheet reminders, and more.
            </p>
            <button
              type="button"
              onClick={openCreate}
              className="mt-4 inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              <Plus className="h-4 w-4" />
              Add Template
            </button>
          </div>
        ) : (
          <div className="grid gap-3 md:grid-cols-2">
            {templates.map((template) => (
              <article key={template.id} className={cn(cardClass, "flex flex-col p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h3 className="font-semibold text-slate-900">{template.name}</h3>
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          categoryBadgeClass(template.category)
                        )}
                      >
                        {template.category}
                      </span>
                    </div>
                    <p className="mt-1 text-sm font-medium text-slate-700">{template.subject}</p>
                    <p className="mt-2 line-clamp-3 text-xs text-slate-500">
                      {bodyPreview(template.body_html)}
                    </p>
                  </div>
                </div>
                <div className="mt-4 flex flex-wrap gap-2">
                  <button
                    type="button"
                    onClick={() => onUseInCompose(template)}
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-500"
                  >
                    <Send className="h-3.5 w-3.5" />
                    Use in Compose
                  </button>
                  <button
                    type="button"
                    onClick={() => openEdit(template)}
                    className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                  >
                    <Pencil className="h-3.5 w-3.5" />
                    Edit
                  </button>
                  <button
                    type="button"
                    disabled={saving}
                    onClick={() => void onDelete(template)}
                    className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-60"
                  >
                    <Trash2 className="h-3.5 w-3.5" />
                    Delete
                  </button>
                </div>
              </article>
            ))}
          </div>
        )}
      </div>

      {modalOpen ? (
        <TemplateEditorModal
          template={editing}
          saving={localSaving}
          adminWorkerId={adminWorkerId}
          adminName={adminName}
          onClose={() => {
            setModalOpen(false);
            setEditing(null);
          }}
          onSave={handleSave}
          onValidationError={showError}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}

function TemplateEditorModal({
  template,
  saving,
  adminWorkerId,
  adminName,
  onClose,
  onSave,
  onValidationError,
}: {
  template: EmailTemplateRow | null;
  saving: boolean;
  adminWorkerId: string | null;
  adminName: string;
  onClose: () => void;
  onSave: (input: SaveEmailTemplateInput) => Promise<void>;
  onValidationError: (message: string) => void;
}) {
  const [name, setName] = useState(template?.name ?? "");
  const [subject, setSubject] = useState(template?.subject ?? "");
  const [category, setCategory] = useState(template?.category ?? "General");
  const [body, setBody] = useState(
    template ? htmlToEditorText(template.body_html) : ""
  );

  const insertPlaceholder = (token: string) => {
    setBody((current) => `${current}${current.endsWith(" ") || !current ? "" : " "}${token}`);
  };

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();

    const trimmedSubject = subject.trim();
    const trimmedBody = body.trim();
    const trimmedName = name.trim();

    if (!trimmedSubject || !trimmedBody) {
      onValidationError("Please fill in Title, Subject, and Body");
      return;
    }

    void onSave({
      name: trimmedName || trimmedSubject,
      subject: trimmedSubject,
      category: category.trim() || "General",
      body_html: editorTextToHtml(trimmedBody),
      body_text: trimmedBody,
      created_by: adminWorkerId,
      created_by_name: adminName,
    });
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="flex max-h-[92vh] w-full max-w-2xl flex-col overflow-hidden rounded-xl bg-white shadow-2xl">
        <div className="flex items-center justify-between border-b border-slate-200 px-5 py-4">
          <h2 className="text-lg font-bold text-slate-900">
            {template ? "Edit Template" : "Add Template"}
          </h2>
          <button type="button" onClick={onClose} className="rounded-md p-2 hover:bg-slate-100">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="flex min-h-0 flex-1 flex-col">
        <div className="space-y-4 overflow-y-auto px-5 py-4">
          <div>
            <label className={labelClass}>Template Title / Name</label>
            <input
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="Weekly Timesheet Reminder"
              className={cn(inputClass, "mt-1")}
            />
          </div>

          <div>
            <label className={labelClass}>Email Subject</label>
            <input
              value={subject}
              onChange={(event) => setSubject(event.target.value)}
              placeholder="Reminder: submit your timesheet"
              className={cn(inputClass, "mt-1")}
            />
          </div>

          <div>
            <label className={labelClass}>Category / Tag</label>
            <select
              value={category}
              onChange={(event) => setCategory(event.target.value)}
              className={cn(inputClass, "mt-1")}
            >
              {EMAIL_TEMPLATE_CATEGORIES.map((item) => (
                <option key={item} value={item}>
                  {item}
                </option>
              ))}
            </select>
          </div>

          <div>
            <label className={labelClass}>Dynamic Placeholders</label>
            <div className="mt-2 flex flex-wrap gap-2">
              {EMAIL_TEMPLATE_PLACEHOLDERS.map((placeholder) => (
                <button
                  key={placeholder.key}
                  type="button"
                  onClick={() => insertPlaceholder(placeholder.token)}
                  className="rounded-full border border-orange-200 bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 hover:bg-orange-100"
                >
                  {placeholder.token}
                </button>
              ))}
            </div>
          </div>

          <div>
            <label className={labelClass}>Body</label>
            <textarea
              value={body}
              onChange={(event) => setBody(event.target.value)}
              placeholder="Hi {{worker_name}}, please submit your timesheet for {{project_name}} by end of day."
              className={cn(inputClass, "mt-1 min-h-48 font-mono text-sm")}
            />
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
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Template
          </button>
        </div>
        </form>
      </div>
    </div>
  );
}
