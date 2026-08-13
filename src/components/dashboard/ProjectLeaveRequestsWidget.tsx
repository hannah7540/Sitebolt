"use client";

import { useMemo, useState } from "react";
import { CalendarOff, Check, Ban, Loader2, ChevronRight } from "lucide-react";
import type { LeaveRequest, Worker } from "@/lib/supabase";
import {
  approveLeaveRequestAction,
  getLeaveEndDate,
  getLeaveReason,
  getLeaveStartDate,
  isLeaveRequestPending,
  rejectLeaveRequestAction,
  resolveWorkerName,
} from "@/lib/leave-requests";
import { formatLeaveDateRange, leaveStatusMeta } from "@/lib/leave-utils";
import { leaveTypeDisplayBadge } from "@/lib/leave-type-calendar";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";

interface ProjectLeaveRequestsWidgetProps {
  leaveRequests: LeaveRequest[];
  workers: Worker[];
  projectId?: string | null;
  loading?: boolean;
  onUpdated: () => void;
  onOpenAll?: () => void;
  onRefreshCalendar?: () => void | Promise<void>;
}

export default function ProjectLeaveRequestsWidget({
  leaveRequests,
  workers,
  projectId = null,
  loading = false,
  onUpdated,
  onOpenAll,
  onRefreshCalendar,
}: ProjectLeaveRequestsWidgetProps) {
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const pendingRequests = useMemo(() => {
    return leaveRequests
      .filter((request) => isLeaveRequestPending(request.status))
      .sort((left, right) =>
        getLeaveStartDate(left).localeCompare(getLeaveStartDate(right))
      );
  }, [leaveRequests]);

  const totalCount = leaveRequests.length;

  const resolveName = (request: LeaveRequest) => {
    const worker = workers.find((row) => row.id === request.worker_id);
    return resolveWorkerName(worker ?? null, request.worker_name);
  };

  const handleApprove = async (
    requestId: string,
    workerId: string,
    startDate: string,
    endDate: string
  ) => {
    setError(null);
    setActingId(requestId);
    setActionType("approve");

    try {
      const result = await approveLeaveRequestAction({
        requestId,
        workerId,
        startDate,
        endDate,
      });

      if (result.error) {
        setError(result.error);
        showError(result.error);
        return;
      }

      if (result.toastMessage) {
        showSuccess(result.toastMessage);
      }

      onUpdated();
      if (onRefreshCalendar) {
        await onRefreshCalendar();
      }
    } catch (err) {
      console.error("Approve failed:", err);
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setActingId(null);
      setActionType(null);
    }
  };

  const handleReject = async (
    requestId: string,
    workerId: string,
    startDate: string,
    endDate: string
  ) => {
    setError(null);
    setActingId(requestId);
    setActionType("reject");

    try {
      const result = await rejectLeaveRequestAction({
        requestId,
        workerId,
        startDate,
        endDate,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onUpdated();
      if (onRefreshCalendar) {
        await onRefreshCalendar();
      }
    } catch (err) {
      console.error("Reject failed:", err);
      setError(err instanceof Error ? err.message : "Reject failed.");
    } finally {
      setActingId(null);
      setActionType(null);
    }
  };

  const openAll = () => {
    onOpenAll?.();
  };

  return (
    <div className={cn(cardClass, "flex h-full flex-col p-6")}>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}

      <div className="mb-4 flex items-start gap-4">
        <CalendarOff className="h-10 w-10 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Leave Requests</h2>
            {onOpenAll ? (
              <button
                type="button"
                onClick={openAll}
                className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
                aria-label="View all leave requests"
              >
                <ChevronRight className="h-5 w-5" />
              </button>
            ) : null}
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading
              ? "Loading leave requests…"
              : pendingRequests.length > 0
                ? `${pendingRequests.length} pending review`
                : "No pending leave requests"}
            {projectId ? " for this project" : ""}
          </p>
          {onOpenAll && totalCount > 0 ? (
            <button
              type="button"
              onClick={openAll}
              className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              View all leave requests ({totalCount})
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading leave requests…
        </div>
      ) : pendingRequests.length === 0 ? (
        <button
          type="button"
          onClick={onOpenAll}
          disabled={!onOpenAll}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500",
            onOpenAll && "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700"
          )}
        >
          {onOpenAll && totalCount > 0
            ? "No pending requests. View all leave requests →"
            : "No pending leave requests to review."}
        </button>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {pendingRequests.map((request) => {
            const startDate = getLeaveStartDate(request);
            const endDate = getLeaveEndDate(request);
            const reason = getLeaveReason(request);
            const isActing = actingId === request.id;
            const typeBadge = leaveTypeDisplayBadge(request.leave_type);
            const statusMeta = leaveStatusMeta(request.status);

            return (
              <li
                key={request.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <div className="mb-3 space-y-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">{resolveName(request)}</p>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                        typeBadge.badgeClass
                      )}
                    >
                      {typeBadge.label}
                    </span>
                    <span
                      className={cn(
                        "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                        statusMeta.badgeClass
                      )}
                    >
                      {statusMeta.label}
                    </span>
                  </div>
                  <p className="text-sm text-slate-600">
                    {formatLeaveDateRange(startDate, endDate)} · {request.number_of_days}{" "}
                    day{request.number_of_days === 1 ? "" : "s"}
                  </p>
                  {reason ? <p className="text-sm text-slate-700">{reason}</p> : null}
                </div>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleApprove(
                        request.id,
                        request.worker_id,
                        startDate,
                        endDate
                      );
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                  >
                    {isActing && actionType === "approve" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Check className="h-4 w-4" />
                    )}
                    Approve
                  </button>
                  <button
                    type="button"
                    disabled={isActing}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleReject(
                        request.id,
                        request.worker_id,
                        startDate,
                        endDate
                      );
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-red-200 bg-red-50 py-2 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                  >
                    {isActing && actionType === "reject" ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Ban className="h-4 w-4" />
                    )}
                    Reject
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
