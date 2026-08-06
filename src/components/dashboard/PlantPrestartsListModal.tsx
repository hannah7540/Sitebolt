"use client";

import { X } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import { getPlantPrestartUnitLabel } from "@/lib/dashboard-form-utils";
import { modalOverlayClass, modalClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface PlantPrestartsListModalProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  projectName: string;
  onClose: () => void;
  onSelectPrestart: (prestart: PlantPrestart) => void;
}

function formatTimestamp(iso: string) {
  return new Date(iso).toLocaleString("en-AU", {
    dateStyle: "medium",
    timeStyle: "short",
  });
}

export default function PlantPrestartsListModal({
  prestarts,
  plant,
  projectName,
  onClose,
  onSelectPrestart,
}: PlantPrestartsListModalProps) {
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Plant Pre-Starts</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {prestarts.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-6 text-sm text-slate-500">
            No plant pre-starts submitted for this project yet.
          </p>
        ) : (
          <ul className="max-h-[60vh] space-y-2 overflow-y-auto">
            {prestarts.map((prestart) => (
              <li key={prestart.id}>
                <button
                  type="button"
                  onClick={() => onSelectPrestart(prestart)}
                  className="w-full rounded-xl border border-slate-200 px-4 py-3 text-left hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="flex items-center justify-between gap-3">
                    <div>
                      <p className="font-medium text-slate-900">
                        {getPlantPrestartUnitLabel(prestart, plant)}
                      </p>
                      <p className="mt-0.5 text-xs text-slate-500">
                        {prestart.operator_name} · {formatTimestamp(prestart.created_at)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        prestart.has_defect
                          ? "border-red-200 bg-red-50 text-red-700"
                          : "border-emerald-200 bg-emerald-50 text-emerald-700"
                      )}
                    >
                      {prestart.has_defect ? "Defect" : "Passed"}
                    </span>
                  </div>
                </button>
              </li>
            ))}
          </ul>
        )}
      </div>
    </div>
  );
}
