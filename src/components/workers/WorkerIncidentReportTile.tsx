"use client";

import { AlertTriangle, ChevronRight } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerIncidentReportTileProps {
  onClick: () => void;
}

export default function WorkerIncidentReportTile({
  onClick,
}: WorkerIncidentReportTileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        cardClass,
        "flex h-full flex-col items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99]"
      )}
    >
      <span className="text-xl" aria-hidden>
        🚨
      </span>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-red-200 bg-red-50 text-red-600">
        <AlertTriangle className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-900">Incident Reports</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Report workplace incidents, injuries, and near misses
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}
