"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import type { OrganizationDocument } from "@/lib/organization-documents";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";

interface OrganisationDocumentFormModalProps {
  document?: OrganizationDocument | null;
  saving?: boolean;
  error?: string | null;
  onClose: () => void;
  onSubmit: (input: { name: string; file: File | null }) => Promise<void>;
}

export default function OrganisationDocumentFormModal({
  document,
  saving = false,
  error,
  onClose,
  onSubmit,
}: OrganisationDocumentFormModalProps) {
  const isEdit = Boolean(document);
  const [name, setName] = useState(document?.name ?? "");
  const [file, setFile] = useState<File | null>(null);
  const [localError, setLocalError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    const trimmed = name.trim();
    if (!trimmed) {
      setLocalError("Document name is required.");
      return;
    }
    if (!isEdit && !file) {
      setLocalError("A file attachment is required.");
      return;
    }
    setLocalError(null);
    await onSubmit({ name: trimmed, file });
  };

  return (
    <div className={modalOverlayClass}>
      <form onSubmit={handleSubmit} className={cn(modalClass, "max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isEdit ? "Edit Document" : "Add Document"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              {isEdit
                ? "Update the document name or replace the attached file."
                : "Upload a file for workers to view from Useful Documents."}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>Document Name *</span>
            <input
              className={inputClass}
              value={name}
              onChange={(event) => setName(event.target.value)}
              placeholder="EBA 2024"
              required
            />
          </label>

          {isEdit && document?.file_name ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-700">
              Current file:{" "}
              <span className="font-medium">{document.file_name}</span>
            </p>
          ) : null}

          <label className="block">
            <span className={labelClass}>
              {isEdit ? "Replace File" : "File Attachment *"}
            </span>
            <input
              type="file"
              className={inputClass}
              required={!isEdit}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {isEdit ? (
              <span className="mt-1 block text-xs text-slate-500">
                Choose a new file only if you want to replace the current attachment.
              </span>
            ) : null}
          </label>
        </div>

        {localError || error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {localError || error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            {isEdit ? "Save Changes" : "Add Document"}
          </button>
        </div>
      </form>
    </div>
  );
}
