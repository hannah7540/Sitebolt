"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import { resolveWorkerDisplayName } from "@/lib/induction-form-builder";
import {
  fetchRfiProjectOptions,
  parseAttachmentLinks,
  RFI_CATEGORY_OPTIONS,
  RFI_DISCIPLINE_OPTIONS,
  RFI_PRIORITY_OPTIONS,
  submitRfi,
  type RfiPriority,
  type RfiProjectOption,
} from "@/lib/rfi-service";
import { StableSignaturePad } from "@/components/workers/StableSignaturePad";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SubmitRFIModalProps {
  worker: Worker;
  seedProjects?: DbProject[];
  defaultProjectId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

export default function SubmitRFIModal({
  worker,
  seedProjects = [],
  defaultProjectId,
  onClose,
  onSubmitted,
}: SubmitRFIModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [subject, setSubject] = useState("");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [zoneArea, setZoneArea] = useState("");
  const [category, setCategory] = useState("");
  const [discipline, setDiscipline] = useState("");
  const [priority, setPriority] = useState<RfiPriority>("Medium");
  const [dueDate, setDueDate] = useState("");
  const [description, setDescription] = useState("");
  const [attachmentLinks, setAttachmentLinks] = useState("");
  const [documentUrl, setDocumentUrl] = useState("");
  const [comments, setComments] = useState("");
  const [signature, setSignature] = useState("");
  const [projects, setProjects] = useState<RfiProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const options = await fetchRfiProjectOptions(seedProjects);
        if (cancelled) return;
        setProjects(options);
        setProjectId((current) => {
          if (current) return current;
          if (defaultProjectId && options.some((row) => row.id === defaultProjectId)) {
            return defaultProjectId;
          }
          return options[0]?.id ?? "";
        });
      } finally {
        if (!cancelled) setLoadingProjects(false);
      }
    }

    void loadProjects();
    return () => {
      cancelled = true;
    };
  }, [defaultProjectId, seedProjects]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!subject.trim() || !description.trim()) {
      setError("Subject and description are required.");
      return;
    }
    if (!signature.trim()) {
      setError("Please sign your request.");
      return;
    }

    const selectedProject = projects.find((row) => row.id === projectId);
    const attachments = [
      ...parseAttachmentLinks(attachmentLinks),
      ...(documentUrl.trim()
        ? [{ name: "Document", url: documentUrl.trim(), type: "document" }]
        : []),
    ];

    setSaving(true);
    try {
      const result = await submitRfi({
        title: subject,
        description,
        projectId: projectId || null,
        projectName: selectedProject?.name ?? "General / Unassigned",
        zoneArea,
        category,
        discipline,
        priority,
        dueDate: dueDate || null,
        attachments,
        documentUrl: documentUrl || null,
        comments,
        requestedById: worker.id,
        requestedByName:
          resolveWorkerDisplayName(worker) ||
          worker.full_name ||
          worker.name ||
          "Worker",
        requestedByEmail: worker.email ?? "",
        signatureDataUrl: signature,
      });

      if (result.error || !result.rfi) {
        const message = result.error ?? "Failed to submit RFI.";
        setError(message);
        showError(message);
        return;
      }

      showSuccess("RFI Submitted Successfully!");
      onSubmitted();
      window.setTimeout(() => onClose(), 300);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to submit RFI.";
      setError(message);
      showError(message);
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
        <div
          className={cn(modalClass, "max-w-2xl")}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Submit RFI</h2>
              <p className="text-sm text-slate-500">
                Request information or clarification from site management.
              </p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4">
            <div className="grid gap-4 sm:grid-cols-2">
              <label className="block space-y-1 sm:col-span-2">
                <span className={labelClass}>RFI Subject</span>
                <input
                  className={inputClass}
                  value={subject}
                  onChange={(event) => setSubject(event.target.value)}
                  placeholder="Brief summary of your request"
                  disabled={saving}
                />
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Project</span>
                <select
                  className={inputClass}
                  value={projectId}
                  onChange={(event) => setProjectId(event.target.value)}
                  disabled={saving || loadingProjects}
                >
                  {loadingProjects ? (
                    <option value="">Loading projects…</option>
                  ) : projects.length === 0 ? (
                    <option value="">General / Unassigned</option>
                  ) : (
                    projects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))
                  )}
                </select>
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Zone / Area</span>
                <input
                  className={inputClass}
                  value={zoneArea}
                  onChange={(event) => setZoneArea(event.target.value)}
                  placeholder="e.g. Level 3 East"
                  disabled={saving}
                />
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Category</span>
                <select
                  className={inputClass}
                  value={category}
                  onChange={(event) => setCategory(event.target.value)}
                  disabled={saving}
                >
                  <option value="">Select category</option>
                  {RFI_CATEGORY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Discipline</span>
                <select
                  className={inputClass}
                  value={discipline}
                  onChange={(event) => setDiscipline(event.target.value)}
                  disabled={saving}
                >
                  <option value="">Select discipline</option>
                  {RFI_DISCIPLINE_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Priority</span>
                <select
                  className={inputClass}
                  value={priority}
                  onChange={(event) => setPriority(event.target.value as RfiPriority)}
                  disabled={saving}
                >
                  {RFI_PRIORITY_OPTIONS.map((option) => (
                    <option key={option} value={option}>
                      {option}
                    </option>
                  ))}
                </select>
              </label>

              <label className="block space-y-1">
                <span className={labelClass}>Due Date</span>
                <input
                  type="date"
                  className={inputClass}
                  value={dueDate}
                  onChange={(event) => setDueDate(event.target.value)}
                  disabled={saving}
                />
              </label>
            </div>

            <label className="block space-y-1">
              <span className={labelClass}>Description</span>
              <textarea
                className={cn(inputClass, "min-h-[120px] resize-y")}
                value={description}
                onChange={(event) => setDescription(event.target.value)}
                placeholder="Describe the information you need…"
                disabled={saving}
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Photos / Links / Files</span>
              <textarea
                className={cn(inputClass, "min-h-[80px] resize-y")}
                value={attachmentLinks}
                onChange={(event) => setAttachmentLinks(event.target.value)}
                placeholder="One link per line. Optional format: Label | https://..."
                disabled={saving}
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Document URL</span>
              <input
                className={inputClass}
                value={documentUrl}
                onChange={(event) => setDocumentUrl(event.target.value)}
                placeholder="https://..."
                disabled={saving}
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Comments</span>
              <textarea
                className={cn(inputClass, "min-h-[80px] resize-y")}
                value={comments}
                onChange={(event) => setComments(event.target.value)}
                placeholder="Additional notes for the register…"
                disabled={saving}
              />
            </label>

            <div>
              <p className={labelClass}>Your signature</p>
              <div className="mt-1">
                <StableSignaturePad onChange={setSignature} />
              </div>
            </div>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex gap-2">
              <button
                type="button"
                onClick={onClose}
                disabled={saving}
                className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving || loadingProjects}
                className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit RFI
              </button>
            </div>
          </form>
        </div>
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </>
  );
}
