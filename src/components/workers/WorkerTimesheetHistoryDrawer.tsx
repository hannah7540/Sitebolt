"use client";

import { X } from "lucide-react";
import type { WorkerTimesheet } from "@/lib/supabase";
import {
  formatTimeDisplay,
  formatTimesheetHours,
  isAdvanceTimesheetDate,
  timesheetStatusMeta,
} from "@/lib/timesheet-utils";
import TimesheetAdvanceEntryBadge from "@/components/workers/TimesheetAdvanceEntryBadge";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface WorkerTimesheetHistoryDrawerProps {
  timesheets: WorkerTimesheet[];
  onClose: () => void;
}

function formatWorkDate(iso: string): string {
  const [y, m, d] = iso.split("-").map(Number);
  const date = new Date(y, m - 1, d);
  return date.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function WorkerTimesheetHistoryDrawer({
  timesheets,
  onClose,
}: WorkerTimesheetHistoryDrawerProps) {
  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <button
        type="button"
        className="flex-1"
        aria-label="Close past timesheets"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Past Timesheets</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {timesheets.length} submission{timesheets.length === 1 ? "" : "s"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex-1 overflow-y-auto p-4">
          {timesheets.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              No timesheet submissions yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {timesheets.map((entry) => {
                const status = timesheetStatusMeta(entry.status);
                return (
                  <li key={entry.id} className={cn(cardClass, "p-4")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <div className="flex flex-wrap items-center gap-2">
                          <p className="font-semibold text-slate-900">
                            {formatWorkDate(entry.work_date)}
                          </p>
                          {isAdvanceTimesheetDate(entry.work_date) ? (
                            <TimesheetAdvanceEntryBadge />
                          ) : null}
                        </div>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {entry.project_name ?? "Unassigned project"}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          status.badgeClass
                        )}
                      >
                        {status.label}
                      </span>
                    </div>
                    <div className="mt-2 flex flex-wrap gap-x-3 gap-y-1 text-xs text-slate-500">
                      <span>
                        {formatTimeDisplay(entry.start_time)} –{" "}
                        {formatTimeDisplay(entry.finish_time)}
                      </span>
                      <span>{entry.break_minutes}m break</span>
                      <span className="font-semibold text-orange-600">
                        {formatTimesheetHours(Number(entry.total_hours))}
                      </span>
                    </div>
                    {entry.notes && (
                      <p className="mt-2 text-sm text-slate-600">{entry.notes}</p>
                    )}
                  </li>
                );
              })}
            </ul>
          )}
        </div>
      </div>
    </div>
  );
}
