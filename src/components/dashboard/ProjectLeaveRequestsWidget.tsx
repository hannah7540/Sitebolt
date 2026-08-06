"use client";

import { useMemo, useState } from "react";
import { CalendarOff, Check, Ban, Loader2, Users } from "lucide-react";
import type { LeaveRequest, Worker } from "@/lib/supabase";
import {
  approveLeaveRequestAction,
  getLeaveEndDate,
  getLeaveReason,
  getLeaveStartDate,
  isLeaveRequestApproved,
  isLeaveRequestPending,
  rejectLeaveRequestAction,
  resolveWorkerName,
} from "@/lib/leave-requests";
import { formatLeaveDateRange } from "@/lib/leave-utils";
import {
  classifyLeaveAttendance,
  isLeaveRequestOnDate,
  leaveTypeBadgeClass,
  leaveTypeBadgeLabel,
  leaveTypeDisplayBadge,
  type LeaveAttendanceCategory,
} from "@/lib/leave-type-calendar";
import { LEAVE_TYPE_FORM_OPTIONS } from "@/lib/leave-requests";
import { localIsoDate } from "@/lib/timesheet-utils";
import { cn } from "@/lib/utils";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";

interface ProjectLeaveRequestsWidgetProps {
  leaveRequests: LeaveRequest[];
  workers: Worker[];
  projectId?: string | null;
  loading?: boolean;
  onUpdated: () => void;
  onRefreshCalendar?: () => void | Promise<void>;
}

interface AttendanceWorkerRow {
  worker: Worker;
  category: LeaveAttendanceCategory;
  leaveType?: string | null;
}

const ATTENDANCE_SECTIONS: LeaveAttendanceCategory[] = [
  "on_site",
  "public_holiday",
  "rdo",
  "flexi_rdo",
  "leave_without_pay",
  "other_leave",
  "pending_leave",
];

export default function ProjectLeaveRequestsWidget({
  leaveRequests,
  workers,
  projectId = null,
  loading = false,
  onUpdated,
  onRefreshCalendar,
}: ProjectLeaveRequestsWidgetProps) {
  const [actingId, setActingId] = useState<string | null>(null);
  const [actionType, setActionType] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());
  const [selectedDate, setSelectedDate] = useState(localIsoDate());
  const [leaveTypeFilter, setLeaveTypeFilter] = useState("");
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const pendingRequests = useMemo(
    () =>
      leaveRequests.filter(
        (request) =>
          isLeaveRequestPending(request.status) && !resolvedIds.has(request.id)
      ),
    [leaveRequests, resolvedIds]
  );

  const filteredPendingRequests = useMemo(() => {
    if (!leaveTypeFilter) return pendingRequests;
    return pendingRequests.filter(
      (request) => (request.leave_type ?? "Annual Leave") === leaveTypeFilter
    );
  }, [leaveTypeFilter, pendingRequests]);

  const attendanceRows = useMemo(() => {
    const dateIso = selectedDate;
    const leaveByWorker = new Map<string, LeaveRequest>();

    for (const request of leaveRequests) {
      if (!isLeaveRequestPending(request.status) && !isLeaveRequestApproved(request.status)) {
        continue;
      }

      const startDate = getLeaveStartDate(request);
      const endDate = getLeaveEndDate(request);
      if (!isLeaveRequestOnDate(startDate, endDate, dateIso)) continue;

      const existing = leaveByWorker.get(request.worker_id);
      if (!existing) {
        leaveByWorker.set(request.worker_id, request);
        continue;
      }

      const existingApproved = isLeaveRequestApproved(existing.status);
      const requestApproved = isLeaveRequestApproved(request.status);
      if (requestApproved && !existingApproved) {
        leaveByWorker.set(request.worker_id, request);
      }
    }

    return workers.map((worker): AttendanceWorkerRow => {
      const request = leaveByWorker.get(worker.id);
      if (!request) {
        return { worker, category: "on_site" };
      }

      return {
        worker,
        category: classifyLeaveAttendance(request.leave_type, request.status),
        leaveType: request.leave_type,
      };
    });
  }, [leaveRequests, selectedDate, workers]);

  const attendanceByCategory = useMemo(() => {
    const grouped = new Map<LeaveAttendanceCategory, AttendanceWorkerRow[]>();
    for (const category of ATTENDANCE_SECTIONS) {
      grouped.set(category, []);
    }

    for (const row of attendanceRows) {
      grouped.get(row.category)?.push(row);
    }

    return grouped;
  }, [attendanceRows]);

  const resolveName = (request: LeaveRequest) => {
    const worker = workers.find((row) => row.id === request.worker_id);
    return resolveWorkerName(worker ?? null);
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

      setResolvedIds((current) => new Set(current).add(requestId));
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

      setResolvedIds((current) => new Set(current).add(requestId));
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

  const onSiteCount = attendanceByCategory.get("on_site")?.length ?? 0;
  const awayCount = workers.length - onSiteCount;

  return (
    <div className={cn(cardClass, "p-6")}>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
      <div className="mb-4 flex items-start gap-4">
        <CalendarOff className="h-10 w-10 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">Project Attendance &amp; Leave Requests</p>
          <h2 className="text-2xl font-bold text-slate-900">
            {loading ? "Loading…" : `${onSiteCount} On Site · ${awayCount} Away`}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Review attendance and approve leave submissions
            {projectId ? " for this project" : ""}
          </p>
        </div>
      </div>

      <label className="mb-4 block space-y-1">
        <span className={labelClass}>Selected date</span>
        <input
          type="date"
          value={selectedDate}
          onChange={(event) => setSelectedDate(event.target.value)}
          className={inputClass}
        />
      </label>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="mb-6 flex items-center gap-2 py-4 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading leave requests…
        </div>
      ) : (
        <div className="mb-6 space-y-4">
          {ATTENDANCE_SECTIONS.map((category) => {
            const rows = attendanceByCategory.get(category) ?? [];
            if (rows.length === 0) return null;

            return (
              <section key={category}>
                <div className="mb-2 flex items-center gap-2">
                  <Users className="h-4 w-4 text-slate-400" />
                  <h3 className="text-sm font-semibold text-slate-800">
                    {leaveTypeBadgeLabel(category)} ({rows.length})
                  </h3>
                </div>
                <ul className="space-y-2">
                  {rows.map(({ worker, leaveType }) => (
                    <li
                      key={worker.id}
                      className="flex items-center justify-between gap-3 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2"
                    >
                      <span className="text-sm font-medium text-slate-900">
                        {resolveWorkerName(worker)}
                      </span>
                      <span
                        className={cn(
                          "rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                          leaveTypeBadgeClass(category)
                        )}
                      >
                        {category === "on_site"
                          ? "On Site"
                          : leaveType ?? leaveTypeBadgeLabel(category)}
                      </span>
                    </li>
                  ))}
                </ul>
              </section>
            );
          })}

          {workers.length === 0 ? (
            <p className="text-sm text-slate-500">No workers assigned to this project.</p>
          ) : null}
        </div>
      )}

      <div className="border-t border-slate-200 pt-4">
        <div className="mb-3">
          <h3 className="text-sm font-semibold text-slate-800">Pending approval</h3>
          <p className="text-xs text-slate-500">
            {filteredPendingRequests.length > 0
              ? `${filteredPendingRequests.length} request${filteredPendingRequests.length === 1 ? "" : "s"} awaiting review`
              : "No outstanding leave requests"}
          </p>
        </div>

        <label className="mb-3 block space-y-1">
          <span className={labelClass}>Filter by leave type</span>
          <select
            value={leaveTypeFilter}
            onChange={(event) => setLeaveTypeFilter(event.target.value)}
            className={inputClass}
          >
            <option value="">All leave types</option>
            {LEAVE_TYPE_FORM_OPTIONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {filteredPendingRequests.length === 0 ? null : (
          <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
            {filteredPendingRequests.map((request) => {
              const startDate = getLeaveStartDate(request);
              const endDate = getLeaveEndDate(request);
              const reason = getLeaveReason(request);
              const isActing = actingId === request.id;
              const typeBadge = leaveTypeDisplayBadge(request.leave_type);

              return (
                <li
                  key={request.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 p-4"
                >
                  <div className="mb-3">
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
                    </div>
                    <p className="text-xs text-slate-500">
                      {formatLeaveDateRange(startDate, endDate)} · {request.number_of_days}{" "}
                      day{request.number_of_days === 1 ? "" : "s"}
                    </p>
                    {reason ? (
                      <p className="mt-2 text-sm text-slate-700">{reason}</p>
                    ) : null}
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
    </div>
  );
}
