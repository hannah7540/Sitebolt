"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { fetchProjects, filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssignAssetToProjectModalProps {
  assetLabel: string;
  currentProjectId: string | null;
  onClose: () => void;
  onSave: (projectId: string) => Promise<{ error: string | null }>;
}

export default function AssignAssetToProjectModal({
  assetLabel,
  currentProjectId,
  onClose,
  onSave,
}: AssignAssetToProjectModalProps) {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedId, setSelectedId] = useState(currentProjectId ?? "");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void (async () => {
      setLoadingProjects(true);
      const rows = await fetchProjects();
      setProjects(filterActiveProjects(rows));
      setLoadingProjects(false);
    })();
  }, []);

  const handleSave = async () => {
    if (!selectedId) {
      setError("Select an active project");
      return;
    }
    setSaving(true);
    setError(null);
    const { error: saveError } = await onSave(selectedId);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={`${cardClass} w-full max-w-md p-6`}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign to Project</h2>
            <p className="mt-1 text-sm text-slate-500">{assetLabel}</p>
            <p className="mt-1 text-xs text-slate-400">
              Transfers the asset to the selected active project.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {loadingProjects ? (
          <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading projects…
          </div>
        ) : projects.length === 0 ? (
          <p className="py-4 text-sm text-slate-500">No active projects available.</p>
        ) : (
          <div className="max-h-64 space-y-1 overflow-y-auto">
            {projects.map((project) => (
              <label
                key={project.id}
                className={cn(
                  "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2.5 text-sm transition",
                  selectedId === project.id
                    ? "border-orange-300 bg-orange-50 text-orange-700"
                    : "border-slate-200 hover:bg-slate-50"
                )}
              >
                <input
                  type="radio"
                  name="project"
                  value={project.id}
                  checked={selectedId === project.id}
                  onChange={() => setSelectedId(project.id)}
                  disabled={saving}
                  className="text-orange-500 focus:ring-orange-500"
                />
                <span className="font-medium">{project.name}</span>
              </label>
            ))}
          </div>
        )}

        {error ? (
          <p className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || loadingProjects}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign Asset
          </button>
        </div>
      </div>
    </div>
  );
}
