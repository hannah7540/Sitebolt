"use client";

import { CalendarOff, Plus } from "lucide-react";
import type { LeaveRequest } from "@/lib/supabase";
import { countPendingLeave, leaveStatusMeta } from "@/lib/leave-utils";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface WorkerLeaveRequestsWidgetProps {
  leaveRequests: LeaveRequest[];
  onSubmitLeave: () => void;
}

export default function WorkerLeaveRequestsWidget({
  leaveRequests,
  onSubmitLeave,
}: WorkerLeaveRequestsWidgetProps) {
  const pendingCount = countPendingLeave(leaveRequests);
  const latest = leaveRequests[0];
  const latestMeta = latest ? leaveStatusMeta(latest.status) : null;

  return (
    <div className={cn(cardClass, "flex flex-col gap-4 p-4 sm:col-span-2")}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          <CalendarOff className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Leave Requests</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Submit and track time-off requests
          </p>
        </div>
        {pendingCount > 0 && (
          <span className="rounded-full bg-amber-100 px-2.5 py-0.5 text-xs font-bold text-amber-800">
            {pendingCount} pending
          </span>
        )}
      </div>

      <div className="grid grid-cols-2 gap-3 rounded-xl border border-slate-200 bg-slate-50 p-3">
        <div>
          <p className="text-xs text-slate-500">Outstanding requests</p>
          <p className="mt-0.5 text-xl font-bold text-slate-900">{pendingCount}</p>
        </div>
        <div>
          <p className="text-xs text-slate-500">Latest status</p>
          {latestMeta ? (
            <span
              className={cn(
                "mt-1 inline-block rounded px-2 py-0.5 text-xs font-bold",
                latestMeta.badgeClass
              )}
            >
              {latestMeta.label}
            </span>
          ) : (
            <p className="mt-0.5 text-sm text-slate-400">No requests yet</p>
          )}
        </div>
      </div>

      <button
        type="button"
        onClick={onSubmitLeave}
        className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
      >
        <Plus className="h-4 w-4" />
        Submit Leave Request
      </button>
    </div>
  );
}
