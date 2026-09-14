"use client";

import { Loader2, X } from "lucide-react";
import { cn } from "@/lib/utils";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface ConfirmDeletionDialogProps {
  open: boolean;
  onCancel: () => void;
  onConfirm: () => void | Promise<void>;
  confirming?: boolean;
}

export default function ConfirmDeletionDialog({
  open,
  onCancel,
  onConfirm,
  confirming = false,
}: ConfirmDeletionDialogProps) {
  if (!open) return null;

  return (
    <div
      className={modalOverlayClass}
      role="alertdialog"
      aria-modal="true"
      aria-labelledby="confirm-deletion-title"
      aria-describedby="confirm-deletion-message"
      onClick={() => {
        if (!confirming) onCancel();
      }}
    >
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2
              id="confirm-deletion-title"
              className="text-lg font-bold text-slate-900"
            >
              Confirm Deletion
            </h2>
            <p
              id="confirm-deletion-message"
              className="mt-2 text-sm text-slate-600"
            >
              Are you sure you want to delete this record? This action cannot be
              undone.
            </p>
          </div>
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-50"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="flex gap-2">
          <button
            type="button"
            onClick={onCancel}
            disabled={confirming}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={confirming}
            onClick={() => void onConfirm()}
            className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-red-600 py-2.5 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {confirming ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Delete
          </button>
        </div>
      </div>
    </div>
  );
}
