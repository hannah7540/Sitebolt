"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import {
  X,
  Loader2,
  AlertTriangle,
  User,
  Clock,
  Wrench,
} from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import {
  fetchLatestDefectPrestart,
  clearPlantDefect,
} from "@/lib/supabase";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
  sectionClass,
} from "@/lib/ui-classes";

interface PlantDefectModalProps {
  plant: PlantAsset;
  onClose: () => void;
  onCleared: () => void;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PlantDefectModal({
  plant,
  onClose,
  onCleared,
}: PlantDefectModalProps) {
  const [prestart, setPrestart] = useState<PlantPrestart | null>(null);
  const [loading, setLoading] = useState(true);
  const [repairNotes, setRepairNotes] = useState("");
  const [invoiceRef, setInvoiceRef] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    async function load() {
      const data = await fetchLatestDefectPrestart(plant.id);
      setPrestart(data);
      setLoading(false);
    }
    load();
  }, [plant.id]);

  const handleClear = async () => {
    if (!prestart) return;
    if (!repairNotes.trim()) {
      setError("Please enter repair notes before clearing the tag-out.");
      return;
    }

    setSubmitting(true);
    setError(null);
    const { error: clearError } = await clearPlantDefect({
      plantId: plant.id,
      prestartId: prestart.id,
      repairNotes: repairNotes.trim(),
      mechanicInvoiceRef: invoiceRef.trim() || undefined,
    });
    setSubmitting(false);

    if (clearError) {
      setError(clearError);
      return;
    }
    onCleared();
    onClose();
  };

  return (
    <div className={modalOverlayClass}>
      <div className={`${modalClass} max-w-lg border-red-300`}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <div className="mb-4 flex items-center gap-2 text-red-600">
          <AlertTriangle className="h-5 w-5" />
          <h2 className="text-lg font-bold">Tag-Out Defect Report</h2>
        </div>
        <p className="mb-6 text-sm text-slate-600">
          {plant.unit_number}
          {plant.make && ` · ${plant.make}`}
          {plant.model && ` ${plant.model}`}
        </p>

        {loading && (
          <div className="flex justify-center py-10">
            <Loader2 className="h-6 w-6 animate-spin text-orange-500" />
          </div>
        )}

        {!loading && !prestart && (
          <p className="py-6 text-center text-slate-500">
            No defect pre-start record found for this machine.
          </p>
        )}

        {prestart && (
          <div className="space-y-4">
            <div className={sectionClass}>
              <div className="flex items-center gap-2 text-sm text-slate-700">
                <User className="h-4 w-4 text-orange-500" />
                <span className="font-medium">{prestart.operator_name}</span>
              </div>
              <div className="flex items-center gap-2 text-sm text-slate-600">
                <Clock className="h-4 w-4" />
                {formatTimestamp(prestart.created_at)}
              </div>
              {prestart.defect_comments && (
                <div>
                  <p className="mb-1 text-xs font-semibold uppercase text-slate-500">
                    Defect Comments
                  </p>
                  <p className="text-sm text-slate-900">{prestart.defect_comments}</p>
                </div>
              )}
              {prestart.defect_photo_url && (
                <div>
                  <p className="mb-2 text-xs font-semibold uppercase text-slate-500">
                    Defect Photo
                  </p>
                  <a
                    href={prestart.defect_photo_url}
                    target="_blank"
                    rel="noopener noreferrer"
                    className="block overflow-hidden rounded-lg border border-slate-200"
                  >
                    <Image
                      src={prestart.defect_photo_url}
                      alt="Defect photo"
                      width={400}
                      height={300}
                      className="h-auto w-full object-cover"
                      unoptimized
                    />
                  </a>
                </div>
              )}
            </div>

            <div className="space-y-3 border-t border-slate-200 pt-4">
              <h3 className="flex items-center gap-2 text-sm font-semibold text-slate-900">
                <Wrench className="h-4 w-4 text-orange-500" />
                Admin Repair Resolution
              </h3>
              <label className="block space-y-1">
                <span className={labelClass}>
                  Repair Notes <span className="text-red-600">*</span>
                </span>
                <textarea
                  value={repairNotes}
                  onChange={(e) => setRepairNotes(e.target.value)}
                  rows={3}
                  placeholder="Describe repairs completed…"
                  className={inputClass}
                />
              </label>
              <label className="block space-y-1">
                <span className={labelClass}>Mechanic Invoice Ref</span>
                <input
                  type="text"
                  value={invoiceRef}
                  onChange={(e) => setInvoiceRef(e.target.value)}
                  placeholder="e.g. INV-2024-0842"
                  className={inputClass}
                />
              </label>
            </div>

            {error && (
              <p className="text-sm text-red-600">{error}</p>
            )}

            <button
              type="button"
              onClick={handleClear}
              disabled={submitting}
              className="flex w-full items-center justify-center gap-2 rounded-lg bg-emerald-600 py-3 font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" /> Clearing…
                </>
              ) : (
                "Clear Defect & Restore to Available"
              )}
            </button>
          </div>
        )}
      </div>
    </div>
  );
}
