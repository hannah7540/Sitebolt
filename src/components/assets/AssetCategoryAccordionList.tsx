"use client";

import { useMemo, useState } from "react";
import { ChevronDown } from "lucide-react";
import {
  ASSET_TYPES,
  getAssetCategoryColumnHeaders,
  getAssetTypeLabel,
  groupAssetsByType,
  type Asset,
  type AssetType,
} from "@/lib/assets";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AssetCategoryAccordionListProps {
  assets: Asset[];
  emptyMessage?: string;
  renderAsset: (asset: Asset, type: AssetType) => React.ReactNode;
  /** When true, renders a table shell with category-specific column headers. */
  useTableLayout?: boolean;
  className?: string;
}

export default function AssetCategoryAccordionList({
  assets,
  emptyMessage = "No assets in this view.",
  renderAsset,
  useTableLayout = false,
  className,
}: AssetCategoryAccordionListProps) {
  const grouped = useMemo(() => groupAssetsByType(assets), [assets]);

  const [expanded, setExpanded] = useState<Record<AssetType, boolean>>(() =>
    Object.fromEntries(ASSET_TYPES.map((type) => [type, true])) as Record<
      AssetType,
      boolean
    >
  );

  const totalCount = assets.length;

  return (
    <div className={cn("space-y-3", className)}>
      {totalCount === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : null}

      {ASSET_TYPES.map((type) => {
        const items = grouped[type];
        const isOpen = expanded[type] ?? true;
        const headers = getAssetCategoryColumnHeaders(type);

        return (
          <section key={type} className={`${cardClass} overflow-hidden`}>
            <button
              type="button"
              onClick={() =>
                setExpanded((prev) => ({ ...prev, [type]: !prev[type] }))
              }
              className="flex w-full items-center justify-between gap-3 px-4 py-3 text-left hover:bg-orange-50/60"
              aria-expanded={isOpen}
            >
              <span className="text-sm font-bold text-slate-900">
                {getAssetTypeLabel(type)} ({items.length})
              </span>
              <ChevronDown
                className={cn(
                  "h-4 w-4 shrink-0 text-slate-500 transition-transform",
                  isOpen && "rotate-180"
                )}
              />
            </button>

            {isOpen ? (
              <div className="border-t border-slate-200 px-4 py-4">
                {items.length === 0 ? (
                  <p className="text-sm text-slate-500">No assets in this category.</p>
                ) : useTableLayout ? (
                  <div className="overflow-x-auto">
                    <table className="min-w-full border-separate border-spacing-y-2 text-left text-sm">
                      <thead>
                        <tr className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                          {headers.map((header) => (
                            <th key={header} className="px-2 py-1 font-semibold">
                              {header}
                            </th>
                          ))}
                        </tr>
                      </thead>
                      <tbody>
                        {items.map((asset) => renderAsset(asset, type))}
                      </tbody>
                    </table>
                  </div>
                ) : (
                  <div className="space-y-3">
                    {items.map((asset) => (
                      <div key={asset.id}>{renderAsset(asset, type)}</div>
                    ))}
                  </div>
                )}
              </div>
            ) : null}
          </section>
        );
      })}
    </div>
  );
}
