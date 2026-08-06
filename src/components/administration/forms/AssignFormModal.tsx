"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, Search, Send, X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { DbProject } from "@/lib/project-resolver";
import {
  assignFormToWorkers,
  resolveWorkerDisplayName,
  type FormAssignmentAssignedByRef,
  type FormAssignmentTemplateRef,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssignFormModalProps {
  form: InductionFormTemplate;
  workers: Worker[];
  projects: DbProject[];
  assignedByUser?: FormAssignmentAssignedByRef | null;
  initialSelectedWorkerIds?: string[];
  onClose: () => void;
  onAssigned: () => void;
}

function workerMatchesProject(worker: Worker, projectId: string): boolean {
  if (!projectId) return true;
  return (
    worker.assigned_project_id === projectId ||
    worker.project_id === projectId ||
    (worker.assigned_project_ids ?? []).includes(projectId)
  );
}

export default function AssignFormModal({
  form,
  workers,
  projects,
  assignedByUser,
  initialSelectedWorkerIds = [],
  onClose,
  onAssigned,
}: AssignFormModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilterId, setProjectFilterId] = useState(form.project_id ?? "");
  const [selectedIds, setSelectedIds] = useState<string[]>(initialSelectedWorkerIds);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const templateProjectName = useMemo(() => {
    if (!form.project_id) return null;
    return projects.find((project) => project.id === form.project_id)?.name ?? null;
  }, [form.project_id, projects]);

  const visibleWorkers = useMemo(() => {
    let list = workers.filter(
      (worker) => worker.status !== "Revoked" && !worker.is_revoked
    );

    if (projectFilterId) {
      list = list.filter((worker) => workerMatchesProject(worker, projectFilterId));
    }

    const needle = searchQuery.trim().toLowerCase();
    if (needle) {
      list = list.filter((worker) => {
        const displayName = resolveWorkerDisplayName(worker).toLowerCase();
        return (
          displayName.includes(needle) ||
          worker.full_name.toLowerCase().includes(needle) ||
          (worker.trade?.toLowerCase().includes(needle) ?? false)
        );
      });
    }

    return list.sort((a, b) =>
      resolveWorkerDisplayName(a).localeCompare(resolveWorkerDisplayName(b))
    );
  }, [workers, projectFilterId, searchQuery]);

  const allVisibleSelected =
    visibleWorkers.length > 0 &&
    visibleWorkers.every((worker) => selectedIds.includes(worker.id));

  const toggleAll = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !visibleWorkers.some((worker) => worker.id === id))
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...visibleWorkers.map((worker) => worker.id)]),
    ]);
  };

  const toggleWorker = (workerId: string) => {
    setSelectedIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId]
    );
  };

  const handleSend = async () => {
    setSubmitting(true);
    setError(null);

    const selectedWorkers = workers.filter((worker) => selectedIds.includes(worker.id));
    const assignmentTemplate: FormAssignmentTemplateRef = {
      id: form.id,
      title: form.title,
      project_id: form.project_id,
      project_name: templateProjectName,
    };

    try {
      const result = await assignFormToWorkers({
        template: assignmentTemplate,
        workers: selectedWorkers,
        assignedBy: assignedByUser,
      });

      if (result.error) {
        setError(result.error);
        showError(result.error);
        return;
      }

      if (result.assigned === 0 && result.skipped > 0) {
        const message = `All ${result.skipped} selected workers already have this assignment.`;
        setError(message);
        showError(message);
        return;
      }

      const successMessage = "Form assigned successfully!";
      showSuccess(successMessage);
      onAssigned();
      onClose();
    } catch (cause) {
      const message =
        cause instanceof Error
          ? `Could not assign form. ${cause.message}`
          : "Could not assign form. Please try again.";
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign to Workers</h2>
            <p className="text-sm text-slate-500">{form.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2">
          <label className="block sm:col-span-2">
            <span className={labelClass}>Search workers</span>
            <div className="relative">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Filter by name or trade…"
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </label>

          <label className="block sm:col-span-2">
            <span className={labelClass}>Filter by project</span>
            <select
              value={projectFilterId}
              onChange={(event) => setProjectFilterId(event.target.value)}
              className={inputClass}
            >
              <option value="">All projects</option>
              {projects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        </div>

        <label className="mb-2 flex items-center gap-2 text-sm font-semibold text-slate-700">
          <input
            type="checkbox"
            checked={allVisibleSelected}
            onChange={toggleAll}
            className="rounded border-slate-300 text-orange-500"
          />
          Select all visible ({visibleWorkers.length})
        </label>

        <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
          {visibleWorkers.length === 0 ? (
            <p className="p-4 text-center text-sm text-slate-500">
              No workers match your search or project filter.
            </p>
          ) : (
            visibleWorkers.map((worker) => (
              <label
                key={worker.id}
                className="flex cursor-pointer items-center gap-2 rounded-lg px-2 py-1.5 hover:bg-slate-50"
              >
                <input
                  type="checkbox"
                  checked={selectedIds.includes(worker.id)}
                  onChange={() => toggleWorker(worker.id)}
                  className="rounded border-slate-300 text-orange-500"
                />
                <span className="min-w-0 flex-1 text-sm text-slate-800">
                  {resolveWorkerDisplayName(worker)}
                </span>
                {worker.trade ? (
                  <span className="shrink-0 text-xs text-slate-400">{worker.trade}</span>
                ) : null}
              </label>
            ))
          )}
        </div>

        {error ? (
          <p role="alert" className="mt-3 text-sm text-red-600">
            {error}
          </p>
        ) : null}

        <button
          type="button"
          disabled={submitting || selectedIds.length === 0}
          onClick={() => void handleSend()}
          className="mt-4 flex w-full items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
        >
          {submitting ? (
            <Loader2 className="h-4 w-4 animate-spin" />
          ) : (
            <Send className="h-4 w-4" />
          )}
          Send Out for Completion ({selectedIds.length})
        </button>
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
