"use client";

import { useMemo, useState } from "react";
import { Loader2, Send, X } from "lucide-react";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import {
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  pushSwmsToProject,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import type { Worker } from "@/lib/supabase";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface AssignSwmsToProjectModalProps {
  swms: SwmsDocumentSummary;
  projects: DbProject[];
  workers: Worker[];
  onClose: () => void;
  onAssigned: () => void;
}

export default function AssignSwmsToProjectModal({
  swms,
  projects,
  workers,
  onClose,
  onAssigned,
}: AssignSwmsToProjectModalProps) {
  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);
  const [projectId, setProjectId] = useState(activeProjects[0]?.id ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const handleAssign = async () => {
    if (!projectId.trim()) {
      setError("Select a target project.");
      return;
    }

    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const { workerByProject } = await loadAssignmentMaps();
      const projectWorkers = filterWorkersForProject(workers, projectId, workerByProject)
        .filter((worker) => !worker.is_subcontractor)
        .map((worker) => ({
          id: worker.id,
          name: getWorkerDisplayName(worker),
        }));

      if (projectWorkers.length === 0) {
        setError("No workers are assigned to the selected project.");
        setSaving(false);
        return;
      }

      const { error: pushError, document } = await pushSwmsToProject({
        masterSwms: swms,
        projectId,
        projectWorkers,
      });

      if (pushError || !document) {
        setError(pushError ?? "Failed to push SWMS to project.");
        return;
      }

      const projectName =
        activeProjects.find((project) => project.id === projectId)?.name ?? "project";
      setSuccess(
        `"${swms.title}" pushed to ${projectName}. ${projectWorkers.length} worker(s) must sign off.`
      );
      onAssigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to assign SWMS.");
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
            <h2 className="text-lg font-bold text-slate-900">Assign / Push to Project</h2>
            <p className="text-sm text-slate-500">
              Clone &ldquo;{swms.title}&rdquo; as a site-specific SWMS for worker sign-off.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
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
          <div className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>Target Project *</span>
              <select
                className={inputClass}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
              >
                {activeProjects.length === 0 ? (
                  <option value="">No active projects</option>
                ) : (
                  activeProjects.map((project) => (
                    <option key={project.id} value={project.id}>
                      {project.name}
                    </option>
                  ))
                )}
              </select>
            </label>

            <p className="text-xs text-slate-500">
              All workers currently assigned to the project will receive a pending sign-off
              request for the cloned SWMS.
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
                type="button"
                disabled={saving || activeProjects.length === 0}
                onClick={() => void handleAssign()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Push to Project
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
