"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Search, Send, Users, UserRound, X } from "lucide-react";
import {
  assignSwmsWorkersRequest,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { notifySwmsAssignmentsClientSide } from "@/lib/swms-assignment-notify-client";
import {
  fetchWorkerIdsForProject,
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { isWorkerRevoked, type Worker } from "@/lib/supabase";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type AssignMode = "all_members" | "specific_members";

interface ProjectAssignSwmsModalProps {
  swms: SwmsDocumentSummary;
  projectId: string;
  projectName: string;
  /** Prefetched project members (may be incomplete — modal re-resolves on open). */
  projectWorkers: Worker[];
  /** Full organisation worker directory used to resolve project membership. */
  workers: Worker[];
  onClose: () => void;
  onAssigned: () => void;
}

function workerMatchesMemberQuery(worker: Worker, query: string): boolean {
  const q = query.toLowerCase().trim();
  if (!q) return true;

  try {
    const name = getWorkerDisplayName(worker).toLowerCase();
    const firstName = (worker.first_name ?? "").toLowerCase();
    const lastName = (worker.last_name ?? "").toLowerCase();
    const fullName = (worker.full_name ?? "").toLowerCase();
    const email = (worker.email ?? "").toLowerCase();
    const phone = (worker.phone ?? "").toLowerCase();
    const trade = (worker.trade ?? "").toLowerCase();
    const id = String(worker.id ?? "").toLowerCase();

    return (
      name.includes(q) ||
      firstName.includes(q) ||
      lastName.includes(q) ||
      fullName.includes(q) ||
      email.includes(q) ||
      phone.includes(q) ||
      trade.includes(q) ||
      id.includes(q)
    );
  } catch {
    return false;
  }
}

function isEligibleProjectMember(worker: Worker): boolean {
  return !worker.is_subcontractor && !isWorkerRevoked(worker);
}

export default function ProjectAssignSwmsModal({
  swms,
  projectId,
  projectName,
  projectWorkers: initialProjectWorkers,
  workers,
  onClose,
  onAssigned,
}: ProjectAssignSwmsModalProps) {
  const [mode, setMode] = useState<AssignMode>("all_members");
  const [query, setQuery] = useState("");
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [saving, setSaving] = useState(false);
  const [loadingMembers, setLoadingMembers] = useState(true);
  const [members, setMembers] = useState<Worker[]>(initialProjectWorkers);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState<string | null>(null);

  const resolveMembers = useCallback(async () => {
    setLoadingMembers(true);
    try {
      const [{ workerByProject }, junctionWorkerIds] = await Promise.all([
        loadAssignmentMaps(),
        fetchWorkerIdsForProject(projectId),
      ]);

      const fromFilter = filterWorkersForProject(
        workers,
        projectId,
        workerByProject
      );

      const byId = new Map(workers.map((worker) => [worker.id, worker]));
      const merged = new Map<string, Worker>();

      for (const worker of fromFilter) {
        if (isEligibleProjectMember(worker)) merged.set(worker.id, worker);
      }
      for (const worker of initialProjectWorkers) {
        if (isEligibleProjectMember(worker)) merged.set(worker.id, worker);
      }
      for (const workerId of junctionWorkerIds) {
        const worker = byId.get(workerId);
        if (worker && isEligibleProjectMember(worker)) {
          merged.set(worker.id, worker);
        }
      }

      // Include anyone already on this SWMS so assignees remain selectable/searchable.
      for (const assignment of swms.assignments ?? []) {
        if (assignment.assignee_type !== "worker" || !assignment.assignee_id) continue;
        const worker = byId.get(assignment.assignee_id);
        if (worker && isEligibleProjectMember(worker)) {
          merged.set(worker.id, worker);
        }
      }

      const sorted = [...merged.values()].sort((a, b) =>
        getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
      );
      setMembers(sorted);
    } catch {
      setMembers(
        initialProjectWorkers.filter(isEligibleProjectMember).sort((a, b) =>
          getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
        )
      );
    } finally {
      setLoadingMembers(false);
    }
  }, [projectId, workers, initialProjectWorkers, swms.assignments]);

  useEffect(() => {
    void resolveMembers();
  }, [resolveMembers]);

  const alreadyAssigned = useMemo(() => {
    const ids = new Set<string>();
    for (const row of swms.assignments ?? []) {
      if (row.assignee_type === "worker" && row.assignee_id) {
        ids.add(row.assignee_id);
      }
    }
    return ids;
  }, [swms.assignments]);

  const filteredWorkers = useMemo(() => {
    return members.filter((worker) => workerMatchesMemberQuery(worker, query));
  }, [members, query]);

  const allVisibleSelected =
    filteredWorkers.length > 0 &&
    filteredWorkers.every((worker) => selectedIds.includes(worker.id));

  const toggleAllVisible = () => {
    if (allVisibleSelected) {
      setSelectedIds((current) =>
        current.filter((id) => !filteredWorkers.some((worker) => worker.id === id))
      );
      return;
    }
    setSelectedIds((current) => [
      ...new Set([...current, ...filteredWorkers.map((worker) => worker.id)]),
    ]);
  };

  const toggleWorker = (workerId: string) => {
    setSelectedIds((current) =>
      current.includes(workerId)
        ? current.filter((id) => id !== workerId)
        : [...current, workerId]
    );
  };

  const handleAssign = async () => {
    setSaving(true);
    setError(null);
    setSuccess(null);

    try {
      const result =
        mode === "all_members"
          ? await assignSwmsWorkersRequest({
              swmsId: swms.id,
              // Prefer explicit ids from the resolved member list so assignment
              // works even if server-side project lookup differs.
              workerIds: members.map((worker) => worker.id),
              projectId,
              mode: "workers",
              swmsTitle: swms.title,
            })
          : await assignSwmsWorkersRequest({
              swmsId: swms.id,
              workerIds: selectedIds,
              projectId,
              mode: "workers",
              swmsTitle: swms.title,
            });

      if (result.error) {
        setError(result.error);
        return;
      }

      notifySwmsAssignmentsClientSide(result.createdWorkerIds);

      if (result.created === 0) {
        setSuccess(
          result.skipped > 0
            ? `No new assignments — ${result.skipped} worker(s) already have this SWMS.`
            : "No new assignments were created."
        );
      } else {
        setSuccess(
          `Assigned to ${result.created} worker(s).${
            result.skipped > 0 ? ` ${result.skipped} already had it.` : ""
          }`
        );
      }
      onAssigned();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to assign SWMS.");
    } finally {
      setSaving(false);
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
            <h2 className="text-lg font-bold text-slate-900">Assign SWMS</h2>
            <p className="text-sm text-slate-500">
              “{swms.title}” · {projectName}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {success ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              {success}
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <div className="space-y-4">
            <div className="grid grid-cols-1 gap-2 sm:grid-cols-2">
              <button
                type="button"
                onClick={() => setMode("all_members")}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-3 text-left transition",
                  mode === "all_members"
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <Users className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Assign to All Project Members
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Bulk assign to every worker on this project
                  </span>
                </span>
              </button>
              <button
                type="button"
                onClick={() => setMode("specific_members")}
                className={cn(
                  "flex items-start gap-2 rounded-xl border px-3 py-3 text-left transition",
                  mode === "specific_members"
                    ? "border-orange-300 bg-orange-50 shadow-sm"
                    : "border-slate-200 hover:border-slate-300"
                )}
              >
                <UserRound className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                <span>
                  <span className="block text-sm font-semibold text-slate-900">
                    Select Specific Members
                  </span>
                  <span className="mt-0.5 block text-xs text-slate-500">
                    Choose one or more workers from this project
                  </span>
                </span>
              </button>
            </div>

            {mode === "all_members" ? (
              <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
                {loadingMembers ? (
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Loading project members…
                  </span>
                ) : (
                  <>
                    This will assign the SWMS to all{" "}
                    <strong>{members.length}</strong> project member
                    {members.length === 1 ? "" : "s"}. Workers who already have a
                    pending or signed assignment are skipped.
                  </>
                )}
              </p>
            ) : (
              <div className="space-y-3">
                <label className="block space-y-1">
                  <span className={labelClass}>Search project members</span>
                  <div className="relative">
                    <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
                    <input
                      type="search"
                      value={query}
                      onChange={(event) => setQuery(event.target.value)}
                      placeholder="Search by name or email…"
                      autoComplete="off"
                      className={cn(inputClass, "pl-9")}
                    />
                  </div>
                </label>

                <label className="flex items-center gap-2 text-sm font-semibold text-slate-700">
                  <input
                    type="checkbox"
                    checked={allVisibleSelected}
                    onChange={toggleAllVisible}
                    disabled={loadingMembers || filteredWorkers.length === 0}
                    className="rounded border-slate-300 text-orange-500"
                  />
                  Select all visible ({filteredWorkers.length})
                </label>

                <div className="max-h-64 space-y-1 overflow-y-auto rounded-xl border border-slate-200 p-2">
                  {loadingMembers ? (
                    <p className="flex items-center justify-center gap-2 px-2 py-6 text-sm text-slate-500">
                      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                      Loading project members…
                    </p>
                  ) : filteredWorkers.length === 0 ? (
                    <p className="p-4 text-center text-sm text-slate-500">
                      {query.trim()
                        ? "No project members match your search."
                        : "No workers are currently assigned to this project."}
                    </p>
                  ) : (
                    filteredWorkers.map((worker) => {
                      const already = alreadyAssigned.has(worker.id);
                      return (
                        <label
                          key={worker.id}
                          className="flex cursor-pointer items-center gap-3 rounded-lg px-2 py-2 hover:bg-slate-50"
                        >
                          <input
                            type="checkbox"
                            checked={selectedIds.includes(worker.id)}
                            onChange={() => toggleWorker(worker.id)}
                            className="rounded border-slate-300 text-orange-500"
                          />
                          <span className="min-w-0 flex-1">
                            <span className="block text-sm font-medium text-slate-900">
                              {getWorkerDisplayName(worker)}
                            </span>
                            <span className="block truncate text-xs text-slate-500">
                              {worker.email || "No email"}
                              {already ? " · already assigned" : ""}
                            </span>
                          </span>
                        </label>
                      );
                    })
                  )}
                </div>
              </div>
            )}

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="button"
                disabled={
                  saving ||
                  loadingMembers ||
                  (mode === "specific_members" && selectedIds.length === 0) ||
                  (mode === "all_members" && members.length === 0)
                }
                onClick={() => void handleAssign()}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Send className="h-4 w-4" />
                )}
                Assign SWMS
              </button>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
