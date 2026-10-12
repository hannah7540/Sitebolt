"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import AddHiredLabourModal from "./AddHiredLabourModal";
import {
  fetchHiredLabourWorkers,
  hiredLabourMatchesFilters,
} from "@/lib/hired-labour";
import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getWorkerAssignedProjectIds, type Worker } from "@/lib/supabase";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";
import { cardClass, inputClass } from "@/lib/ui-classes";

export default function HiredLabourPanel() {
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [projectId, setProjectId] = useState("");
  const [state, setState] = useState("");
  const [showAdd, setShowAdd] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const [hired, projectRows] = await Promise.all([
      fetchHiredLabourWorkers(),
      fetchProjects(),
    ]);
    setWorkers(hired);
    setProjects(projectRows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const projectNameById = useMemo(() => {
    const map = new Map<string, string>();
    for (const project of projects) {
      map.set(project.id, project.name);
    }
    return map;
  }, [projects]);

  const filtered = useMemo(
    () => workers.filter((worker) => hiredLabourMatchesFilters(worker, { projectId, state })),
    [workers, projectId, state]
  );

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Hired Labour</h1>
          <p className="text-sm text-slate-500">
            External labour that appears on the scheduling calendar, with limited app access.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-5 w-5" />
          Add New Hired Labour
        </button>
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Project
          </span>
          <select
            className={inputClass}
            value={projectId}
            onChange={(event) => setProjectId(event.target.value)}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            State
          </span>
          <select
            className={inputClass}
            value={state}
            onChange={(event) => setState(event.target.value)}
          >
            <option value="">All states</option>
            {WORKER_STATE_REGION_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading hired labour…
        </div>
      ) : filtered.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No hired labour workers match these filters.
        </p>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead>
              <tr className="border-b border-slate-200 bg-orange-50/50 text-left text-xs uppercase tracking-wide text-slate-500">
                <th className="px-4 py-3">Name</th>
                <th className="px-4 py-3">Email</th>
                <th className="px-4 py-3">Phone</th>
                <th className="px-4 py-3">Project</th>
                <th className="px-4 py-3">State</th>
                <th className="px-4 py-3">Onboarding</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((worker) => {
                const projectIds = getWorkerAssignedProjectIds(worker);
                const projectLabel =
                  projectIds
                    .map((id) => projectNameById.get(id))
                    .filter(Boolean)
                    .join(", ") ||
                  worker.assigned_project_name ||
                  "Unassigned";
                return (
                  <tr key={worker.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {getWorkerDisplayName(worker, "Hired labour")}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{worker.email || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{projectLabel}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.state || "—"}</td>
                    <td className="px-4 py-3">
                      <span
                        className={
                          worker.onboarding_completed
                            ? "rounded bg-emerald-100 px-2 py-0.5 text-xs font-bold text-emerald-800"
                            : "rounded bg-amber-100 px-2 py-0.5 text-xs font-bold text-amber-800"
                        }
                      >
                        {worker.onboarding_completed ? "Complete" : "Pending"}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      )}

      {showAdd ? (
        <AddHiredLabourModal
          onClose={() => setShowAdd(false)}
          onCreated={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
