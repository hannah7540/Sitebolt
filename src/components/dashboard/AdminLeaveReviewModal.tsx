"use client";

import { useState } from "react";
import { X, Loader2, Check, Ban } from "lucide-react";
import type { LeaveRequest, Worker } from "@/lib/supabase";
import {
  approveLeaveRequest,
  declineLeaveRequest,
} from "@/lib/supabase";
import {
  formatLeaveDateRange,
  leaveStatusMeta,
} from "@/lib/leave-utils";
import { LEAVE_TYPE_FORM_OPTIONS } from "@/lib/leave-requests";
import { cn } from "@/lib/utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
  cardClass,
} from "@/lib/ui-classes";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";

interface AdminLeaveReviewModalProps {
  leaveRequests: LeaveRequest[];
  workers: Worker[];
  projectName: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function AdminLeaveReviewModal({
  leaveRequests,
  workers,
  projectName,
  onClose,
  onUpdated,
}: AdminLeaveReviewModalProps) {
  const pending = leaveRequests.filter((r) => r.status === "pending");
  const [selectedId, setSelectedId] = useState<string | null>(
    pending[0]?.id ?? null
  );
  const [leaveType, setLeaveType] = useState<(typeof LEAVE_TYPE_FORM_OPTIONS)[number]>(
    "Annual Leave"
  );
  const [action, setAction] = useState<"approve" | "decline" | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  const selected = pending.find((r) => r.id === selectedId) ?? pending[0] ?? null;
  const workerName =
    workers.find((w) => w.id === selected?.worker_id)?.full_name ?? "Unknown worker";

  const handleConfirm = async () => {
    if (!selected || !action) return;
    setError(null);
    setSaving(true);

    if (action === "approve") {
      const result = await approveLeaveRequest({
        leaveRequestId: selected.id,
        leaveType,
      });

      setSaving(false);

      if (result.error) {
        setError(result.error);
        showError(result.error);
        return;
      }

      if (result.toastMessage) {
        showSuccess(result.toastMessage);
      }
    } else {
      const result = await declineLeaveRequest(selected.id);

      setSaving(false);

      if (result.error) {
        setError(result.error);
        showError(result.error);
        return;
      }
    }

    setAction(null);
    onUpdated();

    const remaining = pending.filter((r) => r.id !== selected.id);
    setSelectedId(remaining[0]?.id ?? null);
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
      <div
        className={`${modalClass} max-w-2xl`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Leave Requests</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {projectName} · {pending.length} pending review
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

        {pending.length === 0 ? (
          <p className="py-8 text-center text-sm text-slate-500">
            No outstanding leave requests for this project.
          </p>
        ) : (
          <div className="grid gap-4 md:grid-cols-[220px_1fr]">
            <ul className="max-h-80 space-y-2 overflow-y-auto rounded-xl border border-slate-200 bg-slate-50 p-2">
              {pending.map((req) => {
                const name =
                  workers.find((w) => w.id === req.worker_id)?.full_name ??
                  "Worker";
                return (
                  <li key={req.id}>
                    <button
                      type="button"
                      onClick={() => {
                        setSelectedId(req.id);
                        setAction(null);
                        setError(null);
                      }}
                      className={cn(
                        "w-full rounded-lg px-3 py-2 text-left text-sm transition",
                        selected?.id === req.id
                          ? "bg-orange-500 font-semibold text-white"
                          : "text-slate-700 hover:bg-white"
                      )}
                    >
                      <p className="truncate">{name}</p>
                      <p
                        className={cn(
                          "truncate text-xs",
                          selected?.id === req.id
                            ? "text-orange-100"
                            : "text-slate-500"
                        )}
                      >
                        {formatLeaveDateRange(req.first_date, req.last_date)}
                      </p>
                    </button>
                  </li>
                );
              })}
            </ul>

            {selected && (
              <div className={cn(cardClass, "space-y-4 p-4")}>
                <div>
                  <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                    Review request
                  </p>
                  <h3 className="mt-1 text-lg font-bold text-slate-900">
                    {workerName}
                  </h3>
                </div>

                <dl className="grid grid-cols-2 gap-3 text-sm">
                  <div>
                    <dt className={labelClass}>Dates</dt>
                    <dd className="font-medium text-slate-900">
                      {formatLeaveDateRange(selected.first_date, selected.last_date)}
                    </dd>
                  </div>
                  <div>
                    <dt className={labelClass}>Days</dt>
                    <dd className="font-medium text-slate-900">
                      {selected.number_of_days}
                    </dd>
                  </div>
                  <div className="col-span-2">
                    <dt className={labelClass}>Reason</dt>
                    <dd className="mt-0.5 text-slate-700">{selected.reason}</dd>
                  </div>
                  <div className="col-span-2">
                    <dt className={labelClass}>Status</dt>
                    <dd>
                      <span
                        className={cn(
                          "inline-block rounded px-2 py-0.5 text-xs font-bold",
                          leaveStatusMeta(selected.status).badgeClass
                        )}
                      >
                        {leaveStatusMeta(selected.status).label}
                      </span>
                    </dd>
                  </div>
                </dl>

                {selected.signature_url && (
                  <div>
                    <p className={labelClass}>Signature</p>
                    <div className="mt-1 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
                      {/* eslint-disable-next-line @next/next/no-img-element */}
                      <img
                        src={selected.signature_url}
                        alt="Worker signature"
                        className="mx-auto max-h-24 object-contain"
                      />
                    </div>
                  </div>
                )}

                {!action && (
                  <div className="flex gap-2">
                    <button
                      type="button"
                      onClick={() => setAction("approve")}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2.5 text-sm font-semibold text-white hover:bg-emerald-500"
                    >
                      <Check className="h-4 w-4" />
                      Approve
                    </button>
                    <button
                      type="button"
                      onClick={() => setAction("decline")}
                      className="flex flex-1 items-center justify-center gap-2 rounded-lg border border-red-200 bg-red-50 py-2.5 text-sm font-semibold text-red-700 hover:bg-red-100"
                    >
                      <Ban className="h-4 w-4" />
                      Decline
                    </button>
                  </div>
                )}

                {action === "approve" && (
                  <div className="space-y-3 rounded-xl border border-emerald-200 bg-emerald-50 p-3">
                    <label className="block space-y-1">
                      <span className={labelClass}>Leave classification</span>
                      <select
                        className={inputClass}
                        value={leaveType}
                        onChange={(e) =>
                          setLeaveType(
                            e.target.value as (typeof LEAVE_TYPE_FORM_OPTIONS)[number]
                          )
                        }
                      >
                        {LEAVE_TYPE_FORM_OPTIONS.map((type) => (
                          <option key={type} value={type}>
                            {type}
                          </option>
                        ))}
                      </select>
                    </label>
                    <p className="text-xs text-emerald-800">
                      Approving will block these dates on the worker&apos;s project
                      calendar as <strong>{leaveType}</strong>.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAction(null)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleConfirm}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-emerald-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirm Approval
                      </button>
                    </div>
                  </div>
                )}

                {action === "decline" && (
                  <div className="space-y-3 rounded-xl border border-red-200 bg-red-50 p-3">
                    <p className="text-sm text-red-800">
                      Decline this leave request? The worker will not be blocked
                      out on the calendar.
                    </p>
                    <div className="flex gap-2">
                      <button
                        type="button"
                        onClick={() => setAction(null)}
                        className="flex-1 rounded-lg border border-slate-200 bg-white py-2 text-sm font-medium text-slate-700"
                      >
                        Back
                      </button>
                      <button
                        type="button"
                        disabled={saving}
                        onClick={handleConfirm}
                        className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2 text-sm font-semibold text-white disabled:opacity-50"
                      >
                        {saving && <Loader2 className="h-4 w-4 animate-spin" />}
                        Confirm Decline
                      </button>
                    </div>
                  </div>
                )}

                {error && (
                  <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                    {error}
                  </p>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </div>
  );
}
