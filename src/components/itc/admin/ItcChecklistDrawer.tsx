"use client";

import { useEffect, useMemo, useState } from "react";
import { FileDown, Loader2, Upload, X } from "lucide-react";
import AdminItcChecklistStepPhotos from "@/components/itc/admin/AdminItcChecklistStepPhotos";
import AdminItcPressureTestSection from "@/components/itc/admin/AdminItcPressureTestSection";
import AdminItcServiceSpecFields from "@/components/itc/admin/AdminItcServiceSpecFields";
import AdminItcSignoffTiers from "@/components/itc/admin/AdminItcSignoffTiers";
import AdminItcStructureSelect from "@/components/itc/admin/AdminItcStructureSelect";
import Toast from "@/components/ui/Toast";
import {
  ADMIN_STATUS_CLASSES,
  ADMIN_STATUS_LABELS,
  deriveAdminItcStatus,
  getAdminItp,
  listAdminItcs,
  saveAdminItcRecord,
  syncChecklistWithTemplate,
  uploadAdminRedlineDrawing,
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
  blockNonIntegerKey,
  parseLinesCount,
} from "@/components/itc/admin/itp-itc-admin-numbering";
import {
  ADMIN_ITC_MARK_COMPLETE_KEYS,
  ADMIN_ITC_ZONE_MODES,
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
import { downloadItpItcPdf, generateAdminItcPdf } from "@/lib/itp-itc-export-pdf";

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
  const [runNumber, setRunNumber] = useState(
    String(itc.lines_count ?? itc.run_number ?? "1")
  );
  const [zonesMode, setZonesMode] = useState(itc.zones_mode ?? "Letters");
  const [revision, setRevision] = useState(itc.revision ?? "");
  const [asBuiltsFileName, setAsBuiltsFileName] = useState(
    itc.as_builts_file_name ?? ""
  );
  const [service, setService] = useState(itc.service ?? "");
  const [pipeSize, setPipeSize] = useState(itc.pipe_size ?? "");
  const [pipeMaterial, setPipeMaterial] = useState(itc.pipe_material ?? "");
  const [drawingRef, setDrawingRef] = useState(itc.drawing_name ?? itc.drawing_ref ?? "");
  const [area, setArea] = useState(itc.area ?? "");
  const [upstreamStructure, setUpstreamStructure] = useState(
    itc.upstream_structure ?? ""
  );
  const [downstreamStructure, setDownstreamStructure] = useState(
    itc.downstream_structure ?? ""
  );
  const [structureOptions, setStructureOptions] = useState<string[]>([]);
  const [checklist, setChecklist] = useState<AdminChecklistItem[]>(() =>
    syncChecklistWithTemplate(
      itc.checklist.map((item) => ({ ...item, photos: item.photos ?? [] })),
      itc.template_key
    )
  );
  const [specValues, setSpecValues] = useState<AdminItcSpecValues | null>(itc.spec_values);
  const [photoSlots] = useState(itc.photo_slots ?? emptyAdminPhotoSlots());
  const [waeUrl] = useState(itc.wae_url);
  const [redlineUrl, setRedlineUrl] = useState(itc.redline_url);

  useEffect(() => {
    let cancelled = false;
    void listAdminItcs(itc.project_id).then((rows) => {
      if (cancelled) return;
      const labels = new Set<string>();
      for (const row of rows) {
        if (row.upstream_structure?.trim()) labels.add(row.upstream_structure.trim());
        if (row.downstream_structure?.trim()) labels.add(row.downstream_structure.trim());
        if (row.area?.trim()) labels.add(row.area.trim());
      }
      setStructureOptions(
        [...labels].sort((a, b) =>
          a.localeCompare(b, undefined, { numeric: true, sensitivity: "base" })
        )
      );
    });
    return () => {
      cancelled = true;
    };
  }, [itc.project_id]);
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
  const [exporting, setExporting] = useState(false);
  const [uploadingRedline, setUploadingRedline] = useState(false);
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
      run_number: parseLinesCount(runNumber) ? String(parseLinesCount(runNumber)) : null,
      lines_count: parseLinesCount(runNumber) || null,
      zones_mode: zonesMode.trim() || null,
      revision: revision.trim() || null,
      as_builts_file_name: asBuiltsFileName.trim() || null,
      service: service.trim() || null,
      pipe_size: pipeSize.trim() || null,
      pipe_material: pipeMaterial.trim() || null,
      drawing_ref: drawingRef.trim() || null,
      drawing_name: drawingRef.trim() || null,
      area: area.trim() || null,
      upstream_structure: upstreamStructure.trim() || null,
      downstream_structure: downstreamStructure.trim() || null,
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
      redline_url: redlineUrl,
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
    zonesMode,
    revision,
    asBuiltsFileName,
    service,
    pipeSize,
    pipeMaterial,
    drawingRef,
    area,
    upstreamStructure,
    downstreamStructure,
    checklist,
    specValues,
    photoSlots,
    pressureTest,
    pressurised,
    requiredKpa,
    diameterM,
    waeUrl,
    redlineUrl,
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

  const handleRedlineUpload = async (file: File) => {
    setUploadingRedline(true);
    setMessage(null);
    const uploaded = await uploadAdminRedlineDrawing({
      projectId: itc.project_id,
      itcId: itc.id,
      file,
    });
    setUploadingRedline(false);
    if (uploaded.error || !uploaded.url) {
      setMessage(uploaded.error ?? "Redline upload failed");
      return;
    }
    setRedlineUrl(uploaded.url);
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
    onClose();
  };

  const handleExportPdf = async () => {
    setExporting(true);
    setMessage(null);
    try {
      const parent = currentItc.itp_id ? await getAdminItp(currentItc.itp_id) : null;
      const result = await generateAdminItcPdf({
        itc: currentItc,
        projectName,
        planUrl: parent?.plan_url ?? null,
      });
      downloadItpItcPdf(result.blob, result.fileName);
    } catch (cause) {
      setMessage(cause instanceof Error ? cause.message : "PDF export failed.");
    } finally {
      setExporting(false);
    }
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
            {currentItc.status === "completed" ? (
              <button
                type="button"
                disabled={exporting}
                onClick={() => void handleExportPdf()}
                className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-1.5 text-xs font-semibold text-white"
              >
                {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
                Export to PDF
              </button>
            ) : null}
            <button type="button" onClick={onClose} className={modalCloseIconButtonClass}>
              <X className="h-5 w-5" />
            </button>
          </div>
        </div>
        <div className={modalBodyClass}>
          <div className="mb-5 grid gap-3 rounded-xl border border-slate-200 bg-slate-50 p-4 sm:grid-cols-2">
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Number of Lines in ITC
              </span>
              <input
                type="number"
                min={1}
                step={1}
                inputMode="numeric"
                value={runNumber}
                onKeyDown={blockNonIntegerKey}
                onChange={(event) => {
                  const next = event.target.value;
                  if (next === "") {
                    setRunNumber("");
                    return;
                  }
                  const parsed = parseLinesCount(next);
                  if (parsed > 0) setRunNumber(String(parsed));
                }}
                className={inputClass}
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Zones
              </span>
              <select
                value={zonesMode}
                onChange={(event) => setZonesMode(event.target.value)}
                className={inputClass}
              >
                {ADMIN_ITC_ZONE_MODES.map((mode) => (
                  <option key={mode} value={mode}>
                    {mode}
                  </option>
                ))}
              </select>
            </label>
            <AdminItcStructureSelect
              id={`itc-upstream-${itc.id}`}
              label="Upstream Structure"
              value={upstreamStructure}
              options={structureOptions}
              placeholder="Select or type upstream structure"
              onChange={(next) => {
                setUpstreamStructure(next);
                setArea(next);
              }}
            />
            <AdminItcStructureSelect
              id={`itc-downstream-${itc.id}`}
              label="Downstream Structure"
              value={downstreamStructure}
              options={structureOptions}
              placeholder="Select or type downstream structure"
              onChange={setDownstreamStructure}
            />
            <div className="sm:col-span-2">
              <AdminItcServiceSpecFields
                service={service}
                pipeSize={pipeSize}
                pipeMaterial={pipeMaterial}
                templateKey={itc.template_key}
                specValues={specValues}
                onServiceChange={setService}
                onPipeSizeChange={setPipeSize}
                onPipeMaterialChange={setPipeMaterial}
                onSpecValuesChange={setSpecValues}
              />
            </div>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Drawing Name
              </span>
              <input
                value={drawingRef}
                onChange={(event) => setDrawingRef(event.target.value)}
                className={inputClass}
                placeholder='e.g. "C0604"'
              />
            </label>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                Revision
              </span>
              <input
                value={revision}
                onChange={(event) => setRevision(event.target.value)}
                className={inputClass}
                placeholder='e.g. "B"'
              />
            </label>
          </div>

          <div className="space-y-3">
            {checklist.map((item) => {
              const markComplete = ADMIN_ITC_MARK_COMPLETE_KEYS.has(item.key);
              return (
                <div key={item.key} className="rounded-xl border border-slate-200 p-3">
                  <p className="text-sm font-medium text-slate-900">{item.text}</p>
                  {markComplete ? (
                    <label className="mt-3 inline-flex items-center gap-2 text-sm font-semibold text-slate-800">
                      <input
                        type="checkbox"
                        checked={item.result === "yes"}
                        onChange={(event) =>
                          updateResult(item.key, event.target.checked ? "yes" : "")
                        }
                        className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
                      />
                      Mark as Complete
                    </label>
                  ) : (
                    <>
                      <div className="mt-2 flex flex-wrap gap-3">
                        {RESULTS.map((result) => (
                          <label
                            key={result}
                            className="inline-flex items-center gap-1.5 text-sm"
                          >
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
                    </>
                  )}
                  <AdminItcChecklistStepPhotos
                    projectId={itc.project_id}
                    itcId={itc.id}
                    stepKey={item.key}
                    stepLabel={item.text}
                    photos={item.photos ?? []}
                    onChange={(photos) =>
                      setChecklist((current) =>
                        current.map((row) =>
                          row.key === item.key ? { ...row, photos } : row
                        )
                      )
                    }
                  />
                </div>
              );
            })}
          </div>

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

          <section className="mt-6 space-y-3">
            <h3 className="text-sm font-semibold text-slate-900">Plan markup (WAE)</h3>
            <label>
              <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">
                As-builts file name
              </span>
              <input
                value={asBuiltsFileName}
                onChange={(event) => setAsBuiltsFileName(event.target.value)}
                className={inputClass}
                placeholder='e.g. "C0604-WAE-RevB.pdf"'
              />
            </label>
          </section>

          <section className="mt-6">
            <h3 className="text-sm font-semibold text-slate-900">Redline drawing</h3>
            {redlineUrl ? (
              <div className="mt-2 flex flex-wrap items-center gap-3">
                <a
                  href={redlineUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-semibold text-orange-600"
                >
                  View current redline
                </a>
                <button
                  type="button"
                  onClick={() => setRedlineUrl(null)}
                  className="text-sm font-semibold text-rose-600"
                >
                  Remove
                </button>
              </div>
            ) : (
              <p className="mt-1 text-xs text-slate-500">No redline drawing uploaded yet.</p>
            )}
            <label className="mt-3 inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm font-semibold text-slate-700">
              {uploadingRedline ? (
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              ) : (
                <Upload className="h-4 w-4" />
              )}
              {uploadingRedline
                ? "Uploading…"
                : redlineUrl
                  ? "Update/Upload Redline Drawing"
                  : "Update/Upload Redline Drawing"}
              <input
                type="file"
                accept="image/*,application/pdf"
                className="hidden"
                disabled={uploadingRedline}
                onChange={(event) => {
                  const file = event.target.files?.[0];
                  if (file) void handleRedlineUpload(file);
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
