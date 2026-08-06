"use client";

import { useEffect, useState } from "react";
import { X, Loader2, Plus, Trash2 } from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import { resolveWorkerDisplayName } from "@/lib/induction-form-builder";
import {
  createEmptyUniformLineItem,
  fetchWorkerRequestProjectOptions,
  submitWorkerRequest,
  UNIFORM_ITEM_OPTIONS,
  UNIFORM_SIZE_OPTIONS,
  WORKER_REQUEST_TYPES,
  type UniformLineItem,
  type WorkerRequestProjectOption,
  type WorkerRequestType,
} from "@/lib/worker-requests-service";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerRequestModalProps {
  worker: Worker;
  seedProjects?: DbProject[];
  defaultProjectId?: string | null;
  onClose: () => void;
  onSubmitted: () => void;
}

interface UniformRowState extends UniformLineItem {
  id: string;
}

function createUniformRow(): UniformRowState {
  return {
    id: `uniform-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`,
    ...createEmptyUniformLineItem(),
  };
}

export default function WorkerRequestModal({
  worker,
  seedProjects = [],
  defaultProjectId,
  onClose,
  onSubmitted,
}: WorkerRequestModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [requestType, setRequestType] = useState<WorkerRequestType>("Uniform");
  const [projectId, setProjectId] = useState(defaultProjectId ?? "");
  const [uniformRows, setUniformRows] = useState<UniformRowState[]>([createUniformRow()]);
  const [description, setDescription] = useState("");
  const [projects, setProjects] = useState<WorkerRequestProjectOption[]>([]);
  const [loadingProjects, setLoadingProjects] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const workerName = resolveWorkerDisplayName(worker);

  useEffect(() => {
    let cancelled = false;

    async function loadProjects() {
      setLoadingProjects(true);
      try {
        const options = await fetchWorkerRequestProjectOptions(seedProjects);
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

  const handleRequestTypeChange = (type: WorkerRequestType) => {
    setRequestType(type);
    if (type === "Uniform" && uniformRows.length === 0) {
      setUniformRows([createUniformRow()]);
    }
  };

  const updateUniformRow = (
    rowId: string,
    field: keyof UniformLineItem,
    value: string | number
  ) => {
    setUniformRows((rows) =>
      rows.map((row) =>
        row.id === rowId
          ? {
              ...row,
              [field]:
                field === "quantity"
                  ? Math.max(1, Math.floor(Number(value) || 1))
                  : value,
            }
          : row
      )
    );
  };

  const addUniformRow = () => {
    setUniformRows((rows) => [...rows, createUniformRow()]);
  };

  const removeUniformRow = (rowId: string) => {
    setUniformRows((rows) => {
      if (rows.length <= 1) return rows;
      return rows.filter((row) => row.id !== rowId);
    });
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    const selectedProject = projects.find((row) => row.id === projectId);
    const uniformItems: UniformLineItem[] = uniformRows.map(({ item, size, quantity }) => ({
      item,
      size,
      quantity,
    }));

    setSaving(true);
    try {
      const result = await submitWorkerRequest({
        workerId: worker.id,
        workerName,
        projectId: projectId || null,
        projectName: selectedProject?.name ?? "General / Unassigned",
        requestType,
        uniformItems: requestType === "Uniform" ? uniformItems : undefined,
        description: requestType !== "Uniform" ? description : null,
      });

      if (result.error || !result.request) {
        const message = result.error ?? "Failed to submit request.";
        setError(message);
        showError(message);
        return;
      }

      showSuccess(`Request ${result.request.request_number} submitted.`);
      onSubmitted();
      onClose();
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to submit request.";
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
          className={cn(modalClass, "max-h-[92vh] w-full max-w-2xl overflow-y-auto p-0")}
          role="dialog"
          aria-modal="true"
          aria-labelledby="worker-request-title"
          onClick={(event) => event.stopPropagation()}
        >
          <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
            <div>
              <h2 id="worker-request-title" className="text-lg font-bold text-slate-900">
                Request Form
              </h2>
              <p className="text-xs text-slate-500">
                Submit uniform, tools, or job-specific equipment requests
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          <form onSubmit={handleSubmit} className="space-y-4 px-6 py-5">
            <div>
              <p className={labelClass}>Raised By</p>
              <p className="text-sm font-medium text-slate-900">{workerName}</p>
            </div>

            <div>
              <label htmlFor="request-project" className={labelClass}>
                Project
              </label>
              <select
                id="request-project"
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className={inputClass}
                disabled={loadingProjects}
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
            </div>

            <fieldset>
              <legend className={labelClass}>Request Category</legend>
              <div className="mt-2 space-y-2">
                {WORKER_REQUEST_TYPES.map((type) => (
                  <label
                    key={type}
                    className={cn(
                      "flex cursor-pointer items-center gap-3 rounded-xl border px-4 py-3 text-sm transition",
                      requestType === type
                        ? "border-orange-400 bg-orange-50 text-orange-900"
                        : "border-slate-200 bg-white text-slate-700 hover:border-orange-200"
                    )}
                  >
                    <input
                      type="radio"
                      name="requestType"
                      value={type}
                      checked={requestType === type}
                      onChange={() => handleRequestTypeChange(type)}
                      className="h-4 w-4 border-slate-300 text-orange-600 focus:ring-orange-500"
                    />
                    <span className="font-medium">{type}</span>
                  </label>
                ))}
              </div>
            </fieldset>

            {requestType === "Uniform" ? (
              <div className="space-y-3">
                <div className="flex items-center justify-between gap-2">
                  <p className={labelClass}>Uniform Items</p>
                  <p className="text-xs text-slate-400">
                    Add all sizes and quantities in one submission
                  </p>
                </div>

                <div className="space-y-3">
                  {uniformRows.map((row, index) => (
                    <div
                      key={row.id}
                      className="rounded-xl border border-slate-200 bg-slate-50/70 p-4"
                    >
                      <div className="mb-3 flex items-center justify-between gap-2">
                        <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          Item {index + 1}
                        </p>
                        <button
                          type="button"
                          onClick={() => removeUniformRow(row.id)}
                          disabled={uniformRows.length <= 1}
                          className="inline-flex items-center gap-1 rounded-lg px-2 py-1 text-xs font-semibold text-red-600 hover:bg-red-50 disabled:cursor-not-allowed disabled:opacity-40"
                          aria-label={`Remove uniform item ${index + 1}`}
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                          Remove
                        </button>
                      </div>

                      <div className="grid gap-3 sm:grid-cols-2">
                        <div className="sm:col-span-2">
                          <label htmlFor={`uniform-item-${row.id}`} className={labelClass}>
                            Item Type
                          </label>
                          <select
                            id={`uniform-item-${row.id}`}
                            value={row.item}
                            onChange={(event) =>
                              updateUniformRow(row.id, "item", event.target.value)
                            }
                            className={inputClass}
                            required
                          >
                            <option value="">Select item…</option>
                            {UNIFORM_ITEM_OPTIONS.map((item) => (
                              <option key={item} value={item}>
                                {item}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor={`uniform-size-${row.id}`} className={labelClass}>
                            Size
                          </label>
                          <select
                            id={`uniform-size-${row.id}`}
                            value={row.size}
                            onChange={(event) =>
                              updateUniformRow(row.id, "size", event.target.value)
                            }
                            className={inputClass}
                            required
                          >
                            <option value="">Select size…</option>
                            {UNIFORM_SIZE_OPTIONS.map((size) => (
                              <option key={size} value={size}>
                                {size}
                              </option>
                            ))}
                          </select>
                        </div>

                        <div>
                          <label htmlFor={`uniform-quantity-${row.id}`} className={labelClass}>
                            Quantity
                          </label>
                          <input
                            id={`uniform-quantity-${row.id}`}
                            type="number"
                            min={1}
                            max={99}
                            value={row.quantity}
                            onChange={(event) =>
                              updateUniformRow(row.id, "quantity", event.target.value)
                            }
                            className={inputClass}
                            required
                          />
                        </div>
                      </div>
                    </div>
                  ))}
                </div>

                <button
                  type="button"
                  onClick={addUniformRow}
                  className="inline-flex w-full items-center justify-center gap-2 rounded-xl border border-dashed border-orange-300 bg-orange-50/50 px-4 py-3 text-sm font-semibold text-orange-700 hover:bg-orange-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Another Uniform Item
                </button>
              </div>
            ) : (
              <div>
                <label htmlFor="request-description" className={labelClass}>
                  Description
                </label>
                <textarea
                  id="request-description"
                  value={description}
                  onChange={(event) => setDescription(event.target.value)}
                  rows={4}
                  className={inputClass}
                  placeholder="Describe the tools or equipment required (e.g. gloves, duct tape, specific hand tools)…"
                  required
                />
              </div>
            )}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit Request
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
