"use client";

import { ChevronRight, Package } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerRequestTileProps {
  onClick: () => void;
}

export default function WorkerRequestTile({ onClick }: WorkerRequestTileProps) {
  const handleClick = () => {
    try {
      onClick();
    } catch (error) {
      console.error("[WorkerRequestTile] Request Form click handler failed:", error);
    }
  };

  return (
    <button
      type="button"
      onClick={handleClick}
      className={cn(
        cardClass,
        "flex h-full flex-col items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99]"
      )}
    >
      <span className="text-xl" aria-hidden>
        📦
      </span>
      <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-sky-200 bg-sky-50 text-sky-600">
        <Package className="h-6 w-6" />
      </div>
      <div className="flex-1">
        <p className="font-semibold text-slate-900">Request Form</p>
        <p className="mt-0.5 text-xs text-slate-500">
          Request uniform, tools, or job-specific equipment
        </p>
      </div>
      <ChevronRight className="h-4 w-4 text-slate-400" />
    </button>
  );
}
