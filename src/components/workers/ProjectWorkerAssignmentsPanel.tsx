"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { HardHat, Loader2, Plus, Trash2, ArrowRightLeft, Search, X } from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  assignWorkersToProjectBatch,
  filterWorkersForProject,
  loadAssignmentMaps,
  transferWorkerToProject,
  unassignWorkerFromProject,
} from "@/lib/project-assignments";
import { fetchProjects } from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getWorkerTicketStatus, getTicketBadgeLabel } from "@/lib/worker-compliance";
import { groupVocsByWorker } from "@/lib/voc-utils";
import AssignWorkerPickerModal from "./AssignWorkerPickerModal";
import TransferWorkerProjectModal from "./TransferWorkerProjectModal";
import { cn } from "@/lib/utils";
import { inputClass } from "@/lib/ui-classes";

interface ProjectWorkerAssignmentsPanelProps {
  projectId: string | null;
  projectName: string;
  workers: Worker[];
  workerVocs: WorkerVoc[];
  loading: boolean;
  onRefresh: () => void;
}

export default function ProjectWorkerAssignmentsPanel({
  projectId,
  projectName,
  workers,
  workerVocs,
  loading,
  onRefresh,
}: ProjectWorkerAssignmentsPanelProps) {
  const [workerProjectMap, setWorkerProjectMap] = useState<Map<string, string[]>>(new Map());
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [showPicker, setShowPicker] = useState(false);
  const [transferWorker, setTransferWorker] = useState<Worker | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [searchQuery, setSearchQuery] = useState("");

  const vocsByWorker = useMemo(() => groupVocsByWorker(workerVocs), [workerVocs]);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    await fetchProjects();
    const { workerByProject } = await loadAssignmentMaps();
    setWorkerProjectMap(workerByProject);
    setAssignmentsLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, workers.length]);

  const assignedWorkers = useMemo(() => {
    if (!projectId) return [];
    return filterWorkersForProject(workers, projectId, workerProjectMap);
  }, [workers, projectId, workerProjectMap]);

  const filteredAssignedWorkers = useMemo(() => {
    if (!searchQuery.trim()) return assignedWorkers;

    const q = searchQuery.toLowerCase().trim();

    return assignedWorkers.filter((worker) => {
      const name = getWorkerDisplayName(worker).toLowerCase();
      const email = (worker.email || "").toLowerCase();
      const phone = (worker.phone || "").toLowerCase();
      const trade = (
        worker.trade ||
        (worker as Worker & { trade_role?: string | null }).trade_role ||
        ""
      ).toLowerCase();

      return (
        name.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        trade.includes(q)
      );
    });
  }, [assignedWorkers, searchQuery]);

  const removeWorkerFromCurrentProjectMap = useCallback(
    (workerId: string) => {
      if (!projectId) return;
      setWorkerProjectMap((prev) => {
        const next = new Map(prev);
        for (const [id, projectIds] of next.entries()) {
          if (id !== workerId) continue;
          next.set(
            id,
            projectIds.filter((value) => value !== projectId)
          );
        }
        return next;
      });
    },
    [projectId]
  );

  const handleUnassign = async (worker: Worker) => {
    if (!projectId) return;
    const snapshot = workerProjectMap;
    setActionId(worker.id);
    removeWorkerFromCurrentProjectMap(worker.id);

    const { error } = await unassignWorkerFromProject(worker, projectId, workers);
    setActionId(null);

    if (error) {
      setWorkerProjectMap(snapshot);
      alert(error);
      return;
    }

    onRefresh();
  };

  const handleTransfer = async (toProjectId: string) => {
    if (!projectId || !transferWorker) return { error: "Missing project context." };

    const worker = transferWorker;
    const snapshot = workerProjectMap;
    setActionId(worker.id);
    removeWorkerFromCurrentProjectMap(worker.id);

    const { error } = await transferWorkerToProject({
      worker,
      fromProjectId: projectId,
      toProjectId,
    });

    setActionId(null);

    if (error) {
      setWorkerProjectMap(snapshot);
      return { error };
    }

    onRefresh();
    return { error: null };
  };

  const handleAssign = async (workerIds: string[]) => {
    if (!projectId || workerIds.length === 0) return { error: null };
    const { error } = await assignWorkersToProjectBatch(projectId, workerIds, workers);
    if (!error) {
      await loadAssignments();
      onRefresh();
    }
    return { error };
  };

  if (!projectId) {
    return (
      <p className="text-sm text-slate-500">
        Select a project from the sidebar to manage worker assignments.
      </p>
    );
  }

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Project Workers</h1>
          <p className="text-sm text-slate-500">
            Workers assigned to <span className="font-semibold text-slate-700">{projectName}</span>
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowPicker(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Assign Worker to Project
        </button>
      </div>

      {(loading || assignmentsLoading) && (
        <div className="mb-4 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading worker assignments…
        </div>
      )}

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search assigned workers by Name, Role, Email, or Phone..."
          className={cn(inputClass, "w-full py-2.5 pl-10", searchQuery ? "pr-10" : "pr-4")}
          aria-label="Search assigned workers"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Ticket Status</th>
              <th className="p-4 text-right">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredAssignedWorkers.map((worker) => {
              const vocs = vocsByWorker[worker.id] ?? [];
              const ticketStatus = getWorkerTicketStatus(worker, vocs);

              return (
                <tr key={worker.id} className="border-t border-slate-200">
                  <td className="p-4">
                    <div className="flex items-center gap-2">
                      <HardHat className="h-4 w-4 text-orange-500" />
                      <span className="font-semibold text-slate-900">
                        {getWorkerDisplayName(worker)}
                      </span>
                    </div>
                  </td>
                  <td className="p-4 text-slate-600">
                    <p>{worker.email}</p>
                    <p className="text-xs text-slate-500">{worker.phone || "—"}</p>
                  </td>
                  <td className="p-4">
                    <span className="rounded bg-slate-100 px-2 py-1 text-xs font-bold text-slate-700">
                      {getTicketBadgeLabel(ticketStatus)}
                    </span>
                  </td>
                  <td className="p-4">
                    <div className="flex flex-wrap items-center justify-end gap-2">
                      <button
                        type="button"
                        disabled={actionId === worker.id}
                        onClick={() => setTransferWorker(worker)}
                        className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                      >
                        <ArrowRightLeft className="h-3.5 w-3.5" />
                        Transfer / Re-assign
                      </button>
                      <button
                        type="button"
                        disabled={actionId === worker.id}
                        onClick={() => void handleUnassign(worker)}
                        className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-3 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                      >
                        {actionId === worker.id ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Trash2 className="h-3.5 w-3.5" />
                        )}
                        Remove from Project
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {!loading && !assignmentsLoading && filteredAssignedWorkers.length === 0 && searchQuery.trim() ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  <p>No assigned workers match &quot;{searchQuery.trim()}&quot;.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
                  >
                    <X className="h-4 w-4" />
                    Clear Search
                  </button>
                </td>
              </tr>
            ) : null}
            {!loading && !assignmentsLoading && assignedWorkers.length === 0 && !searchQuery.trim() ? (
              <tr>
                <td colSpan={4} className="p-8 text-center text-slate-500">
                  No workers assigned to this project yet. Use Organisation → Workers to
                  onboard staff, then assign them here.
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showPicker && (
        <AssignWorkerPickerModal
          projectName={projectName}
          workers={workers}
          workerVocs={workerVocs}
          assignedWorkerIds={assignedWorkers.map((row) => row.id)}
          onClose={() => setShowPicker(false)}
          onAssign={handleAssign}
        />
      )}

      {transferWorker && (
        <TransferWorkerProjectModal
          worker={transferWorker}
          currentProjectId={projectId}
          currentProjectName={projectName}
          onClose={() => setTransferWorker(null)}
          onTransfer={handleTransfer}
        />
      )}
    </div>
  );
}
