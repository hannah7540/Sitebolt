"use client";

import { useMemo, useState } from "react";
import { HardHat, ChevronRight, Loader2, CalendarDays } from "lucide-react";
import type { PlantAsset, PlantPrestart, Worker } from "@/lib/supabase";
import { getPlantPrestartUnitLabel } from "@/lib/dashboard-form-utils";
import {
  filterPlantPrestartsForDate,
  formatPlantPrestartDisplayDateTime,
  getPlantPrestartStatusLabel,
  sortPlantPrestartsNewestFirst,
} from "@/lib/plant-prestart-utils";
import { localIsoDate } from "@/lib/timesheet-utils";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

interface ProjectPlantPrestartsWidgetProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  workers?: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectPrestart: (prestart: PlantPrestart) => void;
}

function resolveOperatorName(prestart: PlantPrestart, workers: Worker[]): string {
  if (prestart.operator_name?.trim()) return prestart.operator_name.trim();
  if (prestart.operator_worker_id) {
    const worker = workers.find((row) => row.id === prestart.operator_worker_id);
    if (worker?.full_name?.trim()) return worker.full_name.trim();
  }
  return "Unknown operator";
}

function statusBadgeClass(label: ReturnType<typeof getPlantPrestartStatusLabel>): string {
  if (label === "Passed") return "border-emerald-200 bg-emerald-50 text-emerald-700";
  if (label === "Failed") return "border-red-300 bg-red-100 text-red-800";
  return "border-amber-200 bg-amber-50 text-amber-800";
}

export default function ProjectPlantPrestartsWidget({
  prestarts,
  plant,
  workers = [],
  loading = false,
  onOpenList,
  onSelectPrestart,
}: ProjectPlantPrestartsWidgetProps) {
  const [filterDate, setFilterDate] = useState(() => localIsoDate());

  const filteredPrestarts = useMemo(() => {
    return sortPlantPrestartsNewestFirst(
      filterPlantPrestartsForDate(prestarts, filterDate)
    ).slice(0, 5);
  }, [prestarts, filterDate]);

  const filteredCount = useMemo(
    () => filterPlantPrestartsForDate(prestarts, filterDate).length,
    [prestarts, filterDate]
  );

  const isToday = filterDate === localIsoDate();

  return (
    <div className={cn(cardClass, "flex h-full flex-col p-6")}>
      <div className="mb-4 flex items-start gap-4">
        <HardHat className="h-10 w-10 shrink-0 text-amber-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <button
              type="button"
              onClick={onOpenList}
              className="text-left"
            >
              <h2 className="text-2xl font-bold text-slate-900 hover:text-orange-700">
                Plant Pre-Starts
              </h2>
            </button>
            <button
              type="button"
              onClick={onOpenList}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
              aria-label="View all plant pre-starts"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading
              ? "Loading plant pre-starts…"
              : filteredCount > 0
                ? `${filteredCount} pre-start${filteredCount === 1 ? "" : "s"}${isToday ? " today" : ""}`
                : isToday
                  ? "No pre-starts submitted today"
                  : "No pre-starts on selected date"}
          </p>
          {prestarts.length > 0 ? (
            <button
              type="button"
              onClick={onOpenList}
              className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              View all plant pre-starts ({prestarts.length})
            </button>
          ) : null}
        </div>
      </div>

      <label className="mb-4 block">
        <span className={cn(labelClass, "flex items-center gap-1")}>
          <CalendarDays className="h-3.5 w-3.5" />
          Quick filter by date
        </span>
        <input
          type="date"
          value={filterDate}
          onChange={(event) => setFilterDate(event.target.value)}
          className={cn(inputClass, "mt-1")}
        />
      </label>

      {loading ? (
        <div className="flex flex-1 items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading plant pre-starts…
        </div>
      ) : filteredPrestarts.length === 0 ? (
        <button
          type="button"
          onClick={onOpenList}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500",
            prestarts.length > 0 &&
              "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700"
          )}
        >
          {prestarts.length > 0
            ? "No pre-starts for this date. Browse full history →"
            : "No plant pre-starts submitted for this project yet."}
        </button>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2 overflow-y-auto">
          {filteredPrestarts.map((prestart) => {
            const statusLabel = getPlantPrestartStatusLabel(prestart);
            const submittedAt = prestart.submitted_at ?? prestart.created_at;

            return (
              <li key={prestart.id}>
                <button
                  type="button"
                  onClick={() => onSelectPrestart(prestart)}
                  className="w-full rounded-xl border border-slate-200 bg-slate-50 px-4 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
                >
                  <div className="flex items-start justify-between gap-3">
                    <div className="min-w-0">
                      <p className="font-bold text-slate-900">
                        {getPlantPrestartUnitLabel(prestart, plant)}
                      </p>
                      <p className="mt-0.5 text-sm text-slate-600">
                        {resolveOperatorName(prestart, workers)} ·{" "}
                        {formatPlantPrestartDisplayDateTime(submittedAt)}
                      </p>
                    </div>
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        statusBadgeClass(statusLabel)
                      )}
                    >
                      {statusLabel}
                    </span>
                  </div>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
