"use client";

import { useMemo, useState } from "react";
import { ArrowRightLeft, Loader2, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { filterActiveProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { modalClass, modalOverlayClass, labelClass, inputClass } from "@/lib/ui-classes";

interface TransferWorkerProjectModalProps {
  worker: Worker;
  currentProjectId: string;
  currentProjectName: string;
  onClose: () => void;
  onTransfer: (toProjectId: string) => Promise<{ error: string | null }>;
}

export default function TransferWorkerProjectModal({
  worker,
  currentProjectId,
  currentProjectName,
  onClose,
  onTransfer,
}: TransferWorkerProjectModalProps) {
  const [targetProjectId, setTargetProjectId] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const activeProjects = useMemo(() => {
    return filterActiveProjects(getCachedProjects()).filter(
      (project: DbProject) => project.id !== currentProjectId
    );
  }, [currentProjectId]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!targetProjectId) {
      setError("Select a project to transfer this worker to.");
      return;
    }

    setSaving(true);
    setError(null);
    const result = await onTransfer(targetProjectId);
    setSaving(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-md`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              Transfer / Re-assign Worker
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Move <span className="font-semibold text-slate-700">{worker.full_name}</span>{" "}
              from {currentProjectName} to another active project.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>New project</span>
            <select
              className={inputClass}
              value={targetProjectId}
              onChange={(event) => setTargetProjectId(event.target.value)}
              required
            >
              <option value="">Select project…</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>

          {activeProjects.length === 0 && (
            <p className="text-sm text-amber-700">
              No other active projects are available. Add or restore a project first.
            </p>
          )}

          {error && (
            <p role="alert" className="text-sm text-red-600">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || activeProjects.length === 0}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {saving ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : (
              <ArrowRightLeft className="h-4 w-4" />
            )}
            Transfer Worker
          </button>
        </form>
      </div>
    </div>
  );
}
