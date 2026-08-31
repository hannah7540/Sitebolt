"use client";

import { ClipboardCheck, ChevronRight, X } from "lucide-react";
import {
  assignmentDueLabel,
  resolveAssignmentProjectLabel,
  type FormWorkerAssignment,
} from "@/lib/induction-form-builder";
import {
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
} from "@/lib/ui-classes";
import ModalActionFooter from "@/components/ui/ModalActionFooter";
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
        className={cn(modalShellClass, "max-w-md")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className={modalBodyClass}>
          <div className="mb-4 flex items-start justify-between gap-3">
            <div>
              <h2 className="text-lg font-bold text-slate-900">Outstanding Inductions</h2>
              <p className="text-sm text-slate-500">
                Complete these assigned forms to stay compliant on site.
              </p>
            </div>
            <button
              type="button"
              onClick={onClose}
              className={modalCloseIconButtonClass}
              aria-label="Close"
            >
              <X className="h-5 w-5" />
            </button>
          </div>

          {assignments.length === 0 ? (
            <p className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-6 text-center text-sm text-slate-500">
              No outstanding inductions.
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
                      className="flex w-full items-center gap-3 rounded-xl border border-slate-200 bg-white px-3 py-3 text-left transition hover:border-orange-300 hover:bg-orange-50"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-orange-100 text-orange-600">
                        <ClipboardCheck className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {assignment.form_title ?? "Site induction"}
                        </p>
                        {projectLabel ? (
                          <p className="truncate text-xs text-slate-500">{projectLabel}</p>
                        ) : null}
                        <p className="mt-0.5 text-xs text-slate-500">
                          Assigned {assignmentDueLabel(assignment.assigned_at)} · Pending
                        </p>
                      </div>
                      <span className="inline-flex shrink-0 items-center gap-1 rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white">
                        Complete
                        <ChevronRight className="h-3.5 w-3.5" />
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <ModalActionFooter>
          <button
            type="button"
            onClick={onClose}
            className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
        </ModalActionFooter>
      </div>
    </div>
  );
}
