"use client";

import { ChevronRight, FileQuestion } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerRFITileProps {
  assignedCount?: number;
  onClick: () => void;
}

export default function WorkerRFITile({ assignedCount = 0, onClick }: WorkerRFITileProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className={cn(
        cardClass,
        "relative flex h-full flex-col items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99]"
      )}
    >
      {assignedCount > 0 ? (
        <span className="absolute right-3 top-3 rounded-full bg-orange-600 px-2 py-0.5 text-xs font-bold text-white">
          {assignedCount} to action
        </span>
      ) : null}
      <span className="text-xl" aria-hidden>
        📋
      </span>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-violet-200 bg-violet-50 text-violet-600">
        <FileQuestion className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-900">RFI</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Submit or action Requests for Information
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}
