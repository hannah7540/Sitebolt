"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import {
  submitLeaveRequest,
  resolveWorkerName,
  sanitizeLeaveType,
  LEAVE_TYPE_FORM_OPTIONS,
} from "@/lib/leave-requests";
import { formatDateOnly } from "@/lib/scheduler-utils";
import { uploadWorkerSignature } from "@/lib/worker-doc-upload";
import { calculateLeaveDays } from "@/lib/leave-utils";
import { localIsoDate } from "@/lib/timesheet-utils";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";

const LEAVE_TYPE_OPTIONS = LEAVE_TYPE_FORM_OPTIONS;

type ModalLeaveType = (typeof LEAVE_TYPE_OPTIONS)[number];

interface WorkerLeaveSubmitModalProps {
  worker: Worker;
  projectId?: string | null;
  allowedProjectIds?: string[];
  onClose: () => void;
  onSubmitted: () => void;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export default function WorkerLeaveSubmitModal({
  worker,
  projectId,
  allowedProjectIds,
  onClose,
  onSubmitted,
}: WorkerLeaveSubmitModalProps) {
  const [firstDate, setFirstDate] = useState(localIsoDate());
  const [lastDate, setLastDate] = useState(localIsoDate());
  const [numberOfDays, setNumberOfDays] = useState("1");
  const [daysEdited, setDaysEdited] = useState(false);
  const [leaveType, setLeaveType] = useState<ModalLeaveType>("Annual Leave");
  const [reason, setReason] = useState("");
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (daysEdited) return;
    const calculated = calculateLeaveDays(firstDate, lastDate);
    setNumberOfDays(String(calculated));
  }, [firstDate, lastDate, daysEdited]);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setError(null);

    const resolvedProjectId =
      projectId ??
      allowedProjectIds?.[0] ??
      worker.assigned_project_id;

    if (!resolvedProjectId) {
      setError(
        "No project assigned to your profile. Ask your supervisor to grant project access in Security Settings."
      );
      return;
    }

    if (!signature) {
      setError("Please sign your leave request.");
      return;
    }

    const days = Number.parseFloat(numberOfDays);
    if (Number.isNaN(days) || days <= 0) {
      setError("Enter a valid number of leave days.");
      return;
    }

    setSaving(true);
    const signatureUrl = await uploadWorkerSignature(
      signature,
      `leave/${worker.id}/${Date.now()}-signature`
    );

    const sanitizedLeaveType = sanitizeLeaveType(leaveType);

    const { error: submitError } = await submitLeaveRequest({
      workerId: worker.id,
      worker,
      workerName: resolveWorkerName(worker),
      projectId: resolvedProjectId,
      firstDate: formatDateOnly(firstDate),
      lastDate: formatDateOnly(lastDate),
      numberOfDays: days,
      reason: reason.trim(),
      signatureUrl,
      leaveType: sanitizedLeaveType,
    });
    setSaving(false);

    if (submitError) {
      setError(submitError);
      return;
    }

    onSubmitted();
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-md`}
        onClick={(e) => e.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Submit Leave Request</h2>
            <p className="mt-0.5 text-sm text-slate-500">
              Request will be sent to your project supervisor for review.
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

        <form onSubmit={handleSubmit} className="space-y-4">
          <Field label="Leave type">
            <select
              className={inputClass}
              value={leaveType}
              onChange={(e) => setLeaveType(e.target.value as ModalLeaveType)}
              required
            >
              {LEAVE_TYPE_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {option}
                </option>
              ))}
            </select>
          </Field>

          <div className="grid grid-cols-2 gap-3">
            <Field label="First date of leave">
              <input
                type="date"
                className={inputClass}
                value={firstDate}
                onChange={(e) => {
                  setFirstDate(e.target.value);
                  setDaysEdited(false);
                }}
                required
              />
            </Field>
            <Field label="Last date of leave">
              <input
                type="date"
                className={inputClass}
                value={lastDate}
                min={firstDate}
                onChange={(e) => {
                  setLastDate(e.target.value);
                  setDaysEdited(false);
                }}
                required
              />
            </Field>
          </div>

          <Field label="Number of days">
            <input
              type="number"
              min={0.5}
              step={0.5}
              className={inputClass}
              value={numberOfDays}
              onChange={(e) => {
                setNumberOfDays(e.target.value);
                setDaysEdited(true);
              }}
              required
            />
          </Field>

          <Field label="Reason for leave">
            <textarea
              className={`${inputClass} min-h-[88px] resize-y`}
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Brief reason for your leave request…"
              required
            />
          </Field>

          <div>
            <p className={labelClass}>Signature</p>
            <div className="mt-1 rounded-xl border border-slate-200 bg-white p-2">
              <SignatureCanvas onChange={setSignature} />
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <div className="flex gap-2 pt-1">
            <button
              type="button"
              onClick={onClose}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Submit Request
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
