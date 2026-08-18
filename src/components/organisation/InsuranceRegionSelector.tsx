"use client";

import { cn } from "@/lib/utils";
import { labelClass } from "@/lib/ui-classes";
import {
  ALL_INSURANCE_REGIONS,
  INSURANCE_REGION_OPTIONS,
  type InsuranceRegion,
} from "@/lib/insurance-utils";

interface InsuranceRegionSelectorProps {
  allRegions: boolean;
  selectedRegions: InsuranceRegion[];
  onAllRegionsChange: (checked: boolean) => void;
  onToggleRegion: (region: InsuranceRegion) => void;
  disabled?: boolean;
  className?: string;
}

export default function InsuranceRegionSelector({
  allRegions,
  selectedRegions,
  onAllRegionsChange,
  onToggleRegion,
  disabled = false,
  className,
}: InsuranceRegionSelectorProps) {
  const allSelected =
    allRegions ||
    ALL_INSURANCE_REGIONS.every((region) => selectedRegions.includes(region));

  return (
    <fieldset className={className} disabled={disabled}>
      <legend className={labelClass}>Applies to regions</legend>

      <label className="mt-2 flex items-center gap-2 text-sm text-slate-700">
        <input
          type="checkbox"
          checked={allSelected}
          onChange={(event) => onAllRegionsChange(event.target.checked)}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-300 text-orange-500 focus:ring-orange-500"
        />
        Applies to All Regions
      </label>

      <div className="mt-3 flex flex-wrap gap-2">
        {INSURANCE_REGION_OPTIONS.map((region) => {
          const selected = allSelected || selectedRegions.includes(region);
          return (
            <button
              key={region}
              type="button"
              disabled={disabled || allSelected}
              onClick={() => onToggleRegion(region)}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold ring-1 ring-inset transition",
                selected
                  ? "bg-orange-100 text-orange-800 ring-orange-200"
                  : "bg-white text-slate-600 ring-slate-200 hover:bg-slate-50",
                (disabled || allSelected) && "cursor-not-allowed opacity-70"
              )}
            >
              {region}
            </button>
          );
        })}
      </div>
    </fieldset>
  );
}
