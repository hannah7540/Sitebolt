"use client";

import {
  BookUser,
  ChevronRight,
  Gauge,
  Laptop,
  Scan,
  Tablet,
} from "lucide-react";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  groupAssetsByType,
  type Asset,
  type ManagedAssetType,
} from "@/lib/assets";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const CATEGORY_ICONS: Record<ManagedAssetType, typeof Laptop> = {
  laptop: Laptop,
  ipad: Tablet,
  laser: Scan,
  pressure_gauge: Gauge,
  assigned_accounts: BookUser,
};

interface AssetCategoryOverviewProps {
  assets: Asset[];
  onSelectCategory: (type: ManagedAssetType) => void;
}

export default function AssetCategoryOverview({
  assets,
  onSelectCategory,
}: AssetCategoryOverviewProps) {
  const grouped = groupAssetsByType(assets);

  return (
    <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
      {ASSET_TYPES.map((type: ManagedAssetType) => {
        const Icon = CATEGORY_ICONS[type];
        const count = grouped[type]?.length ?? 0;

        return (
          <button
            key={type}
            type="button"
            onClick={() => onSelectCategory(type)}
            className={cn(
              cardClass,
              "flex items-center justify-between gap-4 p-5 text-left transition-colors hover:border-orange-300 hover:bg-orange-50/70"
            )}
          >
            <span className="flex items-center gap-3">
              <span className="flex h-11 w-11 items-center justify-center rounded-xl bg-orange-100 text-orange-600">
                <Icon className="h-5 w-5" />
              </span>
              <span>
                <span className="block text-base font-bold text-slate-900">
                  {ASSET_TYPE_LABELS[type]}
                </span>
                <span className="block text-sm text-slate-500">
                  {count} {count === 1 ? "asset" : "assets"}
                </span>
              </span>
            </span>
            <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" />
          </button>
        );
      })}
    </div>
  );
}
