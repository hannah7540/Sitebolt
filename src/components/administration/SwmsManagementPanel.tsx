"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FileText,
  GitBranchPlus,
  Loader2,
  Mail,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  deleteSwmsDocument,
  fetchSwmsList,
  filterSiteSpecificSwmsByProject,
  filterSwmsDocumentsByAdminTab,
  formatSwmsVersionLabel,
  getSwmsDocumentDate,
  getSwmsDocumentUrl,
  isSwmsItemArchived,
  resolveSwmsScope,
  resolveSwmsTargetId,
  sendSwmsNewVersion,
  toggleArchiveSWMS,
  type SwmsAdminTabFilter,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { filterActiveProjects, type DbProject } from "@/lib/project-resolver";
import { resolveSwmsAssigneeName, type Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  formatComplianceReminderToast,
  postComplianceReminders,
  postComplianceRemindersGrouped,
} from "@/lib/compliance-tracking-client";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";
import UploadSwmsModal from "./UploadSwmsModal";
import UploadSiteSpecificSwmsModal from "./UploadSiteSpecificSwmsModal";
import EditSwmsModal from "./EditSwmsModal";
import SendSwmsToGuestModal from "@/components/swms/SendSwmsToGuestModal";
import { isGuestSwmsAssignment } from "@/lib/swms-guest";
import AssignSwmsToProjectModal from "./AssignSwmsToProjectModal";
import SwmsDeleteConfirmModal from "./SwmsDeleteConfirmModal";
import ComplianceTrackingPanel, {
  type ComplianceTrackingRow,
} from "./ComplianceTrackingPanel";
import SwmsAssignmentResultModal from "./SwmsAssignmentResultModal";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SwmsManagementPanelProps {
  workers: Worker[];
  projects: DbProject[];
}

const TAB_FILTERS: Array<{ id: SwmsAdminTabFilter; label: string }> = [
  { id: "company", label: "Company SWMS" },
  { id: "site_specific", label: "Site-Specific SWMS" },
  { id: "archived", label: "Archived SWMS" },
];

function projectLabel(
  projectId: string | null | undefined,
  projects: DbProject[]
): string {
  if (!projectId) return "—";
  return projects.find((project) => project.id === projectId)?.name ?? projectId.slice(0, 8);
}

function trackingWorkerName(
  workers: Worker[],
  workerId: string,
  fallback: string
): string {
  const worker = workers.find((row) => row.id === workerId);
  if (!worker) return fallback;
  return getWorkerDisplayName(worker, fallback);
}

export default function SwmsManagementPanel({
  workers,
  projects,
}: SwmsManagementPanelProps) {
  const [swmsList, setSwmsList] = useState<SwmsDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [showSiteSpecificUpload, setShowSiteSpecificUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<SwmsAdminTabFilter>("company");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SwmsDocumentSummary | null>(null);
  const [editTarget, setEditTarget] = useState<SwmsDocumentSummary | null>(null);
  const [assignTarget, setAssignTarget] = useState<SwmsDocumentSummary | null>(null);
  const [selectedIds, setSelectedIds] = useState<string[]>([]);
  const [guestModalOpen, setGuestModalOpen] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [projectFilterId, setProjectFilterId] = useState("");
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [resultRow, setResultRow] = useState<ComplianceTrackingRow | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const activeProjects = useMemo(() => filterActiveProjects(projects), [projects]);

  const trackingRows = useMemo<ComplianceTrackingRow[]>(() => {
    const rows: ComplianceTrackingRow[] = [];
    for (const doc of swmsList) {
      for (const assignment of doc.assignments ?? []) {
        const workerId = String(
          assignment.worker_id ?? assignment.assignee_id ?? ""
        ).trim();
        const completed =
          assignment.status === "Signed" || Boolean(assignment.signed_at);
        const isGuest = isGuestSwmsAssignment(assignment);
        const isWorker = assignment.assignee_type === "worker";
        const fallbackName =
          resolveSwmsAssigneeName(assignment) || "Unknown worker";
        rows.push({
          id: assignment.id,
          documentId: doc.id,
          documentTitle: doc.title,
          workerId,
          workerName: isGuest
            ? fallbackName
            : trackingWorkerName(workers, workerId, fallbackName),
          assignedAt: assignment.created_at ?? null,
          completedAt: assignment.signed_at ?? null,
          status: completed ? "Completed" : "Pending",
          canRemind: !completed && isWorker && Boolean(workerId),
          isGuest,
        });
      }
    }
    return rows;
  }, [swmsList, workers]);

  const resultAssignment = useMemo(() => {
    if (!resultRow) return null;
    for (const doc of swmsList) {
      const assignment = (doc.assignments ?? []).find(
        (row) => row.id === resultRow.id
      );
      if (assignment) {
        return { doc, assignment };
      }
    }
    return null;
  }, [resultRow, swmsList]);

  const handleRemind = async (row: ComplianceTrackingRow) => {
    setRemindingId(row.id);
    try {
      const result = await postComplianceReminders({
        kind: "swms",
        workerIds: [row.workerId],
        documentTitle: row.documentTitle,
        documentId: row.documentId,
      });
      if (!result.ok) {
        showError(result.error ?? "Could not send reminder.");
        return;
      }
      showSuccess(formatComplianceReminderToast(result));
    } finally {
      setRemindingId(null);
    }
  };

  const handleRemindAllPending = async (pendingRows: ComplianceTrackingRow[]) => {
    setRemindingAll(true);
    try {
      const result = await postComplianceRemindersGrouped("swms", pendingRows);
      if (!result.ok) {
        showError(result.error ?? "Could not send reminders.");
        return;
      }
      showSuccess(formatComplianceReminderToast(result));
    } finally {
      setRemindingAll(false);
    }
  };

  const fetchSwmsListData = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setActionError(null);

    try {
      const rows = await fetchSwmsList();
      setSwmsList(rows);
    } catch (error) {
      setActionError(
        error instanceof Error ? error.message : "Failed to load SWMS records."
      );
      setSwmsList([]);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, []);

  useEffect(() => {
    void fetchSwmsListData();
  }, [fetchSwmsListData]);

  const filteredSwmsList = useMemo(() => {
    const byTab = filterSwmsDocumentsByAdminTab(swmsList, activeTab);
    if (activeTab !== "site_specific") return byTab;
    return filterSiteSpecificSwmsByProject(byTab, projectFilterId);
  }, [swmsList, activeTab, projectFilterId]);

  const selectableIds = useMemo(
    () =>
      filteredSwmsList
        .filter((doc) => !isSwmsItemArchived(doc))
        .map((doc) => doc.id),
    [filteredSwmsList]
  );
  const allSelectableSelected =
    selectableIds.length > 0 && selectableIds.every((id) => selectedIds.includes(id));
  const selectedItems = useMemo(
    () =>
      filteredSwmsList
        .filter((doc) => selectedIds.includes(doc.id))
        .map((doc) => ({ id: doc.id, title: doc.title })),
    [filteredSwmsList, selectedIds]
  );

  const toggleSelected = (id: string) => {
    setSelectedIds((prev) =>
      prev.includes(id) ? prev.filter((value) => value !== id) : [...prev, id]
    );
  };

  const toggleSelectAll = () => {
    setSelectedIds((prev) =>
      selectableIds.every((id) => prev.includes(id)) ? [] : [...selectableIds]
    );
  };

  const emptyMessage =
    activeTab === "archived"
      ? "No archived SWMS documents."
      : activeTab === "site_specific"
        ? projectFilterId
          ? "No site-specific SWMS for the selected project."
          : "No site-specific SWMS documents."
        : "No company SWMS templates in the master library.";

  const toggleArchive = async (item: SwmsDocumentSummary) => {
    const currentlyArchived = isSwmsItemArchived(item);
    const targetState = !currentlyArchived;
    const targetId = resolveSwmsTargetId(item) || item.id;

    setActionId(targetId || item.title || null);
    setSuccessMessage(null);

    try {
      await toggleArchiveSWMS(item, targetState);
      setSuccessMessage(
        targetState
          ? `"${item.title}" archived.`
          : `"${item.title}" restored to active.`
      );
      await fetchSwmsListData({ silent: true });
    } catch (error) {
      console.warn("SWMS archive failed:", error);
    } finally {
      setActionId(null);
    }
  };

  const handleNewVersion = async (item: SwmsDocumentSummary) => {
    const targetId = resolveSwmsTargetId(item) || item.id;
    setActionId(targetId);
    setActionError(null);
    setSuccessMessage(null);

    try {
      const { error, document } = await sendSwmsNewVersion({ swms: item });
      if (error || !document) {
        setActionError(error ?? "Failed to publish new SWMS version.");
        return;
      }
      setSuccessMessage(
        `"${item.title}" updated to ${formatSwmsVersionLabel(document.version)}. Worker signatures have been reset.`
      );
      await fetchSwmsListData({ silent: true });
    } finally {
      setActionId(null);
    }
  };

  const handleDeleteConfirm = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    setActionError(null);
    const { error } = await deleteSwmsDocument(deleteTarget.id);
    setDeleting(false);
    if (error) {
      setActionError(error);
      return;
    }
    setDeleteTarget(null);
    await fetchSwmsListData({ silent: true });
  };

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            SWMS <span className="text-orange-500">Administration</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage company master templates, site-specific deployments, and versioning.
          </p>
        </div>
        {activeTab === "company" ? (
          <button
            type="button"
            onClick={() => setShowUpload(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add New Company SWMS
          </button>
        ) : null}
        {activeTab === "site_specific" ? (
          <button
            type="button"
            onClick={() => setShowSiteSpecificUpload(true)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
          >
            <Plus className="h-4 w-4" />
            Add Site-Specific SWMS
          </button>
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
        <div className="flex flex-wrap gap-2">
          {TAB_FILTERS.map((filter) => (
            <button
              key={filter.id}
              type="button"
              onClick={() => {
                setActiveTab(filter.id);
                setSelectedIds([]);
              }}
              className={cn(
                "rounded-lg border px-3 py-2 text-sm font-medium transition-colors",
                activeTab === filter.id
                  ? "border-orange-300 bg-orange-50 text-orange-700"
                  : "border-slate-200 bg-white text-slate-700 hover:bg-slate-50"
              )}
            >
              {filter.label}
            </button>
          ))}
        </div>

        {activeTab === "site_specific" ? (
          <label className="flex min-w-[220px] flex-col gap-1">
            <span className={labelClass}>Filter by Project</span>
            <select
              className={inputClass}
              value={projectFilterId}
              onChange={(event) => setProjectFilterId(event.target.value)}
            >
              <option value="">All Projects</option>
              {activeProjects.map((project) => (
                <option key={project.id} value={project.id}>
                  {project.name}
                </option>
              ))}
            </select>
          </label>
        ) : null}
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

      {activeTab !== "archived" && filteredSwmsList.length > 0 ? (
        <div className="mb-4 flex flex-wrap items-center justify-between gap-3 rounded-xl border border-slate-200 bg-white px-4 py-3">
          <label className="inline-flex items-center gap-2 text-sm font-medium text-slate-700">
            <input
              type="checkbox"
              checked={allSelectableSelected}
              onChange={toggleSelectAll}
              disabled={selectableIds.length === 0}
              aria-label="Select all SWMS"
              className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500 disabled:opacity-40"
            />
            {selectedIds.length > 0
              ? `${selectedIds.length} selected`
              : "Select SWMS"}
          </label>
          <button
            type="button"
            disabled={selectedIds.length === 0}
            onClick={() => setGuestModalOpen(true)}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:cursor-not-allowed disabled:opacity-50"
          >
            <Mail className="h-4 w-4" />
            Send to Guest
          </button>
        </div>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading SWMS records…
        </div>
      ) : filteredSwmsList.length === 0 ? (
        <div className={cn("p-8 text-center", cardClass)}>
          <FileText className="mx-auto h-10 w-10 text-slate-400" />
          <p className="mt-3 text-sm text-slate-600">{emptyMessage}</p>
        </div>
      ) : (
        <div className="space-y-4">
          {filteredSwmsList.map((doc) => {
            const documentUrl = getSwmsDocumentUrl(doc);
            const documentDate = getSwmsDocumentDate(doc);
            const archived = isSwmsItemArchived(doc);
            const swmsId = resolveSwmsTargetId(doc);
            const isBusy = actionId === doc.id || actionId === swmsId;
            const scope = resolveSwmsScope(doc);
            const isCompany = scope === "company";

            return (
              <article key={doc.id} className={cn("p-5", cardClass)}>
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div className="flex min-w-0 items-start gap-3">
                    {!archived ? (
                      <input
                        type="checkbox"
                        checked={selectedIds.includes(doc.id)}
                        onChange={() => toggleSelected(doc.id)}
                        aria-label={`Select ${doc.title}`}
                        className="mt-1.5 h-4 w-4 shrink-0 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
                      />
                    ) : null}
                    <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <h2 className="text-lg font-semibold text-slate-900">{doc.title}</h2>
                      <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                        {formatSwmsVersionLabel(doc.version)}
                      </span>
                      {activeTab === "archived" ? (
                        <span className="rounded-full border border-slate-300 bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          Archived
                        </span>
                      ) : null}
                    </div>
                    <div className="mt-1 flex flex-wrap gap-x-4 gap-y-1 text-sm text-slate-500">
                      {documentDate ? (
                        <span>
                          {new Date(`${documentDate}T12:00:00`).toLocaleDateString(undefined, {
                            day: "numeric",
                            month: "short",
                            year: "numeric",
                          })}
                        </span>
                      ) : null}
                      {!isCompany ? (
                        <span className="inline-flex items-center rounded-full border border-sky-200 bg-sky-50 px-2.5 py-0.5 text-xs font-semibold text-sky-800">
                          {projectLabel(doc.project_id, projects)}
                        </span>
                      ) : (
                        <span>Master library template</span>
                      )}
                    </div>
                    {documentUrl ? (
                      <a
                        href={documentUrl}
                        target="_blank"
                        rel="noreferrer"
                        className="mt-1 inline-block text-sm font-medium text-orange-600 hover:underline"
                      >
                        View PDF
                      </a>
                    ) : null}
                    </div>
                  </div>

                  <div className="flex flex-wrap items-center gap-2">
                    {!archived ? (
                      <>
                        <span className="rounded-full border border-slate-200 bg-slate-50 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
                          Assigned {doc.totalAssigned}
                        </span>
                        <span className="rounded-full border border-emerald-200 bg-emerald-50 px-2.5 py-0.5 text-xs font-semibold text-emerald-800">
                          Signed {doc.signedCount}
                        </span>
                        <span className="rounded-full border border-amber-200 bg-amber-50 px-2.5 py-0.5 text-xs font-semibold text-amber-800">
                          Pending {doc.pendingCount}
                        </span>
                      </>
                    ) : null}

                    {!archived && activeTab === "company" ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setEditTarget(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setAssignTarget(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Assign SWMS
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleNewVersion(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <GitBranchPlus className="h-3.5 w-3.5" />
                          )}
                          Send Out New Version
                        </button>
                      </>
                    ) : null}

                    {!archived && activeTab === "site_specific" ? (
                      <>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setEditTarget(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                        >
                          <Pencil className="h-3.5 w-3.5" />
                          Edit
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => setAssignTarget(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50 disabled:opacity-50"
                        >
                          <Send className="h-3.5 w-3.5" />
                          Assign SWMS
                        </button>
                        <button
                          type="button"
                          disabled={isBusy}
                          onClick={() => void handleNewVersion(doc)}
                          className="inline-flex items-center gap-1 rounded-lg border border-blue-200 px-2.5 py-1.5 text-xs font-semibold text-blue-800 hover:bg-blue-50 disabled:opacity-50"
                        >
                          {isBusy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <GitBranchPlus className="h-3.5 w-3.5" />
                          )}
                          Send Out New Version
                        </button>
                      </>
                    ) : null}

                    {!archived ? (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void toggleArchive(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <Archive className="h-3.5 w-3.5" />
                        )}
                        Archive
                      </button>
                    ) : (
                      <button
                        type="button"
                        disabled={isBusy}
                        onClick={() => void toggleArchive(doc)}
                        className="inline-flex items-center gap-1 rounded-lg border border-emerald-200 px-2.5 py-1.5 text-xs font-semibold text-emerald-800 hover:bg-emerald-50 disabled:opacity-50"
                      >
                        {isBusy ? (
                          <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        ) : (
                          <ArchiveRestore className="h-3.5 w-3.5" />
                        )}
                        Restore
                      </button>
                    )}

                    <button
                      type="button"
                      disabled={isBusy}
                      onClick={() => setDeleteTarget(doc)}
                      className="inline-flex items-center gap-1 rounded-lg border border-red-200 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-50 disabled:opacity-50"
                    >
                      <Trash2 className="h-3.5 w-3.5" />
                      Delete
                    </button>
                  </div>
                </div>
              </article>
            );
          })}
        </div>
      )}

      <div className="mt-8">
        <ComplianceTrackingPanel
          kind="swms"
          title="SWMS completion tracking"
          rows={trackingRows}
          loading={loading}
          remindingId={remindingId}
          remindingAll={remindingAll}
          onViewResults={setResultRow}
          onRemind={(row) => void handleRemind(row)}
          onRemindAllPending={(rows) => void handleRemindAllPending(rows)}
        />
      </div>

      {showUpload ? (
        <UploadSwmsModal
          onClose={() => setShowUpload(false)}
          onSaved={() => void fetchSwmsListData({ silent: true })}
        />
      ) : null}

      {showSiteSpecificUpload ? (
        <UploadSiteSpecificSwmsModal
          projects={projects}
          workers={workers}
          onClose={() => setShowSiteSpecificUpload(false)}
          onSaved={() => void fetchSwmsListData({ silent: true })}
        />
      ) : null}

      {editTarget ? (
        <EditSwmsModal
          document={editTarget}
          onClose={() => setEditTarget(null)}
          onSaved={() => void fetchSwmsListData({ silent: true })}
        />
      ) : null}

      {assignTarget ? (
        <AssignSwmsToProjectModal
          swms={assignTarget}
          projects={projects}
          workers={workers}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => void fetchSwmsListData({ silent: true })}
        />
      ) : null}

      {guestModalOpen ? (
        <SendSwmsToGuestModal
          items={selectedItems}
          onClose={() => setGuestModalOpen(false)}
          onSent={(count) => {
            setSuccessMessage(`${count} SWMS sent to guest.`);
            setSelectedIds([]);
            void fetchSwmsListData({ silent: true });
          }}
        />
      ) : null}

      {deleteTarget ? (
        <SwmsDeleteConfirmModal
          title={deleteTarget.title}
          deleting={deleting}
          onClose={() => {
            if (!deleting) setDeleteTarget(null);
          }}
          onConfirm={handleDeleteConfirm}
        />
      ) : null}

      {resultRow && resultAssignment ? (
        <SwmsAssignmentResultModal
          workerName={resultRow.workerName}
          documentTitle={resultAssignment.doc.title}
          signedAt={resultAssignment.assignment.signed_at}
          signatureUrl={resultAssignment.assignment.signature_url}
          documentUrl={getSwmsDocumentUrl(resultAssignment.doc) || null}
          acknowledgedRisks={resultAssignment.assignment.acknowledged_risks}
          onClose={() => setResultRow(null)}
        />
      ) : null}

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
