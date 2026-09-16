"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, Upload, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  formatAdminDate,
  formatGpsTag,
  persistAdminItcMedia,
  saveAdminItcChecklist,
  uploadAdminItcPhoto,
  uploadAdminWaeMarkup,
  type AdminChecklistItem,
  type AdminItcRecord,
  type ChecklistResult,
} from "@/components/itc/admin/itp-itc-admin-api";
import {
  inputClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface ItcChecklistDrawerProps {
  itc: AdminItcRecord;
  projectName: string;
  defaultSignerName: string;
  onClose: () => void;
  onSaved: (itc: AdminItcRecord) => void;
}

const RESULTS: ChecklistResult[] = ["yes", "no", "na"];

export default function ItcChecklistDrawer({
  itc,
  projectName,
  defaultSignerName,
  onClose,
  onSaved,
}: ItcChecklistDrawerProps) {
  const [checklist, setChecklist] = useState<AdminChecklistItem[]>(itc.checklist);
  const [photos, setPhotos] = useState(itc.photos);
  const [waeUrl, setWaeUrl] = useState(itc.wae_url);
  const [completedByName, setCompletedByName] = useState(
    itc.completed_by_name || defaultSignerName
  );
  const [reviewedByName, setReviewedByName] = useState(itc.reviewed_by_name || "");
  const [completedSignature, setCompletedSignature] = useState<string | null>(
    itc.completed_by_signature
  );
  const [reviewedSignature, setReviewedSignature] = useState<string | null>(
    itc.reviewed_by_signature
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const currentItc = useMemo<AdminItcRecord>(
    () => ({
      ...itc,
      checklist,
      photos,
      wae_url: waeUrl,
      completed_by_name: completedByName,
      completed_by_signature: completedSignature,
      reviewed_by_name: reviewedByName,
      reviewed_by_signature: reviewedSignature,
    }),
    [
      itc,
      checklist,
      photos,
      waeUrl,
      completedByName,
      completedSignature,
      reviewedByName,
      reviewedSignature,
    ]
  );

  const updateResult = (key: string, result: ChecklistResult) => {
    setChecklist((rows) =>
      rows.map((row) => (row.key === key ? { ...row, result } : row))
    );
  };

  const updateRemarks = (key: string, remarks: string) => {
    setChecklist((rows) =>
      rows.map((row) => (row.key === key ? { ...row, remarks } : row))
    );
  };

  const handlePhoto = async (file: File, label: string) => {
    setUploading(true);
    setMessage(null);
    const uploaded = await uploadAdminItcPhoto({
      projectId: itc.project_id,
      itcId: itc.id,
      file,
      label,
    });
    setUploading(false);
    if (uploaded.error || !uploaded.photo) {
      setMessage(uploaded.error ?? "Photo upload failed");
      return;
    }
    const nextPhotos = [...photos, uploaded.photo];
    setPhotos(nextPhotos);
    await persistAdminItcMedia({ ...currentItc, photos: nextPhotos });
  };

  const handleWae = async (file: File) => {
    setUploading(true);
    setMessage(null);
    const uploaded = await uploadAdminWaeMarkup({
      projectId: itc.project_id,
      itcId: itc.id,
      file,
    });
    setUploading(false);
    if (uploaded.error || !uploaded.url) {
      setMessage(uploaded.error ?? "WAE upload failed");
      return;
    }
    setWaeUrl(uploaded.url);
    await persistAdminItcMedia({ ...currentItc, wae_url: uploaded.url });
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const result = await saveAdminItcChecklist({
      itc: currentItc,
      checklist,
      completedByName,
      completedBySignature: completedSignature,
      reviewedByName,
      reviewedBySignature: reviewedSignature,
    });
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    onSaved(currentItc);
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalShellClass} max-w-4xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-5 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              ITC checklist
            </p>
            <h2 className="text-lg font-semibold text-slate-900">{itc.number}</h2>
            <p className="text-sm text-slate-500">{itc.run_number || "Run not named"}</p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={modalBodyClass}>
          <dl className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 text-sm sm:grid-cols-3">
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Project</dt>
              <dd>{projectName}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Area</dt>
              <dd>{itc.area || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Drawing ref</dt>
              <dd>{itc.drawing_ref || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Line / Run</dt>
              <dd>{itc.run_number || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Pipe size</dt>
              <dd>{itc.pipe_size || "—"}</dd>
            </div>
            <div>
              <dt className="text-xs font-semibold uppercase text-slate-500">Material</dt>
              <dd>{itc.pipe_material || "—"}</dd>
            </div>
          </dl>

          <div className="space-y-3">
            {checklist.map((item) => (
              <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                <p className="text-sm font-medium text-slate-900">{item.text}</p>
                <div className="mt-2 flex flex-wrap gap-3">
                  {RESULTS.map((result) => (
                    <label key={result} className="inline-flex items-center gap-1.5 text-sm">
                      <input
                        type="radio"
                        name={`check-${itc.id}-${item.key}`}
                        checked={item.result === result}
                        onChange={() => updateResult(item.key, result)}
                        className="text-orange-500 focus:ring-orange-500"
                      />
                      {result.toUpperCase()}
                    </label>
                  ))}
                </div>
                <input
                  value={item.remarks}
                  onChange={(event) => updateRemarks(item.key, event.target.value)}
                  placeholder="Remarks"
                  className={`${inputClass} mt-2`}
                />
              </div>
            ))}
          </div>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Photo gallery</h3>
            <p className="mb-3 text-xs text-slate-500">
              Installation photos store a timestamp and location tag when GPS is available.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <figure key={photo.url} className="overflow-hidden rounded-lg border border-slate-200">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.label} className="h-32 w-full object-cover" />
                  <figcaption className="space-y-0.5 p-2 text-[11px] text-slate-600">
                    <p className="font-semibold">{photo.label}</p>
                    <p>{formatAdminDate(photo.captured_at) || photo.captured_at || "No timestamp"}</p>
                    <p className="inline-flex items-center gap-1">
                      <MapPin className="h-3 w-3" />
                      {formatGpsTag(photo.gps_lat, photo.gps_lng) || "Location unavailable"}
                    </p>
                  </figcaption>
                </figure>
              ))}
            </div>
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg bg-slate-900 px-3 py-2 text-sm font-semibold text-white">
              <Upload className="h-4 w-4" />
              {uploading ? "Uploading…" : "Upload installation photo"}
              <input
                type="file"
                accept="image/*"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handlePhoto(file, "Installation photo");
                  event.target.value = "";
                }}
              />
            </label>
            <label className="ml-2 mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              Upload plan markup (WAE)
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleWae(file);
                  event.target.value = "";
                }}
              />
            </label>
            {waeUrl ? (
              <a
                href={waeUrl}
                target="_blank"
                rel="noreferrer"
                className="ml-3 text-sm font-semibold text-orange-600"
              >
                View WAE
              </a>
            ) : null}
          </section>

          <section className="mt-6 grid gap-4 md:grid-cols-2">
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Completed by</h3>
              <input
                value={completedByName}
                onChange={(event) => setCompletedByName(event.target.value)}
                className={`${inputClass} mb-2`}
                placeholder="Name"
              />
              <SignatureCanvas
                key={`completed-${itc.id}`}
                value={itc.completed_by_signature}
                onChange={setCompletedSignature}
              />
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Reviewed by</h3>
              <input
                value={reviewedByName}
                onChange={(event) => setReviewedByName(event.target.value)}
                className={`${inputClass} mb-2`}
                placeholder="Name"
              />
              <SignatureCanvas
                key={`reviewed-${itc.id}`}
                value={itc.reviewed_by_signature}
                onChange={setReviewedSignature}
              />
            </div>
          </section>
          {message ? <p className="mt-4 text-sm text-rose-600">{message}</p> : null}
        </div>
        <div className={`${modalStickyFooterClass} flex justify-end gap-2`}>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleSave()}
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save checklist
          </button>
        </div>
      </div>
    </div>
  );
}
