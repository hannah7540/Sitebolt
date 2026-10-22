"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  createSubcontractorPortalWorker,
  uploadSubcontractorPortalDocument,
} from "@/lib/subcontractor-portal-resources";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

export default function SubcontractorNewWorkerModal({
  subcontractorId,
  organisationId,
  onClose,
  onSaved,
}: {
  subcontractorId: string;
  organisationId?: string;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [firstName, setFirstName] = useState("");
  const [lastName, setLastName] = useState("");
  const [email, setEmail] = useState("");
  const [phone, setPhone] = useState("");
  const [trade, setTrade] = useState("");
  const [whiteCardFile, setWhiteCardFile] = useState<File | null>(null);
  const [silicaFile, setSilicaFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);
    try {
      if (!whiteCardFile || !silicaFile) {
        setError("White Card and Silica Certificate uploads are required.");
        return;
      }

      const [whiteCardUpload, silicaUpload] = await Promise.all([
        uploadSubcontractorPortalDocument(whiteCardFile, subcontractorId, "white-card"),
        uploadSubcontractorPortalDocument(silicaFile, subcontractorId, "silica"),
      ]);
      const uploadError = whiteCardUpload.error || silicaUpload.error;
      if (uploadError) {
        setError(uploadError);
        return;
      }
      if (!whiteCardUpload.url || !silicaUpload.url) {
        setError("White Card and Silica Certificate uploads are required.");
        return;
      }

      const result = await createSubcontractorPortalWorker({
        subcontractorId,
        organisationId,
        firstName,
        lastName,
        email,
        phone,
        trade,
        whiteCardUrl: whiteCardUpload.url,
        silicaUrl: silicaUpload.url,
      });
      if (result.error) {
        setError(result.error);
        return;
      }
      if (result.inviteError) {
        setError(result.inviteError);
        return;
      }
      onSaved();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to add worker.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <form
        onSubmit={(event) => void handleSubmit(event)}
        className={`${modalShellClass} max-w-lg`}
      >
        <div className="flex items-start justify-between gap-3 px-6 pt-6">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
              Workers
            </p>
            <h2 className="mt-1 text-lg font-bold text-slate-900">New Worker</h2>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={`${modalBodyClass} space-y-4`}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>First name *</span>
              <input
                className={inputClass}
                value={firstName}
                onChange={(event) => setFirstName(event.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Last name *</span>
              <input
                className={inputClass}
                value={lastName}
                onChange={(event) => setLastName(event.target.value)}
                required
              />
            </label>
          </div>
          <label className="block space-y-1">
            <span className={labelClass}>Email *</span>
            <input
              className={inputClass}
              type="email"
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Phone *</span>
            <input
              className={inputClass}
              value={phone}
              onChange={(event) => setPhone(event.target.value)}
              required
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Trade / Role *</span>
            <input
              className={inputClass}
              value={trade}
              onChange={(event) => setTrade(event.target.value)}
              required
            />
          </label>

          <div className="space-y-3">
            <p className="text-sm font-semibold text-slate-900">Compliance documents</p>
            <label className="block space-y-1">
              <span className={labelClass}>White Card *</span>
              <input
                className={inputClass}
                type="file"
                accept=".pdf,image/*"
                onChange={(event) => setWhiteCardFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Silica Certificate *</span>
              <input
                className={inputClass}
                type="file"
                accept=".pdf,image/*"
                onChange={(event) => setSilicaFile(event.target.files?.[0] ?? null)}
                required
              />
            </label>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className={`${modalStickyFooterClass} flex justify-end gap-2`}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-600"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Add worker
          </button>
        </div>
      </form>
    </div>
  );
}
