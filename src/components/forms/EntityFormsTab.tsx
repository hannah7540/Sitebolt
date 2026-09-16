"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { ClipboardList, Loader2, Plus, Search } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { useAdminConsoleOptional } from "@/contexts/AdminConsoleContext";
import FormFillDrawer from "@/components/forms/FormFillDrawer";
import FormSubmissionDetailModal from "@/components/forms/FormSubmissionDetailModal";
import {
  fetchCustomFormSubmissions,
  fetchCustomFormTemplates,
  formatFormDate,
  insertCustomFormSubmission,
  templateAppliesTo,
  type CustomFormAnswers,
  type CustomFormEntityType,
  type CustomFormSubmission,
  type CustomFormTemplate,
} from "@/lib/custom-forms";
import { DEFAULT_ADMIN_PROFILE_NAME, getAdminWorkerId } from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

interface EntityFormsTabProps {
  entityType: CustomFormEntityType;
  entityId: string;
  projectId?: string | null;
  compact?: boolean;
}

export default function EntityFormsTab({
  entityType,
  entityId,
  projectId = null,
  compact = false,
}: EntityFormsTabProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const consoleContext = useAdminConsoleOptional();
  const [templates, setTemplates] = useState<CustomFormTemplate[]>([]);
  const [submissions, setSubmissions] = useState<CustomFormSubmission[]>([]);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [pickerOpen, setPickerOpen] = useState(false);
  const [filling, setFilling] = useState<CustomFormTemplate | null>(null);
  const [fillError, setFillError] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [viewing, setViewing] = useState<CustomFormSubmission | null>(null);

  const submitter = useMemo(() => {
    const workerId = consoleContext?.adminWorkerId ?? getAdminWorkerId();
    const worker = (consoleContext?.workers ?? []).find((item) => item.id === workerId);
    return {
      id: workerId,
      name: worker ? getWorkerDisplayName(worker) : DEFAULT_ADMIN_PROFILE_NAME,
    };
  }, [consoleContext]);

  const load = useCallback(async () => {
    setLoading(true);
    setLoadError(null);
    const [templateResult, submissionResult] = await Promise.all([
      fetchCustomFormTemplates(),
      fetchCustomFormSubmissions({
        projectId: entityType === "project" ? entityId : undefined,
        plantId: entityType === "plant" ? entityId : undefined,
        workerId: entityType === "worker" ? entityId : undefined,
        fleetId: entityType === "fleet" ? entityId : undefined,
        assetId: entityType === "asset" ? entityId : undefined,
        includeAssignedPlant: entityType === "project",
      }),
    ]);
    if (templateResult.error) setLoadError(templateResult.error);
    if (submissionResult.error) setLoadError(submissionResult.error);
    setTemplates(templateResult.data.filter((template) => template.is_active));
    setSubmissions(submissionResult.data);
    setLoading(false);
  }, [entityId, entityType, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const availableTemplates = useMemo(
    () => templates.filter((template) => templateAppliesTo(template, entityType)),
    [entityType, templates]
  );

  const filteredSubmissions = useMemo(() => {
    const query = search.trim().toLowerCase();
    if (!query) return submissions;
    return submissions.filter((submission) =>
      [submission.template_title, submission.submitted_by_name]
        .filter(Boolean)
        .some((value) => String(value).toLowerCase().includes(query))
    );
  }, [search, submissions]);

  const handleSubmit = async (payload: {
    answers: CustomFormAnswers;
    signatureUrl: string | null;
  }) => {
    if (!filling) return;
    setSaving(true);
    setFillError(null);
    const result = await insertCustomFormSubmission({
      template_id: filling.id,
      template_title: filling.title,
      project_id: entityType === "project" ? entityId : projectId,
      plant_id: entityType === "plant" ? entityId : null,
      worker_id: entityType === "worker" ? entityId : null,
      fleet_id: entityType === "fleet" ? entityId : null,
      asset_id: entityType === "asset" ? entityId : null,
      answers: payload.answers,
      submitted_by_name: submitter.name,
      submitted_by_id: submitter.id,
      signature_url: payload.signatureUrl,
    });
    setSaving(false);
    if (result.error || !result.data) {
      setFillError(result.error ?? "Submission failed.");
      return;
    }
    setSubmissions((current) => [result.data!, ...current]);
    setFilling(null);
    setPickerOpen(false);
    showSuccess("Form submitted.");
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h3 className="text-lg font-semibold text-slate-900">Forms</h3>
          <p className="text-sm text-slate-500">
            Historical submissions for this {entityType}.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setPickerOpen((open) => !open)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Fill New Form
        </button>
      </div>

      {pickerOpen ? (
        <div className={cn(cardClass, "p-4")}>
          <p className="text-sm font-semibold text-slate-800">Select a template</p>
          {availableTemplates.length === 0 ? (
            <p className="mt-2 text-sm text-slate-500">
              No active templates apply to this {entityType}. Create one under Organisation → Forms.
            </p>
          ) : (
            <div className="mt-3 grid gap-2">
              {availableTemplates.map((template) => (
                <button
                  key={template.id}
                  type="button"
                  onClick={() => {
                    setFillError(null);
                    setFilling(template);
                  }}
                  className="rounded-lg border border-slate-200 bg-white px-3 py-2 text-left text-sm font-medium text-slate-800 hover:border-orange-300 hover:bg-orange-50"
                >
                  {template.title}
                  {template.description ? (
                    <span className="mt-0.5 block text-xs font-normal text-slate-500">
                      {template.description}
                    </span>
                  ) : null}
                </button>
              ))}
            </div>
          )}
        </div>
      ) : null}

      <div className="relative max-w-sm">
        <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
        <input
          className={cn(inputClass, "pl-9")}
          placeholder="Search submissions"
          value={search}
          onChange={(event) => setSearch(event.target.value)}
          onKeyDown={(event) => {
            if (event.key === "Enter") event.preventDefault();
          }}
        />
      </div>

      {loadError ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {loadError}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading forms…
        </div>
      ) : filteredSubmissions.length === 0 ? (
        <div className={cn(cardClass, "flex items-center gap-3 p-6 text-sm text-slate-500")}>
          <ClipboardList className="h-5 w-5 text-slate-400" />
          No form submissions yet.
        </div>
      ) : (
        <div className={cn(cardClass, compact ? "overflow-hidden" : "overflow-x-auto")}>
          <table className="min-w-full text-left text-sm">
            <thead className="bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Form</th>
                <th className="px-4 py-3">Submitted</th>
                <th className="px-4 py-3">By</th>
              </tr>
            </thead>
            <tbody>
              {filteredSubmissions.map((submission) => (
                <tr
                  key={submission.id}
                  className="cursor-pointer border-t border-slate-100 hover:bg-orange-50"
                  onClick={() => setViewing(submission)}
                >
                  <td className="px-4 py-3 font-medium text-slate-900">
                    {submission.template_title}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {formatFormDate(submission.submitted_at)}
                  </td>
                  <td className="px-4 py-3 text-slate-600">
                    {submission.submitted_by_name ?? "—"}
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      <FormFillDrawer
        open={Boolean(filling)}
        template={filling}
        entityType={entityType}
        entityId={entityId}
        projectId={projectId}
        saving={saving}
        error={fillError}
        onClose={() => setFilling(null)}
        onSubmit={handleSubmit}
      />
      <FormSubmissionDetailModal
        open={Boolean(viewing)}
        submission={viewing}
        onClose={() => setViewing(null)}
      />
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
