"use client";

import { useState } from "react";
import { X, Loader2, Check, Ban } from "lucide-react";
import type { LeaveRequest } from "@/lib/supabase";
import {
  approveLeaveRequestAction,
  getLeaveEndDate,
  getLeaveReason,
  getLeaveStartDate,
  isLeaveRequestPending,
  rejectLeaveRequestAction,
} from "@/lib/leave-requests";
import {
  formatLeaveDateRange,
  leaveStatusMeta,
} from "@/lib/leave-utils";
import { leaveTypeDisplayBadge } from "@/lib/leave-type-calendar";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass, labelClass } from "@/lib/ui-classes";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";

interface LeaveRequestReviewModalProps {
  leaveRequest: LeaveRequest;
  workerName: string;
  onClose: () => void;
  onUpdated: (result: "approved" | "rejected") => void;
  onRefreshCalendar?: () => void | Promise<void>;
}

export default function LeaveRequestReviewModal({
  leaveRequest,
  workerName,
  onClose,
  onUpdated,
  onRefreshCalendar,
}: LeaveRequestReviewModalProps) {
  const [saving, setSaving] = useState<"approve" | "reject" | null>(null);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const startDate = getLeaveStartDate(leaveRequest);
  const endDate = getLeaveEndDate(leaveRequest);
  const reason = getLeaveReason(leaveRequest);
  const canReview = isLeaveRequestPending(leaveRequest.status);
  const statusMeta = leaveStatusMeta(leaveRequest.status);
  const typeBadge = leaveTypeDisplayBadge(leaveRequest.leave_type);

  const handleApprove = async () => {
    setError(null);
    setSaving("approve");

    try {
      const result = await approveLeaveRequestAction({
        requestId: leaveRequest.id,
        workerId: leaveRequest.worker_id,
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

      onUpdated("approved");
      if (onRefreshCalendar) {
        await onRefreshCalendar();
      }
    } catch (err) {
      console.error("Approve failed:", err);
      setError(err instanceof Error ? err.message : "Approve failed.");
    } finally {
      setSaving(null);
    }
  };

  const handleReject = async () => {
    setError(null);
    setSaving("reject");

    try {
      const result = await rejectLeaveRequestAction({
        requestId: leaveRequest.id,
        workerId: leaveRequest.worker_id,
        startDate,
        endDate,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      onUpdated("rejected");
      if (onRefreshCalendar) {
        await onRefreshCalendar();
      }
    } catch (err) {
      console.error("Reject failed:", err);
      setError(err instanceof Error ? err.message : "Reject failed.");
    } finally {
      setSaving(null);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
      <div
        className={`${modalClass} max-w-lg`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Leave Request</h2>
            <p className="mt-0.5 text-sm text-slate-500">Review worker leave submission</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <dl className="space-y-3 text-sm">
          <div>
            <dt className={labelClass}>Worker</dt>
            <dd className="font-medium text-slate-900">{workerName}</dd>
          </div>
          <div>
            <dt className={labelClass}>Leave type</dt>
            <dd>
              <span
                className={cn(
                  "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  typeBadge.badgeClass
                )}
              >
                {typeBadge.label}
              </span>
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Requested dates</dt>
            <dd className="font-medium text-slate-900">
              {formatLeaveDateRange(startDate, endDate)}
            </dd>
          </div>
          <div>
            <dt className={labelClass}>Total days</dt>
            <dd className="font-medium text-slate-900">{leaveRequest.number_of_days}</dd>
          </div>
          <div>
            <dt className={labelClass}>Reason</dt>
            <dd className="text-slate-700">{reason || "—"}</dd>
          </div>
          <div>
            <dt className={labelClass}>Status</dt>
            <dd>
              <span
                className={cn(
                  "inline-block rounded px-2 py-0.5 text-xs font-bold",
                  statusMeta.badgeClass
                )}
              >
                {statusMeta.label}
              </span>
            </dd>
          </div>
        </dl>

        {canReview ? (
          <div className="mt-5 flex gap-2">
            <button
              type="button"
              disabled={saving !== null}
              onClick={(event) => {
                event.stopPropagation();
                void handleApprove();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-50"
            >
              {saving === "approve" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Check className="h-4 w-4" />
              )}
              Approve Leave
            </button>
            <button
              type="button"
              disabled={saving !== null}
              onClick={(event) => {
                event.stopPropagation();
                void handleReject();
              }}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100 disabled:opacity-50"
            >
              {saving === "reject" ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Ban className="h-4 w-4" />
              )}
              Reject Leave
            </button>
          </div>
        ) : null}

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}
      </div>
    </div>
  );
}
