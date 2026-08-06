"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import { getPrestartDefectLabel } from "@/lib/plant-prestart-utils";
import { inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface PlantDefectResolveModalProps {
  plant: PlantAsset;
  prestart: PlantPrestart;
  onClose: () => void;
  onConfirm: (resolutionNotes: string) => Promise<{ error: string | null }>;
}

export default function PlantDefectResolveModal({
  plant,
  prestart,
  onClose,
  onConfirm,
}: PlantDefectResolveModalProps) {
  const [notes, setNotes] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleConfirm = async () => {
    setSubmitting(true);
    setError(null);
    const result = await onConfirm(notes.trim());
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  const defectLabel = getPrestartDefectLabel(prestart);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-md`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Mark Defect as Resolved?</h2>
            <p className="mt-1 text-sm text-slate-600">
              {plant.unit_number} · {defectLabel}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <label className="mb-4 block space-y-1">
          <span className="text-xs font-semibold uppercase text-slate-500">
            Resolution notes (optional)
          </span>
          <textarea
            value={notes}
            onChange={(event) => setNotes(event.target.value)}
            rows={3}
            placeholder="e.g. Oil leak repaired and tested"
            className={inputClass}
          />
        </label>

        {error ? <p className="mb-3 text-sm text-red-600">{error}</p> : null}

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="flex-1 rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={() => void handleConfirm()}
            disabled={submitting}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Saving…
              </>
            ) : (
              "Confirm & Resolve"
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
