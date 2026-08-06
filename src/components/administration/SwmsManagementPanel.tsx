"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Archive,
  ArchiveRestore,
  FileText,
  GitBranchPlus,
  Loader2,
  Pencil,
  Plus,
  Send,
  Trash2,
} from "lucide-react";
import {
  deleteSwmsDocument,
  fetchSwmsList,
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
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import UploadSwmsModal from "./UploadSwmsModal";
import EditSwmsModal from "./EditSwmsModal";
import AssignSwmsToProjectModal from "./AssignSwmsToProjectModal";
import SwmsDeleteConfirmModal from "./SwmsDeleteConfirmModal";
import { cardClass } from "@/lib/ui-classes";
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

export default function SwmsManagementPanel({
  workers: _workers,
  projects,
}: SwmsManagementPanelProps) {
  const [swmsList, setSwmsList] = useState<SwmsDocumentSummary[]>([]);
  const [loading, setLoading] = useState(true);
  const [showUpload, setShowUpload] = useState(false);
  const [activeTab, setActiveTab] = useState<SwmsAdminTabFilter>("company");
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<SwmsDocumentSummary | null>(null);
  const [editTarget, setEditTarget] = useState<SwmsDocumentSummary | null>(null);
  const [assignTarget, setAssignTarget] = useState<SwmsDocumentSummary | null>(null);
  const [deleting, setDeleting] = useState(false);

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

  const filteredSwmsList = useMemo(
    () => filterSwmsDocumentsByAdminTab(swmsList, activeTab),
    [swmsList, activeTab]
  );

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

  const emptyMessage =
    activeTab === "archived"
      ? "No archived SWMS documents."
      : activeTab === "site_specific"
        ? "No site-specific SWMS documents."
        : "No company SWMS templates in the master library.";

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
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TAB_FILTERS.map((filter) => (
          <button
            key={filter.id}
            type="button"
            onClick={() => setActiveTab(filter.id)}
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
                  <div>
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
                        <span>Project: {projectLabel(doc.project_id, projects)}</span>
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
                          Assign / Push to Project
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

      {showUpload ? (
        <UploadSwmsModal
          onClose={() => setShowUpload(false)}
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
          workers={_workers}
          onClose={() => setAssignTarget(null)}
          onAssigned={() => void fetchSwmsListData({ silent: true })}
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
    </div>
  );
}
