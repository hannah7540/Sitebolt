"use client";

import { Bell, Loader2, X } from "lucide-react";
import type { FormWorkerAssignment } from "@/lib/induction-form-builder";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface IncompleteInductionsListModalProps {
  assignments: FormWorkerAssignment[];
  sendingId: string | null;
  resolveWorkerName: (workerId: string, fallback?: string | null) => string;
  formatDueDate: (assignment: FormWorkerAssignment) => string;
  onSendNotification: (assignment: FormWorkerAssignment) => void;
  onClose: () => void;
}

export default function IncompleteInductionsListModal({
  assignments,
  sendingId,
  resolveWorkerName,
  formatDueDate,
  onSendNotification,
  onClose,
}: IncompleteInductionsListModalProps) {
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-3xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incomplete Inductions</h2>
            <p className="mt-1 text-sm text-slate-500">
              {assignments.length} worker{assignments.length === 1 ? "" : "s"} with pending
              inductions
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close"
            className="inline-flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-red-600 text-white shadow-sm hover:bg-red-700"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {assignments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
            No incomplete inductions.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Worker Name</th>
                  <th className="py-2 pr-3">Induction Title</th>
                  <th className="py-2 pr-3">Due Date</th>
                  <th className="py-2 text-right">Action</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const workerName = resolveWorkerName(
                    assignment.worker_id,
                    assignment.worker_name
                  );
                  const busy = sendingId === assignment.id;
                  return (
                    <tr key={assignment.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3 font-semibold text-slate-900">{workerName}</td>
                      <td className="py-3 pr-3 text-slate-700">
                        {assignment.form_title?.trim() || "Induction"}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">{formatDueDate(assignment)}</td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={busy}
                          onClick={() => onSendNotification(assignment)}
                          className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bell className="h-3.5 w-3.5" />
                          )}
                          Send Notification
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}
