"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Plus,
  Pencil,
  Loader2,
  MapPin,
  Archive,
  ArchiveRestore,
} from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { supabase } from "@/lib/supabase";
import {
  fetchAllProjectsAdmin,
  filterActiveProjects,
  formatProjectSaveError,
  setProjectsCache,
  type DbProject,
  type ProjectViewFilter,
} from "@/lib/project-resolver";
import ProjectFormModal from "./ProjectFormModal";
import Toast, { type ToastVariant } from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ProjectsManagementPanelProps {
  workers: Worker[];
  onProjectsChanged: () => void;
}

type PanelToast = {
  message: string;
  variant: ToastVariant;
};

const TAB_FILTERS: Array<{ id: ProjectViewFilter; label: string }> = [
  { id: "Active", label: "Active" },
  { id: "Archived", label: "Archived" },
  { id: "All", label: "All" },
];

function isProjectListItemArchived(item: DbProject): boolean {
  return Boolean(
    item.is_archived === true ||
      String(item.is_archived) === "true" ||
      item.status === "Archived"
  );
}

export default function ProjectsManagementPanel({
  workers,
  onProjectsChanged,
}: ProjectsManagementPanelProps) {
  const [projectsList, setProjectsList] = useState<DbProject[]>([]);
  const [activeTab, setActiveTab] = useState<ProjectViewFilter>("Active");
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [toast, setToast] = useState<PanelToast | null>(null);
  const [editing, setEditing] = useState<DbProject | null>(null);
  const [showAdd, setShowAdd] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);

  const showToast = useCallback((message: string, variant: ToastVariant = "error") => {
    setToast({ message, variant });
  }, []);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);

    try {
      setProjectsList(await fetchAllProjectsAdmin());
    } catch (error) {
      const message = formatProjectSaveError(error);
      setLoadError(message);
      setProjectsList([]);
      showToast(message);
    } finally {
      setLoading(false);
    }
  }, [showToast]);

  useEffect(() => {
    load();
  }, [load]);

  const displayedProjects = useMemo(() => {
    return projectsList.filter((item) => {
      const isArchived = Boolean(
        item.is_archived === true ||
          String(item.is_archived) === "true" ||
          item.status === "Archived"
      );

      if (activeTab === "Archived") return isArchived;
      if (activeTab === "Active") return !isArchived;
      return true;
    });
  }, [projectsList, activeTab]);

  const syncSidebarProjectCache = useCallback((list: DbProject[]) => {
    setProjectsCache(filterActiveProjects(list));
  }, []);

  const handleSaved = (updated?: DbProject) => {
    showToast("Project saved successfully.", "success");
    if (updated) {
      setProjectsList((current) => {
        const index = current.findIndex((row) => row.id === updated.id);
        const next =
          index === -1
            ? [updated, ...current]
            : current.map((row, i) => (i === index ? updated : row));
        syncSidebarProjectCache(next);
        return next;
      });
    } else {
      void load();
    }
    onProjectsChanged();
  };

  const handleSaveError = useCallback(
    (message: string) => {
      showToast(message, "error");
    },
    [showToast]
  );

  const handleArchiveToggle = async (project: DbProject) => {
    const nextArchivedState = !(
      project.is_archived === true || project.status === "Archived"
    );
    const nextStatus = nextArchivedState ? "Archived" : "Active";
    const snapshot = project;

    setActionId(project.id);

    setProjectsList((prev) =>
      prev.map((p) =>
        p.id === project.id
          ? {
              ...p,
              is_archived: nextArchivedState,
              status: nextStatus,
              is_active: !nextArchivedState,
            }
          : p
      )
    );

    try {
      const { error } = await supabase
        .from("projects")
        .update({
          is_archived: nextArchivedState,
          status: nextStatus,
          is_active: !nextArchivedState,
        })
        .eq("id", project.id);

      if (error) {
        setProjectsList((prev) =>
          prev.map((p) => (p.id === project.id ? snapshot : p))
        );
        showToast(formatProjectSaveError(error));
        return;
      }

      setProjectsList((prev) => {
        syncSidebarProjectCache(prev);
        return prev;
      });

      showToast(
        nextArchivedState
          ? `"${project.name}" archived.`
          : `"${project.name}" restored to active.`,
        "success"
      );
    } catch (error) {
      setProjectsList((prev) =>
        prev.map((p) => (p.id === project.id ? snapshot : p))
      );
      showToast(formatProjectSaveError(error));
    } finally {
      setActionId(null);
    }
  };

  const workerName = (id: string) =>
    workers.find((w) => w.id === id)?.full_name ?? id.slice(0, 8);

  return (
    <div>
      <div className="mb-6 flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Projects <span className="text-orange-500">Management</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage active and archived projects. Active projects sync to the sidebar.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAdd(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Project
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TAB_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setActiveTab(tab.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              activeTab === tab.id
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      {loadError && (
        <p
          role="alert"
          className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800"
        >
          {loadError}
        </p>
      )}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading projects…
        </div>
      ) : displayedProjects.length === 0 ? (
        <p className={`p-6 text-sm text-slate-500 ${cardClass}`}>
          {activeTab === "Active"
            ? "No active projects. Add a project or restore one from Archived."
            : activeTab === "Archived"
              ? "No archived projects."
              : "No projects yet. Add your first project to populate the sidebar."}
        </p>
      ) : (
        <ul className="space-y-3">
          {displayedProjects.map((project) => {
            const archived = isProjectListItemArchived(project);

            return (
              <li key={project.id} className={cn(cardClass, "p-4")}>
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">{project.name}</p>
                      {activeTab === "All" && (
                        <span
                          className={cn(
                            "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                            archived
                              ? "bg-slate-100 text-slate-600"
                              : "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {archived ? "Archived" : "Active"}
                        </span>
                      )}
                    </div>
                    {project.project_code && (
                      <p className="mt-0.5 text-xs font-medium text-slate-500">
                        Code: {project.project_code}
                      </p>
                    )}
                    {project.client && (
                      <p className="mt-0.5 text-sm text-slate-600">
                        Client: {project.client}
                      </p>
                    )}
                    {project.location && (
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-slate-500">
                        <MapPin className="h-3.5 w-3.5 shrink-0" />
                        {project.location}
                      </p>
                    )}
                    <p className="mt-2 text-xs text-slate-500">
                      Managers:{" "}
                      {project.project_managers.length > 0
                        ? project.project_managers.map(workerName).join(", ")
                        : "None"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Administrators:{" "}
                      {(project.project_administrators.length > 0
                        ? project.project_administrators
                        : project.project_admins
                      ).map(workerName).join(", ") || "None"}
                    </p>
                    <p className="text-xs text-slate-500">
                      Workers:{" "}
                      {project.assigned_workers.length > 0
                        ? `${project.assigned_workers.length} assigned`
                        : "None"}
                    </p>
                  </div>
                  <div className="flex shrink-0 items-center gap-1">
                    <button
                      type="button"
                      onClick={() => setEditing(project)}
                      className="rounded-lg border border-slate-200 p-2 text-slate-600 hover:border-orange-300 hover:text-orange-600"
                      aria-label={`Edit ${project.name}`}
                    >
                      <Pencil className="h-4 w-4" />
                    </button>
                    <button
                      type="button"
                      disabled={actionId === project.id}
                      onClick={() => void handleArchiveToggle(project)}
                      className={cn(
                        "rounded-lg border p-2 transition disabled:opacity-50",
                        archived
                          ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                          : "border-slate-200 text-slate-600 hover:border-amber-300 hover:text-amber-700"
                      )}
                      aria-label={
                        archived ? `Unarchive ${project.name}` : `Archive ${project.name}`
                      }
                    >
                      {actionId === project.id ? (
                        <Loader2 className="h-4 w-4 animate-spin" />
                      ) : archived ? (
                        <ArchiveRestore className="h-4 w-4" />
                      ) : (
                        <Archive className="h-4 w-4" />
                      )}
                    </button>
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}

      {(showAdd || editing) && (
        <ProjectFormModal
          workers={workers}
          project={editing}
          onClose={() => {
            setShowAdd(false);
            setEditing(null);
          }}
          onSaved={handleSaved}
          onError={handleSaveError}
        />
      )}

      {toast && (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      )}
    </div>
  );
}
