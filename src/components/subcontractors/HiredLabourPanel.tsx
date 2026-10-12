"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus } from "lucide-react";
import AddHiredLabourModal from "./AddHiredLabourModal";
import HiredLabourReviewModal from "./HiredLabourReviewModal";
import ReinstateHiredLabourModal from "./ReinstateHiredLabourModal";
import {
  fetchHiredLabourRecords,
  hiredLabourMatchesFilters,
  mutateHiredLabour,
  type HiredLabourRecord,
} from "@/lib/hired-labour";
import type { HiredLabourStatus } from "@/lib/hired-labour-status";
import { fetchProjects, type DbProject } from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { WORKER_STATE_REGION_OPTIONS } from "@/lib/worker-state-region";
import { cardClass, inputClass } from "@/lib/ui-classes";
import type { Worker } from "@/lib/supabase";

type HiredLabourTab = "active" | "pending" | "revoked";

const TABS: { id: HiredLabourTab; label: string }[] = [
  { id: "active", label: "Active" },
  { id: "pending", label: "Awaiting Approval" },
  { id: "revoked", label: "Revoked" },
];

function tabForStatus(status: HiredLabourStatus): HiredLabourTab {
  if (status === "revoked") return "revoked";
  if (status === "pending_approval" || status === "rejected") return "pending";
  return "active";
}

function statusLabel(status: HiredLabourStatus): string {
  switch (status) {
    case "pending_approval":
      return "Awaiting approval";
    case "approved":
      return "Approved";
    case "rejected":
      return "Rejected";
    case "revoked":
      return "Revoked";
    default:
      return "Invited";
  }
}

export default function HiredLabourPanel() {
  const [workers, setWorkers] = useState<HiredLabourRecord[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);
  const [tab, setTab] = useState<HiredLabourTab>("active");
  const [projectId, setProjectId] = useState("");
  const [state, setState] = useState("");
  const [showAdd, setShowAdd] = useState(false);
  const [review, setReview] = useState<HiredLabourRecord | null>(null);
  const [reinstate, setReinstate] = useState<HiredLabourRecord | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [hired, projectRows] = await Promise.all([
      fetchHiredLabourRecords(),
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
    for (const project of projects) map.set(project.id, project.name);
    return map;
  }, [projects]);

  const projectLabel = (worker: HiredLabourRecord) => {
    const ids = [
      ...(worker.assigned_project_id ? [worker.assigned_project_id] : []),
      ...(worker.assigned_project_ids ?? []),
    ];
    const names = [...new Set(ids)].map((id) => projectNameById.get(id)).filter(Boolean);
    return names.join(", ") || "Unassigned";
  };

  const filtered = useMemo(() => {
    return workers.filter((worker) => {
      if (tabForStatus(worker.hired_labour_status) !== tab) return false;
      return hiredLabourMatchesFilters(worker as unknown as Worker, { projectId, state });
    });
  }, [workers, tab, projectId, state]);

  const counts = useMemo(() => {
    const next = { active: 0, pending: 0, revoked: 0 };
    for (const worker of workers) next[tabForStatus(worker.hired_labour_status)] += 1;
    return next;
  }, [workers]);

  const runAction = async (worker: HiredLabourRecord, action: "revoke" | "delete") => {
    const name = getWorkerDisplayName(worker, "this worker");
    const confirmed =
      action === "delete"
        ? window.confirm(
            `Permanently delete ${name}? This removes their login and worker record so they can be invited again as a new person.`
          )
        : window.confirm(`Revoke access for ${name}?`);
    if (!confirmed) return;
    setBusyId(worker.id);
    setActionError(null);
    const result = await mutateHiredLabour({ action, workerId: worker.id });
    setBusyId(null);
    if (result.error) {
      setActionError(result.error);
      return;
    }
    await load();
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Hired Labour</h1>
          <p className="text-sm text-slate-500">
            Invite external labour, review their compliance documents, and control site access.
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

      <div className="mb-4 flex flex-wrap gap-2">
        {TABS.map((item) => (
          <button
            key={item.id}
            type="button"
            onClick={() => setTab(item.id)}
            className={
              tab === item.id
                ? "rounded-full bg-orange-500 px-4 py-1.5 text-sm font-semibold text-white"
                : "rounded-full border border-slate-200 bg-white px-4 py-1.5 text-sm font-semibold text-slate-700"
            }
          >
            {item.label}
            <span className="ml-2 text-xs opacity-80">{counts[item.id]}</span>
          </button>
        ))}
      </div>

      <div className="mb-4 grid gap-3 sm:grid-cols-2">
        <label className="block">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Project
          </span>
          <select className={inputClass} value={projectId} onChange={(event) => setProjectId(event.target.value)}>
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
          <select className={inputClass} value={state} onChange={(event) => setState(event.target.value)}>
            <option value="">All states</option>
            {WORKER_STATE_REGION_OPTIONS.map((code) => (
              <option key={code} value={code}>
                {code}
              </option>
            ))}
          </select>
        </label>
      </div>

      {actionError ? (
        <p className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-900">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading hired labour…
        </div>
      ) : filtered.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          No hired labour workers in this section.
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
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filtered.map((worker) => {
                const name = getWorkerDisplayName(worker, "Hired labour");
                return (
                  <tr key={worker.id} className="border-b border-slate-100">
                    <td className="px-4 py-3 font-medium text-slate-900">
                      {tab === "pending" ? (
                        <button
                          type="button"
                          className="text-left text-orange-700 hover:underline"
                          onClick={() => setReview(worker)}
                        >
                          {name}
                        </button>
                      ) : (
                        name
                      )}
                    </td>
                    <td className="px-4 py-3 text-slate-600">{worker.email || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.phone || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{projectLabel(worker)}</td>
                    <td className="px-4 py-3 text-slate-600">{worker.state || "—"}</td>
                    <td className="px-4 py-3 text-slate-600">{statusLabel(worker.hired_labour_status)}</td>
                    <td className="px-4 py-3">
                      <div className="flex flex-wrap gap-2">
                        {tab === "pending" ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-orange-700 hover:underline"
                            onClick={() => setReview(worker)}
                          >
                            Review
                          </button>
                        ) : null}
                        {worker.hired_labour_status === "approved" ? (
                          <button
                            type="button"
                            disabled={busyId === worker.id}
                            className="text-xs font-semibold text-amber-800 hover:underline disabled:opacity-60"
                            onClick={() => void runAction(worker, "revoke")}
                          >
                            Revoke
                          </button>
                        ) : null}
                        {tab === "revoked" ? (
                          <button
                            type="button"
                            className="text-xs font-semibold text-emerald-700 hover:underline"
                            onClick={() => setReinstate(worker)}
                          >
                            Reinstate
                          </button>
                        ) : null}
                        <button
                          type="button"
                          disabled={busyId === worker.id}
                          className="text-xs font-semibold text-red-700 hover:underline disabled:opacity-60"
                          onClick={() => void runAction(worker, "delete")}
                        >
                          Delete
                        </button>
                      </div>
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
      {review ? (
        <HiredLabourReviewModal
          worker={review}
          projectLabel={projectLabel(review)}
          onClose={() => setReview(null)}
          onChanged={() => {
            void load();
          }}
        />
      ) : null}
      {reinstate ? (
        <ReinstateHiredLabourModal
          workerId={reinstate.id}
          workerName={getWorkerDisplayName(reinstate, "Hired labour")}
          initialState={reinstate.state}
          initialProjectId={reinstate.assigned_project_id}
          onClose={() => setReinstate(null)}
          onSaved={() => {
            void load();
          }}
        />
      ) : null}
    </div>
  );
}
