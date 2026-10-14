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
  fetchAllFormWorkerAssignments,
  fetchInductionForms,
  filterInductionForms,
  formatInductionFormUpdatedAt,
  type FormWorkerAssignment,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import {
  formatComplianceReminderToast,
  postComplianceReminders,
  postComplianceRemindersGrouped,
} from "@/lib/compliance-tracking-client";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import ConfirmDeletionDialog from "@/components/ui/ConfirmDeletionDialog";
import AssignFormModal from "@/components/administration/forms/AssignFormModal";
import InductionTrackerModal from "@/components/administration/forms/InductionTrackerModal";
import InductionAssignmentDetailModal from "@/components/administration/forms/InductionAssignmentDetailModal";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import ComplianceTrackingPanel, {
  type ComplianceTrackingRow,
} from "@/components/administration/ComplianceTrackingPanel";
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

function trackingWorkerName(
  workers: Worker[],
  workerId: string,
  fallback: string
): string {
  const worker = workers.find((row) => row.id === workerId);
  if (!worker) return fallback;
  return getWorkerDisplayName(worker, fallback);
}

function formForAssignment(
  assignment: FormWorkerAssignment,
  forms: InductionFormTemplate[]
): InductionFormTemplate {
  const found = forms.find((form) => form.id === assignment.form_id);
  if (found) return found;
  const blocks = assignment.blocks ?? assignment.schema_fields ?? [];
  return {
    id: assignment.form_id,
    title: assignment.form_title ?? "Induction",
    description: null,
    form_type: "Induction",
    scope: assignment.project_id ? "project" : "company",
    project_id: assignment.project_id,
    status: "active",
    blocks,
    schema_fields: blocks,
    logic_rules: assignment.logic_rules ?? [],
    copied_from_id: null,
    created_at: assignment.assigned_at,
    updated_at: assignment.completed_at ?? assignment.assigned_at,
  };
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
  const [assignTarget, setAssignTarget] = useState<InductionFormTemplate | null>(null);
  const [trackerTarget, setTrackerTarget] = useState<InductionFormTemplate | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [formToDelete, setFormToDelete] = useState<InductionFormTemplate | null>(null);
  const [actionError, setActionError] = useState<string | null>(null);
  const [successMessage, setSuccessMessage] = useState<string | null>(null);
  const [assignments, setAssignments] = useState<FormWorkerAssignment[]>([]);
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [assignmentsError, setAssignmentsError] = useState<string | null>(null);
  const [remindingId, setRemindingId] = useState<string | null>(null);
  const [remindingAll, setRemindingAll] = useState(false);
  const [resultAssignment, setResultAssignment] = useState<FormWorkerAssignment | null>(null);

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

  const loadAssignments = useCallback(async (options?: { silent?: boolean }) => {
    if (!options?.silent) setAssignmentsLoading(true);
    try {
      const { assignments: rows, error } = await fetchAllFormWorkerAssignments();
      setAssignments(rows);
      setAssignmentsError(error);
    } catch (cause) {
      setAssignments([]);
      setAssignmentsError(
        cause instanceof Error ? cause.message : "Failed to load induction assignments."
      );
    } finally {
      if (!options?.silent) setAssignmentsLoading(false);
    }
  }, []);

  useEffect(() => {
    void loadForms();
  }, [loadForms]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

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

  const trackingRows = useMemo<ComplianceTrackingRow[]>(() => {
    const titleById = new Map(forms.map((form) => [form.id, form.title]));
    return assignments.map((assignment) => {
      const completed = assignment.status === "completed" || Boolean(assignment.completed_at);
      const fallbackName = assignment.worker_name?.trim() || "Unknown worker";
      return {
        id: assignment.id,
        documentId: assignment.form_id,
        documentTitle:
          titleById.get(assignment.form_id) ??
          assignment.form_title ??
          "Induction",
        workerId: assignment.worker_id,
        workerName: trackingWorkerName(workers, assignment.worker_id, fallbackName),
        assignedAt: assignment.assigned_at,
        completedAt: assignment.completed_at,
        status: completed ? "Completed" : "Pending",
        canRemind: !completed && Boolean(assignment.worker_id),
      };
    });
  }, [assignments, forms, workers]);

  const resultForm = useMemo(() => {
    if (!resultAssignment) return null;
    return formForAssignment(resultAssignment, forms);
  }, [resultAssignment, forms]);

  const handleRemind = async (row: ComplianceTrackingRow) => {
    setRemindingId(row.id);
    try {
      const result = await postComplianceReminders({
        kind: "induction",
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
      const result = await postComplianceRemindersGrouped("induction", pendingRows);
      if (!result.ok) {
        showError(result.error ?? "Could not send reminders.");
        return;
      }
      showSuccess(formatComplianceReminderToast(result));
    } finally {
      setRemindingAll(false);
    }
  };

  const handleViewResults = (row: ComplianceTrackingRow) => {
    const assignment = assignments.find((item) => item.id === row.id) ?? null;
    setResultAssignment(assignment);
  };

  const openCreate = (event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    router.push("/admin/forms/inductions/new");
  };

  const openEdit = (form: InductionFormTemplate, event?: MouseEvent<HTMLButtonElement>) => {
    event?.preventDefault();
    event?.stopPropagation();
    const id = form.id?.trim();
    if (!id) {
      showError("Failed to load induction data. Missing form id.");
      return;
    }
    router.push(`/admin/forms/inductions/${id}/edit`);
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
      await loadAssignments({ silent: true });
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

  const handleAssigned = () => {
    const message = "Form assigned successfully!";
    setSuccessMessage(message);
    showSuccess(message);
    void loadAssignments({ silent: true });
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
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-medium text-slate-900">{form.title}</p>
                          {form.is_system_template ? (
                            <span className="rounded-full bg-sky-100 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              System
                            </span>
                          ) : null}
                        </div>
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
                              setFormToDelete(form);
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

      <ComplianceTrackingPanel
        kind="induction"
        title="Induction completion tracking"
        rows={trackingRows}
        loading={assignmentsLoading}
        error={assignmentsError}
        remindingId={remindingId}
        remindingAll={remindingAll}
        onViewResults={handleViewResults}
        onRemind={(row) => void handleRemind(row)}
        onRemindAllPending={(rows) => void handleRemindAllPending(rows)}
      />

      {trackerTarget ? (
        <InductionTrackerModal
          form={trackerTarget}
          workers={workers}
          projects={projects}
          assignedByUser={assignedByUser}
          onClose={() => setTrackerTarget(null)}
        />
      ) : null}

      {resultAssignment && resultForm ? (
        <InductionAssignmentDetailModal
          assignment={resultAssignment}
          form={resultForm}
          workerLabel={trackingWorkerName(
            workers,
            resultAssignment.worker_id,
            resultAssignment.worker_name ?? "Worker"
          )}
          onClose={() => setResultAssignment(null)}
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

      <ConfirmDeletionDialog
        open={formToDelete !== null}
        confirming={Boolean(formToDelete && actionId === formToDelete.id)}
        onCancel={() => setFormToDelete(null)}
        onConfirm={async () => {
          if (!formToDelete) return;
          await handleDelete(formToDelete);
          setFormToDelete(null);
        }}
      />

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
