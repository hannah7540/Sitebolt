"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Download, Loader2, Search } from "lucide-react";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  buildCompetencyMatrix,
  COMPETENCY_COLUMN_LABELS,
  competencyCellClassName,
  downloadCompetencyMatrixCsv,
  filterCompetencyMatrixRows,
  type CompetencyMatrixRow,
} from "@/lib/competency-matrix";
import type { Worker } from "@/lib/supabase";
import { fetchAllWorkerVocs } from "@/lib/supabase";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const BASE_STATE_OPTIONS = ["ACT", "NSW", "WA", "NZ"] as const;

interface CompetencyMatrixTabProps {
  workers: Worker[];
}

function normalizeFilterValue(value: string | null | undefined): string {
  return String(value ?? "").trim();
}

function workerMatchesState(worker: Worker, selectedState: string): boolean {
  if (selectedState === "ALL") return true;
  const workerState = normalizeFilterValue(worker.state);
  if (!workerState) return false;
  return workerState.toLowerCase() === selectedState.toLowerCase();
}

function workerProjectIds(worker: Worker): string[] {
  return [
    worker.assigned_project_id,
    worker.project_id,
    ...(Array.isArray(worker.assigned_project_ids) ? worker.assigned_project_ids : []),
  ]
    .map((value) => normalizeFilterValue(value))
    .filter(Boolean);
}

function workerProjectNames(worker: Worker): string[] {
  return [worker.assigned_project_name, worker.project_name]
    .map((value) => normalizeFilterValue(value))
    .filter(Boolean);
}

function workerMatchesProject(worker: Worker, selectedProject: string): boolean {
  if (selectedProject === "ALL") return true;
  const needle = selectedProject.toLowerCase();
  return (
    workerProjectIds(worker).some((id) => id.toLowerCase() === needle) ||
    workerProjectNames(worker).some((name) => name.toLowerCase() === needle)
  );
}

export default function CompetencyMatrixTab({ workers }: CompetencyMatrixTabProps) {
  const { toast, showError, dismissToast } = useFormToast();
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState("");
  const [selectedState, setSelectedState] = useState("ALL");
  const [selectedProject, setSelectedProject] = useState("ALL");
  const [matrixRows, setMatrixRows] = useState<CompetencyMatrixRow[]>([]);

  const loadMatrix = useCallback(async () => {
    setLoading(true);
    try {
      const vocs = await fetchAllWorkerVocs();
      setMatrixRows(buildCompetencyMatrix(workers, vocs));
    } catch (cause) {
      showError(
        cause instanceof Error
          ? cause.message
          : "Failed to load competency matrix."
      );
      setMatrixRows([]);
    } finally {
      setLoading(false);
    }
  }, [workers, showError]);

  useEffect(() => {
    void loadMatrix();
  }, [loadMatrix]);

  const workersById = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers]
  );

  const stateOptions = useMemo(() => {
    const extras = new Set<string>();
    for (const worker of workers) {
      const state = normalizeFilterValue(worker.state).toUpperCase();
      if (!state || state === "ALL") continue;
      if (!(BASE_STATE_OPTIONS as readonly string[]).includes(state)) {
        extras.add(state);
      }
    }
    return [
      ...BASE_STATE_OPTIONS,
      ...[...extras].sort((left, right) =>
        left.localeCompare(right, undefined, { sensitivity: "base" })
      ),
    ];
  }, [workers]);

  const projectOptions = useMemo(() => {
    const options = new Map<string, { value: string; label: string }>();
    for (const worker of workers) {
      const name = normalizeFilterValue(
        worker.assigned_project_name || worker.project_name
      );
      const ids = workerProjectIds(worker);
      if (ids.length > 0) {
        for (const id of ids) {
          const existing = options.get(id);
          options.set(id, {
            value: id,
            label: name || existing?.label || id,
          });
        }
        continue;
      }
      if (name) {
        const key = `name:${name.toLowerCase()}`;
        if (!options.has(key)) {
          options.set(key, { value: name, label: name });
        }
      }
    }
    return [...options.values()].sort((left, right) =>
      left.label.localeCompare(right.label, undefined, { sensitivity: "base" })
    );
  }, [workers]);

  const filteredRows = useMemo(() => {
    const searched = filterCompetencyMatrixRows(matrixRows, search);
    if (selectedState === "ALL" && selectedProject === "ALL") return searched;

    return searched.filter((row) => {
      const worker = workersById.get(row.workerId);
      if (!worker) return false;
      return (
        workerMatchesState(worker, selectedState) &&
        workerMatchesProject(worker, selectedProject)
      );
    });
  }, [matrixRows, search, selectedProject, selectedState, workersById]);

  const handleExport = () => {
    downloadCompetencyMatrixCsv(filteredRows);
  };

  return (
    <div className="space-y-6">
      <FormsAdminTabs active="competencies" />

      <div className={cn(cardClass, "space-y-4")}>
        <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
          <div>
            <h2 className="text-lg font-semibold text-slate-900">
              Competency Matrix Register
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Track worker compliance cards and VOCs across your active workforce.
            </p>
          </div>

          <div className="flex w-full flex-col gap-3 sm:flex-row sm:flex-wrap sm:items-end lg:w-auto">
            <div className="min-w-[180px] flex-1">
              <label htmlFor="competency-state-filter" className={labelClass}>
                State
              </label>
              <select
                id="competency-state-filter"
                value={selectedState}
                onChange={(event) => setSelectedState(event.target.value)}
                className={inputClass}
              >
                <option value="ALL">All States</option>
                {stateOptions.map((state) => (
                  <option key={state} value={state}>
                    {state}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[200px] flex-1">
              <label htmlFor="competency-project-filter" className={labelClass}>
                Project
              </label>
              <select
                id="competency-project-filter"
                value={selectedProject}
                onChange={(event) => setSelectedProject(event.target.value)}
                className={inputClass}
              >
                <option value="ALL">All Projects</option>
                {projectOptions.map((project) => (
                  <option key={project.value} value={project.value}>
                    {project.label}
                  </option>
                ))}
              </select>
            </div>

            <div className="min-w-[240px] flex-1">
              <label htmlFor="competency-search" className={labelClass}>
                Search workers
              </label>
              <div className="relative">
                <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                <input
                  id="competency-search"
                  value={search}
                  onChange={(event) => setSearch(event.target.value)}
                  placeholder="Filter by name or role"
                  className={cn(inputClass, "pl-9")}
                />
              </div>
            </div>

            <button
              type="button"
              onClick={handleExport}
              disabled={loading || filteredRows.length === 0}
              className="inline-flex items-center justify-center gap-2 rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-700 disabled:cursor-not-allowed disabled:opacity-50"
            >
              <Download className="h-4 w-4" />
              Export CSV
            </button>
          </div>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading competency matrix…
          </div>
        ) : filteredRows.length === 0 ? (
          <div className="rounded-xl border border-dashed border-slate-200 px-4 py-10 text-center text-sm text-slate-500">
            No workers match your filters.
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-max border-collapse text-left text-xs">
              <thead>
                <tr className="bg-slate-50">
                  <th className="sticky left-0 z-20 min-w-[220px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.12)]">
                    Worker
                  </th>
                  <th className="min-w-[140px] border-b border-r border-slate-200 bg-slate-50 px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-600">
                    Role
                  </th>
                  {COMPETENCY_COLUMN_LABELS.map((column) => (
                    <th
                      key={column}
                      className="min-w-[180px] border-b border-slate-200 px-3 py-3 text-left text-[11px] font-semibold uppercase tracking-wide text-slate-600"
                    >
                      {column}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {filteredRows.map((row) => (
                  <tr key={row.workerId} className="border-b border-slate-100">
                    <td className="sticky left-0 z-10 min-w-[220px] border-r border-slate-200 bg-white px-4 py-3 text-sm font-medium text-slate-900 shadow-[4px_0_8px_-4px_rgba(15,23,42,0.08)]">
                      {row.workerName}
                    </td>
                    <td className="min-w-[140px] border-r border-slate-200 bg-white px-4 py-3 text-sm text-slate-600">
                      {row.role || "—"}
                    </td>
                    {COMPETENCY_COLUMN_LABELS.map((column) => {
                      const cell = row.cells[column];
                      return (
                        <td key={`${row.workerId}-${column}`} className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex min-h-[28px] items-center rounded-md px-2 py-1 text-[11px] font-medium leading-tight",
                              competencyCellClassName(cell.status)
                            )}
                          >
                            {cell.display}
                          </span>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
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
