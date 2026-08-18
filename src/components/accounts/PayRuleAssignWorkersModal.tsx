"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import type { MouseEvent } from "react";
import { Loader2, X } from "lucide-react";
import {
  batchUpdateWorkerPayRuleTemplateIds,
  fetchPayRuleTemplateIdByName,
  type PayRuleTemplate,
} from "@/lib/pay-rule-templates";
import { isPayRuleConditionSaveError } from "@/lib/pay-rule-condition-errors";
import type { DbProject } from "@/lib/project-resolver";
import { getWorkerAssignedProjectIds, type Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface PayRuleAssignWorkersModalProps {
  template: PayRuleTemplate;
  workers: Worker[];
  projects: DbProject[];
  onClose: () => void;
  onAssigned: (count: number, templateName: string) => void;
  onError: (message: string) => void;
}

function workerMatchesProject(worker: Worker, projectId: string): boolean {
  if (!projectId) return true;
  return getWorkerAssignedProjectIds(worker).includes(projectId);
}

export default function PayRuleAssignWorkersModal({
  template,
  workers,
  projects,
  onClose,
  onAssigned,
  onError,
}: PayRuleAssignWorkersModalProps) {
  const [projectFilterId, setProjectFilterId] = useState("");
  const [selectedWorkerIds, setSelectedWorkerIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  const filteredWorkers = useMemo(() => {
    const list = workers.filter((worker) => workerMatchesProject(worker, projectFilterId));
    return [...list].sort((a, b) =>
      getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
    );
  }, [projectFilterId, workers]);

  const filteredWorkerIds = useMemo(
    () => filteredWorkers.map((worker) => worker.id),
    [filteredWorkers]
  );

  useEffect(() => {
    setSelectedWorkerIds([]);
  }, [projectFilterId, template.id]);

  const toggleWorker = (workerId: string) => {
    setSelectedWorkerIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId]
    );
  };

  const selectAllFiltered = () => {
    setSelectedWorkerIds((current) => [...new Set([...current, ...filteredWorkerIds])]);
  };

  const deselectAllFiltered = () => {
    setSelectedWorkerIds((current) =>
      current.filter((id) => !filteredWorkerIds.includes(id))
    );
  };

  const resolveTemplateId = async (): Promise<string | null> => {
    if (template.id && !template.id.startsWith("display-") && !template.id.startsWith("default-")) {
      return template.id;
    }

    const lookup = await fetchPayRuleTemplateIdByName(template.name);
    if (lookup.error && !isPayRuleConditionSaveError(lookup.error)) {
      onError(lookup.error);
      return null;
    }
    if (!lookup.id) {
      onError(`Unable to resolve pay rule template "${template.name}".`);
      return null;
    }
    return lookup.id;
  };

  const handleSave = async () => {
    if (selectedWorkerIds.length === 0) {
      onError("Select at least one worker to assign this pay rule.");
      return;
    }

    setSaving(true);

    const templateId = await resolveTemplateId();
    if (!templateId) {
      setSaving(false);
      return;
    }

    const result = await batchUpdateWorkerPayRuleTemplateIds(
      selectedWorkerIds.map((workerId) => ({
        workerId,
        templateId,
      }))
    );
    setSaving(false);

    if (result.error && result.updated === 0 && !isPayRuleConditionSaveError(result.error)) {
      onError(result.error);
      return;
    }

    onAssigned(result.updated, template.name);
    onClose();
  };

  const handleBackdropClick = (event: MouseEvent<HTMLDivElement>) => {
    if (event.target !== event.currentTarget) return;
    if (!saving) onClose();
  };

  const stopModalPointerBubble = (event: MouseEvent<HTMLElement>) => {
    event.stopPropagation();
  };

  if (!mounted) return null;

  const modalContent = (
    <div
      className="fixed inset-0 z-[75] flex items-center justify-center bg-slate-900/40 p-4"
      onClick={handleBackdropClick}
      role="presentation"
    >
      <div
        className="flex max-h-[90vh] w-full max-w-2xl flex-col overflow-hidden rounded-2xl border border-slate-200 bg-white shadow-xl"
        onClick={stopModalPointerBubble}
        onMouseDown={stopModalPointerBubble}
        role="dialog"
        aria-modal="true"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h3 className="text-lg font-bold text-slate-900">Assign to Workers</h3>
            <p className="mt-0.5 text-sm text-slate-500">{template.name}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 overflow-y-auto px-6 py-4">
          <label className="block space-y-1">
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

          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={selectAllFiltered}
              disabled={filteredWorkers.length === 0}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Select All
            </button>
            <button
              type="button"
              onClick={deselectAllFiltered}
              disabled={filteredWorkers.length === 0}
              className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
            >
              Deselect All
            </button>
            <span className="self-center text-xs text-slate-500">
              {selectedWorkerIds.length} selected · {filteredWorkers.length} shown
            </span>
          </div>

          {filteredWorkers.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No active workers match this project filter.
            </p>
          ) : (
            <ul className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-3">
              {filteredWorkers.map((worker) => {
                const checked = selectedWorkerIds.includes(worker.id);
                const projectLabel =
                  getWorkerAssignedProjectIds(worker).length > 0
                    ? `${getWorkerAssignedProjectIds(worker).length} project(s)`
                    : "Unassigned";

                return (
                  <li key={worker.id}>
                    <label
                      className={cn(
                        "flex cursor-pointer items-center gap-3 rounded-lg border px-3 py-2 transition",
                        checked
                          ? "border-orange-300 bg-orange-50"
                          : "border-transparent bg-white hover:border-slate-200"
                      )}
                    >
                      <input
                        type="checkbox"
                        checked={checked}
                        onChange={() => toggleWorker(worker.id)}
                        className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block text-sm font-medium text-slate-900">
                          {getWorkerDisplayName(worker)}
                        </span>
                        <span className="block text-xs text-slate-500">
                          {worker.trade ?? "—"} · {projectLabel}
                        </span>
                      </span>
                    </label>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <div className="flex justify-end gap-2 border-t border-slate-200 px-6 py-4">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg bg-slate-100 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-200 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving || selectedWorkerIds.length === 0}
            className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Assign to {selectedWorkerIds.length || ""} Worker
            {selectedWorkerIds.length === 1 ? "" : "s"}
          </button>
        </div>
      </div>
    </div>
  );

  return createPortal(modalContent, document.body);
}
