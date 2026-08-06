"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { fetchProjects, filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import WorkerAssignedProjectsPicker from "./WorkerAssignedProjectsPicker";
import { cardClass } from "@/lib/ui-classes";

interface AssignToProjectsModalProps {
  title: string;
  subtitle?: string;
  initialProjectIds: string[];
  onClose: () => void;
  onSave: (projectIds: string[]) => Promise<{ error: string | null }>;
}

export default function AssignToProjectsModal({
  title,
  subtitle,
  initialProjectIds,
  onClose,
  onSave,
}: AssignToProjectsModalProps) {
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [selectedIds, setSelectedIds] = useState(initialProjectIds);
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

  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const { error: saveError } = await onSave(selectedIds);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className={cnModal(cardClass)}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{title}</h2>
            {subtitle ? <p className="mt-1 text-sm text-slate-500">{subtitle}</p> : null}
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
        ) : (
          <WorkerAssignedProjectsPicker
            projects={activeProjects}
            selectedIds={selectedIds}
            onChange={setSelectedIds}
            disabled={saving}
            saving={saving}
          />
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
            Save Assignments
          </button>
        </div>
      </div>
    </div>
  );
}

function cnModal(base: string) {
  return `${base} w-full max-w-md p-6`;
}
