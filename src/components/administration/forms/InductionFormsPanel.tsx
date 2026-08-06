"use client";

import { useCallback, useEffect, useMemo, useState, type MouseEvent } from "react";
import { useRouter } from "next/navigation";
import {
  ClipboardList,
  Copy,
  Loader2,
  Pencil,
  Plus,
  Search,
  Trash2,
  UserPlus,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import {
  deleteInductionForm,
  duplicateInductionForm,
  fetchInductionForms,
  filterInductionForms,
  formatInductionFormUpdatedAt,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import FormBuilderModal from "@/components/administration/forms/FormBuilderModal";
import AssignFormModal from "@/components/administration/forms/AssignFormModal";
import InductionTrackerModal from "@/components/administration/forms/InductionTrackerModal";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface InductionFormsPanelProps {
  workers: Worker[];
  projects: DbProject[];
  assignedBy?: string | null;
}

function projectLabel(projectId: string | null, projects: DbProject[]): string {
  if (!projectId) return "—";
  return projects.find((project) => project.id === projectId)?.name ?? projectId.slice(0, 8);
}

export default function InductionFormsPanel({
  workers,
  projects,
  assignedBy,
}: InductionFormsPanelProps) {
  const router = useRouter();
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [forms, setForms] = useState<InductionFormTemplate[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [projectFilterId, setProjectFilterId] = useState("");
  const [showBuilder, setShowBuilder] = useState(false);
  const [editTarget, setEditTarget] = useState<InductionFormTemplate | null>(null);
  const [assignTarget, setAssignTarget] = useState<InductionFormTemplate | null>(null);
  const [trackerTarget, setTrackerTarget] = useState<InductionFormTemplate | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);

  const loadForms = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setLoading(true);
    setActionError(null);
    try {
      const { forms: rows, error } = await fetchInductionForms();
      setForms(rows);
      if (error) {
        showError(error);
      }
    } catch (error) {
      const message =
        error instanceof Error ? error.message : "Failed to load induction forms.";
      setActionError(message);
      showError(message);
      setForms([]);
    } finally {
      if (!options?.silent) setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  const assignedByUser = useMemo(() => {
    if (!assignedBy) return { id: null, full_name: "Admin" };
    const worker = workers.find((row) => row.id === assignedBy);
    return {
      id: assignedBy,
      full_name: worker?.full_name ?? "Admin",
    };
  }, [assignedBy, workers]);

  const filteredForms = useMemo(() => {
    const needle = searchQuery.trim().toLowerCase();
    let list = filterInductionForms(forms, searchQuery, projectFilterId || null);
    if (needle) {
      list = list.filter((form) => {
        const projectName = projectLabel(form.project_id, projects).toLowerCase();
        return (
          form.title.toLowerCase().includes(needle) ||
          (form.description?.toLowerCase().includes(needle) ?? false) ||
          projectName.includes(needle)
        );
      });
    }
    return list;
  }, [forms, searchQuery, projectFilterId, projects]);

  const openCreate = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    router.push("/admin/forms/inductions/new");
  };

  const openEdit = (form: InductionFormTemplate, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    setEditTarget(form);
    setShowBuilder(true);
  };

  const handleDuplicate = async (form: InductionFormTemplate) => {
    setActionId(form.id);
    setSuccessMessage(null);
    try {
      const result = await duplicateInductionForm(form.id);
      if (result.error || !result.form) {
        const message = result.error ?? "Duplicate failed.";
        setActionError(message);
        showError(message);
        return;
      }
      setSuccessMessage(`"${result.form.title}" created as a draft copy.`);
      showSuccess(`"${result.form.title}" duplicated.`);
      await loadForms({ silent: true });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? `Could not duplicate form. ${cause.message}`
          : "Could not duplicate form. Please try again.";
      setActionError(message);
      showError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleDelete = async (form: InductionFormTemplate) => {
    if (!window.confirm(`Delete "${form.title}"? Worker assignments will also be removed.`)) {
      return;
    }
    setActionId(form.id);
    setSuccessMessage(null);
    try {
      const result = await deleteInductionForm(form.id);
      if (result.error) {
        setActionError(result.error);
        showError(result.error);
        return;
      }
      setSuccessMessage(`"${form.title}" deleted.`);
      showSuccess(`"${form.title}" deleted.`);
      await loadForms({ silent: true });
    } catch (cause) {
      const message =
        cause instanceof Error
          ? `Could not delete form. ${cause.message}`
          : "Could not delete form. Please try again.";
      setActionError(message);
      showError(message);
    } finally {
      setActionId(null);
    }
  };

  const handleSaved = (form: InductionFormTemplate) => {
    setSuccessMessage(`"${form.title}" saved.`);
    showSuccess(`"${form.title}" saved.`);
    void loadForms({ silent: true });
  };

  const handleAssigned = () => {
    const message = "Form assigned successfully!";
    setSuccessMessage(message);
    showSuccess(message);
  };

  return (
    <div className="space-y-4">
      <FormsAdminTabs active="inductions" />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-2xl font-bold text-slate-900">Induction Forms</h2>
          <p className="mt-1 text-sm text-slate-500">
            Build company-wide or project-specific inductions and assign them to workers.
          </p>
        </div>
        <button
          type="button"
          onClick={openCreate}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-4 w-4" />
          Create New Form
        </button>
      </div>

      {successMessage ? (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          {successMessage}
        </div>
      ) : null}

      {actionError ? (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {actionError}
        </div>
      ) : null}

      <div className={cn(cardClass, "p-4")}>
        <div className="mb-4 flex flex-wrap gap-3">
          <label className="relative min-w-[220px] flex-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Search by title or project…"
              className={cn(inputClass, "pl-9")}
            />
          </label>
          <select
            value={projectFilterId}
            onChange={(event) => setProjectFilterId(event.target.value)}
            className={cn(inputClass, "w-full sm:w-56")}
          >
            <option value="">All projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading form library…
          </div>
        ) : filteredForms.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">
              {forms.length === 0
                ? "No induction forms yet. Create your first template."
                : "No forms match your search."}
            </p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Form Title</th>
                  <th className="px-3 py-2 font-semibold">Type</th>
                  <th className="px-3 py-2 font-semibold">Scope</th>
                  <th className="px-3 py-2 font-semibold">Last Updated</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredForms.map((form) => {
                  const busy = actionId === form.id;
                  return (
                    <tr
                      key={form.id}
                      className="cursor-pointer border-b border-slate-100 hover:bg-orange-50/40"
                      onClick={() => setTrackerTarget(form)}
                    >
                      <td className="px-3 py-3">
                        <p className="font-medium text-slate-900">{form.title}</p>
                        {form.description ? (
                          <p className="mt-0.5 line-clamp-1 text-xs text-slate-500">
                            {form.description}
                          </p>
                        ) : null}
                      </td>
                      <td className="px-3 py-3 text-slate-600">{form.form_type}</td>
                      <td className="px-3 py-3">
                        {form.scope === "company" ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-medium text-slate-700">
                            Company
                          </span>
                        ) : (
                          <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-medium text-orange-800">
                            {projectLabel(form.project_id, projects)}
                          </span>
                        )}
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {formatInductionFormUpdatedAt(form.updated_at)}
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold uppercase",
                            form.status === "active"
                              ? "bg-emerald-100 text-emerald-800"
                              : "bg-amber-100 text-amber-800"
                          )}
                        >
                          {form.status === "active" ? "Active" : "Draft"}
                        </span>
                      </td>
                      <td className="px-3 py-3" onClick={(event) => event.stopPropagation()}>
                        <div className="flex flex-wrap justify-end gap-1">
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(event) => {
                              event.preventDefault();
                              setTrackerTarget(form);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
                          >
                            <ClipboardList className="h-3 w-3" />
                            Tracker
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(event) => openEdit(form, event)}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
                          >
                            <Pencil className="h-3 w-3" />
                            Edit
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(event) => {
                              event.preventDefault();
                              void handleDuplicate(form);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-slate-200 px-2 py-1 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600 disabled:opacity-50"
                          >
                            {busy ? (
                              <Loader2 className="h-3 w-3 animate-spin" />
                            ) : (
                              <Copy className="h-3 w-3" />
                            )}
                            Duplicate
                          </button>
                          <button
                            type="button"
                            disabled={busy || form.status !== "active"}
                            onClick={(event) => {
                              event.preventDefault();
                              setAssignTarget(form);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-orange-200 bg-orange-50 px-2 py-1 text-xs font-medium text-orange-700 hover:bg-orange-100 disabled:opacity-50"
                          >
                            <UserPlus className="h-3 w-3" />
                            Assign
                          </button>
                          <button
                            type="button"
                            disabled={busy}
                            onClick={(event) => {
                              event.preventDefault();
                              void handleDelete(form);
                            }}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 px-2 py-1 text-xs font-medium text-red-600 hover:bg-red-50 disabled:opacity-50"
                          >
                            <Trash2 className="h-3 w-3" />
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
      </div>

      {showBuilder && editTarget ? (
        <FormBuilderModal
          projects={projects}
          templates={forms}
          initialForm={editTarget}
          onClose={() => {
            setShowBuilder(false);
            setEditTarget(null);
          }}
          onSaved={handleSaved}
        />
      ) : null}

      {trackerTarget ? (
        <InductionTrackerModal
          form={trackerTarget}
          workers={workers}
          projects={projects}
          assignedByUser={assignedByUser}
          onClose={() => setTrackerTarget(null)}
        />
      ) : null}

      {assignTarget ? (
        <AssignFormModal
          form={assignTarget}
          workers={workers}
          projects={projects}
          assignedByUser={assignedByUser}
          onClose={() => setAssignTarget(null)}
          onAssigned={handleAssigned}
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
