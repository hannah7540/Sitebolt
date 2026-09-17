"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  FileText,
  ImageIcon,
  Loader2,
  PenLine,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  CUSTOM_FORM_ASSIGNEE_ROLES,
  CUSTOM_FORM_QUESTION_TYPES,
  CUSTOM_FORM_TARGET_KEYS,
  createEmptyFormField,
  createEmptyMedia,
  createEmptyStatement,
  emptyTemplateDraft,
  resolveTemplateAssigneeRole,
  type CustomFormField,
  type CustomFormQuestionType,
  type CustomFormTemplate,
  type CustomFormTemplateInput,
} from "@/lib/custom-forms";
import { uploadCustomFormAttachment } from "@/lib/custom-form-upload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface FormBuilderDrawerProps {
  open: boolean;
  template?: CustomFormTemplate | null;
  readOnly?: boolean;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSave?: (input: CustomFormTemplateInput) => Promise<void> | void;
}

function fieldNeedsOptions(field: CustomFormField): boolean {
  return field.kind === "question" && (field.type === "select" || field.type === "checkbox");
}

function isImageFile(file: File): boolean {
  if (file.type.startsWith("image/")) return true;
  return /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name);
}

export default function FormBuilderDrawer({
  open,
  template,
  readOnly = false,
  saving = false,
  error = null,
  onClose,
  onSave,
}: FormBuilderDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [draft, setDraft] = useState<CustomFormTemplateInput>(emptyTemplateDraft());
  const [optionDrafts, setOptionDrafts] = useState<Record<string, string>>({});
  const [localError, setLocalError] = useState<string | null>(null);
  const [addMenu, setAddMenu] = useState<"closed" | "root" | "questions" | "static">(
    "closed"
  );
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const templateKey = template?.id ?? "new-template";

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    setAddMenu("closed");
    if (template) {
      setDraft({
        title: template.title,
        description: template.description ?? "",
        applies_to_projects: template.applies_to_projects,
        applies_to_workers: template.applies_to_workers,
        applies_to_plant: template.applies_to_plant,
        applies_to_fleet: template.applies_to_fleet,
        applies_to_assets: template.applies_to_assets,
        assignee_role: resolveTemplateAssigneeRole(template),
        is_active: template.is_active,
        fields: template.fields.map((field) => ({
          ...field,
          options: [...(field.options ?? [])],
        })),
      });
      return;
    }
    setDraft(emptyTemplateDraft());
  }, [open, template]);

  const title = useMemo(() => {
    if (readOnly) return "View Form Template";
    return template ? "Edit Form Template" : "Add New Form";
  }, [readOnly, template]);

  if (!open || !mounted) return null;

  const updateField = (id: string, patch: Partial<CustomFormField>) => {
    setDraft((current) => ({
      ...current,
      fields: current.fields.map((field) =>
        field.id === id ? { ...field, ...patch } : field
      ),
    }));
  };

  const addField = (field: CustomFormField) => {
    setDraft((current) => ({ ...current, fields: [...current.fields, field] }));
    setAddMenu("closed");
  };

  const moveField = (index: number, direction: -1 | 1) => {
    setDraft((current) => {
      const nextIndex = index + direction;
      if (nextIndex < 0 || nextIndex >= current.fields.length) return current;
      const fields = [...current.fields];
      const [item] = fields.splice(index, 1);
      fields.splice(nextIndex, 0, item);
      return { ...current, fields };
    });
  };

  const handleMediaUpload = async (field: CustomFormField, file: File | undefined) => {
    if (!file) return;
    setUploadingFieldId(field.id);
    setLocalError(null);
    const uploaded = await uploadCustomFormAttachment({
      file,
      submissionKey: `template-${templateKey}`,
      fieldId: field.id,
    });
    setUploadingFieldId(null);
    if (uploaded.error || !uploaded.url) {
      setLocalError(uploaded.error ?? "File upload failed.");
      return;
    }
    updateField(field.id, {
      file_url: uploaded.url,
      file_name: file.name,
      file_type: isImageFile(file) ? "image" : "doc",
      label: field.caption?.trim() || file.name,
    });
  };

  const handleSave = async () => {
    if (readOnly || !onSave) return;
    const titleValue = draft.title.trim();
    if (!titleValue) {
      setLocalError("Form title is required.");
      return;
    }
    const hasTarget =
      draft.applies_to_projects ||
      draft.applies_to_workers ||
      draft.applies_to_plant ||
      draft.applies_to_fleet ||
      draft.applies_to_assets;
    if (!hasTarget) {
      setLocalError("Select at least one target: Projects, People, Plant, Fleet, or Assets.");
      return;
    }
    if (!draft.fields.length) {
      setLocalError("Add at least one question or static content block.");
      return;
    }
    const unlabeledQuestion = draft.fields.find(
      (field) => field.kind === "question" && !field.label.trim()
    );
    if (unlabeledQuestion) {
      setLocalError("Every question needs a label / prompt.");
      return;
    }
    const emptyStatement = draft.fields.find(
      (field) => field.kind === "statement" && !field.text?.trim()
    );
    if (emptyStatement) {
      setLocalError("Text statements need a notice or instructions.");
      return;
    }
    const emptyMedia = draft.fields.find(
      (field) => field.kind === "media" && !field.file_url
    );
    if (emptyMedia) {
      setLocalError("Embedded files need an uploaded PDF, image, or CAD export.");
      return;
    }
    const missingOptions = draft.fields.find(
      (field) => fieldNeedsOptions(field) && field.options.length === 0
    );
    if (missingOptions) {
      setLocalError(`Add options for "${missingOptions.label}".`);
      return;
    }
    setLocalError(null);
    await onSave({
      ...draft,
      title: titleValue,
      description: draft.description?.trim() || "",
      fields: draft.fields,
    });
  };

  const addOption = (field: CustomFormField) => {
    const next = (optionDrafts[field.id] ?? "").trim();
    if (!next || field.options.includes(next)) return;
    updateField(field.id, { options: [...field.options, next] });
    setOptionDrafts((current) => ({ ...current, [field.id]: "" }));
  };

  return createPortal(
    <div className={modalOverlayClass} role="dialog" aria-modal="true" aria-labelledby="form-builder-title">
      <div className={cn(modalShellClass, "max-w-3xl")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="form-builder-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Add questions for workers to answer, or static notices and files for them to read.
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          <div className="space-y-4">
            <label className="block">
              <span className={labelClass}>Form Title *</span>
              <input
                className={inputClass}
                value={draft.title}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, title: event.target.value }))
                }
                disabled={readOnly}
                required
              />
            </label>
            <label className="block">
              <span className={labelClass}>Description</span>
              <textarea
                className={cn(inputClass, "min-h-[80px]")}
                value={draft.description ?? ""}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, description: event.target.value }))
                }
                disabled={readOnly}
              />
            </label>

            <div>
              <p className={labelClass}>Targets *</p>
              <div className="mt-2 flex flex-wrap gap-3">
                {CUSTOM_FORM_TARGET_KEYS.map((target) => (
                  <label key={target.key} className="inline-flex items-center gap-2 text-sm text-slate-700">
                    <input
                      type="checkbox"
                      checked={draft[target.key]}
                      disabled={readOnly}
                      onChange={(event) =>
                        setDraft((current) => ({
                          ...current,
                          [target.key]: event.target.checked,
                        }))
                      }
                    />
                    {target.label === "Worker"
                      ? "People (Workers)"
                      : target.label === "Plant"
                        ? "Plant"
                        : `${target.label}s`}
                  </label>
                ))}
              </div>
            </div>

            <label className="block max-w-xs">
              <span className={labelClass}>Assignee / Target Role</span>
              <select
                className={inputClass}
                value={draft.assignee_role}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft((current) => ({
                    ...current,
                    assignee_role: event.target.value as CustomFormTemplateInput["assignee_role"],
                  }))
                }
              >
                {CUSTOM_FORM_ASSIGNEE_ROLES.map((role) => (
                  <option key={role.value} value={role.value}>
                    {role.label}
                  </option>
                ))}
              </select>
            </label>

            <label className="inline-flex items-center gap-2 text-sm text-slate-700">
              <input
                type="checkbox"
                checked={draft.is_active !== false}
                disabled={readOnly}
                onChange={(event) =>
                  setDraft((current) => ({ ...current, is_active: event.target.checked }))
                }
              />
              Active template
            </label>
          </div>

          <div className="mt-8 space-y-4">
            <div className="flex flex-wrap items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Form Content</h3>
              {!readOnly ? (
                <div className="relative">
                  <button
                    type="button"
                    onClick={() =>
                      setAddMenu((current) => (current === "closed" ? "root" : "closed"))
                    }
                    className="inline-flex items-center gap-1 rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white hover:bg-orange-600"
                  >
                    <Plus className="h-4 w-4" />
                    Add Element
                  </button>
                  {addMenu !== "closed" ? (
                    <div className="absolute right-0 z-20 mt-2 w-64 rounded-xl border border-slate-200 bg-white p-2 shadow-lg">
                      {addMenu === "root" ? (
                        <>
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-orange-50"
                            onClick={() => setAddMenu("questions")}
                          >
                            Add a Question
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">
                              Text, choice, checkbox, upload, or signature
                            </span>
                          </button>
                          <button
                            type="button"
                            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-orange-50"
                            onClick={() => setAddMenu("static")}
                          >
                            Add Static Content
                            <span className="mt-0.5 block text-xs font-normal text-slate-500">
                              Notices, instructions, or reference files
                            </span>
                          </button>
                        </>
                      ) : addMenu === "questions" ? (
                        <>
                          <p className="px-3 py-1 text-[11px] font-semibold uppercase tracking-wide text-slate-500">
                            Questions / Inputs
                          </p>
                          {CUSTOM_FORM_QUESTION_TYPES.map((item) => (
                            <button
                              key={item.type}
                              type="button"
                              className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-orange-50"
                              onClick={() => addField(createEmptyFormField(item.type))}
                            >
                              {item.type === "signature" ? (
                                <span className="inline-flex items-center gap-2">
                                  <PenLine className="h-3.5 w-3.5 text-orange-500" />
                                  Signature
                                </span>
                              ) : item.type === "checkbox" ? (
                                "Checkbox"
                              ) : item.type === "upload" ? (
                                "Upload File/Image"
                              ) : (
                                item.label
                              )}
                            </button>
                          ))}
                          <button
                            type="button"
                            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
                            onClick={() => setAddMenu("root")}
                          >
                            ← Back
                          </button>
                        </>
                      ) : (
                        <>
                          <button
                            type="button"
                            className="w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-orange-50"
                            onClick={() => addField(createEmptyStatement())}
                          >
                            Text Statement / Notice
                          </button>
                          <button
                            type="button"
                            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-sm font-medium text-slate-800 hover:bg-orange-50"
                            onClick={() => addField(createEmptyMedia())}
                          >
                            Embed File or Image
                          </button>
                          <button
                            type="button"
                            className="mt-1 w-full rounded-lg px-3 py-2 text-left text-xs text-slate-500 hover:bg-slate-50"
                            onClick={() => setAddMenu("root")}
                          >
                            ← Back
                          </button>
                        </>
                      )}
                    </div>
                  ) : null}
                </div>
              ) : null}
            </div>

            {draft.fields.length === 0 ? (
              <p className="rounded-xl border border-dashed border-slate-300 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
                No content yet. Add a question or static content block.
              </p>
            ) : null}

            {draft.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">
                    {field.kind === "question"
                      ? field.type === "signature"
                        ? `Signature ${index + 1}`
                        : `Question ${index + 1}`
                      : field.kind === "statement"
                        ? `Statement ${index + 1}`
                        : `File ${index + 1}`}
                  </p>
                  {!readOnly ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                        aria-label="Move block up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === draft.fields.length - 1}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                        aria-label="Move block down"
                      >
                        <ChevronDown className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() =>
                          setDraft((current) => ({
                            ...current,
                            fields: current.fields.filter((item) => item.id !== field.id),
                          }))
                        }
                        className="rounded-md p-1.5 text-red-500 hover:bg-white"
                        aria-label="Remove block"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                {field.kind === "question" ? (
                  <>
                    <label className="block">
                      <span className={labelClass}>
                        {field.type === "signature" ? "Field Label *" : "Question Label / Prompt *"}
                      </span>
                      <input
                        className={inputClass}
                        value={field.label}
                        disabled={readOnly}
                        placeholder={
                          field.type === "signature"
                            ? 'e.g. "Operator Signature", "Supervisor Sign-off", "Client Acceptance"'
                            : 'e.g. "Is the perimeter fenced?"'
                        }
                        onChange={(event) => updateField(field.id, { label: event.target.value })}
                      />
                    </label>
                    <div className="grid gap-3 sm:grid-cols-2">
                      <label className="block">
                        <span className={labelClass}>Response Type</span>
                        <select
                          className={inputClass}
                          value={field.type}
                          disabled={readOnly}
                          onChange={(event) => {
                            const type = event.target.value as CustomFormQuestionType;
                            updateField(field.id, {
                              type,
                              options: fieldNeedsOptions({ ...field, type })
                                ? field.options.length
                                  ? field.options
                                  : ["Option 1"]
                                : [],
                            });
                          }}
                        >
                          {CUSTOM_FORM_QUESTION_TYPES.map((item) => (
                            <option key={item.type} value={item.type}>
                              {item.label}
                            </option>
                          ))}
                        </select>
                      </label>
                      <label className="flex items-end gap-2 pb-2 text-sm text-slate-700">
                        <input
                          type="checkbox"
                          checked={field.required}
                          disabled={readOnly}
                          onChange={(event) =>
                            updateField(field.id, { required: event.target.checked })
                          }
                        />
                        {field.type === "signature" ? "Required (Yes / No)" : "Required"}
                      </label>
                    </div>
                    {field.type === "signature" ? (
                      <div className="flex h-28 flex-col items-center justify-center gap-2 rounded-lg border-2 border-dashed border-orange-300 bg-white text-orange-700">
                        <PenLine className="h-6 w-6" />
                        <p className="text-xs font-semibold uppercase tracking-wide">
                          Signature pad
                        </p>
                        <p className="text-[11px] font-medium text-orange-600/80">
                          Workers will sign here on a live canvas
                        </p>
                      </div>
                    ) : null}
                    {fieldNeedsOptions(field) ? (
                      <div>
                        <p className={labelClass}>Options</p>
                        <div className="mt-2 flex flex-wrap gap-2">
                          {field.options.map((option) => (
                            <span
                              key={option}
                              className="inline-flex items-center gap-1 rounded-full bg-white px-3 py-1 text-xs font-medium text-slate-700 ring-1 ring-slate-200"
                            >
                              {option}
                              {!readOnly ? (
                                <button
                                  type="button"
                                  className="text-slate-400 hover:text-red-500"
                                  onClick={() =>
                                    updateField(field.id, {
                                      options: field.options.filter((item) => item !== option),
                                    })
                                  }
                                  aria-label={`Remove ${option}`}
                                >
                                  <X className="h-3 w-3" />
                                </button>
                              ) : null}
                            </span>
                          ))}
                        </div>
                        {!readOnly ? (
                          <div className="mt-2 flex gap-2">
                            <input
                              className={inputClass}
                              placeholder="Add option"
                              value={optionDrafts[field.id] ?? ""}
                              onChange={(event) =>
                                setOptionDrafts((current) => ({
                                  ...current,
                                  [field.id]: event.target.value,
                                }))
                              }
                              onKeyDown={(event) => {
                                if (event.key !== "Enter") return;
                                event.preventDefault();
                                addOption(field);
                              }}
                            />
                            <button
                              type="button"
                              className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                              onClick={() => addOption(field)}
                            >
                              Add
                            </button>
                          </div>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                ) : null}

                {field.kind === "statement" ? (
                  <>
                    <label className="block">
                      <span className={labelClass}>Title / Heading</span>
                      <input
                        className={inputClass}
                        value={field.title ?? ""}
                        disabled={readOnly}
                        placeholder="Optional heading"
                        onChange={(event) =>
                          updateField(field.id, {
                            title: event.target.value,
                            label: event.target.value,
                          })
                        }
                      />
                    </label>
                    <label className="block">
                      <span className={labelClass}>Text / Instructions *</span>
                      <textarea
                        className={cn(inputClass, "min-h-[120px]")}
                        value={field.text ?? ""}
                        disabled={readOnly}
                        placeholder="Safety warnings, terms, or guidance for the worker to read."
                        onChange={(event) => updateField(field.id, { text: event.target.value })}
                      />
                    </label>
                  </>
                ) : null}

                {field.kind === "media" ? (
                  <>
                    <label className="block">
                      <span className={labelClass}>Caption / Label</span>
                      <input
                        className={inputClass}
                        value={field.caption ?? ""}
                        disabled={readOnly}
                        placeholder='e.g. "Site Evacuation Plan"'
                        onChange={(event) =>
                          updateField(field.id, {
                            caption: event.target.value,
                            label: event.target.value || field.file_name || "Media",
                          })
                        }
                      />
                    </label>
                    {!readOnly ? (
                      <label className="block">
                        <span className={labelClass}>Upload PDF, image, or CAD export</span>
                        <input
                          type="file"
                          accept=".pdf,.png,.jpg,.jpeg,.webp,.dwg,.dxf,.svg"
                          className={inputClass}
                          onChange={(event) =>
                            void handleMediaUpload(field, event.target.files?.[0])
                          }
                        />
                      </label>
                    ) : null}
                    {uploadingFieldId === field.id ? (
                      <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <Loader2 className="h-3.5 w-3.5 animate-spin" />
                        Uploading…
                      </p>
                    ) : null}
                    {field.file_url ? (
                      <div className="rounded-lg border border-slate-200 bg-white p-3">
                        {field.file_type === "image" ? (
                          // eslint-disable-next-line @next/next/no-img-element
                          <img
                            src={field.file_url}
                            alt={field.caption || field.file_name || "Embedded image"}
                            className="max-h-40 w-full rounded-md object-contain"
                          />
                        ) : (
                          <a
                            href={field.file_url}
                            target="_blank"
                            rel="noreferrer"
                            className="inline-flex items-center gap-2 text-sm font-medium text-orange-600 hover:underline"
                          >
                            <FileText className="h-4 w-4" />
                            {field.file_name || "Open document"}
                          </a>
                        )}
                      </div>
                    ) : (
                      <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                        <ImageIcon className="h-3.5 w-3.5" />
                        No file uploaded yet.
                      </p>
                    )}
                  </>
                ) : null}
              </div>
            ))}
          </div>

          {localError || error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {localError || error}
            </p>
          ) : null}
        </div>

        <div className={cn(modalStickyFooterClass, "flex justify-end gap-2 py-3")}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            {readOnly ? "Close" : "Cancel"}
          </button>
          {!readOnly ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving || Boolean(uploadingFieldId)}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Template
            </button>
          ) : null}
        </div>
      </div>
    </div>,
    document.body
  );
}
