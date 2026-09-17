"use client";

import { useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { FileText, Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  asNamedFileList,
  asSignatureAnswer,
  asStringList,
  isAnswerFilled,
  isMediaField,
  isQuestionField,
  isStatementField,
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
  if (
    field.type === "checkbox" ||
    field.type === "multiselect" ||
    field.type === "upload" ||
    field.type === "image" ||
    field.type === "document"
  ) {
    return [];
  }
  return "";
}

function isUploadQuestion(field: CustomFormField): boolean {
  return (
    isQuestionField(field) &&
    (field.type === "upload" || field.type === "image" || field.type === "document")
  );
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
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
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
    setSignatureDataUrl(null);
    const next: Record<string, unknown> = {};
    for (const field of template.fields) {
      if (isQuestionField(field)) next[field.id] = emptyValue(field);
    }
    setValues(next);
  }, [open, template]);

  if (!open || !mounted || !template) return null;

  const hasSignatureFields = template.fields.some(
    (field) => isQuestionField(field) && field.type === "signature"
  );

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
      setFieldValue(field.id, [...asNamedFileList(values[field.id]), ...uploaded]);
    } finally {
      setUploadingFieldId(null);
    }
  };

  const handleSubmit = async () => {
    const missing = template.fields.find(
      (field) =>
        isQuestionField(field) && field.required && !isAnswerFilled(field, values[field.id])
    );
    if (missing) {
      setLocalError(`"${missing.label}" is required.`);
      return;
    }
    if (!hasSignatureFields && !signatureDataUrl) {
      setLocalError("Please sign the form before submitting.");
      return;
    }

    setSubmitting(true);
    setLocalError(null);
    try {
      let formSignatureUrl: string | null = null;
      if (!hasSignatureFields && signatureDataUrl) {
        const uploadedSignature = await uploadSignatureDataUrl(signatureDataUrl, submissionKey);
        if (uploadedSignature.error || !uploadedSignature.url) {
          setLocalError(uploadedSignature.error ?? "Signature upload failed.");
          setSubmitting(false);
          return;
        }
        formSignatureUrl = uploadedSignature.url;
      }

      const answers: CustomFormAnswers = {};
      for (const field of template.fields) {
        if (!isQuestionField(field)) continue;
        if (field.type === "signature") {
          const dataUrl = asSignatureAnswer(values[field.id]).url;
          if (!dataUrl) {
            answers[field.id] = { label: field.label, type: field.type, value: "" };
            continue;
          }
          if (dataUrl.startsWith("data:")) {
            const blob = await fetch(dataUrl).then((response) => response.blob());
            const file = new File([blob], "signature.png", {
              type: blob.type || "image/png",
            });
            const uploaded = await uploadCustomFormAttachment({
              file,
              submissionKey,
              fieldId: field.id,
            });
            if (uploaded.error || !uploaded.url) {
              setLocalError(uploaded.error ?? `Signature upload failed for "${field.label}".`);
              setSubmitting(false);
              return;
            }
            answers[field.id] = {
              label: field.label,
              type: field.type,
              value: { url: uploaded.url, signed_at: new Date().toISOString() },
            };
          } else {
            answers[field.id] = {
              label: field.label,
              type: field.type,
              value: { url: dataUrl, signed_at: new Date().toISOString() },
            };
          }
          continue;
        }
        answers[field.id] = {
          label: field.label,
          type: field.type,
          value: values[field.id],
        };
      }
      await onSubmit({ answers, signatureUrl: formSignatureUrl });
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
            {template.fields.map((field) => {
              if (isStatementField(field)) {
                return (
                  <div
                    key={field.id}
                    className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3"
                  >
                    {field.title ? (
                      <p className="text-sm font-semibold text-amber-950">{field.title}</p>
                    ) : null}
                    <p className="mt-1 whitespace-pre-wrap text-sm text-amber-900">
                      {field.text || field.label}
                    </p>
                  </div>
                );
              }

              if (isMediaField(field) && field.file_url) {
                return (
                  <div key={field.id} className="overflow-hidden rounded-xl border border-slate-200 bg-white">
                    {field.file_type === "image" ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={field.file_url}
                        alt={field.caption || field.file_name || "Reference image"}
                        className="w-full object-contain"
                      />
                    ) : (
                      <a
                        href={field.file_url}
                        target="_blank"
                        rel="noreferrer"
                        className="flex items-center gap-3 p-4 text-sm font-medium text-orange-600 hover:bg-orange-50"
                      >
                        <FileText className="h-5 w-5 shrink-0" />
                        <span>
                          {field.caption || field.file_name || "Open reference document"}
                        </span>
                      </a>
                    )}
                    {field.caption && field.file_type === "image" ? (
                      <p className="border-t border-slate-100 px-4 py-2 text-xs text-slate-500">
                        {field.caption}
                      </p>
                    ) : null}
                  </div>
                );
              }

              if (!isQuestionField(field)) return null;

              return (
                <div key={field.id} className="space-y-2">
                  <label className={labelClass} htmlFor={`fill-${field.id}`}>
                    {field.label}
                    {field.required ? <span className="ml-1 text-red-500">*</span> : null}
                  </label>
                  {field.type === "text" || field.type === "textarea" ? (
                    <textarea
                      id={`fill-${field.id}`}
                      className={cn(inputClass, "min-h-[88px]")}
                      placeholder={field.helpText || "Enter your response"}
                      value={String(values[field.id] ?? "")}
                      onChange={(event) => setFieldValue(field.id, event.target.value)}
                    />
                  ) : null}
                  {field.type === "select" ? (
                    <div className="space-y-2">
                      {field.options.map((option) => (
                        <label key={option} className="flex items-center gap-2 text-sm text-slate-700">
                          <input
                            type="radio"
                            name={`fill-${field.id}`}
                            checked={String(values[field.id] ?? "") === option}
                            onChange={() => setFieldValue(field.id, option)}
                          />
                          {option}
                        </label>
                      ))}
                    </div>
                  ) : null}
                  {field.type === "checkbox" || field.type === "multiselect" ? (
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
                  {isUploadQuestion(field) ? (
                    <div>
                      <input
                        id={`fill-${field.id}`}
                        type="file"
                        accept="image/*,.pdf,.doc,.docx,.dwg,.dxf"
                        capture="environment"
                        multiple
                        className={inputClass}
                        onChange={(event) => void handleUpload(field, event.target.files)}
                      />
                      <div className="mt-2 flex flex-wrap gap-2">
                        {asNamedFileList(values[field.id]).map((file) =>
                          /\.(png|jpe?g|gif|webp|svg)$/i.test(file.name) ||
                          file.url.match(/\.(png|jpe?g|gif|webp|svg)(\?|$)/i) ? (
                            // eslint-disable-next-line @next/next/no-img-element
                            <img
                              key={file.url}
                              src={file.url}
                              alt={file.name}
                              className="h-16 w-16 rounded-md object-cover ring-1 ring-slate-200"
                            />
                          ) : (
                            <a
                              key={file.url}
                              href={file.url}
                              target="_blank"
                              rel="noreferrer"
                              className="text-sm text-orange-600 hover:underline"
                            >
                              {file.name}
                            </a>
                          )
                        )}
                      </div>
                    </div>
                  ) : null}
                  {field.type === "signature" ? (
                    <SignatureCanvas
                      key={field.id}
                      onChange={(dataUrl) => setFieldValue(field.id, dataUrl)}
                    />
                  ) : null}
                  {uploadingFieldId === field.id ? (
                    <p className="inline-flex items-center gap-2 text-xs text-slate-500">
                      <Loader2 className="h-3.5 w-3.5 animate-spin" />
                      Uploading…
                    </p>
                  ) : null}
                </div>
              );
            })}

            {!hasSignatureFields ? (
              <div className="space-y-2 border-t border-slate-200 pt-5">
                <p className={labelClass}>
                  Signature <span className="text-red-500">*</span>
                </p>
                <SignatureCanvas onChange={(dataUrl) => setSignatureDataUrl(dataUrl)} />
              </div>
            ) : null}
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
