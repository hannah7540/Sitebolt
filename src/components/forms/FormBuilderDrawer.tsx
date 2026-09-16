"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import {
  ChevronDown,
  ChevronUp,
  Loader2,
  Plus,
  Trash2,
  X,
} from "lucide-react";
import {
  CUSTOM_FORM_ASSIGNEE_ROLES,
  CUSTOM_FORM_FIELD_TYPES,
  CUSTOM_FORM_TARGET_KEYS,
  createEmptyFormField,
  emptyTemplateDraft,
  type CustomFormField,
  type CustomFormFieldType,
  type CustomFormTemplate,
  type CustomFormTemplateInput,
} from "@/lib/custom-forms";
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

function fieldNeedsOptions(type: CustomFormFieldType): boolean {
  return type === "select" || type === "multiselect";
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

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open) return;
    setLocalError(null);
    if (template) {
      setDraft({
        title: template.title,
        description: template.description ?? "",
        applies_to_projects: template.applies_to_projects,
        applies_to_workers: template.applies_to_workers,
        applies_to_plant: template.applies_to_plant,
        applies_to_fleet: template.applies_to_fleet,
        applies_to_assets: template.applies_to_assets,
        assignee_role: template.assignee_role,
        is_active: template.is_active,
        fields: template.fields.length
          ? template.fields.map((field) => ({ ...field, options: [...field.options] }))
          : [createEmptyFormField("text")],
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
    const labeledFields = draft.fields.filter((field) => field.label.trim());
    if (!labeledFields.length) {
      setLocalError("Add at least one field with a label.");
      return;
    }
    const missingOptions = labeledFields.find(
      (field) => fieldNeedsOptions(field.type) && field.options.length === 0
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
      fields: labeledFields.map((field) => ({
        ...field,
        label: field.label.trim(),
        helpText: field.helpText.trim(),
      })),
    });
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
              Configure targets, roles, and dynamic fields for this template.
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
                    {target.label === "Worker" ? "People (Workers)" : `${target.label}s`}
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
            <div className="flex items-center justify-between gap-3">
              <h3 className="text-sm font-semibold text-slate-900">Dynamic Fields</h3>
              {!readOnly ? (
                <button
                  type="button"
                  onClick={() =>
                    setDraft((current) => ({
                      ...current,
                      fields: [...current.fields, createEmptyFormField("text")],
                    }))
                  }
                  className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-3 py-1.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
                >
                  <Plus className="h-4 w-4" />
                  Add Field
                </button>
              ) : null}
            </div>

            {draft.fields.map((field, index) => (
              <div
                key={field.id}
                className="space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <p className="text-sm font-semibold text-slate-800">Field {index + 1}</p>
                  {!readOnly ? (
                    <div className="flex items-center gap-1">
                      <button
                        type="button"
                        onClick={() => moveField(index, -1)}
                        disabled={index === 0}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                        aria-label="Move field up"
                      >
                        <ChevronUp className="h-4 w-4" />
                      </button>
                      <button
                        type="button"
                        onClick={() => moveField(index, 1)}
                        disabled={index === draft.fields.length - 1}
                        className="rounded-md p-1.5 text-slate-500 hover:bg-white disabled:opacity-40"
                        aria-label="Move field down"
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
                        disabled={draft.fields.length === 1}
                        className="rounded-md p-1.5 text-red-500 hover:bg-white disabled:opacity-40"
                        aria-label="Remove field"
                      >
                        <Trash2 className="h-4 w-4" />
                      </button>
                    </div>
                  ) : null}
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block">
                    <span className={labelClass}>Field Type</span>
                    <select
                      className={inputClass}
                      value={field.type}
                      disabled={readOnly}
                      onChange={(event) => {
                        const type = event.target.value as CustomFormFieldType;
                        updateField(field.id, {
                          type,
                          options: fieldNeedsOptions(type)
                            ? field.options.length
                              ? field.options
                              : ["Option 1"]
                            : [],
                        });
                      }}
                    >
                      {CUSTOM_FORM_FIELD_TYPES.map((item) => (
                        <option key={item.type} value={item.type}>
                          {item.label}
                        </option>
                      ))}
                    </select>
                  </label>
                  <label className="block">
                    <span className={labelClass}>Label *</span>
                    <input
                      className={inputClass}
                      value={field.label}
                      disabled={readOnly}
                      onChange={(event) => updateField(field.id, { label: event.target.value })}
                    />
                  </label>
                  <label className="block sm:col-span-2">
                    <span className={labelClass}>Help Text / Placeholder</span>
                    <input
                      className={inputClass}
                      value={field.helpText}
                      disabled={readOnly}
                      onChange={(event) => updateField(field.id, { helpText: event.target.value })}
                    />
                  </label>
                </div>

                <label className="inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={field.required}
                    disabled={readOnly}
                    onChange={(event) => updateField(field.id, { required: event.target.checked })}
                  />
                  Required
                </label>

                {fieldNeedsOptions(field.type) ? (
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
                            const next = (optionDrafts[field.id] ?? "").trim();
                            if (!next || field.options.includes(next)) return;
                            updateField(field.id, { options: [...field.options, next] });
                            setOptionDrafts((current) => ({ ...current, [field.id]: "" }));
                          }}
                        />
                        <button
                          type="button"
                          className="rounded-lg border border-slate-300 px-3 py-2 text-sm font-medium text-slate-700 hover:bg-white"
                          onClick={() => {
                            const next = (optionDrafts[field.id] ?? "").trim();
                            if (!next || field.options.includes(next)) return;
                            updateField(field.id, { options: [...field.options, next] });
                            setOptionDrafts((current) => ({ ...current, [field.id]: "" }));
                          }}
                        >
                          Add
                        </button>
                      </div>
                    ) : null}
                  </div>
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
              disabled={saving}
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
