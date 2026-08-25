"use client";

import { useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import {
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  createSiteSpecificSwmsDocument,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { uploadSwmsPdf } from "@/lib/swms-upload";
import type { Worker } from "@/lib/supabase";
import { isValidSwmsId } from "@/lib/supabase";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface UploadSiteSpecificSwmsModalProps {
  projects: DbProject[];
  workers: Worker[];
  onClose: () => void;
  onSaved: () => void;
}

export default function UploadSiteSpecificSwmsModal({
  projects,
  workers,
  onClose,
  onSaved,
}: UploadSiteSpecificSwmsModalProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [projectId, setProjectId] = useState("");
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SwmsDocumentSummary | null>(null);
  const [assignedCount, setAssignedCount] = useState(0);

  const selectedProjectName =
    activeProjects.find((project) => project.id === projectId)?.name ?? "project";

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreated(null);
    setAssignedCount(0);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!projectId.trim() || !isValidSwmsId(projectId.trim())) {
      setError("Select a valid target project.");
      return;
    }

    const selectedProjectId = projectId.trim();
    if (!file) {
      setError("Please upload a SWMS PDF.");
      return;
    }

    setSaving(true);
    try {
      const { url, error: uploadError } = await uploadSwmsPdf(file);

      if (uploadError || !url) {
        setError(uploadError ?? "PDF upload failed.");
        return;
      }

      const { workerByProject } = await loadAssignmentMaps();
      const projectWorkers = filterWorkersForProject(
        workers,
        selectedProjectId,
        workerByProject
      )
        .filter((worker) => !worker.is_subcontractor)
        .map((worker) => ({
          id: worker.id,
          name: getWorkerDisplayName(worker),
        }));

      const insertPayload = {
        title: title.trim(),
        documentDate,
        fileUrl: url,
        fileName: file.name,
        projectId: selectedProjectId,
        workerAssignments: projectWorkers,
      };
      console.log("SWMS Insert Payload:", {
        project_id: insertPayload.projectId,
        swms_scope: "site_specific",
        title: insertPayload.title,
      });

      const { error: createError, document } = await createSiteSpecificSwmsDocument(
        insertPayload
      );

      if (createError || !document) {
        setError(createError ?? "Failed to save site-specific SWMS.");
        return;
      }

      setAssignedCount(projectWorkers.length);
      setCreated(document);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload SWMS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Site-Specific SWMS</h2>
            <p className="text-sm text-slate-500">
              Upload a SWMS PDF and link it to a project for worker sign-off.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              &ldquo;{created.title}&rdquo; created for {selectedProjectName}.
              {assignedCount > 0
                ? ` ${assignedCount} worker(s) received a pending sign-off request.`
                : " Workers assigned to this project will receive it automatically for acknowledgment."}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>Title *</span>
              <input
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Date *</span>
              <input
                type="date"
                className={inputClass}
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Select Project *</span>
              <select
                className={inputClass}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
              >
                {activeProjects.length === 0 ? (
                  <option value="">No active projects</option>
                ) : (
                  <>
                    <option value="">Select a project…</option>
                    {activeProjects.map((project) => (
                      <option key={project.id} value={project.id}>
                        {project.name}
                      </option>
                    ))}
                  </>
                )}
              </select>
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>SWMS PDF *</span>
              <input
                type="file"
                accept="application/pdf"
                className={inputClass}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            <p className="text-xs text-slate-500">
              Workers currently assigned to the selected project will receive a pending
              digital acknowledgment. Future project assignees are auto-synced.
            </p>

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
                disabled={saving || activeProjects.length === 0}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Site-Specific SWMS
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
