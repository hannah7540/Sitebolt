"use client";

import Link from "next/link";
import { ClipboardCheck, MapPin } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerItcsWidgetProps {
  workerId?: string | null;
  projectId?: string | null;
  className?: string;
  /** When the dashboard layout is being customized, disable navigation. */
  layoutEditMode?: boolean;
}

export default function WorkerItcsWidget({
  workerId,
  projectId,
  className,
  layoutEditMode = false,
}: WorkerItcsWidgetProps) {
  const params = new URLSearchParams();
  if (workerId?.trim()) params.set("worker_id", workerId.trim());
  if (projectId?.trim()) params.set("project_id", projectId.trim());
  const query = params.toString();
  const href = query ? `/worker-dashboard/itc?${query}` : "/worker-dashboard/itc";

  const actionClassName =
    "inline-flex items-center justify-center rounded-lg bg-orange-600 px-4 py-2.5 text-sm font-semibold text-white shadow-sm transition hover:bg-orange-500";

  return (
    <div
      className={cn(
        cardClass,
        "relative flex w-full flex-col gap-4 border-orange-200 bg-gradient-to-br from-orange-50/80 to-white p-4 sm:p-5",
        layoutEditMode && "pointer-events-none select-none",
        className
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-12 w-12 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-white text-orange-600 shadow-sm">
          <MapPin className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <h3 className="text-base font-bold text-slate-900">ITC&apos;s</h3>
            <span className="inline-flex items-center gap-1 rounded-full bg-orange-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-orange-700">
              <ClipboardCheck className="h-3 w-3" />
              Inspection
            </span>
          </div>
          <p className="mt-1 text-sm text-slate-600">
            Site floorplans, pins &amp; inspection checklists
          </p>
        </div>
      </div>

      <div className="mt-auto flex flex-wrap items-center gap-2">
        {layoutEditMode ? (
          <span className={cn(actionClassName, "opacity-70")}>Open ITCs</span>
        ) : (
          <Link href={href} className={actionClassName}>
            Open ITCs
          </Link>
        )}
        <span className="text-xs text-slate-500">
          No active ITCs? You can still select a job and open the floorplan.
        </span>
      </div>
    </div>
  );
}
