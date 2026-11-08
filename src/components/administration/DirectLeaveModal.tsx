"use client";

import { useMemo, useState, useTransition } from "react";
import { Loader2, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createDirectApprovedLeave } from "@/app/actions/direct-calendar-leave";
import {
  DIRECT_LEAVE_TYPE_OPTIONS,
  type LeaveRequestDbLeaveType,
} from "@/lib/leave-requests";
import { WA_LEAVE_DAY_HOURS } from "@/lib/payroll/rules/wa";
import {
  inputClass,
  labelClass,
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { Worker } from "@/lib/supabase";

export type DirectLeaveModalTarget = {
  worker: Worker;
  date: string;
};

interface DirectLeaveModalProps {
  target: DirectLeaveModalTarget;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function formatDisplayDate(iso: string): string {
  const parsed = new Date(`${iso}T12:00:00`);
  if (Number.isNaN(parsed.getTime())) return iso;
  return parsed.toLocaleDateString("en-AU", {
    weekday: "short",
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function DirectLeaveModal({
  target,
  onClose,
  onSaved,
}: DirectLeaveModalProps) {
  const router = useRouter();
  const [leaveType, setLeaveType] = useState<LeaveRequestDbLeaveType>("Leave");
  const [hours, setHours] = useState<string>(String(WA_LEAVE_DAY_HOURS));
  const [notes, setNotes] = useState("");
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const workerName = useMemo(
    () => getWorkerDisplayName(target.worker),
    [target.worker]
  );

  const handleSubmit = () => {
    setError(null);
    const parsedHours = Number(hours);
    if (!Number.isFinite(parsedHours) || parsedHours < 0) {
      setError("Enter a valid hours value.");
      return;
    }
    if (parsedHours > WA_LEAVE_DAY_HOURS) {
      setError(`Leave hours cannot exceed ${WA_LEAVE_DAY_HOURS} per day.`);
      return;
    }

    startTransition(async () => {
      const result = await createDirectApprovedLeave({
        workerId: target.worker.id,
        date: target.date,
        leaveType,
        hours: parsedHours,
        notes: notes.trim() || null,
      });

      if (result.error) {
        setError(result.error);
        return;
      }

      await onSaved();
      router.refresh();
      onClose();
    });
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-md`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Add Leave</h2>
            <p className="mt-1 text-sm text-slate-500">
              Pre-approved admin entry — bypasses leave queues and creates an
              approved timesheet immediately.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm">
            <p className="font-semibold text-slate-900">{workerName}</p>
            <p className="text-slate-600">{formatDisplayDate(target.date)}</p>
          </div>

          <label className="block space-y-1">
            <span className={labelClass}>Leave Type</span>
            <select
              className={inputClass}
              value={leaveType}
              onChange={(event) =>
                setLeaveType(event.target.value as LeaveRequestDbLeaveType)
              }
              disabled={pending}
            >
              {DIRECT_LEAVE_TYPE_OPTIONS.map((option) => (
                <option key={option.value} value={option.value}>
                  {option.label}
                </option>
              ))}
            </select>
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>
              Hours (max {WA_LEAVE_DAY_HOURS})
            </span>
            <input
              type="number"
              className={inputClass}
              min={0}
              max={WA_LEAVE_DAY_HOURS}
              step={0.1}
              value={hours}
              onChange={(event) => setHours(event.target.value)}
              disabled={pending}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Notes (optional)</span>
            <textarea
              className={inputClass}
              rows={2}
              value={notes}
              onChange={(event) => setNotes(event.target.value)}
              disabled={pending}
              placeholder="Optional admin note"
            />
          </label>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={pending}
            className="rounded-lg border border-slate-300 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleSubmit}
            disabled={pending}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {pending ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Approved Leave
          </button>
        </div>
      </div>
    </div>
  );
}
