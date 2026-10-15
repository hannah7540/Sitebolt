"use client";

import { Bell, Loader2, X } from "lucide-react";
import type { SwmsAssignmentRecord } from "@/lib/supabase";
import { isGuestSwmsAssignment } from "@/lib/swms-guest";
import type { SwmsDocumentSummary } from "@/lib/swms";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SwmsWaitingSignOffListModalProps {
  assignments: SwmsAssignmentRecord[];
  documents: SwmsDocumentSummary[];
  sendingId: string | null;
  resolveWorkerName: (workerId: string, fallback?: string | null) => string;
  onSendReminder: (assignment: SwmsAssignmentRecord) => void;
  onClose: () => void;
}

function swmsTitle(
  assignment: SwmsAssignmentRecord,
  documents: SwmsDocumentSummary[]
): string {
  return (
    documents.find(
      (doc) => doc.id === assignment.swms_id || doc.swms_id === assignment.swms_id
    )?.title ??
    assignment.swms_id ??
    "SWMS"
  );
}

function assignmentWorkerId(assignment: SwmsAssignmentRecord): string {
  return String(
    assignment.worker_id ||
      (assignment.assignee_type === "worker" ? assignment.assignee_id : "") ||
      ""
  ).trim();
}

function formatAssignedDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString(undefined, {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export default function SwmsWaitingSignOffListModal({
  assignments,
  documents,
  sendingId,
  resolveWorkerName,
  onSendReminder,
  onClose,
}: SwmsWaitingSignOffListModalProps) {
  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-5xl sm:w-[90vw]")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">SWMS waiting sign-off</h2>
            <p className="mt-1 text-sm text-slate-500">
              {assignments.length} outstanding assignment
              {assignments.length === 1 ? "" : "s"}
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
            No SWMS waiting for sign-off.
          </p>
        ) : (
          <div className="overflow-x-auto">
            <table className="min-w-full text-left text-sm">
              <thead>
                <tr className="border-b border-slate-200 text-xs font-semibold uppercase tracking-wide text-slate-500">
                  <th className="py-2 pr-3">Worker Name</th>
                  <th className="py-2 pr-3">SWMS</th>
                  <th className="py-2 pr-3">Assigned Date</th>
                  <th className="py-2 pr-3">Status</th>
                  <th className="py-2 text-right">Actions</th>
                </tr>
              </thead>
              <tbody>
                {assignments.map((assignment) => {
                  const workerId = assignmentWorkerId(assignment);
                  const workerName = resolveWorkerName(
                    workerId,
                    assignment.assignee_name
                  );
                  const busy = sendingId === assignment.id;
                  const isGuest = isGuestSwmsAssignment(assignment);
                  const canRemind = Boolean(workerId) && !isGuest;
                  return (
                    <tr key={assignment.id} className="border-b border-slate-100">
                      <td className="py-3 pr-3 font-semibold text-slate-900">
                        <span className="inline-flex flex-wrap items-center gap-1.5">
                          {workerName}
                          {isGuest ? (
                            <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                              Guest
                            </span>
                          ) : null}
                        </span>
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {swmsTitle(assignment, documents)}
                      </td>
                      <td className="py-3 pr-3 text-slate-700">
                        {formatAssignedDate(assignment.created_at)}
                      </td>
                      <td className="py-3 pr-3">
                        <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                          {assignment.status || "Pending"}
                        </span>
                      </td>
                      <td className="py-3 text-right">
                        <button
                          type="button"
                          disabled={busy || !canRemind}
                          onClick={() => onSendReminder(assignment)}
                          className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-xs font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
                        >
                          {busy ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <Bell className="h-3.5 w-3.5" />
                          )}
                          Send Reminder
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
