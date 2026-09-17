"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { DbProject } from "@/lib/project-resolver";
import { composeSms } from "@/lib/sms-module-client";
import {
  SMS_OUTBOUND_PREFIX,
  SMS_RECURRENCE_OPTIONS,
  SMS_SEGMENT_LENGTH,
} from "@/lib/sms-types";
import { smsSegmentCount } from "@/lib/sms-phone";
import RecipientTargetingControls from "@/components/communications/RecipientTargetingControls";
import {
  resolveCommsRecipients,
  type CommsTargetMode,
  type ProjectStateTag,
} from "@/components/communications/recipient-targeting";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ComposeSmsModalProps {
  workers: Worker[];
  projects: DbProject[];
  onClose: () => void;
  onSent: (summary?: { warning?: string; sent?: number; failed?: number; queued?: number }) => void;
}

function formatSmsDispatchErrors(
  result: Awaited<ReturnType<typeof composeSms>>
): string | null {
  const parts: string[] = [];
  if (result.error) parts.push(result.error);
  if (result.twilioCode) parts.push(`Twilio code ${result.twilioCode}`);
  for (const item of result.dispatchErrors ?? []) {
    parts.push(
      item.twilioCode ? `[${item.twilioCode}] ${item.error}` : item.error
    );
  }
  return parts.length > 0 ? parts.join(" · ") : null;
}

export default function ComposeSmsModal({
  workers,
  projects,
  onClose,
  onSent,
}: ComposeSmsModalProps) {
  const [targetMode, setTargetMode] = useState<CommsTargetMode>("all_workers");
  const [selectedStateTags, setSelectedStateTags] = useState<ProjectStateTag[]>([]);
  const [selectedProjectIds, setSelectedProjectIds] = useState<string[]>([]);
  const [messageBody, setMessageBody] = useState("");
  const [sendMode, setSendMode] = useState<"immediate" | "scheduled">("immediate");
  const [scheduledAt, setScheduledAt] = useState("");
  const [recurrence, setRecurrence] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const recipients = useMemo(
    () =>
      resolveCommsRecipients({
        mode: targetMode,
        workers,
        projects,
        stateTags: selectedStateTags,
        projectIds: selectedProjectIds,
        channel: "sms",
      }),
    [projects, selectedProjectIds, selectedStateTags, targetMode, workers]
  );

  const previewBody = `${SMS_OUTBOUND_PREFIX}${messageBody.trim()}`;
  const segments = smsSegmentCount(previewBody, SMS_SEGMENT_LENGTH);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!messageBody.trim()) {
      setError("Message body is required.");
      return;
    }
    if (targetMode === "by_state" && selectedStateTags.length === 0) {
      setError("Select at least one state tag.");
      return;
    }
    if (targetMode === "by_project" && selectedProjectIds.length === 0) {
      setError("Select at least one project.");
      return;
    }
    if (recipients.length === 0) {
      setError("No matching workers with a valid mobile number.");
      return;
    }
    if (sendMode === "scheduled" && !scheduledAt.trim()) {
      setError("Choose a schedule date and time.");
      return;
    }

    setSaving(true);
    try {
      const result = await composeSms({
        message_body: messageBody.trim(),
        target_mode: "selected_workers",
        worker_ids: recipients.map((worker) => worker.id),
        project_ids: selectedProjectIds,
        project_id: selectedProjectIds[0] ?? null,
        send_mode: sendMode,
        scheduled_at: sendMode === "scheduled" ? new Date(scheduledAt).toISOString() : null,
        recurrence: recurrence || null,
      });

      const delivered = (result.sent ?? 0) + (result.queued ?? 0);
      const failureMessage = formatSmsDispatchErrors(result);

      if (delivered === 0) {
        setError(failureMessage ?? "Failed to send SMS.");
        return;
      }

      onSent({
        warning: failureMessage ?? undefined,
        sent: result.sent,
        failed: result.failed,
        queued: result.queued,
      });
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to send SMS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-2xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Compose New SMS</h2>
            <p className="text-sm text-slate-500">
              Outbound messages are prefixed with {SMS_OUTBOUND_PREFIX.trim()}.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <RecipientTargetingControls
            mode={targetMode}
            onModeChange={setTargetMode}
            selectedStateTags={selectedStateTags}
            onStateTagsChange={setSelectedStateTags}
            selectedProjectIds={selectedProjectIds}
            onProjectIdsChange={setSelectedProjectIds}
            projects={projects}
            recipients={recipients}
          />

          <label className="block space-y-1">
            <span className={labelClass}>Message *</span>
            <textarea
              className={cn(inputClass, "min-h-[120px]")}
              value={messageBody}
              onChange={(event) => setMessageBody(event.target.value)}
              required
            />
            <p className="text-xs text-slate-500">
              Preview length {previewBody.length} · {segments} SMS segment
              {segments === 1 ? "" : "s"} (160 chars each)
            </p>
          </label>

          <fieldset className="space-y-2">
            <legend className={labelClass}>Delivery *</legend>
            <div className="flex flex-wrap gap-2">
              <button
                type="button"
                onClick={() => setSendMode("immediate")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium",
                  sendMode === "immediate"
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                Send Now
              </button>
              <button
                type="button"
                onClick={() => setSendMode("scheduled")}
                className={cn(
                  "rounded-lg border px-3 py-1.5 text-sm font-medium",
                  sendMode === "scheduled"
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-slate-200 bg-white text-slate-700"
                )}
              >
                Schedule for Later
              </button>
            </div>
          </fieldset>

          {sendMode === "scheduled" ? (
            <div className="grid gap-3 sm:grid-cols-2">
              <label className="block space-y-1">
                <span className={labelClass}>Schedule at *</span>
                <input
                  type="datetime-local"
                  className={inputClass}
                  value={scheduledAt}
                  onChange={(event) => setScheduledAt(event.target.value)}
                  required
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Recurrence</span>
                <select
                  className={inputClass}
                  value={recurrence}
                  onChange={(event) => setRecurrence(event.target.value)}
                >
                  {SMS_RECURRENCE_OPTIONS.map((option) => (
                    <option key={option.value || "none"} value={option.value}>
                      {option.label}
                    </option>
                  ))}
                </select>
              </label>
            </div>
          ) : null}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {sendMode === "scheduled" ? "Schedule SMS" : "Send SMS"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
