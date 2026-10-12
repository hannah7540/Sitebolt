"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import { mutateHiredLabour } from "@/lib/hired-labour";
import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface ReinstateHiredLabourModalProps {
  workerName: string;
  workerId: string;
  initialState?: string | null;
  initialProjectId?: string | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function ReinstateHiredLabourModal({
  workerName,
  workerId,
  initialState,
  initialProjectId,
  onClose,
  onSaved,
}: ReinstateHiredLabourModalProps) {
  const [state, setState] = useState(initialState ?? "");
  const [projectId, setProjectId] = useState(initialProjectId ?? "");
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    void fetchProjects().then(setProjects).catch(() => setProjects([]));
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSubmitting(true);
    setError(null);
    const result = await mutateHiredLabour({
      action: "reinstate",
      workerId,
      state,
      projectId,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onSaved();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalShellClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between border-b border-slate-200 px-6 py-4">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">Reinstate hired labour</h2>
            <p className="text-sm text-slate-500">{workerName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <form onSubmit={(event) => void handleSubmit(event)}>
          <div className={modalBodyClass + " space-y-4"}>
            {error ? (
              <p className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
                {error}
              </p>
            ) : null}
            <p className="text-sm text-slate-600">
              Choose the state and project they will work on. Inductions and SWMS for that
              state and project are assigned the same way as internal workers.
            </p>
            <label className="block">
              <span className={labelClass}>State</span>
              <select
                className={inputClass}
                value={state}
                onChange={(event) => setState(event.target.value)}
                required
              >
                <option value="">Select state</option>
                {WORKER_STATE_REGION_OPTIONS.map((code) => (
                  <option key={code} value={code}>
                    {code}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Project</span>
              <select
                className={inputClass}
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                required
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          </div>
          <div className={modalStickyFooterClass + " flex justify-end gap-2 pb-4"}>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-60"
            >
              {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Reinstate
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
