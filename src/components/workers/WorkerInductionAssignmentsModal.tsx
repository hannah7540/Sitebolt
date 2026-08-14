"use client";

import { ClipboardCheck, ChevronRight, X } from "lucide-react";
import {
  assignmentDueLabel,
  resolveAssignmentProjectLabel,
  type FormWorkerAssignment,
} from "@/lib/induction-form-builder";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerInductionAssignmentsModalProps {
  assignments: FormWorkerAssignment[];
  onClose: () => void;
  onSelectAssignment: (assignment: FormWorkerAssignment) => void;
}

export default function WorkerInductionAssignmentsModal({
  assignments,
  onClose,
  onSelectAssignment,
}: WorkerInductionAssignmentsModalProps) {
  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Outstanding Inductions</h2>
            <p className="text-sm text-slate-500">
              Complete these assigned forms to stay compliant on site.
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {assignments.length === 0 ? (
          <p className="rounded-xl border border-dashed border-slate-200 p-6 text-center text-sm text-slate-500">
            No pending inductions right now.
          </p>
        ) : (
          <ul className="space-y-2">
            {assignments.map((assignment) => {
              const projectLabel = resolveAssignmentProjectLabel(assignment);
              return (
              <li key={assignment.id}>
                <button
                  type="button"
                  onClick={() => onSelectAssignment(assignment)}
                  className="flex w-full items-start gap-3 rounded-xl border border-orange-200 bg-orange-50 p-3 text-left transition hover:border-orange-300 hover:bg-orange-100/80"
                >
                  <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-white text-orange-600">
                    <ClipboardCheck className="h-4 w-4" />
                  </div>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-center gap-2">
                      <p className="font-semibold text-slate-900">
                        {assignment.form_title ?? "Site induction"}
                      </p>
                      {projectLabel ? (
                        <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                          {projectLabel}
                        </span>
                      ) : null}
                    </div>
                    <p className="mt-0.5 text-xs text-slate-500">
                      Assigned {assignmentDueLabel(assignment.assigned_at)} · Pending
                    </p>
                  </div>
                  <span className="shrink-0 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">
                    Complete Induction
                  </span>
                </button>
              </li>
            );
            })}
          </ul>
        )}

        <button
          type="button"
          onClick={onClose}
          className="mt-4 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700"
        >
          Close
        </button>
      </div>
    </div>
  );
}
