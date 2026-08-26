"use client";

import { useCallback } from "react";
import { X } from "lucide-react";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import type { LeaveRequest } from "@/lib/supabase";
import {
  formatLeaveDateRange,
  leaveStatusMeta,
} from "@/lib/leave-utils";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface WorkerLeaveHistoryDrawerProps {
  leaveRequests: LeaveRequest[];
  onClose: () => void;
}

export default function WorkerLeaveHistoryDrawer({
  leaveRequests,
  onClose,
}: WorkerLeaveHistoryDrawerProps) {
  const handleBack = useCallback(() => {
    onClose();
    return true;
  }, [onClose]);

  useMobileBackHandler(handleBack, true);

  return (
    <div className="fixed inset-0 z-50 flex justify-end bg-slate-900/40">
      <button
        type="button"
        className="flex-1"
        aria-label="Close past leave requests"
        onClick={onClose}
      />
      <div className="flex h-full w-full max-w-md flex-col border-l border-slate-200 bg-white shadow-xl">
        <div className="mobile-safe-area-top flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Past Leave Requests</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {leaveRequests.length} request{leaveRequests.length === 1 ? "" : "s"}
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

        <div className="worker-mobile-content-pad flex-1 overflow-y-auto p-4 lg:pb-4">
          {leaveRequests.length === 0 ? (
            <p className="text-center text-sm text-slate-500">
              No leave requests yet.
            </p>
          ) : (
            <ul className="space-y-3">
              {leaveRequests.map((request) => {
                const status = leaveStatusMeta(request.status);
                return (
                  <li key={request.id} className={cn(cardClass, "p-4")}>
                    <div className="flex items-start justify-between gap-2">
                      <div>
                        <p className="font-semibold text-slate-900">
                          {request.leave_type}
                        </p>
                        <p className="mt-0.5 text-sm text-slate-600">
                          {formatLeaveDateRange(
                            request.first_date,
                            request.last_date
                          )}
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
                    {request.reason ? (
                      <p className="mt-2 text-sm text-slate-600">{request.reason}</p>
                    ) : null}
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
