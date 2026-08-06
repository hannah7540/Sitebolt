"use client";

import type { ProjectItc } from "@/lib/itc-service";
import { ITC_STATUS_COLORS } from "@/lib/itc-templates";
import { cn } from "@/lib/utils";

interface ItcPlanMapViewProps {
  itcs: ProjectItc[];
  selectedZone: string;
  focusedItcId?: string | null;
  onSelectItc: (itcId: string, zoneCode: string | null) => void;
}

export default function ItcPlanMapView({
  itcs,
  selectedZone,
  focusedItcId,
  onSelectItc,
}: ItcPlanMapViewProps) {
  const visible = itcs.filter(
    (itc) =>
      (selectedZone === "ALL" || itc.zone_code === selectedZone) &&
      itc.map_x != null &&
      itc.map_y != null
  );

  return (
    <div className="relative overflow-hidden rounded-xl border border-slate-200 bg-gradient-to-br from-slate-100 via-white to-orange-50">
      <div className="border-b border-slate-200 px-4 py-3">
        <p className="text-sm font-semibold text-slate-900">Plan Map View</p>
        <p className="text-xs text-slate-500">
          Tap a pin to focus the register on that ITC run.
        </p>
      </div>

      <div className="relative aspect-[16/9] min-h-[220px]">
        <div className="absolute inset-0 bg-[linear-gradient(rgba(148,163,184,0.15)_1px,transparent_1px),linear-gradient(90deg,rgba(148,163,184,0.15)_1px,transparent_1px)] bg-[size:24px_24px]" />
        <div className="absolute inset-6 rounded-lg border-2 border-dashed border-slate-300" />

        {visible.map((itc) => {
          const colors = ITC_STATUS_COLORS[itc.status];
          return (
            <button
              key={itc.id}
              type="button"
              title={`${itc.itc_number} — ${itc.start_location} → ${itc.end_location}`}
              onClick={() => onSelectItc(itc.id, itc.zone_code)}
              className={cn(
                "absolute -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-white shadow-md transition hover:scale-110",
                colors.pin,
                focusedItcId === itc.id && "ring-4 ring-orange-300"
              )}
              style={{
                left: `${(itc.map_x ?? 0.5) * 100}%`,
                top: `${(itc.map_y ?? 0.5) * 100}%`,
                width: "14px",
                height: "14px",
              }}
            />
          );
        })}
      </div>

      <div className="flex flex-wrap gap-3 border-t border-slate-200 px-4 py-3 text-xs text-slate-600">
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-slate-400" /> Not Started
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-amber-400" /> Ongoing
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-red-500" /> Issue / CR
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-emerald-500" /> Complete
        </span>
      </div>
    </div>
  );
}
