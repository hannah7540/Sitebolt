"use client";

import { useRef, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { WorkerVoc } from "@/lib/supabase";
import { updateWorkerVoc } from "@/lib/supabase";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { VOC_TYPE_OPTIONS, getVocDisplayTitle } from "@/lib/voc-utils";
import { nullIfBlankWorkerDate } from "@/lib/worker-utils";
import DocumentCapture from "@/components/ui/DocumentCapture";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface EditVocModalProps {
  voc: WorkerVoc;
  workerId: string;
  onClose: () => void;
  onSaved: (voc: WorkerVoc) => void;
  /** When false, fields are read-only (admin review without edit). */
  canEdit?: boolean;
}

export default function EditVocModal({
  voc,
  workerId,
  onClose,
  onSaved,
  canEdit = true,
}: EditVocModalProps) {
  const uploadPrefix = useRef(
    `workers/${workerId}/vocs/${voc.id}/${Date.now()}`
  ).current;

  const initialType = getVocDisplayTitle(voc);
  const [vocType, setVocType] = useState(initialType);
  const [issuingOrg, setIssuingOrg] = useState(voc.issuing_org ?? "");
  const [issueDate, setIssueDate] = useState(voc.issue_date ?? "");
  const [expiryDate, setExpiryDate] = useState(voc.expiry_date ?? "");
  const [documentUrl, setDocumentUrl] = useState(voc.document_url);
  const [pendingFile, setPendingFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSave = async () => {
    if (!canEdit) {
      onClose();
      return;
    }

    const trimmedType = vocType.trim();
    if (!trimmedType) {
      setError("Please select a VOC type.");
      return;
    }

    setSaving(true);
    setError(null);

    try {
      let nextDocumentUrl = documentUrl;
      if (pendingFile) {
        const uploaded = await uploadWorkerDocumentSafe(
          pendingFile,
          `${uploadPrefix}/${trimmedType.replace(/[^a-z0-9]/gi, "_") || "voc"}`
        );
        if (!uploaded) {
          throw new Error("Failed to upload VOC document.");
        }
        nextDocumentUrl = uploaded;
      }

      const { error: updateError } = await updateWorkerVoc(voc.id, {
        title: trimmedType,
        voc_type: trimmedType,
        issuing_org: issuingOrg.trim() || null,
        issue_date: nullIfBlankWorkerDate(issueDate),
        expiry_date: nullIfBlankWorkerDate(expiryDate),
        document_url: nextDocumentUrl,
      });

      if (updateError) {
        throw new Error(updateError);
      }

      onSaved({
        ...voc,
        title: trimmedType,
        voc_type: trimmedType,
        issuing_org: issuingOrg.trim() || null,
        issue_date: nullIfBlankWorkerDate(issueDate),
        expiry_date: nullIfBlankWorkerDate(expiryDate),
        document_url: nextDocumentUrl,
      });
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save VOC.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-w-lg")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-900">
          {canEdit ? "Edit VOC" : "VOC Details"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Verification of Competency
        </p>

        {error ? (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-4 space-y-3">
          <label className="block space-y-1">
            <span className={labelClass}>VOC Type *</span>
            <select
              className={inputClass}
              value={vocType}
              disabled={!canEdit}
              required
              onChange={(event) => setVocType(event.target.value)}
            >
              <option value="">Select VOC type…</option>
              {VOC_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
              {vocType &&
              !VOC_TYPE_OPTIONS.includes(
                vocType as (typeof VOC_TYPE_OPTIONS)[number]
              ) ? (
                <option value={vocType}>{vocType}</option>
              ) : null}
            </select>
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Issuing Organisation</span>
            <input
              className={inputClass}
              value={issuingOrg}
              disabled={!canEdit}
              onChange={(event) => setIssuingOrg(event.target.value)}
            />
          </label>

          <div className="grid gap-3 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Issue Date</span>
              <input
                type="date"
                className={inputClass}
                value={issueDate}
                disabled={!canEdit}
                onChange={(event) => setIssueDate(event.target.value)}
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Expiry Date</span>
              <input
                type="date"
                className={inputClass}
                value={expiryDate}
                disabled={!canEdit}
                onChange={(event) => setExpiryDate(event.target.value)}
              />
            </label>
          </div>

          <DocumentCapture
            label="Photo / Document"
            file={pendingFile}
            onFileChange={setPendingFile}
            existingUrl={documentUrl}
            uploadedUrl={documentUrl}
            disabled={!canEdit || saving}
            uploadPath={canEdit ? `${uploadPrefix}/document` : undefined}
            onUploaded={(url) => {
              setDocumentUrl(url);
              setPendingFile(null);
            }}
          />
        </div>

        <div className="mt-6 flex gap-3">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg bg-slate-100 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-200"
          >
            {canEdit ? "Cancel" : "Close"}
          </button>
          {canEdit ? (
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {saving ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Saving…
                </>
              ) : (
                "Save VOC"
              )}
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
