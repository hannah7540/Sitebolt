"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  BarChart3,
  Bell,
  CheckCircle2,
  ClipboardList,
  Eye,
  Loader2,
  Search,
  UserPlus,
  X,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import {
  assignmentDueLabel,
  fetchFormTemplateAssignments,
  formatInductionFormUpdatedAt,
  isCompletedAssignmentStatus,
  isOutstandingAssignmentStatus,
  remindFormWorkerAssignment,
  resolveWorkerDisplayName,
  summarizeFormTemplateAssignments,
  type FormWorkerAssignment,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import InductionAssignmentDetailModal from "@/components/administration/forms/InductionAssignmentDetailModal";
import AssignFormModal from "@/components/administration/forms/AssignFormModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

type TrackerTab = "all" | "completed" | "pending";

interface InductionTrackerModalProps {
  form: InductionFormTemplate;
  workers: Worker[];
  projects: DbProject[];
  assignedByUser?: { id?: string | null; full_name?: string | null } | null;
  onClose: () => void;
}

function projectLabel(
  assignment: FormWorkerAssignment,
  projects: DbProject[]
): string {
  if (assignment.project_name?.trim()) return assignment.project_name;
  if (!assignment.project_id) return "—";
  return (
    projects.find((project) => project.id === assignment.project_id)?.name ??
    assignment.project_id.slice(0, 8)
  );
}

function workerTrade(worker: Worker | undefined): string {
  return worker?.trade?.trim() || "—";
}

export default function InductionTrackerModal({
  form,
  workers,
  projects,
  assignedByUser,
  onClose,
}: InductionTrackerModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [assignments, setAssignments] = useState<FormWorkerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [tab, setTab] = useState<TrackerTab>("all");
  const [searchQuery, setSearchQuery] = useState("");
  const [actionId, setActionId] = useState<string | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<FormWorkerAssignment | null>(null);
  const [showAssignModal, setShowAssignModal] = useState(false);

  const workerById = useMemo(
    () => new Map(workers.map((worker) => [worker.id, worker])),
    [workers]
  );

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchFormTemplateAssignments(form.id);
      setAssignments(result.assignments);
      if (result.error) {
        setError(result.error);
        showError(result.error);
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load completion tracker.";
      setError(message);
      showError(message);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [form.id, showError]);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const summary = useMemo(
    () => summarizeFormTemplateAssignments(assignments),
    [assignments]
  );

  const filteredAssignments = useMemo(() => {
    let list = assignments;

    if (tab === "completed") {
      list = list.filter((row) => isCompletedAssignmentStatus(row.status));
    } else if (tab === "pending") {
      list = list.filter((row) => isOutstandingAssignmentStatus(row.status));
    }

    const needle = searchQuery.trim().toLowerCase();
    if (!needle) return list;

    return list.filter((assignment) => {
      const worker = workerById.get(assignment.worker_id);
      const workerName = (
        assignment.worker_name ??
        (worker ? resolveWorkerDisplayName(worker) : "")
      ).toLowerCase();
      const trade = workerTrade(worker).toLowerCase();
      const project = projectLabel(assignment, projects).toLowerCase();
      return (
        workerName.includes(needle) ||
        trade.includes(needle) ||
        project.includes(needle)
      );
    });
  }, [assignments, tab, searchQuery, workerById, projects]);

  const resolveWorkerLabel = (assignment: FormWorkerAssignment): string => {
    const worker = workerById.get(assignment.worker_id);
    return assignment.worker_name ?? (worker ? resolveWorkerDisplayName(worker) : "Worker");
  };

  const handleRemind = async (assignment: FormWorkerAssignment) => {
    setActionId(assignment.id);
    try {
      const result = await remindFormWorkerAssignment(assignment.id);
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`Reminder sent to ${resolveWorkerLabel(assignment)}.`);
      await loadAssignments();
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <div className={modalOverlayClass} onClick={onClose}>
        <div
          className={cn(modalClass, "max-w-5xl")}
          onClick={(event) => event.stopPropagation()}
        >
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <div className="flex items-center gap-2">
                <BarChart3 className="h-5 w-5 text-orange-600" />
                <h2 className="text-lg font-bold text-slate-900">Completion Tracker</h2>
              </div>
              <p className="mt-1 text-sm text-slate-500">{form.title}</p>
            </div>
            <button type="button" onClick={onClose} aria-label="Close">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          </div>

          <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
            <div className={cn(cardClass, "p-4")}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Total Assigned
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{summary.total}</p>
            </div>
            <div className={cn(cardClass, "border-emerald-200 bg-emerald-50/60 p-4")}>
              <p className="text-xs font-medium uppercase tracking-wide text-emerald-700">
                Completed
              </p>
              <p className="mt-1 text-2xl font-bold text-emerald-800">{summary.completed}</p>
            </div>
            <div className={cn(cardClass, "border-orange-200 bg-orange-50/60 p-4")}>
              <p className="text-xs font-medium uppercase tracking-wide text-orange-700">
                Pending / Outstanding
              </p>
              <p className="mt-1 text-2xl font-bold text-orange-800">{summary.pending}</p>
            </div>
            <div className={cn(cardClass, "p-4")}>
              <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
                Completion Rate
              </p>
              <p className="mt-1 text-2xl font-bold text-slate-900">{summary.completionRate}%</p>
              <div className="mt-2 h-2 overflow-hidden rounded-full bg-slate-200">
                <div
                  className="h-full rounded-full bg-orange-500 transition-all"
                  style={{ width: `${summary.completionRate}%` }}
                />
              </div>
            </div>
          </div>

          <div className="mb-4 flex flex-wrap items-center gap-3">
            <div className="inline-flex rounded-lg border border-slate-200 bg-slate-50 p-1">
              {([
                ["all", "All"],
                ["completed", "Completed"],
                ["pending", "Pending"],
              ] as const).map(([value, label]) => (
                <button
                  key={value}
                  type="button"
                  onClick={() => setTab(value)}
                  className={cn(
                    "rounded-md px-3 py-1.5 text-xs font-semibold transition",
                    tab === value
                      ? "bg-white text-orange-700 shadow-sm"
                      : "text-slate-600 hover:text-slate-900"
                  )}
                >
                  {label}
                </button>
              ))}
            </div>

            <label className="relative min-w-[220px] flex-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Search worker or project…"
                className={cn(inputClass, "pl-9")}
              />
            </label>

            <button
              type="button"
              onClick={() => setShowAssignModal(true)}
              className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
            >
              <UserPlus className="h-3.5 w-3.5" />
              Assign Workers
            </button>
          </div>

          {error ? (
            <div className="mb-4 rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </div>
          ) : null}

          {loading ? (
            <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading assignment records…
            </div>
          ) : filteredAssignments.length === 0 ? (
            <div className="flex flex-col items-center gap-3 py-12 text-center">
              <ClipboardList className="h-10 w-10 text-slate-300" />
              <p className="text-sm text-slate-500">
                {assignments.length === 0
                  ? "No workers assigned to this form yet."
                  : "No assignments match your filter."}
              </p>
            </div>
          ) : (
            <div className="overflow-x-auto rounded-xl border border-slate-200">
              <table className="min-w-full text-left text-sm">
                <thead>
                  <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                    <th className="px-3 py-2 font-semibold">Worker</th>
                    <th className="px-3 py-2 font-semibold">Project</th>
                    <th className="px-3 py-2 font-semibold">Assigned</th>
                    <th className="px-3 py-2 font-semibold">Status</th>
                    <th className="px-3 py-2 font-semibold">Completed</th>
                    <th className="px-3 py-2 font-semibold text-right">Action</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredAssignments.map((assignment) => {
                    const worker = workerById.get(assignment.worker_id);
                    const completed = isCompletedAssignmentStatus(assignment.status);
                    const busy = actionId === assignment.id;

                    return (
                      <tr key={assignment.id} className="border-b border-slate-100">
                        <td className="px-3 py-3">
                          <p className="font-medium text-slate-900">
                            {resolveWorkerLabel(assignment)}
                          </p>
                          <p className="text-xs text-slate-500">{workerTrade(worker)}</p>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {projectLabel(assignment, projects)}
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {assignmentDueLabel(assignment.assigned_at)}
                        </td>
                        <td className="px-3 py-3">
                          <span
                            className={cn(
                              "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-xs font-semibold",
                              completed
                                ? "bg-emerald-100 text-emerald-800"
                                : "bg-orange-100 text-orange-800"
                            )}
                          >
                            {completed ? (
                              <CheckCircle2 className="h-3 w-3" />
                            ) : null}
                            {completed ? "Completed" : "Pending"}
                          </span>
                        </td>
                        <td className="px-3 py-3 text-slate-600">
                          {assignment.completed_at
                            ? formatInductionFormUpdatedAt(assignment.completed_at)
                            : "—"}
                        </td>
                        <td className="px-3 py-3 text-right">
                          {completed ? (
                            <button
                              type="button"
                              onClick={() => setDetailAssignment(assignment)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600"
                            >
                              <Eye className="h-3 w-3" />
                              View Answers / Signature
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleRemind(assignment)}
                              className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                            >
                              {busy ? (
                                <Loader2 className="h-3 w-3 animate-spin" />
                              ) : (
                                <Bell className="h-3 w-3" />
                              )}
                              Remind / Re-assign
                            </button>
                          )}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>

      {detailAssignment ? (
        <InductionAssignmentDetailModal
          assignment={detailAssignment}
          form={form}
          workerLabel={resolveWorkerLabel(detailAssignment)}
          onClose={() => setDetailAssignment(null)}
        />
      ) : null}

      {showAssignModal ? (
        <AssignFormModal
          form={form}
          workers={workers}
          projects={projects}
          assignedByUser={assignedByUser}
          onClose={() => setShowAssignModal(false)}
          onAssigned={() => {
            setShowAssignModal(false);
            showSuccess("Form assigned successfully!");
            void loadAssignments();
          }}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
