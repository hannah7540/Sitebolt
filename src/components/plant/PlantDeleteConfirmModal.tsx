"use client";

import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface PlantDeleteConfirmModalProps {
  unitNumber: string;
  onClose: () => void;
  onConfirm: () => Promise<void>;
  deleting: boolean;
}

export default function PlantDeleteConfirmModal({
  unitNumber,
  onClose,
  onConfirm,
  deleting,
}: PlantDeleteConfirmModalProps) {
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-red-700">Delete Asset</h2>
            <p className="mt-2 text-sm text-slate-600">
              Are you sure you want to permanently delete{" "}
              <span className="font-semibold text-slate-900">{unitNumber}</span>?
              This action cannot be undone and will remove associated records.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={deleting}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onClose}
            disabled={deleting}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={deleting}
            onClick={() => void onConfirm()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {deleting ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete permanently
          </button>
        </div>
      </div>
    </div>
  );
}
