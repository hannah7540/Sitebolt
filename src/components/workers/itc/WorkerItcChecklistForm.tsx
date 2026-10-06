"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useRouter } from "next/navigation";
import { Camera, FileDown, Loader2 } from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import Toast from "@/components/ui/Toast";
import { getChecklistTemplateItem } from "@/lib/worker-itc-checklist-templates";
import {
  completeWorkerItc,
  fetchWorkerItcDetail,
  fetchWorkerItcPlan,
  saveWorkerItcChecklist,
  uploadWorkerItcChecklistPhoto,
  type WorkerItcChecklistEntryRow,
} from "@/lib/worker-itc-service";
import { ITP_ITC_COMPLETED_TOAST } from "@/lib/itp-itc-payload";
import { downloadItpItcPdf, generateWorkerItcPdf } from "@/lib/itp-itc-export-pdf";
import ItcPhotoThumbGallery from "@/components/itc/ItcPhotoThumbGallery";
import { ITC_MAX_SECTION_PHOTOS } from "@/lib/itc-naming";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerItcChecklistFormProps {
  itcId: string;
  projectId: string;
  projectName?: string;
  workerId: string;
  workerName: string;
  onClose: () => void;
  onCompleted: () => void;
}

export default function WorkerItcChecklistForm({
  itcId,
  projectId,
  projectName = "Project",
  workerId,
  workerName,
  onClose,
  onCompleted,
}: WorkerItcChecklistFormProps) {
  const router = useRouter();
  const [entries, setEntries] = useState<WorkerItcChecklistEntryRow[]>([]);
  const [itcNumber, setItcNumber] = useState("");
  const [itcStatus, setItcStatus] = useState("in_progress");
  const [completedAt, setCompletedAt] = useState<string | null>(null);
  const [pinX, setPinX] = useState<number | null>(null);
  const [pinY, setPinY] = useState<number | null>(null);
  const [planUrl, setPlanUrl] = useState<string | null>(null);
  const [exporting, setExporting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingKey, setUploadingKey] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchWorkerItcDetail(itcId);
      if (result.error || !result.itc) {
        setError(result.error ?? "Unable to load ITC checklist.");
        return;
      }
      setItcNumber(result.itc.itc_number);
      setItcStatus(result.itc.status);
      setCompletedAt(result.itc.completed_at);
      setPinX(result.itc.pin_x ?? result.itc.map_x);
      setPinY(result.itc.pin_y ?? result.itc.map_y);
      setEntries(result.entries);
      const plan = await fetchWorkerItcPlan(projectId);
      setPlanUrl(plan.plan?.image_url ?? null);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Unable to load ITC checklist.");
    } finally {
      setLoading(false);
    }
  }, [itcId, projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const allMandatoryComplete = useMemo(
    () => entries.every((entry) => !entry.is_mandatory || entry.is_checked),
    [entries]
  );

  const updateEntry = (itemKey: string, patch: Partial<WorkerItcChecklistEntryRow>) => {
    setEntries((current) =>
      current.map((entry) =>
        entry.item_key === itemKey ? { ...entry, ...patch } : entry
      )
    );
  };

  const handlePhotoUpload = async (itemKey: string, files: File[]) => {
    if (!files.length) return;
    const entry = entries.find((row) => row.item_key === itemKey);
    const current = entry?.photos?.length ? entry.photos : entry?.photo_url ? [entry.photo_url] : [];
    if (current.length >= ITC_MAX_SECTION_PHOTOS) {
      setToast({ message: `Maximum of ${ITC_MAX_SECTION_PHOTOS} photos reached.`, variant: "error" });
      return;
    }
    setUploadingKey(itemKey);
    try {
      const urls = [...current];
      for (const file of files) {
        if (urls.length >= ITC_MAX_SECTION_PHOTOS) break;
        const upload = await uploadWorkerItcChecklistPhoto({
          projectId,
          itcId,
          itemKey,
          file,
        });
        if (upload.error || !upload.url) {
          setToast({ message: upload.error ?? "Photo upload failed.", variant: "error" });
          break;
        }
        urls.push(upload.url);
      }
      updateEntry(itemKey, { photo_url: urls[0] ?? null, photos: urls });
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Network error while saving. Please try again.";
      setToast({ message, variant: "error" });
    } finally {
      setUploadingKey(null);
    }
  };

  const buildSavePayload = () =>
    entries.map((entry) => ({
      item_key: entry.item_key,
      item_label: entry.item_label,
      is_mandatory: entry.is_mandatory,
      is_checked: entry.is_checked,
      notes: entry.notes,
      photo_url: entry.photos?.[0] ?? entry.photo_url,
      photos: entry.photos?.length ? entry.photos : entry.photo_url ? [entry.photo_url] : [],
      sort_order: entry.sort_order,
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await saveWorkerItcChecklist({
        itcId,
        workerId,
        workerName,
        items: buildSavePayload(),
      });
      if (result.error) {
        setError(result.error);
        setToast({ message: result.error, variant: "error" });
        return;
      }
      setToast({ message: "ITC progress saved successfully.", variant: "success" });
      await load();
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Network error while saving. Please try again.";
      setError(message);
      setToast({ message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleComplete = async () => {
    setSaving(true);
    setError(null);
    try {
      const saveResult = await saveWorkerItcChecklist({
        itcId,
        workerId,
        workerName,
        items: buildSavePayload(),
      });
      if (saveResult.error) {
        setError(saveResult.error);
        setToast({ message: saveResult.error, variant: "error" });
        return;
      }

      const completeResult = await completeWorkerItc({ itcId, workerId });
      if (completeResult.error) {
        setError(completeResult.error);
        setToast({ message: completeResult.error, variant: "error" });
        return;
      }
      setToast({ message: ITP_ITC_COMPLETED_TOAST, variant: "success" });
      router.refresh();
      window.setTimeout(() => onCompleted(), 900);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Network error while saving. Please try again.";
      setError(message);
      setToast({ message, variant: "error" });
    } finally {
      setSaving(false);
    }
  };

  const handleMobileBack = useCallback(() => {
    onClose();
    return true;
  }, [onClose]);

  useMobileBackHandler(handleMobileBack, true);

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-4 worker-mobile-content-pad lg:pb-0">
      <button
        type="button"
        onClick={onClose}
        className="hidden items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700 lg:inline-flex"
      >
        ← Back to floorplan
      </button>

      <WorkerMobileBackButton label="Back to floorplan" onClick={onClose} />

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="text-xl font-bold text-slate-900">{itcNumber}</h2>
          <p className="text-sm text-slate-500">
            Collaborative checklist — each item shows who last updated it.
          </p>
        </div>
        {itcStatus === "completed" || itcStatus === "complete" ? (
          <button
            type="button"
            disabled={exporting}
            onClick={() => {
              setExporting(true);
              void generateWorkerItcPdf({
                itcNumber,
                projectName,
                status: "Completed / Signed-off",
                completedAt,
                workerName,
                entries,
                planUrl,
                pinX,
                pinY,
              })
                .then((result) => downloadItpItcPdf(result.blob, result.fileName))
                .catch((cause) =>
                  setToast({
                    message: cause instanceof Error ? cause.message : "PDF export failed.",
                    variant: "error",
                  })
                )
                .finally(() => setExporting(false));
            }}
            className="inline-flex items-center gap-1 rounded-lg bg-slate-900 px-3 py-2 text-xs font-semibold text-white"
          >
            {exporting ? <Loader2 className="h-3.5 w-3.5 animate-spin" /> : <FileDown className="h-3.5 w-3.5" />}
            Export to PDF
          </button>
        ) : null}
      </div>

      {error ? (
        <div className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
          {error}
        </div>
      ) : null}

      <div className="space-y-3">
        {entries.map((entry) => {
          const template = getChecklistTemplateItem(entry.item_key);
          const touchedByOther =
            entry.worker_id && entry.worker_id !== workerId && entry.worker_name;

          return (
            <div key={entry.item_key} className={cn(cardClass, "p-4")}>
              <div className="flex flex-wrap items-start justify-between gap-2">
                <label className="flex items-start gap-3">
                  <input
                    type="checkbox"
                    checked={entry.is_checked}
                    onChange={(event) =>
                      updateEntry(entry.item_key, { is_checked: event.target.checked })
                    }
                    className="mt-1 h-4 w-4 rounded border-slate-300 text-orange-600"
                  />
                  <span>
                    <span className="font-semibold text-slate-900">{entry.item_label}</span>
                    {entry.is_mandatory ? (
                      <span className="ml-2 text-[10px] font-bold uppercase text-orange-600">
                        Required
                      </span>
                    ) : null}
                    {template?.description ? (
                      <p className="mt-1 text-xs text-slate-500">{template.description}</p>
                    ) : null}
                  </span>
                </label>
                {entry.worker_name ? (
                  <span className="rounded-full bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-600">
                    {touchedByOther ? `${entry.worker_name}` : "You"} ·{" "}
                    {new Date(entry.updated_at).toLocaleString()}
                  </span>
                ) : null}
              </div>

              <textarea
                value={entry.notes ?? ""}
                onChange={(event) =>
                  updateEntry(entry.item_key, { notes: event.target.value })
                }
                placeholder="Notes for this item…"
                rows={2}
                className={cn(inputClass, "mt-3")}
              />

              <div className="mt-3 space-y-2">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Camera className="h-4 w-4" />
                  {uploadingKey === entry.item_key ? "Uploading…" : "Add photos"}
                  <input
                    type="file"
                    accept="image/*"
                    multiple
                    className="hidden"
                    onChange={(event) => {
                      const files = Array.from(event.target.files ?? []);
                      if (files.length) void handlePhotoUpload(entry.item_key, files);
                      event.target.value = "";
                    }}
                  />
                </label>
                <ItcPhotoThumbGallery
                  urls={entry.photos?.length ? entry.photos : entry.photo_url ? [entry.photo_url] : []}
                  disabled={uploadingKey === entry.item_key}
                  onRemove={(url) => {
                    const next = (entry.photos?.length ? entry.photos : entry.photo_url ? [entry.photo_url] : []).filter(
                      (item) => item !== url
                    );
                    updateEntry(entry.item_key, { photos: next, photo_url: next[0] ?? null });
                  }}
                />
              </div>
            </div>
          );
        })}
      </div>

      <div className="fixed inset-x-0 bottom-0 z-40 border-t border-slate-200 bg-white/95 px-4 py-3 backdrop-blur">
        <div className="mx-auto flex max-w-lg items-center justify-between gap-3">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Close
          </button>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="rounded-lg border border-orange-200 bg-orange-50 px-4 py-2 text-sm font-semibold text-orange-700 disabled:opacity-50"
            >
              {saving ? "Saving…" : "Save ITC"}
            </button>
            {allMandatoryComplete ? (
              <button
                type="button"
                onClick={() => void handleComplete()}
                disabled={saving}
                className="rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
              >
                Complete ITC
              </button>
            ) : null}
          </div>
        </div>
      </div>

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={() => setToast(null)}
        />
      ) : null}
    </div>
  );
}
