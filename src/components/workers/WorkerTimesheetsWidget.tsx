"use client";

import { Clock, Plus } from "lucide-react";
import type { WorkerTimesheet } from "@/lib/supabase";
import {
  formatTimesheetHours,
  getWeekTimesheetSummary,
  weekSummaryStatusClass,
} from "@/lib/timesheet-utils";
import { localIsoDate, formatTimesheetHoursLabel } from "@/lib/timesheet-utils";
import { getPayWeekRange, formatPayWeekRange } from "@/lib/pay-week-utils";
import { sumPayWeekDailyHours } from "@/lib/timesheet-entries";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface WorkerTimesheetsWidgetProps {
  payWeekStart: Date;
  payWeekEnd: Date;
  payWeekStartIso: string;
  payWeekEndIso: string;
  weekTimesheets: WorkerTimesheet[];
  todayIso: string;
  onSubmitToday: () => void;
  onViewPast: () => void;
}

export default function WorkerTimesheetsWidget({
  payWeekStart,
  payWeekEnd,
  payWeekStartIso,
  payWeekEndIso,
  weekTimesheets,
  todayIso,
  onSubmitToday,
  onViewPast,
}: WorkerTimesheetsWidgetProps) {
  const summary = getWeekTimesheetSummary(weekTimesheets);
  const weeklyTotal = sumPayWeekDailyHours(
    weekTimesheets,
    payWeekStartIso,
    payWeekEndIso
  );
  const todayEntry = weekTimesheets.find((row) => row.work_date === todayIso);
  const todayTotal = Number(
    todayEntry?.daily_total_hours ?? todayEntry?.total_hours ?? 0
  );

  return (
    <div
      className={cn(
        cardClass,
        "flex w-full flex-col gap-4 p-4"
      )}
    >
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          <Clock className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">My Timesheets</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Pay week: {formatPayWeekRange(payWeekStart, payWeekEnd)}
          </p>
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3 sm:grid-cols-4">
        <div>
          <p className="text-xs text-slate-500">Today&apos;s total</p>
          <p className="mt-0.5 text-lg font-bold text-slate-900">
            {formatTimesheetHoursLabel(todayTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Weekly total</p>
          <p className="mt-0.5 text-lg font-bold text-blue-700">
            {formatTimesheetHoursLabel(weeklyTotal)}
          </p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Entries</p>
          <p className="mt-0.5 text-lg font-bold text-slate-900">{summary.entryCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Status</p>
          <span
            className={cn(
              "mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold",
              weekSummaryStatusClass(summary.status)
            )}
          >
            {summary.statusLabel}
          </span>
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <button
          type="button"
          onClick={onSubmitToday}
          className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Submit Timesheet
        </button>
        <button
          type="button"
          onClick={onViewPast}
          className="text-sm font-medium text-orange-600 hover:text-orange-700 hover:underline"
        >
          View Past Timesheets
        </button>
      </div>
    </div>
  );
}
