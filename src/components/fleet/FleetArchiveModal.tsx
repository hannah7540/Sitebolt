"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  FLEET_ARCHIVE_REASONS,
  type FleetArchiveReason,
} from "@/lib/fleet-archive";
import { cn } from "@/lib/utils";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface FleetArchiveModalProps {
  vehicleLabel: string;
  onClose: () => void;
  onConfirm: (reason: string) => Promise<void>;
  saving: boolean;
}

export default function FleetArchiveModal({
  vehicleLabel,
  onClose,
  onConfirm,
  saving,
}: FleetArchiveModalProps) {
  const [reason, setReason] = useState<FleetArchiveReason>("Sold");
  const [otherDetail, setOtherDetail] = useState("");
  const [error, setError] = useState<string | null>(null);

  const handleConfirm = async () => {
    const resolved =
      reason === "Other"
        ? otherDetail.trim()
          ? `Other: ${otherDetail.trim()}`
          : "Other"
        : reason;
    if (!resolved.trim()) {
      setError("Please choose an archive reason.");
      return;
    }
    setError(null);
    await onConfirm(resolved);
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Archive Vehicle</h2>
            <p className="mt-2 text-sm text-slate-600">
              Archive <span className="font-semibold text-slate-900">{vehicleLabel}</span>?
              Archived vehicles stay in the Archived tab and can be restored later.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <label className="block">
          <span className={labelClass}>Reason</span>
          <select
            className={inputClass}
            value={reason}
            onChange={(event) =>
              setReason(event.target.value as FleetArchiveReason)
            }
            disabled={saving}
          >
            {FLEET_ARCHIVE_REASONS.map((option) => (
              <option key={option} value={option}>
                {option}
              </option>
            ))}
          </select>
        </label>

        {reason === "Other" ? (
          <label className="mt-3 block">
            <span className={labelClass}>Details</span>
            <input
              className={inputClass}
              value={otherDetail}
              onChange={(event) => setOtherDetail(event.target.value)}
              placeholder="Optional details"
              disabled={saving}
            />
          </label>
        ) : null}

        {error ? <p className="mt-3 text-sm text-red-600">{error}</p> : null}

        <div className="mt-6 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={saving}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={() => void handleConfirm()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-slate-800 py-2.5 text-sm font-semibold text-white hover:bg-slate-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Archive Vehicle
          </button>
        </div>
      </div>
    </div>
  );
}
