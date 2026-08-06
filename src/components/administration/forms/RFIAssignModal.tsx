"use client";

import { X } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import { resolveWorkerDisplayName } from "@/lib/induction-form-builder";
import { modalClass, modalOverlayClass, labelClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface RFIAssignModalProps {
  workers: Worker[];
  onClose: () => void;
  onAssign: (workerId: string, workerName: string) => void;
  assigning?: boolean;
}

export default function RFIAssignModal({
  workers,
  onClose,
  onAssign,
  assigning = false,
}: RFIAssignModalProps) {
  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Assign RFI</h2>
            <p className="text-sm text-slate-500">Select a worker to action this request.</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <label className="block space-y-2">
          <span className={labelClass}>Assign to worker</span>
          <select
            className={inputClass}
            defaultValue=""
            disabled={assigning}
            onChange={(event) => {
              const workerId = event.target.value;
              if (!workerId) return;
              const worker = workers.find((row) => row.id === workerId);
              if (!worker) return;
              onAssign(worker.id, resolveWorkerDisplayName(worker));
            }}
          >
            <option value="">Select worker…</option>
            {workers
              .filter((worker) => worker.status !== "Revoked" && !worker.is_revoked)
              .map((worker) => (
                <option key={worker.id} value={worker.id}>
                  {resolveWorkerDisplayName(worker)}
                  {worker.trade ? ` · ${worker.trade}` : ""}
                </option>
              ))}
          </select>
        </label>

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
        >
          Cancel
        </button>
      </div>
    </div>
  );
}
