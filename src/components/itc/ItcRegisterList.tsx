"use client";

import { useMemo, useState } from "react";
import { ChevronDown, ChevronRight } from "lucide-react";
import type { ProjectItc } from "@/lib/itc-service";
import {
  formatConduitConfig,
  ITC_STATUS_COLORS,
  ITC_STATUS_LABELS,
} from "@/lib/itc-templates";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ItcRegisterListProps {
  itcs: ProjectItc[];
  selectedIds: string[];
  focusedItcId?: string | null;
  onToggleSelect: (itcId: string) => void;
  onOpenItc: (itcId: string) => void;
}

function ProgressBar({ value }: { value: number }) {
  return (
    <div className="h-2 w-full overflow-hidden rounded-full bg-slate-100">
      <div
        className="h-full rounded-full bg-orange-500 transition-all"
        style={{ width: `${Math.min(100, Math.max(0, value))}%` }}
      />
    </div>
  );
}

export default function ItcRegisterList({
  itcs,
  selectedIds,
  focusedItcId,
  onToggleSelect,
  onOpenItc,
}: ItcRegisterListProps) {
  const grouped = useMemo(() => {
    const map = new Map<string, ProjectItc[]>();
    for (const itc of itcs) {
      const key = `${itc.zone_code ?? "Unassigned"}::${itc.building ?? "General"}`;
      const list = map.get(key) ?? [];
      list.push(itc);
      map.set(key, list);
    }
    return Array.from(map.entries()).sort(([a], [b]) => a.localeCompare(b));
  }, [itcs]);

  const [collapsed, setCollapsed] = useState<Record<string, boolean>>({});

  if (itcs.length === 0) {
    return (
      <div className={cn("p-8 text-center text-sm text-slate-500", cardClass)}>
        No ITCs match the current zone filter.
      </div>
    );
  }

  return (
    <div className="space-y-3">
      {grouped.map(([groupKey, rows]) => {
        const [zone, building] = groupKey.split("::");
        const isCollapsed = collapsed[groupKey] ?? false;

        return (
          <div key={groupKey} className={cardClass}>
            <button
              type="button"
              onClick={() =>
                setCollapsed((current) => ({ ...current, [groupKey]: !isCollapsed }))
              }
              className="flex w-full items-center justify-between px-4 py-3 text-left"
            >
              <div>
                <p className="font-semibold text-slate-900">
                  {zone} — {building}
                </p>
                <p className="text-xs text-slate-500">{rows.length} ITC(s)</p>
              </div>
              {isCollapsed ? (
                <ChevronRight className="h-4 w-4 text-slate-400" />
              ) : (
                <ChevronDown className="h-4 w-4 text-slate-400" />
              )}
            </button>

            {!isCollapsed ? (
              <div className="overflow-x-auto border-t border-slate-200">
                <table className="min-w-full text-sm">
                  <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
                    <tr>
                      <th className="px-3 py-2">Select</th>
                      <th className="px-3 py-2">ITC #</th>
                      <th className="px-3 py-2">Discipline</th>
                      <th className="px-3 py-2">Start → End</th>
                      <th className="px-3 py-2">Conduits</th>
                      <th className="px-3 py-2">Length</th>
                      <th className="px-3 py-2">Progress</th>
                      <th className="px-3 py-2">Status</th>
                    </tr>
                  </thead>
                  <tbody>
                    {rows.map((itc) => {
                      const statusColors = ITC_STATUS_COLORS[itc.status];
                      return (
                        <tr
                          key={itc.id}
                          className={cn(
                            "border-t border-slate-100 hover:bg-orange-50/40",
                            focusedItcId === itc.id && "bg-orange-50"
                          )}
                        >
                          <td className="px-3 py-2">
                            <input
                              type="checkbox"
                              checked={selectedIds.includes(itc.id)}
                              onChange={() => onToggleSelect(itc.id)}
                            />
                          </td>
                          <td className="px-3 py-2">
                            <button
                              type="button"
                              onClick={() => onOpenItc(itc.id)}
                              className="font-semibold text-orange-600 hover:underline"
                            >
                              {itc.itc_number}
                            </button>
                          </td>
                          <td className="px-3 py-2">{itc.service_discipline}</td>
                          <td className="px-3 py-2">
                            {itc.start_location ?? "—"} → {itc.end_location ?? "—"}
                          </td>
                          <td className="px-3 py-2">{formatConduitConfig(itc.conduits)}</td>
                          <td className="px-3 py-2">
                            {itc.length_m != null ? `${itc.length_m} m` : "—"}
                          </td>
                          <td className="min-w-[120px] px-3 py-2">
                            <ProgressBar value={itc.progress_percent} />
                            <span className="text-xs text-slate-500">
                              {itc.progress_percent}%
                            </span>
                          </td>
                          <td className="px-3 py-2">
                            <span
                              className={cn(
                                "rounded-full px-2 py-0.5 text-xs font-semibold",
                                statusColors.bg,
                                statusColors.text
                              )}
                            >
                              {ITC_STATUS_LABELS[itc.status]}
                            </span>
                          </td>
                        </tr>
                      );
                    })}
                  </tbody>
                </table>
              </div>
            ) : null}
          </div>
        );
      })}
    </div>
  );
}
