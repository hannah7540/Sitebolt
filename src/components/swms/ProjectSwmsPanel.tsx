"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  ChevronDown,
  ChevronRight,
  Clock,
  FileText,
  Loader2,
  PenLine,
  UserPlus,
} from "lucide-react";
import {
  buildSwmsWorkerSignOffMatrix,
  fetchProjectSwmsDocuments,
  formatSwmsVersionLabel,
  getSwmsDocumentDate,
  getSwmsDocumentUrl,
  sendSwmsSignatureReminder,
  type SwmsAssignment,
  type SwmsDocument,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import {
  fetchWorkerIdsForProject,
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { isWorkerRevoked, type Worker } from "@/lib/supabase";
import WorkerSwmsSignModal from "@/components/workers/WorkerSwmsSignModal";
import ProjectAssignSwmsModal from "@/components/swms/ProjectAssignSwmsModal";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ProjectSwmsPanelProps {
  projectId: string | null;
  projectName: string;
  workers: Worker[];
}

function formatSignedAt(value: string | null): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export default function ProjectSwmsPanel({
  projectId,
  projectName,
  workers,
}: ProjectSwmsPanelProps) {
  const [documents, setDocuments] = useState<SwmsDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [expandedIds, setExpandedIds] = useState<Set<string>>(new Set());
  const [projectWorkers, setProjectWorkers] = useState<Worker[]>([]);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [reminderId, setReminderId] = useState<string | null>(null);
  const [assignTarget, setAssignTarget] = useState<SwmsDocumentSummary | null>(null);
  const [signAssignment, setSignAssignment] = useState<
    (SwmsAssignment & { swms?: SwmsDocument }) | null
  >(null);
  const [signSwmsTitle, setSignSwmsTitle] = useState("");

  const loadData = useCallback(async () => {
    if (!projectId?.trim()) {
      setDocuments([]);
      setProjectWorkers([]);
      setLoading(false);
      return;
    }

    setLoading(true);
    setActionError(null);

    try {
      const [{ workerByProject }, swmsRows, junctionWorkerIds] = await Promise.all([
        loadAssignmentMaps(),
        fetchProjectSwmsDocuments(projectId),
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
        if (!worker.is_subcontractor && !isWorkerRevoked(worker)) {
          merged.set(worker.id, worker);
        }
      }
      for (const workerId of junctionWorkerIds) {
        const worker = byId.get(workerId);
        if (worker && !worker.is_subcontractor && !isWorkerRevoked(worker)) {
          merged.set(worker.id, worker);
        }
      }

      setProjectWorkers(
        [...merged.values()].sort((a, b) =>
          getWorkerDisplayName(a).localeCompare(getWorkerDisplayName(b))
        )
      );
      setDocuments(swmsRows);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to load project SWMS."
      );
      setDocuments([]);
    } finally {
      setLoading(false);
    }
  }, [projectId, workers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  const projectWorkerSummaries = useMemo(
    () =>
      projectWorkers.map((worker) => ({
        id: worker.id,
        name: getWorkerDisplayName(worker),
      })),
    [projectWorkers]
  );

  const toggleExpanded = (id: string) => {
    setExpandedIds((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id);
      else next.add(id);
      return next;
    });
  };

  const handleReminder = async (
    assignmentId: string,
    assignment: NonNullable<SwmsDocumentSummary["assignments"]>[number]
  ) => {
    setReminderId(assignmentId);
    setSuccessMessage(null);
    setActionError(null);

    const { error, signingUrl } = await sendSwmsSignatureReminder(assignment);
    if (error) {
      setActionError(`${error}${signingUrl ? ` Link: ${signingUrl}` : ""}`);
    } else {
      setSuccessMessage("Signing link copied to clipboard for reminder.");
    }
    setReminderId(null);
  };

  const summaryStats = useMemo(() => {
    let signed = 0;
    let pending = 0;
    for (const doc of documents) {
      signed += doc.signedCount;
      pending += doc.pendingCount;
    }
    return { signed, pending, total: documents.length };
  }, [documents]);

  if (!projectId) {
    return (
      <div className={cn("p-8 text-center", cardClass)}>
        <p className="text-sm text-slate-600">Select a project to view site-specific SWMS.</p>
      </div>
    );
  }

  return (
    <div>
      <div className="mb-6">
        <h1 className="text-3xl font-bold text-slate-900">
          SWMS <span className="text-orange-500">{projectName}</span>
        </h1>
        <p className="mt-1 text-sm text-slate-500">
          Site-specific SWMS assigned to this project with worker sign-off tracking.
        </p>
      </div>

      <div className="mb-6 grid gap-4 sm:grid-cols-3">
        <div className={cn("p-4", cardClass)}>
          <p className="text-sm text-slate-500">Active SWMS</p>
          <p className="text-2xl font-bold text-slate-900">{summaryStats.total}</p>
        </div>
        <div className={cn("p-4", cardClass)}>
          <p className="text-sm text-slate-500">Signed</p>
          <p className="text-2xl font-bold text-emerald-700">{summaryStats.signed}</p>
        </div>
        <div className={cn("p-4", cardClass)}>
          <p className="text-sm text-slate-500">Pending</p>
          <p className="text-2xl font-bold text-red-600">{summaryStats.pending}</p>
        </div>
      </div>

      {successMessage ? (
        <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {successMessage}
        </p>
      ) : null}

      {actionError ? (
        <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {actionError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading project SWMS…
        </div>
      ) : documents.length === 0 ? (
        <div className={cn("p-8 text-center", cardClass)}>
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-3 text-sm text-slate-600">
            No site-specific SWMS assigned to this project yet. Push a company template from
            Administration → SWMS.
          </p>
        </div>
      ) : (
        <div className="space-y-4">
          {documents.map((doc) => {
            const expanded = expandedIds.has(doc.id);
            const matrix = buildSwmsWorkerSignOffMatrix(
              projectWorkerSummaries,
              doc.assignments ?? []
            );
            const documentUrl = getSwmsDocumentUrl(doc);
            const documentDate = getSwmsDocumentDate(doc);

            return (
              <article key={doc.id} className={cn("overflow-hidden", cardClass)}>
                <div className="flex w-full items-start justify-between gap-3 p-5">
                  <button
                    type="button"
                    onClick={() => toggleExpanded(doc.id)}
                    className="min-w-0 flex-1 text-left hover:opacity-90"
                  >
                    <div className="flex flex-wrap items-center gap-2">
                      {expanded ? (
                        <ChevronDown className="h-4 w-4 shrink-0 text-slate-400" />
                      ) : (
                        <ChevronRight className="h-4 w-4 shrink-0 text-slate-400" />
                      )}
                      <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {formatSwmsVersionLabel(doc.version)}
                      </span>
                    </div>
                    <div className="mt-1 flex flex-wrap gap-3 text-sm text-slate-500">
                      {documentDate ? (
                        <span>
                          {new Date(`${documentDate}T12:00:00`).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      ) : null}
                      <span className="text-emerald-700">{doc.signedCount} signed</span>
                      <span className="text-red-600">{doc.pendingCount} pending</span>
                    </div>
                  </button>
                  <div className="flex shrink-0 flex-wrap items-center gap-2">
                    <button
                      type="button"
                      onClick={() => setAssignTarget(doc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                    >
                      <UserPlus className="h-3.5 w-3.5" />
                      Assign Workers
                    </button>
                    {documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="text-sm font-medium text-orange-600 hover:underline"
                      >
                        View PDF
                      </a>
                    ) : null}
                  </div>
                </div>

                {expanded ? (
                  <div className="border-t border-slate-200 px-5 pb-5">
                    <p className="mb-3 pt-4 text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Sign-Off Tracker
                    </p>
                    <div className="overflow-x-auto">
                      <table className="min-w-full text-sm">
                        <thead>
                          <tr className="border-b border-slate-200 text-left text-xs uppercase tracking-wide text-slate-500">
                            <th className="px-3 py-2 font-semibold">Worker</th>
                            <th className="px-3 py-2 font-semibold">Status</th>
                            <th className="px-3 py-2 font-semibold">Actions</th>
                          </tr>
                        </thead>
                        <tbody>
                          {matrix.map((row) => (
                            <tr key={row.workerId} className="border-b border-slate-100">
                              <td className="px-3 py-3 font-medium text-slate-900">
                                {row.workerName}
                              </td>
                              <td className="px-3 py-3">
                                {row.status === "Signed" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-semibold text-emerald-800">
                                    <CheckCircle2 className="h-3.5 w-3.5" />
                                    Signed
                                    {row.signedAt ? (
                                      <span className="font-normal text-emerald-700">
                                        · {formatSignedAt(row.signedAt)}
                                      </span>
                                    ) : null}
                                  </span>
                                ) : row.status === "Pending" ? (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-semibold text-red-700">
                                    <Clock className="h-3.5 w-3.5" />
                                    Not Signed
                                  </span>
                                ) : (
                                  <span className="inline-flex items-center gap-1.5 rounded-full border border-slate-200 bg-slate-50 px-2.5 py-1 text-xs font-semibold text-slate-600">
                                    Not Assigned
                                  </span>
                                )}
                              </td>
                              <td className="px-3 py-3">
                                {row.assignment && row.status === "Pending" ? (
                                  <div className="flex flex-wrap gap-2">
                                    <button
                                      type="button"
                                      onClick={() => {
                                        if (!row.assignment) return;
                                        setSignAssignment({
                                          ...row.assignment,
                                          swms: doc,
                                        });
                                        setSignSwmsTitle(doc.title);
                                      }}
                                      className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                                    >
                                      <PenLine className="h-3.5 w-3.5" />
                                      Sign SWMS
                                    </button>
                                    <button
                                      type="button"
                                      disabled={reminderId === row.assignment.id}
                                      onClick={() =>
                                        void handleReminder(row.assignment!.id, row.assignment!)
                                      }
                                      className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                                    >
                                      {reminderId === row.assignment.id ? (
                                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                      ) : (
                                        <Bell className="h-3.5 w-3.5" />
                                      )}
                                      Send Signature Reminder
                                    </button>
                                  </div>
                                ) : row.assignment && row.status === "Signed" ? (
                                  <span className="text-xs text-slate-500">Complete</span>
                                ) : (
                                  <button
                                    type="button"
                                    onClick={() => setAssignTarget(doc)}
                                    className="text-xs font-semibold text-orange-600 hover:underline"
                                  >
                                    Assign…
                                  </button>
                                )}
                              </td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  </div>
                ) : null}
              </article>
            );
          })}
        </div>
      )}

      {signAssignment ? (
        <WorkerSwmsSignModal
          assignment={signAssignment}
          onClose={() => setSignAssignment(null)}
          onSigned={() => {
            setSignAssignment(null);
            setSuccessMessage(`SWMS "${signSwmsTitle}" signed successfully.`);
            void loadData();
          }}
        />
      ) : null}

      {assignTarget && projectId ? (
        <ProjectAssignSwmsModal
          swms={assignTarget}
          projectId={projectId}
          projectName={projectName}
          projectWorkers={projectWorkers}
          workers={workers}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => {
            setSuccessMessage("SWMS assignments updated.");
            void loadData();
          }}
        />
      ) : null}
    </div>
  );
}
