"use client";

import { Loader2, Trash2, X } from "lucide-react";
import {
  modalClass,
  modalOverlayClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface DeleteWorkerConfirmModalProps {
  workerName: string;
  saving?: boolean;
  archiveFromRevoked?: boolean;
  onClose: () => void;
  onConfirm: () => void;
}

const DELETE_MESSAGE =
  "Are you sure you want to delete this worker? They will be removed from all active rosters, project allocations, and team lists. Their compliance history, signed SWMS, inductions, and leave records will be archived for administrative reporting.";

const ARCHIVE_MESSAGE =
  "Move this revoked worker to the archive? They will be permanently deleted from active and revoked lists. Their compliance history, signed SWMS, inductions, and leave records will remain available in Admin Reports.";

export default function DeleteWorkerConfirmModal({
  workerName,
  saving = false,
  archiveFromRevoked = false,
  onClose,
  onConfirm,
}: DeleteWorkerConfirmModalProps) {
  const title = archiveFromRevoked ? "Move to Archive" : "Delete Worker";
  const message = archiveFromRevoked ? ARCHIVE_MESSAGE : DELETE_MESSAGE;
  const actionLabel = archiveFromRevoked ? "Move to Archive" : "Delete Worker";
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div className="flex items-start gap-3">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-100 text-red-700">
              <Trash2 className="h-5 w-5" />
            </span>
            <div>
              <h2 className="text-lg font-bold text-slate-900">{title}</h2>
              <p className="mt-0.5 text-sm text-slate-500">{workerName}</p>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close" disabled={saving}>
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <p className="text-sm leading-relaxed text-slate-700">{message}</p>

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            disabled={saving}
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Cancel
          </button>
          <button
            type="button"
            disabled={saving}
            onClick={onConfirm}
            className="inline-flex items-center gap-2 rounded-lg bg-red-600 px-4 py-2 text-sm font-semibold text-white hover:bg-red-700 disabled:opacity-50"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Trash2 className="h-4 w-4" />}
            {actionLabel}
          </button>
        </div>
      </div>
    </div>
  );
}
