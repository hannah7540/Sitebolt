"use client";

import { cn } from "@/lib/utils";
import type { ItcZone } from "@/lib/itc-service";

interface ItcZoneFilterPillsProps {
  zones: ItcZone[];
  selectedZone: string;
  onSelect: (zoneCode: string) => void;
}

export default function ItcZoneFilterPills({
  zones,
  selectedZone,
  onSelect,
}: ItcZoneFilterPillsProps) {
  return (
    <div className="flex flex-wrap gap-2">
      <button
        type="button"
        onClick={() => onSelect("ALL")}
        className={cn(
          "rounded-full px-4 py-1.5 text-sm font-semibold transition",
          selectedZone === "ALL"
            ? "bg-orange-600 text-white"
            : "bg-slate-100 text-slate-700 hover:bg-slate-200"
        )}
      >
        All Zones
      </button>
      {zones.map((zone) => (
        <button
          key={zone.id}
          type="button"
          onClick={() => onSelect(zone.zone_code)}
          className={cn(
            "rounded-full px-4 py-1.5 text-sm font-semibold transition",
            selectedZone === zone.zone_code
              ? "bg-orange-600 text-white"
              : "bg-slate-100 text-slate-700 hover:bg-slate-200"
          )}
        >
          {zone.zone_name}
        </button>
      ))}
    </div>
  );
}
