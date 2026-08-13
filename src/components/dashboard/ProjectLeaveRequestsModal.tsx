"use client";

import { useMemo, useState } from "react";
import { X, Search, Check, Ban, Loader2 } from "lucide-react";
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
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";

type StatusFilter = "all" | "pending" | "approved" | "rejected";

interface ProjectLeaveRequestsModalProps {
  leaveRequests: LeaveRequest[];
  workers: Worker[];
  projectName: string;
  onClose: () => void;
  onUpdated: () => void;
  onRefreshCalendar?: () => void | Promise<void>;
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "pending", label: "Pending" },
  { id: "approved", label: "Approved" },
  { id: "rejected", label: "Rejected" },
];

function matchesStatusFilter(request: LeaveRequest, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  const status = String(request.status ?? "").trim().toLowerCase();
  if (filter === "pending") return status === "pending";
  if (filter === "approved") return status === "approved";
  return status === "declined" || status === "rejected";
}

function overlapsDateRange(
  request: LeaveRequest,
  rangeStart: string | null,
  rangeEnd: string | null
): boolean {
  if (!rangeStart && !rangeEnd) return true;

  const leaveStart = getLeaveStartDate(request);
  const leaveEnd = getLeaveEndDate(request);
  const filterStart = rangeStart ?? "0000-01-01";
  const filterEnd = rangeEnd ?? "9999-12-31";

  return leaveStart <= filterEnd && leaveEnd >= filterStart;
}

function matchesSearchQuery(
  request: LeaveRequest,
  workerName: string,
  query: string
): boolean {
  const q = query.trim().toLowerCase();
  if (!q) return true;

  const reason = getLeaveReason(request).toLowerCase();
  const leaveType = String(request.leave_type ?? "").toLowerCase();

  return (
    workerName.toLowerCase().includes(q) ||
    reason.includes(q) ||
    leaveType.includes(q)
  );
}

export default function ProjectLeaveRequestsModal({
  leaveRequests,
  workers,
  projectName,
  onClose,
  onUpdated,
  onRefreshCalendar,
}: ProjectLeaveRequestsModalProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const resolveName = (request: LeaveRequest) => {
    const worker = workers.find((row) => row.id === request.worker_id);
    return resolveWorkerName(worker ?? null, request.worker_name);
  };

  const filteredRequests = useMemo(() => {
    return leaveRequests
      .filter((request) => matchesStatusFilter(request, statusFilter))
      .filter((request) =>
        overlapsDateRange(request, rangeStart || null, rangeEnd || null)
      )
      .filter((request) => matchesSearchQuery(request, resolveName(request), searchQuery))
      .sort((left, right) => {
        const leftPending = isLeaveRequestPending(left.status);
        const rightPending = isLeaveRequestPending(right.status);
        if (leftPending !== rightPending) {
          return leftPending ? -1 : 1;
        }
        return getLeaveStartDate(right).localeCompare(getLeaveStartDate(left));
      });
  }, [leaveRequests, statusFilter, rangeStart, rangeEnd, searchQuery, workers]);

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

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
      <div
        className={`${modalClass} max-w-5xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Leave Requests</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
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

        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                statusFilter === tab.id
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className={labelClass}>Search worker or reason</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Worker name, leave type, or reason…"
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </label>
          <label className="block">
            <span className={labelClass}>From date</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <label className="block">
            <span className={labelClass}>To date</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
        </div>

        {error ? (
          <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        {filteredRequests.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No leave requests match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Worker
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Leave type / reason
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Start
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    End
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Days
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredRequests.map((request) => {
                  const startDate = getLeaveStartDate(request);
                  const endDate = getLeaveEndDate(request);
                  const reason = getLeaveReason(request);
                  const isPending = isLeaveRequestPending(request.status);
                  const isActing = actingId === request.id;
                  const typeBadge = leaveTypeDisplayBadge(request.leave_type);
                  const statusMeta = leaveStatusMeta(request.status);
                  const workerName = resolveName(request);

                  return (
                    <tr key={request.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {workerName}
                      </td>
                      <td className="max-w-xs px-4 py-3">
                        <div className="flex flex-wrap items-center gap-1.5">
                          <span
                            className={cn(
                              "rounded-full px-2 py-0.5 text-xs font-semibold ring-1 ring-inset",
                              typeBadge.badgeClass
                            )}
                          >
                            {typeBadge.label}
                          </span>
                        </div>
                        {reason ? (
                          <p className="mt-1 line-clamp-2 text-xs text-slate-600">{reason}</p>
                        ) : null}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatLeaveDateRange(startDate, startDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatLeaveDateRange(endDate, endDate)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {request.number_of_days}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            statusMeta.badgeClass
                          )}
                        >
                          {statusMeta.label}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        {isPending ? (
                          <div className="flex justify-end gap-1.5">
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() =>
                                void handleApprove(
                                  request.id,
                                  request.worker_id,
                                  startDate,
                                  endDate
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
                            >
                              {isActing && actionType === "approve" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Check className="h-3.5 w-3.5" />
                              )}
                              Approve
                            </button>
                            <button
                              type="button"
                              disabled={isActing}
                              onClick={() =>
                                void handleReject(
                                  request.id,
                                  request.worker_id,
                                  startDate,
                                  endDate
                                )
                              }
                              className="inline-flex items-center gap-1 rounded-lg border border-red-200 bg-red-50 px-2.5 py-1.5 text-xs font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
                            >
                              {isActing && actionType === "reject" ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <Ban className="h-3.5 w-3.5" />
                              )}
                              Reject
                            </button>
                          </div>
                        ) : (
                          <span className="text-xs text-slate-400">—</span>
                        )}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Showing {filteredRequests.length} of {leaveRequests.length} leave request
          {leaveRequests.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
