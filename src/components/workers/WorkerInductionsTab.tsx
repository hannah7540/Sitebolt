"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  ClipboardList,
  Eye,
  Loader2,
  UserPlus,
} from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import {
  assignmentDueLabel,
  assignmentStatusBadgeClass,
  assignmentStatusLabel,
  fetchInductionFormById,
  fetchInductionForms,
  fetchWorkerInductionAssignments,
  formatInductionFormUpdatedAt,
  isCompletedAssignmentStatus,
  remindFormWorkerAssignment,
  resolveWorkerDisplayName,
  summarizeFormTemplateAssignments,
  type FormWorkerAssignment,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import AssignFormModal from "@/components/administration/forms/AssignFormModal";
import InductionAssignmentDetailModal from "@/components/administration/forms/InductionAssignmentDetailModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerInductionsTabProps {
  worker: Worker;
  workers: Worker[];
  projects: DbProject[];
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

function assignmentToFormTemplate(
  assignment: FormWorkerAssignment,
  form: InductionFormTemplate | null
): InductionFormTemplate {
  if (form) return form;

  return {
    id: assignment.form_id,
    title: assignment.form_title ?? "Induction",
    description: null,
    form_type: "Induction",
    scope: assignment.project_id ? "project" : "company",
    project_id: assignment.project_id,
    status: "active",
    blocks: assignment.blocks ?? assignment.schema_fields ?? [],
    schema_fields: assignment.schema_fields ?? assignment.blocks ?? [],
    logic_rules: assignment.logic_rules ?? [],
    copied_from_id: null,
    created_at: assignment.assigned_at,
    updated_at: assignment.assigned_at,
  };
}

export default function WorkerInductionsTab({
  worker,
  workers,
  projects,
}: WorkerInductionsTabProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [assignments, setAssignments] = useState<FormWorkerAssignment[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [actionId, setActionId] = useState<string | null>(null);
  const [detailAssignment, setDetailAssignment] = useState<FormWorkerAssignment | null>(null);
  const [detailForm, setDetailForm] = useState<InductionFormTemplate | null>(null);
  const [assignForm, setAssignForm] = useState<InductionFormTemplate | null>(null);
  const [showFormPicker, setShowFormPicker] = useState(false);
  const [availableForms, setAvailableForms] = useState<InductionFormTemplate[]>([]);
  const [loadingForms, setLoadingForms] = useState(false);

  const loadAssignments = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkerInductionAssignments({
        workerId: worker.id,
        workerEmail: worker.email,
        workerFullName: worker.full_name,
      });
      setAssignments(result.assignments);
      if (result.error) {
        setError(result.error);
        showError(result.error);
      }
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Failed to load induction assignments.";
      setError(message);
      showError(message);
      setAssignments([]);
    } finally {
      setLoading(false);
    }
  }, [worker.id, worker.email, worker.full_name, showError]);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments]);

  const summary = useMemo(
    () => summarizeFormTemplateAssignments(assignments),
    [assignments]
  );

  const openAssignPicker = async () => {
    setShowFormPicker(true);
    setLoadingForms(true);
    try {
      const { forms, error: formsError } = await fetchInductionForms();
      if (formsError) showError(formsError);
      setAvailableForms(forms.filter((form) => form.status === "active"));
    } finally {
      setLoadingForms(false);
    }
  };

  const handleRemind = async (assignment: FormWorkerAssignment) => {
    setActionId(assignment.id);
    try {
      const result = await remindFormWorkerAssignment(assignment.id);
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`Reminder sent to ${resolveWorkerDisplayName(worker)}.`);
      await loadAssignments();
    } finally {
      setActionId(null);
    }
  };

  const handleViewSubmission = async (assignment: FormWorkerAssignment) => {
    setActionId(assignment.id);
    try {
      const { form, error: formError } = await fetchInductionFormById(assignment.form_id);
      if (formError) showError(formError);
      setDetailForm(form ? assignmentToFormTemplate(assignment, form) : assignmentToFormTemplate(assignment, null));
      setDetailAssignment(assignment);
    } finally {
      setActionId(null);
    }
  };

  const handleOpenAssignForForm = async (assignment: FormWorkerAssignment) => {
    setActionId(assignment.id);
    try {
      const { form, error: formError } = await fetchInductionFormById(assignment.form_id);
      if (formError || !form) {
        showError(formError ?? "Induction form not found.");
        return;
      }
      setAssignForm(form);
    } finally {
      setActionId(null);
    }
  };

  return (
    <>
      <div className="space-y-4">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <p className="text-sm text-slate-500">
            Track induction forms assigned to {worker.full_name}, including pending and completed submissions.
          </p>
          <button
            type="button"
            onClick={() => void openAssignPicker()}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-100"
          >
            <UserPlus className="h-3.5 w-3.5" />
            Assign Induction
          </button>
        </div>

        <div className="grid gap-3 sm:grid-cols-3">
          <div className={cn(cardClass, "p-4")}>
            <p className="text-xs font-medium uppercase tracking-wide text-slate-500">
              Assigned Inductions
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
        </div>

        {error ? (
          <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading induction assignments…
          </div>
        ) : assignments.length === 0 ? (
          <div className="flex flex-col items-center gap-3 py-12 text-center">
            <ClipboardList className="h-10 w-10 text-slate-300" />
            <p className="text-sm text-slate-500">No induction assignments for this worker yet.</p>
          </div>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <th className="px-3 py-2 font-semibold">Induction Title</th>
                  <th className="px-3 py-2 font-semibold">Project Name</th>
                  <th className="px-3 py-2 font-semibold">Assigned Date</th>
                  <th className="px-3 py-2 font-semibold">Status</th>
                  <th className="px-3 py-2 font-semibold">Completion Date</th>
                  <th className="px-3 py-2 font-semibold text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const completed = isCompletedAssignmentStatus(assignment.status);
                  const busy = actionId === assignment.id;

                  return (
                    <tr key={assignment.id} className="border-b border-slate-100">
                      <td className="px-3 py-3 font-medium text-slate-900">
                        {assignment.form_title ?? "Induction"}
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
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            assignmentStatusBadgeClass(assignment.status)
                          )}
                        >
                          {assignmentStatusLabel(assignment.status)}
                        </span>
                      </td>
                      <td className="px-3 py-3 text-slate-600">
                        {assignment.completed_at
                          ? formatInductionFormUpdatedAt(assignment.completed_at)
                          : "—"}
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap justify-end gap-2">
                          {completed ? (
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleViewSubmission(assignment)}
                              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
                            >
                              {busy ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Eye className="h-3.5 w-3.5" />
                              )}
                              View Submission & Signature
                            </button>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleRemind(assignment)}
                                className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-60"
                              >
                                {busy ? (
                                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                                ) : (
                                  <Bell className="h-3.5 w-3.5" />
                                )}
                                Remind
                              </button>
                              <button
                                type="button"
                                disabled={busy}
                                onClick={() => void handleOpenAssignForForm(assignment)}
                                className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                              >
                                <UserPlus className="h-3.5 w-3.5" />
                                Assign
                              </button>
                            </>
                          )}
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

      {showFormPicker ? (
        <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/50 p-4">
          <div className={cn(cardClass, "max-h-[80vh] w-full max-w-lg overflow-y-auto p-4")}>
            <h3 className="text-lg font-bold text-slate-900">Assign Induction Form</h3>
            <p className="mt-1 text-sm text-slate-500">
              Select an induction form to assign to {worker.full_name}.
            </p>
            {loadingForms ? (
              <p className="mt-4 flex items-center gap-2 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin" /> Loading forms…
              </p>
            ) : availableForms.length === 0 ? (
              <p className="mt-4 text-sm text-slate-500">No active induction forms available.</p>
            ) : (
              <ul className="mt-4 space-y-2">
                {availableForms.map((form) => (
                  <li key={form.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setShowFormPicker(false);
                        setAssignForm(form);
                      }}
                      className="w-full rounded-lg border border-slate-200 px-3 py-2 text-left text-sm font-medium text-slate-800 hover:border-orange-300 hover:bg-orange-50"
                    >
                      {form.title}
                    </button>
                  </li>
                ))}
              </ul>
            )}
            <button
              type="button"
              onClick={() => setShowFormPicker(false)}
              className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
          </div>
        </div>
      ) : null}

      {assignForm ? (
        <AssignFormModal
          form={assignForm}
          workers={workers}
          projects={projects}
          initialSelectedWorkerIds={[worker.id]}
          onClose={() => setAssignForm(null)}
          onAssigned={() => {
            setAssignForm(null);
            showSuccess("Induction assigned successfully!");
            void loadAssignments();
          }}
        />
      ) : null}

      {detailAssignment && detailForm ? (
        <InductionAssignmentDetailModal
          assignment={detailAssignment}
          form={detailForm}
          workerLabel={resolveWorkerDisplayName(worker)}
          onClose={() => {
            setDetailAssignment(null);
            setDetailForm(null);
          }}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </>
  );
}
