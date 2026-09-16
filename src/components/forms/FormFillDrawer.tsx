"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  asNamedFileList,
  asStringList,
  isAnswerFilled,
  type CustomFormAnswers,
  type CustomFormEntityType,
  type CustomFormField,
  type CustomFormTemplate,
} from "@/lib/custom-forms";
import {
  uploadCustomFormAttachment,
  uploadSignatureDataUrl,
} from "@/lib/custom-form-upload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface FormFillDrawerProps {
  open: boolean;
  template: CustomFormTemplate | null;
  entityType: CustomFormEntityType;
  entityId: string;
  projectId?: string | null;
  submittedByName?: string | null;
  submittedById?: string | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (payload: {
    answers: CustomFormAnswers;
    signatureUrl: string | null;
  }) => Promise<void> | void;
}

function emptyValue(field: CustomFormField): unknown {
  if (field.type === "multiselect" || field.type === "image") return [];
  if (field.type === "document") return [];
  return "";
}

export default function FormFillDrawer({
  open,
  template,
  entityType,
  entityId,
  projectId,
  saving = false,
  error = null,
  onClose,
  onSubmit,
}: FormFillDrawerProps) {
  const [mounted, setMounted] = useState(false);
  const [values, setValues] = useState<Record<string, unknown>>({});
  const [uploadingFieldId, setUploadingFieldId] = useState<string | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);
  const submissionKey = useMemo(
    () => `${entityType}-${entityId}-${template?.id ?? "draft"}`,
    [entityType, entityId, template?.id]
  );

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (!open || !template) return;
    setLocalError(null);
    const next: Record<string, unknown> = {};
    for (const field of template.fields) {
      next[field.id] = emptyValue(field);
    }
    setValues(next);
  }, [open, template]);

  if (!open || !mounted || !template) return null;

  const setFieldValue = (fieldId: string, value: unknown) => {
    setValues((current) => ({ ...current, [fieldId]: value }));
  };

  const handleUpload = async (field: CustomFormField, files: FileList | null) => {
    if (!files?.length) return;
    setUploadingFieldId(field.id);
    setLocalError(null);
    try {
      const uploaded: Array<{ name: string; url: string }> = [];
      for (const file of Array.from(files)) {
        const result = await uploadCustomFormAttachment({
          file,
          submissionKey,
          fieldId: field.id,
        });
        if (result.error || !result.url) {
          setLocalError(result.error ?? `Failed to upload ${file.name}.`);
          return;
        }
        uploaded.push({ name: file.name, url: result.url });
      }
      if (field.type === "image") {
        setFieldValue(field.id, [
          ...asStringList(values[field.id]),
          ...uploaded.map((item) => item.url),
        ]);
      } else {
        setFieldValue(field.id, [...asNamedFileList(values[field.id]), ...uploaded]);
      }
    } finally {
      setUploadingFieldId(null);
    }
  };

  const handleSubmit = async () => {
    const missing = template.fields.find(
      (field) => field.required && !isAnswerFilled(field, values[field.id])
    );
    if (missing) {
      setLocalError(`"${missing.label}" is required.`);
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      const answers: CustomFormAnswers = {};
      let signatureUrl: string | null = null;
      for (const field of template.fields) {
        let value = values[field.id];
        if (field.type === "signature" && typeof value === "string" && value.startsWith("data:")) {
          const uploaded = await uploadSignatureDataUrl(value, submissionKey);
          if (uploaded.error || !uploaded.url) {
            setLocalError(uploaded.error ?? "Signature upload failed.");
            setSubmitting(false);
            return;
          }
          value = uploaded.url;
        }
        if (field.type === "signature" && typeof value === "string" && value.trim()) {
          signatureUrl = value;
        }
        answers[field.id] = {
          label: field.label,
          type: field.type,
          value,
        };
      }
      await onSubmit({ answers, signatureUrl });
    } finally {
      setSubmitting(false);
    }
  };

  const busy = saving || submitting;

  return createPortal(
    <div className={modalOverlayClass} role="dialog" aria-modal="true" aria-labelledby="fill-form-title">
      <div className={cn(modalShellClass, "max-w-2xl")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <h2 id="fill-form-title" className="text-lg font-bold text-slate-900">
              {template.title}
            </h2>
            {template.description ? (
              <p className="mt-1 text-sm text-slate-500">{template.description}</p>
            ) : null}
            {projectId ? (
              <p className="mt-1 text-xs text-slate-400">Linked project will be stamped on submit.</p>
            ) : null}
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
          <div className="space-y-5">
            {template.fields.map((field) => (
              <div key={field.id} className="space-y-2">
                <label className={labelClass} htmlFor={`fill-${field.id}`}>
                  {field.label}
                  {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                </label>
                {field.type === "text" ? (
                  <input
                    id={`fill-${field.id}`}
                    className={inputClass}
                    placeholder={field.helpText}
                    value={String(values[field.id] ?? "")}
                    onChange={(event) => setFieldValue(field.id, event.target.value)}
                  />
                ) : null}
                {field.type === "textarea" ? (
                  <textarea
                    id={`fill-${field.id}`}
                    className={cn(inputClass, "min-h-[96px]")}
                    placeholder={field.helpText}
                    value={String(values[field.id] ?? "")}
                    onChange={(event) => setFieldValue(field.id, event.target.value)}
                  />
                ) : null}
                {field.type === "select" ? (
                  <select
                    id={`fill-${field.id}`}
                    className={inputClass}
                    value={String(values[field.id] ?? "")}
                    onChange={(event) => setFieldValue(field.id, event.target.value)}
                  >
                    <option value="">{field.helpText || "Select an option"}</option>
                    {field.options.map((option) => (
                      <option key={option} value={option}>
                        {option}
                      </option>
                    ))}
                  </select>
                ) : null}
                {field.type === "multiselect" ? (
                  <div className="space-y-2">
                    {field.options.map((option) => {
                      const selected = asStringList(values[field.id]);
                      return (
                        <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="checkbox"
                            checked={selected.includes(option)}
                            onChange={(event) => {
                              setFieldValue(
                                field.id,
                                event.target.checked
                                  ? [...selected, option]
                                  : selected.filter((item) => item !== option)
                              );
                            }}
                          />
                          {option}
                        </label>
                      );
                    })}
                  </div>
                ) : null}
                {field.type === "image" ? (
                  <div>
                    <input
                      id={`fill-${field.id}`}
                      type="file"
                      accept="image/*"
                      capture="environment"
                      multiple
                      className={inputClass}
                      onChange={(event) => void handleUpload(field, event.target.files)}
                    />
                    {field.helpText ? (
                      <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>
                    ) : null}
                    <div className="mt-2 flex flex-wrap gap-2">
                      {asStringList(values[field.id]).map((url) => (
                        // eslint-disable-next-line @next/next/no-img-element
                        <img
                          key={url}
                          src={url}
                          alt=""
                          className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200"
                        />
                      ))}
                    </div>
                  </div>
                ) : null}
                {field.type === "document" ? (
                  <div>
                    <input
                      id={`fill-${field.id}`}
                      type="file"
                      accept=".pdf,.doc,.docx,.xls,.xlsx,.png,.jpg,.jpeg,.webp"
                      multiple
                      className={inputClass}
                      onChange={(event) => void handleUpload(field, event.target.files)}
                    />
                    {field.helpText ? (
                      <p className="mt-1 text-xs text-slate-500">{field.helpText}</p>
                    ) : null}
                    <ul className="mt-2 space-y-1 text-sm text-slate-600">
                      {asNamedFileList(values[field.id]).map((file) => (
                        <li key={file.url}>
                          <a
                            href={file.url}
                            target="_blank"
                            rel="noreferrer"
                            className="text-orange-600 hover:underline"
                          >
                            {file.name}
                          </a>
                        </li>
                      ))}
                    </ul>
                  </div>
                ) : null}
                {field.type === "signature" ? (
                  <div>
                    {field.helpText ? (
                      <p className="mb-2 text-xs text-slate-500">{field.helpText}</p>
                    ) : null}
                    <SignatureCanvas
                      onChange={(dataUrl) => setFieldValue(field.id, dataUrl ?? "")}
                    />
                  </div>
                ) : null}
                {uploadingFieldId === field.id ? (
                  <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                    Uploading…
                  </p>
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
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSubmit()}
            disabled={busy || Boolean(uploadingFieldId)}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {busy ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Submit Form
          </button>
        </div>
      </div>
    </div>,
    document.body
  );
}
