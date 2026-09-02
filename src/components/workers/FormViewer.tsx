"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Loader2, X } from "lucide-react";
import FormBrandingHeader from "@/components/ui/FormBrandingHeader";
import { StableSignatureField } from "@/components/workers/StableSignaturePad";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  completeFormWorkerAssignment,
  extractInductionSignatureUrl,
  fetchInductionFormById,
  resolveAssignmentFormTemplateId,
  resolveInductionFormBlocks,
  type FormWorkerAssignment,
  type InductionFormBlock,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import {
  evaluateBlockSubmissionRules,
  validateLogicRules,
  type InductionFormAnswers,
} from "@/lib/induction-form-logic";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import ModalActionFooter from "@/components/ui/ModalActionFooter";
import PdfViewer from "@/components/documents/PdfViewer";

interface FormViewerProps {
  assignment: FormWorkerAssignment;
  onClose: () => void;
  onSubmitted: () => void;
}

function isInputBlock(block: InductionFormBlock): boolean {
  return !["section_header", "rich_text", "pdf_viewer"].includes(block.type);
}

function buildTemplateFromAssignment(
  assignment: FormWorkerAssignment,
  template?: InductionFormTemplate | null
): InductionFormTemplate | null {
  const formId = resolveAssignmentFormTemplateId(assignment);
  const blocks =
    assignment.schema_fields ??
    assignment.blocks ??
    template?.schema_fields ??
    template?.blocks ??
    [];

  if (!formId || blocks.length === 0) {
    return null;
  }

  return {
    id: formId,
    title: assignment.form_title ?? template?.title ?? "Site induction",
    description: template?.description ?? null,
    form_type: "Induction",
    scope: template?.scope ?? "company",
    project_id: assignment.project_id ?? template?.project_id ?? null,
    status: template?.status ?? "active",
    blocks,
    schema_fields: blocks,
    logic_rules: assignment.logic_rules ?? template?.logic_rules ?? [],
    copied_from_id: template?.copied_from_id ?? null,
    created_at: template?.created_at ?? assignment.assigned_at,
    updated_at: template?.updated_at ?? assignment.assigned_at,
  };
}

export default function FormViewer({
  assignment,
  onClose,
  onSubmitted,
}: FormViewerProps) {
  const [form, setForm] = useState<InductionFormTemplate | null>(null);
  const [loading, setLoading] = useState(true);
  const [answers, setAnswers] = useState<InductionFormAnswers>({});
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [highlightedFieldId, setHighlightedFieldId] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      setLoading(true);
      setError(null);

      const templateId = resolveAssignmentFormTemplateId(assignment);
      if (!templateId) {
        setForm(null);
        const message = "This induction assignment is missing a form template id.";
        setError(message);
        showError(message);
        setLoading(false);
        return;
      }

      const embeddedTemplate = buildTemplateFromAssignment(assignment);
      if (embeddedTemplate) {
        setForm(embeddedTemplate);
        setLoading(false);
        return;
      }

      const { form: template, error: fetchError } = await fetchInductionFormById(
        templateId
      );
      if (cancelled) return;

      if (fetchError) {
        showError(fetchError);
      }

      const resolvedTemplate = buildTemplateFromAssignment(assignment, template);
      if (!resolvedTemplate) {
        setForm(null);
        const message =
          fetchError ?? "Induction form schema could not be loaded for this assignment.";
        setError(message);
        if (!fetchError) {
          showError(message);
        }
      } else {
        setForm(resolvedTemplate);
      }
      setLoading(false);
    }

    void load();

    return () => {
      cancelled = true;
    };
  }, [assignment, showError]);

  const blocks = form ? resolveInductionFormBlocks(form) : [];

  const blockSubmission = useMemo(
    () => evaluateBlockSubmissionRules(form?.logic_rules ?? [], answers),
    [form?.logic_rules, answers]
  );

  const setAnswer = (fieldId: string, value: unknown) => {
    setHighlightedFieldId((current) => (current === fieldId ? null : current));
    setAnswers((current) => ({ ...current, [fieldId]: value }));
  };

  const commitSignatureAnswer = useCallback((fieldId: string, base64: string) => {
    setAnswers((current) => ({ ...current, [fieldId]: base64 }));
  }, []);

  const toggleMultiCheckbox = (fieldId: string, option: string) => {
    setAnswers((current) => {
      const existing = Array.isArray(current[fieldId]) ? (current[fieldId] as string[]) : [];
      const next = existing.includes(option)
        ? existing.filter((value) => value !== option)
        : [...existing, option];
      return { ...current, [fieldId]: next };
    });
  };

  const validateRequiredFields = (): string | null => {
    for (const block of blocks) {
      if (!block.required || !isInputBlock(block)) continue;
      const value = answers[block.id];
      if (block.type === "checkbox") {
        if (value !== true) return `"${block.label}" must be acknowledged.`;
        continue;
      }
      if (block.type === "multi_checkbox") {
        if (!Array.isArray(value) || value.length === 0) {
          return `"${block.label}" requires at least one selection.`;
        }
        continue;
      }
      if (block.type === "signature") {
        if (!value || typeof value !== "string") {
          return `"${block.label}" requires a signature.`;
        }
        continue;
      }
      if (value === undefined || value === null || String(value).trim() === "") {
        return `"${block.label}" is required.`;
      }
    }
    return null;
  };

  const scrollToField = useCallback((fieldId: string) => {
    window.requestAnimationFrame(() => {
      document
        .getElementById(`induction-field-${fieldId}`)
        ?.scrollIntoView({ behavior: "smooth", block: "center" });
    });
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const ruleError = validateLogicRules(form?.logic_rules ?? [], answers);
    if (ruleError) {
      setHighlightedFieldId(ruleError.fieldId);
      setError(ruleError.message);
      showError(ruleError.message);
      scrollToField(ruleError.fieldId);
      return;
    }

    const validationError = validateRequiredFields();
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    setError(null);
    const signatureUrl = extractInductionSignatureUrl(blocks, answers);
    const result = await completeFormWorkerAssignment(assignment.id, {
      responses: answers,
      signature_url: signatureUrl,
    });
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      showError(result.error);
      return;
    }

    showSuccess("Induction submitted successfully!");
    onSubmitted();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalShellClass, "max-w-3xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={cn(modalBodyClass, "space-y-4")}>
          <div className="flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">
                {form?.title ?? assignment.form_title ?? "Site induction"}
              </h2>
              <p className="text-sm text-slate-500">Complete all required fields to submit</p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={modalCloseIconButtonClass}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

        {loading ? (
          <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading induction form…
          </div>
        ) : !form ? (
          <p className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">
            {error ?? "Form unavailable."}
          </p>
        ) : (
          <form
            id="induction-form-viewer"
            onSubmit={(event) => void handleSubmit(event)}
            className="space-y-4"
          >
            <FormBrandingHeader
              title={form.title}
              subtitle={form.description ?? undefined}
              printFriendly={false}
            />

            {blocks.map((block) => {
              if (block.type === "section_header") {
                return (
                  <div key={block.id} className="border-b border-slate-200 pb-2">
                    <h3 className="text-base font-semibold text-slate-900">{block.label}</h3>
                    {block.content ? (
                      <p className="mt-1 text-sm text-slate-600">{block.content}</p>
                    ) : null}
                  </div>
                );
              }

              if (block.type === "rich_text") {
                return (
                  <div
                    key={block.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    {block.label ? (
                      <p className="mb-2 text-sm font-semibold text-slate-800">{block.label}</p>
                    ) : null}
                    <p className="whitespace-pre-wrap text-sm text-slate-700">
                      {block.content}
                    </p>
                  </div>
                );
              }

              if (block.type === "pdf_viewer") {
                return (
                  <div
                    key={block.id}
                    className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                  >
                    <p className="mb-2 text-sm font-semibold text-slate-800">{block.label}</p>
                    {block.pdfUrl ? (
                      <PdfViewer
                        fileUrl={block.pdfUrl}
                        title={block.label || "Induction document"}
                      />
                    ) : (
                      <p className="text-sm text-slate-500">PDF attachment unavailable.</p>
                    )}
                  </div>
                );
              }

              return (
                <div
                  key={block.id}
                  id={`induction-field-${block.id}`}
                  className={cn(
                    "rounded-xl border bg-white p-4 shadow-sm transition",
                    highlightedFieldId === block.id
                      ? "border-orange-400 ring-2 ring-orange-200"
                      : "border-slate-200"
                  )}
                >
                  <label className="block space-y-2">
                    <span className={labelClass}>
                      {block.label}
                      {block.required ? " *" : ""}
                    </span>

                    {block.type === "text_input" ? (
                      <input
                        value={String(answers[block.id] ?? "")}
                        onChange={(event) => setAnswer(block.id, event.target.value)}
                        className={inputClass}
                      />
                    ) : null}

                    {block.type === "checkbox" ? (
                      <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={answers[block.id] === true}
                          onChange={(event) => setAnswer(block.id, event.target.checked)}
                          className="rounded border-slate-300 text-orange-500"
                        />
                        {block.content || "I acknowledge"}
                      </label>
                    ) : null}

                    {block.type === "radio" ? (
                      <div className="space-y-2">
                        {(block.options ?? []).map((option) => (
                          <label
                            key={option}
                            className="flex items-center gap-2 text-sm text-slate-700"
                          >
                            <input
                              type="radio"
                              name={block.id}
                              checked={answers[block.id] === option}
                              onChange={() => setAnswer(block.id, option)}
                              className="border-slate-300 text-orange-500"
                            />
                            {option}
                          </label>
                        ))}
                      </div>
                    ) : null}

                    {block.type === "multi_checkbox" ? (
                      <div className="space-y-2">
                        {(block.options ?? []).map((option) => {
                          const selected = Array.isArray(answers[block.id])
                            ? (answers[block.id] as string[]).includes(option)
                            : false;
                          return (
                            <label
                              key={option}
                              className="flex items-center gap-2 text-sm text-slate-700"
                            >
                              <input
                                type="checkbox"
                                checked={selected}
                                onChange={() => toggleMultiCheckbox(block.id, option)}
                                className="rounded border-slate-300 text-orange-500"
                              />
                              {option}
                            </label>
                          );
                        })}
                      </div>
                    ) : null}

                    {block.type === "signature" ? (
                      <StableSignatureField
                        key={block.id}
                        fieldId={block.id}
                        onCommit={commitSignatureAnswer}
                      />
                    ) : null}
                  </label>
                </div>
              );
            })}

            {blockSubmission.blocked ? (
              <div
                role="alert"
                className="rounded-xl border border-orange-300 bg-orange-50 px-4 py-3 text-sm text-orange-900"
              >
                <div className="flex items-start gap-2">
                  <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-orange-600" />
                  <div className="space-y-1">
                    {blockSubmission.messages.map((message) => (
                      <p key={message}>{message}</p>
                    ))}
                  </div>
                </div>
              </div>
            ) : null}

            {error ? <p className="text-sm text-red-600">{error}</p> : null}
          </form>
        )}
        </div>

        <ModalActionFooter>
          <div className="flex gap-2 pb-1">
            <button
              type="button"
              onClick={onClose}
              className="flex min-h-11 flex-1 items-center justify-center rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            {!loading && form ? (
              <button
                type="submit"
                form="induction-form-viewer"
                disabled={submitting}
                className="flex min-h-11 flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:cursor-not-allowed disabled:opacity-50"
              >
                {submitting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Submit Induction
              </button>
            ) : null}
          </div>
        </ModalActionFooter>
      </div>

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
