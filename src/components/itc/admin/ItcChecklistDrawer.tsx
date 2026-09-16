"use client";

import { useMemo, useState } from "react";
import { Loader2, Trash2, X } from "lucide-react";
import AdminItcPhotoSlotGrid from "@/components/itc/admin/AdminItcPhotoSlotGrid";
import AdminItcPressureTestSection from "@/components/itc/admin/AdminItcPressureTestSection";
import AdminItcServiceSpecFields from "@/components/itc/admin/AdminItcServiceSpecFields";
import AdminItcSignoffTiers from "@/components/itc/admin/AdminItcSignoffTiers";
import Toast from "@/components/ui/Toast";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  deriveAdminItcStatus,
  saveAdminItcRecord,
  uploadAdminWaeMarkup,
  type AdminChecklistItem,
  type AdminItcRecord,
  type ChecklistResult,
} from "@/components/itc/admin/itp-itc-admin-api";
import {
  emptyAdminPhotoSlots,
  emptyAdminPressureTest,
  emptyAdminSignoff,
} from "@/components/itc/admin/itp-itc-admin-hybrid";
import {
  isPressurisedAdminItc,
  parsePipeDiameterMm,
  requiredPressureKpaForItc,
} from "@/components/itc/admin/itp-itc-admin-specs";
import {
  DEFAULT_ITC_CLIENT,
  DEFAULT_MANAGING_CONTRACTOR,
  DEFAULT_SUBCONTRACTOR,
  type AdminItcSpecValues,
} from "@/components/itc/admin/itp-itc-admin-types";
import { headFromTestPressureKpa } from "@/lib/itc-pressure-test";
import {
  inputClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ItcChecklistDrawerProps {
  itc: AdminItcRecord;
  projectName: string;
  defaultSignerName: string;
  onClose: () => void;
  onSaved: (itc: AdminItcRecord) => void;
  onRequestDelete?: () => void;
}

const RESULTS: ChecklistResult[] = ["yes", "no", "na"];

export default function ItcChecklistDrawer({
  itc,
  projectName,
  defaultSignerName,
  onClose,
  onSaved,
  onRequestDelete,
}: ItcChecklistDrawerProps) {
  const [runNumber, setRunNumber] = useState(itc.run_number ?? "");
  const [pipeSize, setPipeSize] = useState(itc.pipe_size ?? "");
  const [pipeMaterial, setPipeMaterial] = useState(itc.pipe_material ?? "");
  const [drawingRef, setDrawingRef] = useState(itc.drawing_ref ?? "");
  const [area, setArea] = useState(itc.area ?? "");
  const [checklist, setChecklist] = useState<AdminChecklistItem[]>(itc.checklist);
  const [specValues, setSpecValues] = useState<AdminItcSpecValues | null>(itc.spec_values);
  const [photoSlots, setPhotoSlots] = useState(itc.photo_slots ?? emptyAdminPhotoSlots());
  const [waeUrl, setWaeUrl] = useState(itc.wae_url);
  const [subcontractorSign, setSubcontractorSign] = useState(
    itc.subcontractor_sign ??
      emptyAdminSignoff({
        company: DEFAULT_SUBCONTRACTOR,
        full_name: itc.completed_by_name || defaultSignerName,
        signature_url: itc.completed_by_signature,
        signed_at: itc.completed_at,
      })
  );
  const [contractorSign, setContractorSign] = useState(
    itc.contractor_sign ??
      emptyAdminSignoff({
        company: DEFAULT_MANAGING_CONTRACTOR,
        full_name: itc.reviewed_by_name,
        signature_url: itc.reviewed_by_signature,
        signed_at: itc.reviewed_at,
      })
  );
  const [clientSign, setClientSign] = useState(
    itc.client_sign ?? emptyAdminSignoff({ company: DEFAULT_ITC_CLIENT })
  );
  const requiredKpa = requiredPressureKpaForItc({ template_key: itc.template_key });
  const diameterM = parsePipeDiameterMm(pipeSize);
  const [pressureTest, setPressureTest] = useState(
    itc.pressure_test_data ??
      emptyAdminPressureTest({
        requiredKpa,
        diameterM: diameterM != null ? diameterM / 1000 : null,
      })
  );
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const pressurised = isPressurisedAdminItc({
    template_key: itc.template_key,
    pipe_material: pipeMaterial,
    pipe_size: pipeSize,
  });

  const currentItc = useMemo<AdminItcRecord>(() => {
    const next: AdminItcRecord = {
      ...itc,
      run_number: runNumber.trim() || null,
      pipe_size: pipeSize.trim() || null,
      pipe_material: pipeMaterial.trim() || null,
      drawing_ref: drawingRef.trim() || null,
      area: area.trim() || null,
      checklist,
      spec_values: specValues,
      photo_slots: photoSlots,
      pressure_test_data: pressurised
        ? {
            ...pressureTest,
            required_pressure_kpa: requiredKpa,
            diameter_m: pressureTest.diameter_m ?? (diameterM != null ? diameterM / 1000 : null),
            head_m: pressureTest.head_m ?? headFromTestPressureKpa(requiredKpa),
          }
        : pressureTest,
      wae_url: waeUrl,
      subcontractor_sign: {
        ...subcontractorSign,
        full_name: subcontractorSign.full_name || defaultSignerName,
        company: subcontractorSign.company || DEFAULT_SUBCONTRACTOR,
      },
      contractor_sign: contractorSign,
      client_sign: clientSign,
      completed_by_name: subcontractorSign.full_name || defaultSignerName,
      completed_by_signature: subcontractorSign.signature_url,
      completed_at: subcontractorSign.signed_at,
      reviewed_by_name: contractorSign.full_name,
      reviewed_by_signature: contractorSign.signature_url,
      reviewed_at: contractorSign.signed_at,
    };
    return { ...next, status: deriveAdminItcStatus(next) };
  }, [
    itc,
    runNumber,
    pipeSize,
    pipeMaterial,
    drawingRef,
    area,
    checklist,
    specValues,
    photoSlots,
    pressureTest,
    pressurised,
    requiredKpa,
    diameterM,
    waeUrl,
    subcontractorSign,
    contractorSign,
    clientSign,
    defaultSignerName,
  ]);

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
        className={`${modalShellClass} max-w-5xl`}
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
          <div className="flex items-center gap-2">
            <span
              className={cn(
                "rounded-full px-2 py-0.5 text-[11px] font-semibold",
                ADMIN_STATUS_CLASSES[currentItc.status]
              )}
            >
              {ADMIN_STATUS_LABELS[currentItc.status]}
            </span>
            <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
              <X className="h-5 w-5" />
            </button>
          </div>
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
            <div className="sm:col-span-2">
              <AdminItcServiceSpecFields
                pipeSize={pipeSize}
                pipeMaterial={pipeMaterial}
                templateKey={itc.template_key}
                specValues={specValues}
                onPipeSizeChange={setPipeSize}
                onPipeMaterialChange={setPipeMaterial}
                onSpecValuesChange={setSpecValues}
              />
            </div>
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

          <AdminItcPhotoSlotGrid
            projectId={itc.project_id}
            itcId={itc.id}
            slots={photoSlots}
            onChange={setPhotoSlots}
          />

          {pressurised ? (
            <AdminItcPressureTestSection
              serviceLabel={
                String(itc.template_key ?? "").includes("fire")
                  ? "Fire service — 1700 kPa"
                  : "Potable water — 1500 kPa"
              }
              value={{
                ...pressureTest,
                required_pressure_kpa: requiredKpa,
                diameter_m:
                  pressureTest.diameter_m ?? (diameterM != null ? diameterM / 1000 : null),
                head_m: pressureTest.head_m ?? headFromTestPressureKpa(requiredKpa),
              }}
              onChange={setPressureTest}
            />
          ) : null}

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
              {uploading ? "Uploading…" : waeUrl ? "Replace plan markup (WAE)" : "Upload plan markup (WAE)"}
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

          <AdminItcSignoffTiers
            subcontractor={subcontractorSign}
            contractor={contractorSign}
            client={clientSign}
            onSubcontractorChange={setSubcontractorSign}
            onContractorChange={setContractorSign}
            onClientChange={setClientSign}
          />
          {message ? <p className="mt-4 text-sm text-rose-600">{message}</p> : null}
        </div>
        <div className={`${modalStickyFooterClass} flex flex-wrap items-center justify-between gap-2`}>
          {onRequestDelete ? (
            <button
              type="button"
              onClick={onRequestDelete}
              className="rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700"
              title={`Delete ITC? Are you sure you want to delete ${itc.number} - ${runNumber || itc.number}? This will permanently remove this checklist, photos, and remove its pin from the drawing.`}
            >
              Delete ITC
            </button>
          ) : (
            <span />
          )}
          <div className="flex gap-2">
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
      </div>
      {toast ? (
        <div onClick={(event) => event.stopPropagation()}>
          <Toast message={toast} variant="success" onDismiss={() => setToast(null)} />
        </div>
      ) : null}
    </div>
  );
}
