"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Camera, ChevronLeft, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { getChecklistTemplateItem } from "@/lib/worker-itc-checklist-templates";
import {
  completeWorkerItc,
  fetchWorkerItcDetail,
  saveWorkerItcChecklist,
  uploadWorkerItcChecklistPhoto,
  type WorkerItcChecklistEntryRow,
} from "@/lib/worker-itc-service";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerItcChecklistFormProps {
  itcId: string;
  projectId: string;
  workerId: string;
  workerName: string;
  onClose: () => void;
  onCompleted: () => void;
}

export default function WorkerItcChecklistForm({
  itcId,
  projectId,
  workerId,
  workerName,
  onClose,
  onCompleted,
}: WorkerItcChecklistFormProps) {
  const [entries, setEntries] = useState<WorkerItcChecklistEntryRow[]>([]);
  const [itcNumber, setItcNumber] = useState("");
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
    const result = await fetchWorkerItcDetail(itcId);
    if (result.error || !result.itc) {
      setError(result.error ?? "Unable to load ITC checklist.");
      setLoading(false);
      return;
    }
    setItcNumber(result.itc.itc_number);
    setEntries(result.entries);
    setLoading(false);
  }, [itcId]);

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

  const handlePhotoUpload = async (itemKey: string, file: File) => {
    setUploadingKey(itemKey);
    const upload = await uploadWorkerItcChecklistPhoto({
      projectId,
      itcId,
      itemKey,
      file,
    });
    setUploadingKey(null);
    if (upload.error || !upload.url) {
      setToast({ message: upload.error ?? "Photo upload failed.", variant: "error" });
      return;
    }
    updateEntry(itemKey, { photo_url: upload.url });
  };

  const buildSavePayload = () =>
    entries.map((entry) => ({
      item_key: entry.item_key,
      item_label: entry.item_label,
      is_mandatory: entry.is_mandatory,
      is_checked: entry.is_checked,
      notes: entry.notes,
      photo_url: entry.photo_url,
      sort_order: entry.sort_order,
    }));

  const handleSave = async () => {
    setSaving(true);
    setError(null);
    const result = await saveWorkerItcChecklist({
      itcId,
      workerId,
      workerName,
      items: buildSavePayload(),
    });
    setSaving(false);
    if (result.error) {
      setError(result.error);
      setToast({ message: result.error, variant: "error" });
      return;
    }
    setToast({ message: "ITC progress saved successfully.", variant: "success" });
    await load();
  };

  const handleComplete = async () => {
    setSaving(true);
    setError(null);
    const saveResult = await saveWorkerItcChecklist({
      itcId,
      workerId,
      workerName,
      items: buildSavePayload(),
    });
    if (saveResult.error) {
      setSaving(false);
      setError(saveResult.error);
      return;
    }

    const completeResult = await completeWorkerItc({ itcId, workerId });
    setSaving(false);
    if (completeResult.error) {
      setError(completeResult.error);
      setToast({ message: completeResult.error, variant: "error" });
      return;
    }
    setToast({ message: "ITC marked complete.", variant: "success" });
    onCompleted();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
        <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
        Loading checklist…
      </div>
    );
  }

  return (
    <div className="space-y-4 pb-24">
      <button
        type="button"
        onClick={onClose}
        className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700"
      >
        <ChevronLeft className="h-4 w-4" />
        Back to floorplan
      </button>

      <div>
        <h2 className="text-xl font-bold text-slate-900">{itcNumber}</h2>
        <p className="text-sm text-slate-500">
          Collaborative checklist — each item shows who last updated it.
        </p>
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

              <div className="mt-3 flex flex-wrap items-center gap-3">
                <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-xs font-semibold text-slate-700 hover:bg-slate-50">
                  <Camera className="h-4 w-4" />
                  {uploadingKey === entry.item_key ? "Uploading…" : "Attach photo"}
                  <input
                    type="file"
                    accept="image/*"
                    className="hidden"
                    onChange={(event) => {
                      const file = event.target.files?.[0];
                      if (file) void handlePhotoUpload(entry.item_key, file);
                    }}
                  />
                </label>
                {entry.photo_url ? (
                  // eslint-disable-next-line @next/next/no-img-element
                  <img
                    src={entry.photo_url}
                    alt={`${entry.item_label} photo`}
                    className="h-14 w-14 rounded-lg border border-slate-200 object-cover"
                  />
                ) : null}
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
