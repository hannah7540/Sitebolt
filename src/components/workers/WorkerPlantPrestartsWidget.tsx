"use client";

import { HardHat, Loader2 } from "lucide-react";
import type { PlantAsset, PlantPrestart } from "@/lib/supabase";
import {
  formatPrestartSubmittedTime,
  getPlantPrestartDisplayTitle,
} from "@/lib/plant-prestart-utils";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface WorkerPlantPrestartsWidgetProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  loading?: boolean;
  onSelectPrestart: (prestart: PlantPrestart) => void;
}

export default function WorkerPlantPrestartsWidget({
  prestarts,
  plant,
  loading = false,
  onSelectPrestart,
}: WorkerPlantPrestartsWidgetProps) {
  return (
    <div className={cn(cardClass, "flex flex-col gap-4 p-4 sm:col-span-2")}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          <HardHat className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Plant Pre-Starts</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Completed plant pre-starts submitted today
          </p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-semibold text-slate-700">
          {prestarts.length}
        </span>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading today&apos;s pre-starts…
        </div>
      ) : prestarts.length === 0 ? (
        <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
          No plant pre-starts submitted today yet.
        </p>
      ) : (
        <div className="space-y-2">
          {prestarts.map((prestart) => (
            <button
              key={prestart.id}
              type="button"
              onClick={() => onSelectPrestart(prestart)}
              className="flex w-full items-start justify-between gap-3 rounded-lg border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
            >
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {getPlantPrestartDisplayTitle(prestart, plant)}
                </p>
                <p className="mt-0.5 text-xs text-slate-600">
                  {prestart.operator_name} · {formatPrestartSubmittedTime(prestart.created_at)}
                </p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  prestart.has_defect
                    ? "bg-orange-100 text-orange-800"
                    : "bg-emerald-100 text-emerald-800"
                )}
              >
                {prestart.has_defect ? "Defect Flagged" : "No Defects"}
              </span>
            </button>
          ))}
        </div>
      )}
    </div>
  );
}
