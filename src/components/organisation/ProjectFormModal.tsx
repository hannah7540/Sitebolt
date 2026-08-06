"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { DbProject } from "@/lib/project-resolver";
import {
  saveProject,
  updateProject,
  syncProjectWorkerAssignments,
  normalizeWorkerUuidArray,
  formatProjectSaveError,
  isProjectArchived,
} from "@/lib/project-resolver";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
  sectionClass,
} from "@/lib/ui-classes";

interface ProjectFormModalProps {
  workers: Worker[];
  project?: DbProject | null;
  onClose: () => void;
  onSaved: (project?: DbProject) => void;
  onError?: (message: string) => void;
}

function WorkerChecklist({
  label,
  workers,
  selected,
  onChange,
}: {
  label: string;
  workers: Worker[];
  selected: string[];
  onChange: (ids: string[]) => void;
}) {
  const toggle = (id: string) => {
    onChange(
      selected.includes(id)
        ? selected.filter((x) => x !== id)
        : [...selected, id]
    );
  };

  return (
    <div className={sectionClass}>
      <p className="text-sm font-semibold text-slate-900">{label}</p>
      <div className="max-h-40 space-y-2 overflow-y-auto">
        {workers.length === 0 ? (
          <p className="text-xs text-slate-500">No workers in directory.</p>
        ) : (
          workers.map((w) => (
            <label
              key={w.id}
              className="flex cursor-pointer items-center gap-2 text-sm text-slate-700"
            >
              <input
                type="checkbox"
                checked={selected.includes(w.id)}
                onChange={() => toggle(w.id)}
                className="rounded border-slate-300 text-orange-500 focus:ring-orange-500"
              />
              {w.full_name}
            </label>
          ))
        )}
      </div>
    </div>
  );
}

export default function ProjectFormModal({
  workers,
  project,
  onClose,
  onSaved,
  onError,
}: ProjectFormModalProps) {
  const [title, setTitle] = useState(project?.project_name ?? project?.name ?? "");
  const [projectCode, setProjectCode] = useState(project?.project_code ?? "");
  const [client, setClient] = useState(project?.client ?? "");
  const [location, setLocation] = useState(project?.location ?? "");
  const [projectAdmins, setProjectAdmins] = useState<string[]>(() =>
    normalizeWorkerUuidArray(project?.project_admins)
  );
  const [assignedWorkers, setAssignedWorkers] = useState<string[]>(() =>
    normalizeWorkerUuidArray(project?.assigned_workers)
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const archived = project ? isProjectArchived(project) : false;
  const statusLabel = archived ? "Archived" : project?.status ?? "Active";

  const reportError = (message: string) => {
    setError(message);
    onError?.(message);
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!title.trim()) {
      reportError("Project title is required.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const adminIds = normalizeWorkerUuidArray(projectAdmins);
      const workerIds = normalizeWorkerUuidArray(assignedWorkers);

      const saveInput = {
        project_name: title.trim(),
        project_code: projectCode.trim() || null,
        client: client.trim() || null,
        location,
        project_admins: adminIds,
        assigned_workers: workerIds,
        is_active: !archived,
        status: statusLabel,
      };

      const { error: saveError, project: saved } = project?.id
        ? await updateProject({ id: project.id, ...saveInput })
        : await saveProject(saveInput);

      if (saveError || !saved) {
        reportError(saveError ?? "Failed to save project.");
        return;
      }

      if (workerIds.length > 0) {
        const { error: syncError } = await syncProjectWorkerAssignments(
          saved.id,
          workerIds
        );

        if (syncError) {
          reportError(syncError);
          return;
        }
      }

      onSaved(saved);
      onClose();
    } catch (err) {
      reportError(formatProjectSaveError(err));
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {project ? "Edit Project" : "Add Project"}
            </h2>
            {project && (
              <p className="mt-0.5 text-xs font-medium text-slate-500">
                Status: {statusLabel}
              </p>
            )}
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Project name</span>
            <input
              className={inputClass}
              value={title}
              onChange={(e) => setTitle(e.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Project code / number</span>
            <input
              className={inputClass}
              value={projectCode}
              onChange={(e) => setProjectCode(e.target.value)}
              placeholder="e.g. SB-2024-01"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Client</span>
            <input
              className={inputClass}
              value={client}
              onChange={(e) => setClient(e.target.value)}
              placeholder="Client or principal name"
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Address / location</span>
            <input
              className={inputClass}
              value={location}
              onChange={(e) => setLocation(e.target.value)}
              placeholder="Site address or region"
            />
          </label>

          <WorkerChecklist
            label="Project admins"
            workers={workers}
            selected={projectAdmins}
            onChange={setProjectAdmins}
          />
          <WorkerChecklist
            label="Assigned workers"
            workers={workers}
            selected={assignedWorkers}
            onChange={setAssignedWorkers}
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Project
          </button>
        </form>
      </div>
    </div>
  );
}
