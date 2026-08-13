"use client";

import { useEffect, useMemo, useState } from "react";
import {
  ArrowDown,
  ArrowLeft,
  ArrowUp,
  Braces,
  GripVertical,
  LayoutTemplate,
  Loader2,
  Plus,
  Trash2,
  Wand2,
  X,
} from "lucide-react";
import CompanyLogo from "@/components/ui/CompanyLogo";
import FormBuilderJsonEditor from "@/components/administration/forms/FormBuilderJsonEditor";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import type { DbProject } from "@/lib/project-resolver";
import {
  createEmptyInductionBlock,
  resolveInductionFormBlocks,
  resolveInductionFormLogicRules,
  saveInductionForm,
  type InductionFormBlock,
  type InductionFormBlockType,
  type InductionFormLogicRule,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import {
  parseInductionFormJson,
  resolveInductionFormJsonState,
  serializeInductionFormJson,
} from "@/lib/induction-form-json";
import { uploadSiteFormFile } from "@/lib/site-form-upload";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass, modalClass } from "@/lib/ui-classes";

type FormBuilderViewMode = "visual" | "json";

const BLOCK_TYPE_OPTIONS: { type: InductionFormBlockType; label: string }[] = [
  { type: "section_header", label: "Header / Section Title" },
  { type: "rich_text", label: "Rich Text Block" },
  { type: "pdf_viewer", label: "PDF Viewer Attachment" },
  { type: "text_input", label: "Question Input (Text)" },
  { type: "checkbox", label: "Single Checkbox" },
  { type: "multi_checkbox", label: "Multi-Select Checkboxes" },
  { type: "radio", label: "Radio Buttons" },
  { type: "signature", label: "Digital Signature Block" },
];

interface FormBuilderProps {
  projects: DbProject[];
  templates: InductionFormTemplate[];
  initialForm?: InductionFormTemplate | null;
  variant?: "page" | "embedded";
  onClose: () => void;
  onSaved: (form: InductionFormTemplate) => void;
}

function moveBlock(blocks: InductionFormBlock[], index: number, direction: -1 | 1) {
  const next = [...blocks];
  const target = index + direction;
  if (target < 0 || target >= next.length) return blocks;
  [next[index], next[target]] = [next[target], next[index]];
  return next;
}

function BlockOptionsEditor({
  options,
  onChange,
}: {
  options: string[];
  onChange: (options: string[]) => void;
}) {
  const rows = options.length > 0 ? options : [""];

  const updateOption = (index: number, value: string) => {
    const next = [...rows];
    next[index] = value;
    onChange(next);
  };

  const removeOption = (index: number) => {
    if (rows.length <= 1) {
      onChange([""]);
      return;
    }
    onChange(rows.filter((_, rowIndex) => rowIndex !== index));
  };

  const addOption = () => {
    onChange([...rows, ""]);
  };

  return (
    <div className="space-y-2">
      <span className={labelClass}>Options</span>
      <div className="space-y-2">
        {rows.map((option, index) => (
          <div key={`option-${index}`} className="flex items-center gap-2">
            <input
              value={option}
              onChange={(event) => updateOption(index, event.target.value)}
              className={cn(inputClass, "flex-1")}
              placeholder={`Option ${index + 1}`}
            />
            <button
              type="button"
              onClick={() => removeOption(index)}
              className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-red-200 text-red-600 hover:bg-red-50"
              aria-label={`Remove option ${index + 1}`}
            >
              <Trash2 className="h-4 w-4" />
            </button>
          </div>
        ))}
      </div>
      <button
        type="button"
        onClick={addOption}
        className="inline-flex items-center gap-1.5 rounded-lg border border-dashed border-orange-300 bg-orange-50/50 px-3 py-2 text-xs font-semibold text-orange-700 hover:bg-orange-50"
      >
        <Plus className="h-3.5 w-3.5" />
        Add Option
      </button>
    </div>
  );
}

export default function FormBuilder({
  projects,
  templates,
  initialForm,
  variant = "page",
  onClose,
  onSaved,
}: FormBuilderProps) {
  const [title, setTitle] = useState(initialForm?.title ?? "");
  const [description, setDescription] = useState(initialForm?.description ?? "");
  const [scope, setScope] = useState<"company" | "project">(
    initialForm?.scope ?? "company"
  );
  const [projectId, setProjectId] = useState(initialForm?.project_id ?? "");
  const [status, setStatus] = useState<"active" | "draft">(
    initialForm?.status ?? "draft"
  );
  const initialBlocks = resolveInductionFormBlocks(initialForm);
  const [blocks, setBlocks] = useState<InductionFormBlock[]>(initialBlocks);
  const [logicRules, setLogicRules] = useState<InductionFormLogicRule[]>(
    initialForm?.logic_rules ?? []
  );
  const [viewMode, setViewMode] = useState<FormBuilderViewMode>("visual");
  const [jsonText, setJsonText] = useState(() =>
    serializeInductionFormJson(initialBlocks, initialForm?.logic_rules ?? [])
  );
  const [jsonError, setJsonError] = useState<string | null>(null);
  const [copyTemplateId, setCopyTemplateId] = useState("");
  const [persistedFormId, setPersistedFormId] = useState<string | undefined>(
    initialForm?.id
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [uploadingBlockId, setUploadingBlockId] = useState<string | null>(null);
  const { toast, showError, dismissToast } = useFormToast();

  const copyOptions = useMemo(
    () => templates.filter((row) => row.id !== initialForm?.id),
    [templates, initialForm?.id]
  );

  useEffect(() => {
    if (initialForm?.id) {
      setPersistedFormId(initialForm.id);
    }
  }, [initialForm?.id]);

  useEffect(() => {
    if (viewMode === "visual") {
      setJsonText(serializeInductionFormJson(blocks, logicRules));
      setJsonError(null);
    }
  }, [blocks, logicRules, viewMode]);

  const applyParsedJson = (
    parsed: ReturnType<typeof parseInductionFormJson>,
    options?: { mergeSchema?: InductionFormBlock[]; mergeRules?: InductionFormLogicRule[] }
  ) => {
    if (parsed.error) {
      setJsonError(parsed.error);
      return false;
    }

    setJsonError(null);
    if (parsed.schemaFieldsTouched) {
      setBlocks(parsed.schema_fields);
    } else if (options?.mergeSchema) {
      setBlocks(options.mergeSchema);
    }
    if (parsed.logicRulesTouched) {
      setLogicRules(parsed.logic_rules);
    } else if (options?.mergeRules) {
      setLogicRules(options.mergeRules);
    }
    return true;
  };

  const handleJsonChange = (text: string) => {
    setJsonText(text);
    applyParsedJson(parseInductionFormJson(text), {
      mergeSchema: blocks,
      mergeRules: logicRules,
    });
  };

  const handleFormatJson = (event?: React.MouseEvent) => {
    event?.preventDefault();
    const parsed = parseInductionFormJson(jsonText);
    if (parsed.error) {
      setJsonError(parsed.error);
      return;
    }
    const schema = parsed.schemaFieldsTouched ? parsed.schema_fields : blocks;
    const rules = parsed.logicRulesTouched ? parsed.logic_rules : logicRules;
    const formatted = serializeInductionFormJson(schema, rules);
    setJsonText(formatted);
    setJsonError(null);
    setBlocks(schema);
    setLogicRules(rules);
  };

  const switchViewMode = (mode: FormBuilderViewMode) => {
    if (mode === viewMode) return;

    if (mode === "json") {
      setJsonText(serializeInductionFormJson(blocks, logicRules));
      setJsonError(null);
      setViewMode("json");
      return;
    }

    const resolved = resolveInductionFormJsonState(jsonText, blocks, logicRules);
    if (resolved.error) {
      setJsonError(resolved.error);
      return;
    }
    setJsonError(null);
    setBlocks(resolved.formBlocks);
    setLogicRules(resolved.logicRules);
    setViewMode("visual");
  };

  const applyTemplateCopy = () => {
    const source = templates.find((row) => row.id === copyTemplateId);
    if (!source) return;
    setTitle(source.title);
    setDescription(source.description ?? "");
    setScope(source.scope);
    setProjectId(source.project_id ?? "");
    const sourceBlocks = resolveInductionFormBlocks(source);
    setBlocks(
      sourceBlocks.map((block) => ({
        ...block,
        id: createEmptyInductionBlock(block.type).id,
      }))
    );
    setLogicRules(resolveInductionFormLogicRules(source).map((rule) => ({ ...rule })));
  };

  const updateBlock = (blockId: string, patch: Partial<InductionFormBlock>) => {
    setBlocks((current) =>
      current.map((block) => (block.id === blockId ? { ...block, ...patch } : block))
    );
  };

  const handlePdfUpload = async (blockId: string, file: File) => {
    setUploadingBlockId(blockId);
    const path = `induction-forms/${Date.now()}-${file.name.replace(/\s+/g, "-")}`;
    const { url, error: uploadError } = await uploadSiteFormFile(
      file,
      path,
      file.type || "application/pdf"
    );
    setUploadingBlockId(null);
    if (uploadError || !url) {
      const message = uploadError ?? "PDF upload failed";
      setError(message);
      showError(message);
      return;
    }
    updateBlock(blockId, { pdfUrl: url });
  };

  const persistForm = async (): Promise<InductionFormTemplate | null> => {
    if (!title.trim()) {
      setError("Form title is required.");
      return null;
    }
    if (scope === "project" && !projectId) {
      setError("Select a project for project-specific inductions.");
      return null;
    }

    let formBlocks = blocks;
    let rulesToSave = logicRules;

    if (viewMode === "json") {
      const resolved = resolveInductionFormJsonState(jsonText, blocks, logicRules);
      if (resolved.error) {
        setJsonError(resolved.error);
        setError(resolved.error);
        return null;
      }
      formBlocks = resolved.formBlocks;
      rulesToSave = resolved.logicRules;
      setBlocks(formBlocks);
      setLogicRules(rulesToSave);
      setJsonText(serializeInductionFormJson(formBlocks, rulesToSave));
      setJsonError(null);
    }

    setSaving(true);
    setError(null);

    try {
      const projectName =
        scope === "project" && projectId
          ? projects.find((project) => project.id === projectId)?.name ?? null
          : null;

      const result = await saveInductionForm({
        id: persistedFormId ?? initialForm?.id,
        title,
        description,
        scope,
        scope_type: scope,
        project_id: scope === "project" ? projectId : null,
        project_name: projectName,
        status,
        is_active: status === "active",
        blocks: formBlocks,
        schema_fields: formBlocks,
        logic_rules: rulesToSave,
        copied_from_id: copyTemplateId || initialForm?.copied_from_id || null,
      });

      if (result.error || !result.form) {
        const message = result.error ?? "Save failed";
        setError(message);
        showError(message);
        return null;
      }

      setPersistedFormId(result.form.id);
      return result.form;
    } catch (cause) {
      const message =
        cause instanceof Error
          ? `Could not save induction form. ${cause.message}`
          : "Could not save induction form. Please try again.";
      setError(message);
      showError(message);
      return null;
    } finally {
      setSaving(false);
    }
  };

  const handleSaveDraft = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    const saved = await persistForm();
    if (saved) {
      onSaved(saved);
    }
  };

  const handleSaveAndExit = async (event?: React.MouseEvent) => {
    event?.preventDefault();
    const saved = await persistForm();
    if (saved) {
      onSaved(saved);
      onClose();
    }
  };

  const handleClose = (event?: React.MouseEvent) => {
    event?.preventDefault();
    onClose();
  };

  const shellClass =
    variant === "page"
      ? cn(cardClass, "w-full max-w-none")
      : cn(modalClass, "w-full max-w-4xl");

  return (
    <div className={cn(shellClass, variant === "page" && "min-w-0")}>
      {variant === "page" ? (
        <button
          type="button"
          onClick={handleClose}
          className="mb-4 inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-orange-600"
        >
          <ArrowLeft className="h-4 w-4" />
          Back to induction forms
        </button>
      ) : null}

      <div className="mb-4 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">
            {initialForm ? "Edit Induction Form" : "Create Induction Form"}
          </h2>
          <p className="text-sm text-slate-500">
            Step-by-step field builder with company branding
          </p>
        </div>
        <div className="flex items-center gap-2">
          <div className="inline-flex rounded-lg border border-slate-200 bg-slate-100 p-0.5">
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                switchViewMode("visual");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                viewMode === "visual"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <LayoutTemplate className="h-3.5 w-3.5" />
              Visual Builder
            </button>
            <button
              type="button"
              onClick={(event) => {
                event.preventDefault();
                switchViewMode("json");
              }}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-md px-3 py-1.5 text-xs font-semibold transition",
                viewMode === "json"
                  ? "bg-white text-orange-600 shadow-sm"
                  : "text-slate-600 hover:text-slate-900"
              )}
            >
              <Braces className="h-3.5 w-3.5" />
              JSON Logic Editor
            </button>
          </div>
          {variant === "embedded" ? (
            <button type="button" onClick={handleClose} aria-label="Close">
              <X className="h-5 w-5 text-slate-400" />
            </button>
          ) : null}
        </div>
      </div>

        <div className="mb-6 w-full rounded-xl border border-slate-200 bg-slate-50 p-4">
          <CompanyLogo size="form" showFallback />
        </div>

        {!initialForm && copyOptions.length > 0 ? (
          <div className="mb-4 flex w-full flex-wrap items-end gap-2 rounded-xl border border-dashed border-orange-200 bg-orange-50/60 p-3">
            <label className="min-w-[220px] flex-1">
              <span className={labelClass}>Copy from existing template</span>
              <select
                value={copyTemplateId}
                onChange={(event) => setCopyTemplateId(event.target.value)}
                className={inputClass}
              >
                <option value="">Start blank</option>
                {copyOptions.map((row) => (
                  <option key={row.id} value={row.id}>
                    {row.title}
                  </option>
                ))}
              </select>
            </label>
            <button
              type="button"
              disabled={!copyTemplateId}
              onClick={(event) => {
                event.preventDefault();
                applyTemplateCopy();
              }}
              className="rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              Apply Template
            </button>
          </div>
        ) : null}

        <div className="grid w-full gap-4 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4">
          <label className="block md:col-span-2">
            <span className={labelClass}>Form title</span>
            <input
              value={title}
              onChange={(event) => setTitle(event.target.value)}
              className={inputClass}
              placeholder="Site induction — all workers"
            />
          </label>
          <label className="block md:col-span-2">
            <span className={labelClass}>Description</span>
            <textarea
              value={description}
              onChange={(event) => setDescription(event.target.value)}
              rows={2}
              className={inputClass}
              placeholder="Brief overview for administrators"
            />
          </label>
          <label className="block">
            <span className={labelClass}>Scope</span>
            <select
              value={scope}
              onChange={(event) =>
                setScope(event.target.value as "company" | "project")
              }
              className={inputClass}
            >
              <option value="company">Company-Wide Induction</option>
              <option value="project">Project-Specific Induction</option>
            </select>
          </label>
          {scope === "project" ? (
            <label className="block">
              <span className={labelClass}>Project</span>
              <select
                value={projectId}
                onChange={(event) => setProjectId(event.target.value)}
                className={inputClass}
              >
                <option value="">Select project</option>
                {projects.map((project) => (
                  <option key={project.id} value={project.id}>
                    {project.name}
                  </option>
                ))}
              </select>
            </label>
          ) : (
            <label className="block">
              <span className={labelClass}>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "draft")
                }
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
          )}
          {scope === "project" ? (
            <label className="block">
              <span className={labelClass}>Status</span>
              <select
                value={status}
                onChange={(event) =>
                  setStatus(event.target.value as "active" | "draft")
                }
                className={inputClass}
              >
                <option value="draft">Draft</option>
                <option value="active">Active</option>
              </select>
            </label>
          ) : null}
        </div>

        {viewMode === "json" ? (
          <div className="mt-6 w-full space-y-3">
            <div className="flex flex-wrap items-center justify-between gap-2">
              <h3 className="text-sm font-semibold uppercase tracking-wide text-slate-600">
                JSON schema &amp; logic rules
              </h3>
              <button
                type="button"
                onClick={handleFormatJson}
                className="inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-3 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
              >
                <Wand2 className="h-3.5 w-3.5" />
                Format JSON
              </button>
            </div>
            <FormBuilderJsonEditor
              value={jsonText}
              onChange={handleJsonChange}
              error={jsonError}
            />
          </div>
        ) : (
        <div className="mt-6 w-full space-y-3">
          <div className="flex flex-col gap-3 lg:flex-row lg:items-start lg:justify-between">
            <h3 className="shrink-0 text-sm font-semibold uppercase tracking-wide text-slate-600">
              Form blocks
            </h3>
            <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3 lg:grid-cols-4 xl:grid-cols-4">
              {BLOCK_TYPE_OPTIONS.map((option) => (
                <button
                  key={option.type}
                  type="button"
                  onClick={(event) => {
                    event.preventDefault();
                    setBlocks((current) => [
                      ...current,
                      createEmptyInductionBlock(option.type),
                    ]);
                  }}
                  className="inline-flex w-full items-center justify-center gap-1 rounded-lg border border-slate-200 bg-white px-2 py-2 text-xs font-medium text-slate-700 hover:border-orange-300 hover:text-orange-600"
                >
                  <Plus className="h-3 w-3 shrink-0" />
                  <span className="truncate">{option.label}</span>
                </button>
              ))}
            </div>
          </div>

          {blocks.length === 0 ? (
            <p className="rounded-xl border border-dashed border-slate-300 p-6 text-center text-sm text-slate-500">
              Add blocks to build your induction form.
            </p>
          ) : null}

          {blocks.map((block, index) => (
            <div
              key={block.id}
              className="w-full rounded-xl border border-slate-200 bg-slate-50 p-4"
            >
              <div className="mb-3 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-semibold uppercase text-slate-500">
                  <GripVertical className="h-4 w-4" />
                  {BLOCK_TYPE_OPTIONS.find((row) => row.type === block.type)?.label ??
                    block.type}
                </div>
                <div className="flex items-center gap-1">
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setBlocks((current) => moveBlock(current, index, -1));
                    }}
                    className="rounded p-1 text-slate-500 hover:bg-white"
                    aria-label="Move up"
                  >
                    <ArrowUp className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setBlocks((current) => moveBlock(current, index, 1));
                    }}
                    className="rounded p-1 text-slate-500 hover:bg-white"
                    aria-label="Move down"
                  >
                    <ArrowDown className="h-4 w-4" />
                  </button>
                  <button
                    type="button"
                    onClick={(event) => {
                      event.preventDefault();
                      setBlocks((current) => current.filter((row) => row.id !== block.id));
                    }}
                    className="rounded p-1 text-red-500 hover:bg-white"
                    aria-label="Remove block"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
                </div>
              </div>

              <label className="mb-2 block">
                <span className={labelClass}>Label / prompt</span>
                <input
                  value={block.label}
                  onChange={(event) =>
                    updateBlock(block.id, { label: event.target.value })
                  }
                  className={inputClass}
                />
              </label>

              {block.type === "rich_text" || block.type === "section_header" ? (
                <textarea
                  value={block.content ?? ""}
                  onChange={(event) =>
                    updateBlock(block.id, { content: event.target.value })
                  }
                  rows={4}
                  className={inputClass}
                  placeholder="Policy text or section content"
                />
              ) : null}

              {block.type === "pdf_viewer" ? (
                <div className="space-y-2">
                  <input
                    type="file"
                    accept="application/pdf"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handlePdfUpload(block.id, file);
                      event.target.value = "";
                    }}
                    className={inputClass}
                  />
                  {uploadingBlockId === block.id ? (
                    <p className="text-xs text-slate-500">Uploading PDF…</p>
                  ) : null}
                  {block.pdfUrl ? (
                    <a
                      href={block.pdfUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="text-xs font-semibold text-orange-600 hover:underline"
                    >
                      View attached PDF
                    </a>
                  ) : null}
                </div>
              ) : null}

              {block.type === "multi_checkbox" || block.type === "radio" ? (
                <BlockOptionsEditor
                  options={block.options ?? []}
                  onChange={(options) => updateBlock(block.id, { options })}
                />
              ) : null}

              {block.type !== "section_header" && block.type !== "rich_text" ? (
                <label className="mt-2 inline-flex items-center gap-2 text-sm text-slate-700">
                  <input
                    type="checkbox"
                    checked={block.required === true}
                    onChange={(event) =>
                      updateBlock(block.id, { required: event.target.checked })
                    }
                    className="rounded border-slate-300 text-orange-500"
                  />
                  Is required?
                </label>
              ) : null}
            </div>
          ))}
        </div>
        )}

        {error ? <p className="mt-4 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex flex-wrap justify-end gap-2">
          <button
            type="button"
            onClick={handleClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={(event) => void handleSaveDraft(event)}
            className="inline-flex items-center gap-2 rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Draft
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={(event) => void handleSaveAndExit(event)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save &amp; Exit
          </button>
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
