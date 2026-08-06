"use client";

import { useMemo } from "react";
import { AlertTriangle } from "lucide-react";
import {
  getActiveLaserSignouts,
  hasLaserWarningToday,
  isLaserOverdueNotReturned,
  type Asset,
  type AssetLaserSignout,
} from "@/lib/assets";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface LaserStatusWidgetProps {
  lasers: Asset[];
  signouts: AssetLaserSignout[];
}

export default function LaserStatusWidget({ lasers, signouts }: LaserStatusWidgetProps) {
  const laserIds = useMemo(() => new Set(lasers.map((l) => l.id)), [lasers]);

  const projectSignouts = useMemo(
    () => signouts.filter((s) => laserIds.has(s.asset_id)),
    [signouts, laserIds]
  );

  const activeSignouts = useMemo(
    () => getActiveLaserSignouts(projectSignouts),
    [projectSignouts]
  );

  const overdueCount = useMemo(
    () => activeSignouts.filter(isLaserOverdueNotReturned).length,
    [activeSignouts]
  );

  const showWarning = useMemo(
    () => hasLaserWarningToday(projectSignouts),
    [projectSignouts]
  );

  if (lasers.length === 0) return null;

  return (
    <div
      className={cn(
        cardClass,
        "mb-6 p-4",
        showWarning && "border-amber-300 bg-amber-50"
      )}
    >
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h2 className="text-sm font-bold uppercase tracking-wide text-slate-700">
            Laser Status
          </h2>
          <div className="mt-2 flex flex-wrap gap-4 text-sm">
            <span>
              <strong className="text-slate-900">{activeSignouts.length}</strong>{" "}
              Signed Out
            </span>
            <span>
              <strong className={overdueCount > 0 ? "text-red-600" : "text-slate-900"}>
                {overdueCount}
              </strong>{" "}
              Overdue / Not Returned
            </span>
          </div>
        </div>
        {showWarning ? (
          <div className="flex items-center gap-2 rounded-lg border border-amber-400 bg-amber-100 px-3 py-2 text-xs font-semibold text-amber-900">
            <AlertTriangle className="h-4 w-4 shrink-0" />
            Laser signed out today not returned by 5:00 PM
          </div>
        ) : null}
      </div>
    </div>
  );
}
