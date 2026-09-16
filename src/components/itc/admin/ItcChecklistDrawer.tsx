"use client";

import { useMemo, useState } from "react";
import { Loader2, MapPin, Trash2, Upload, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import Toast from "@/components/ui/Toast";
import {
  formatAdminDate,
  formatGpsTag,
  saveAdminItcRecord,
  uploadAdminItcPhoto,
  uploadAdminWaeMarkup,
  type AdminChecklistItem,
  type AdminItcRecord,
  type AdminStatusBadge,
  type ChecklistResult,
} from "@/components/itc/admin/itp-itc-admin-api";
import { ADMIN_PIPE_MATERIALS, ADMIN_PIPE_SIZES } from "@/components/itc/admin/itp-itc-admin-types";
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
const STATUS_OPTIONS: Array<{ value: AdminStatusBadge; label: string }> = [
  { value: "active", label: "Draft" },
  { value: "in_progress", label: "In Progress" },
  { value: "completed", label: "Completed" },
];

function toDateTimeLocal(value: string | null | undefined): string {
  if (!value) return "";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "";
  const local = new Date(date.getTime() - date.getTimezoneOffset() * 60000);
  return local.toISOString().slice(0, 16);
}

function fromDateTimeLocal(value: string): string | null {
  if (!value) return null;
  const date = new Date(value);
  return Number.isNaN(date.getTime()) ? null : date.toISOString();
}

export default function ItcChecklistDrawer({
  itc,
  projectName,
  defaultSignerName,
  onClose,
  onSaved,
}: ItcChecklistDrawerProps) {
  const [runNumber, setRunNumber] = useState(itc.run_number ?? "");
  const [pipeSize, setPipeSize] = useState(itc.pipe_size ?? "");
  const [pipeMaterial, setPipeMaterial] = useState(itc.pipe_material ?? "");
  const [drawingRef, setDrawingRef] = useState(itc.drawing_ref ?? "");
  const [area, setArea] = useState(itc.area ?? "");
  const [status, setStatus] = useState<AdminStatusBadge>(itc.status);
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
  const [completedAt, setCompletedAt] = useState(itc.completed_at);
  const [reviewedAt, setReviewedAt] = useState(itc.reviewed_at);
  const [resignCompleted, setResignCompleted] = useState(!itc.completed_by_signature);
  const [resignReviewed, setResignReviewed] = useState(!itc.reviewed_by_signature);
  const [completedPadKey, setCompletedPadKey] = useState(0);
  const [reviewedPadKey, setReviewedPadKey] = useState(0);
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pipeSizeOptions = useMemo(() => {
    const extra = pipeSize && !ADMIN_PIPE_SIZES.includes(pipeSize as (typeof ADMIN_PIPE_SIZES)[number]);
    return extra ? [pipeSize, ...ADMIN_PIPE_SIZES] : [...ADMIN_PIPE_SIZES];
  }, [pipeSize]);
  const pipeMaterialOptions = useMemo(() => {
    const extra =
      pipeMaterial &&
      !ADMIN_PIPE_MATERIALS.includes(pipeMaterial as (typeof ADMIN_PIPE_MATERIALS)[number]);
    return extra ? [pipeMaterial, ...ADMIN_PIPE_MATERIALS] : [...ADMIN_PIPE_MATERIALS];
  }, [pipeMaterial]);

  const currentItc = useMemo<AdminItcRecord>(
    () => ({
      ...itc,
      run_number: runNumber.trim() || null,
      pipe_size: pipeSize.trim() || null,
      pipe_material: pipeMaterial.trim() || null,
      drawing_ref: drawingRef.trim() || null,
      area: area.trim() || null,
      status,
      checklist,
      photos,
      wae_url: waeUrl,
      completed_by_name: completedByName.trim() || null,
      completed_by_signature: completedSignature,
      completed_at: completedAt,
      reviewed_by_name: reviewedByName.trim() || null,
      reviewed_by_signature: reviewedSignature,
      reviewed_at: reviewedAt,
    }),
    [
      itc,
      runNumber,
      pipeSize,
      pipeMaterial,
      drawingRef,
      area,
      status,
      checklist,
      photos,
      waeUrl,
      completedByName,
      completedSignature,
      completedAt,
      reviewedByName,
      reviewedSignature,
      reviewedAt,
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

  const handlePhoto = async (file: File) => {
    setUploading(true);
    setMessage(null);
    const uploaded = await uploadAdminItcPhoto({
      projectId: itc.project_id,
      itcId: itc.id,
      file,
      label: "Installation photo",
    });
    setUploading(false);
    if (uploaded.error || !uploaded.photo) {
      setMessage(uploaded.error ?? "Photo upload failed");
      return;
    }
    setPhotos((current) => [...current, uploaded.photo!]);
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
  };

  const handleSave = async () => {
    setSaving(true);
    setMessage(null);
    const result = await saveAdminItcRecord(currentItc);
    setSaving(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }
    setToast("Changes saved successfully");
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
              Edit ITC
            </p>
            <h2 className="text-lg font-semibold text-slate-900">{itc.number}</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
          </div>
          <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className={modalBodyClass}>
          <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Run / Line number
              </span>
              <input
                value={runNumber}
                onChange={(event) => setRunNumber(event.target.value)}
                className={inputClass}
                placeholder='e.g. "SW11-01 to SW11-02"'
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Line location / Area notes
              </span>
              <input
                value={area}
                onChange={(event) => setArea(event.target.value)}
                className={inputClass}
                placeholder="Area, pit, or location notes"
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Pipe size
              </span>
              <select
                value={pipeSize}
                onChange={(event) => setPipeSize(event.target.value)}
                className={inputClass}
              >
                <option value="">Select size</option>
                {pipeSizeOptions.map((size) => (
                  <option key={size} value={size}>
                    {size}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Pipe material
              </span>
              <select
                value={pipeMaterial}
                onChange={(event) => setPipeMaterial(event.target.value)}
                className={inputClass}
              >
                <option value="">Select material</option>
                {pipeMaterialOptions.map((material) => (
                  <option key={material} value={material}>
                    {material}
                  </option>
                ))}
              </select>
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Drawing ref & rev
              </span>
              <input
                value={drawingRef}
                onChange={(event) => setDrawingRef(event.target.value)}
                className={inputClass}
                placeholder='e.g. "C0604 Rev B"'
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Status
              </span>
              <select
                value={status}
                onChange={(event) => setStatus(event.target.value as AdminStatusBadge)}
                className={inputClass}
              >
                {STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
          </div>

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
                  placeholder="Remarks / notes"
                  className={`${inputClass} mt-2`}
                />
              </div>
            ))}
          </div>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Photo gallery</h3>
            <p className="mb-3 text-xs text-slate-500">
              Previously saved photos stay here. Add new shots from files or the camera, or remove
              unwanted ones before saving.
            </p>
            <div className="grid gap-3 sm:grid-cols-3">
              {photos.map((photo) => (
                <figure
                  key={photo.url}
                  className="relative overflow-hidden rounded-lg border border-slate-200"
                >
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img src={photo.url} alt={photo.label} className="h-32 w-full object-cover" />
                  <button
                    type="button"
                    onClick={() =>
                      setPhotos((current) => current.filter((row) => row.url !== photo.url))
                    }
                    className="absolute right-2 top-2 inline-flex h-8 w-8 items-center justify-center rounded-full bg-white/90 text-rose-600 shadow"
                    title="Remove photo"
                  >
                    <Trash2 className="h-4 w-4" />
                  </button>
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
              {uploading ? "Uploading…" : "Add photo / camera"}
              <input
                type="file"
                accept="image/*"
                capture="environment"
                className="hidden"
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handlePhoto(file);
                  event.target.value = "";
                }}
              />
            </label>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Plan markup (WAE)</h3>
            {waeUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={waeUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-orange-600"
                >
                  View current WAE
                </a>
                <button
                  type="button"
                  onClick={() => setWaeUrl(null)}
                  className="text-sm font-semibold text-rose-600"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No WAE uploaded yet.</p>
            )}
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              {waeUrl ? "Replace plan markup (WAE)" : "Upload plan markup (WAE)"}
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
              <label className="mb-2 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Date
                </span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(completedAt)}
                  onChange={(event) => setCompletedAt(fromDateTimeLocal(event.target.value))}
                  className={inputClass}
                />
              </label>
              {completedSignature && !resignCompleted ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={completedSignature}
                    alt="Completed by signature"
                    className="h-24 w-full rounded-lg border border-slate-200 bg-white object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setCompletedSignature(null);
                      setCompletedAt(null);
                      setResignCompleted(true);
                      setCompletedPadKey((current) => current + 1);
                    }}
                    className="text-sm font-semibold text-orange-600"
                  >
                    Clear / Resign
                  </button>
                </div>
              ) : (
                <SignatureCanvas
                  key={`completed-${itc.id}-${completedPadKey}`}
                  value={null}
                  onChange={(value) => {
                    setCompletedSignature(value);
                    if (value && !completedAt) setCompletedAt(new Date().toISOString());
                  }}
                />
              )}
            </div>
            <div>
              <h3 className="mb-2 text-sm font-semibold text-slate-900">Reviewed by</h3>
              <input
                value={reviewedByName}
                onChange={(event) => setReviewedByName(event.target.value)}
                className={`${inputClass} mb-2`}
                placeholder="Name"
              />
              <label className="mb-2 block">
                <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                  Date
                </span>
                <input
                  type="datetime-local"
                  value={toDateTimeLocal(reviewedAt)}
                  onChange={(event) => setReviewedAt(fromDateTimeLocal(event.target.value))}
                  className={inputClass}
                />
              </label>
              {reviewedSignature && !resignReviewed ? (
                <div className="space-y-2">
                  {/* eslint-disable-next-line @next/next/no-img-element */}
                  <img
                    src={reviewedSignature}
                    alt="Reviewed by signature"
                    className="h-24 w-full rounded-lg border border-slate-200 bg-white object-contain"
                  />
                  <button
                    type="button"
                    onClick={() => {
                      setReviewedSignature(null);
                      setReviewedAt(null);
                      setResignReviewed(true);
                      setReviewedPadKey((current) => current + 1);
                    }}
                    className="text-sm font-semibold text-orange-600"
                  >
                    Clear / Resign
                  </button>
                </div>
              ) : (
                <SignatureCanvas
                  key={`reviewed-${itc.id}-${reviewedPadKey}`}
                  value={null}
                  onChange={(value) => {
                    setReviewedSignature(value);
                    if (value && !reviewedAt) setReviewedAt(new Date().toISOString());
                  }}
                />
              )}
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
            Save Changes
          </button>
        </div>
      </div>
      {toast ? (
        <div onClick={(event) => event.stopPropagation()}>
          <Toast message={toast} variant="success" onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
