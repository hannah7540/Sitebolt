"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  createCompanySwmsDocument,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { uploadSwmsPdf } from "@/lib/swms-upload";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface UploadSwmsModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function UploadSwmsModal({ onClose, onSaved }: UploadSwmsModalProps) {
  const [title, setTitle] = useState("");
  const [documentDate, setDocumentDate] = useState(
    new Date().toISOString().slice(0, 10)
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [created, setCreated] = useState<SwmsDocumentSummary | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setCreated(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }
    if (!file) {
      setError("Please upload a SWMS PDF.");
      return;
    }

    setSaving(true);
    try {
      const { url, error: uploadError } = await uploadSwmsPdf(file);

      if (uploadError || !url) {
        setError(uploadError ?? "PDF upload failed.");
        return;
      }

      const { error: createError, document } = await createCompanySwmsDocument({
        title: title.trim(),
        documentDate,
        fileUrl: url,
        fileName: file.name,
      });

      if (createError || !document) {
        setError(createError ?? "Failed to save company SWMS.");
        return;
      }

      setCreated(document);
      onSaved();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to upload SWMS.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Company SWMS</h2>
            <p className="text-sm text-slate-500">
              Upload a master SWMS template to the company library.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {created ? (
          <div className="space-y-4">
            <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
              &ldquo;{created.title}&rdquo; added to the company library. Use Assign / Push to
              Project to deploy it to a site.
            </p>
            <button
              type="button"
              onClick={onClose}
              className="w-full rounded-lg bg-orange-500 px-4 py-2.5 text-sm font-semibold text-white hover:bg-orange-600"
            >
              Done
            </button>
          </div>
        ) : (
          <form onSubmit={handleSubmit} className="space-y-4">
            <label className="block space-y-1">
              <span className={labelClass}>Title *</span>
              <input
                className={inputClass}
                value={title}
                onChange={(event) => setTitle(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Date *</span>
              <input
                type="date"
                className={inputClass}
                value={documentDate}
                onChange={(event) => setDocumentDate(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>SWMS PDF *</span>
              <input
                type="file"
                accept="application/pdf"
                className={inputClass}
                onChange={(event) => setFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>

            {error ? (
              <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {error}
              </p>
            ) : null}

            <div className="flex justify-end gap-2">
              <button
                type="button"
                onClick={onClose}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                type="submit"
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save to Library
              </button>
            </div>
          </form>
        )}
      </div>
    </div>
  );
}
