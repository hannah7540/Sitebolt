"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  getSwmsDocumentDate,
  getSwmsDocumentUrl,
  updateSwmsDocument,
  type SwmsDocumentSummary,
} from "@/lib/swms";
import { uploadSwmsPdf } from "@/lib/swms-upload";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface EditSwmsModalProps {
  document: SwmsDocumentSummary;
  onClose: () => void;
  onSaved: () => void;
}

export default function EditSwmsModal({
  document,
  onClose,
  onSaved,
}: EditSwmsModalProps) {
  const [title, setTitle] = useState(document.title);
  const [documentDate, setDocumentDate] = useState(
    getSwmsDocumentDate(document) || new Date().toISOString().slice(0, 10)
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!title.trim()) {
      setError("Title is required.");
      return;
    }

    setSaving(true);
    try {
      let fileUrl: string | undefined;
      if (file) {
        const stamp = Date.now();
        const uploadPath = `swms/${stamp}-${title.trim().replace(/\s+/g, "-").toLowerCase()}`;
        const { url, error: uploadError } = await uploadSwmsPdf(file, uploadPath);
        if (uploadError || !url) {
          setError(uploadError ?? "PDF upload failed.");
          return;
        }
        fileUrl = url;
      }

      const { error: updateError } = await updateSwmsDocument(document.id, {
        title: title.trim(),
        documentDate,
        fileUrl,
      });

      if (updateError) {
        setError(updateError);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update SWMS.");
    } finally {
      setSaving(false);
    }
  };

  const currentUrl = getSwmsDocumentUrl(document);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Edit SWMS</h2>
            <p className="text-sm text-slate-500">Update title, date, or replace the PDF.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

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
            <span className={labelClass}>Replace PDF (optional)</span>
            <input
              type="file"
              accept="application/pdf"
              className={inputClass}
              onChange={(event) => setFile(event.target.files?.[0] ?? null)}
            />
            {currentUrl ? (
              <a
                href={currentUrl}
                target="_blank"
                rel="noreferrer"
                className="text-xs font-medium text-orange-600 hover:underline"
              >
                View current PDF
              </a>
            ) : null}
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
              Save Changes
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
