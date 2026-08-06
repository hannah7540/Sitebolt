"use client";

import { ClipboardCheck, Loader2 } from "lucide-react";
import {
  assignmentDueLabel,
  type FormWorkerAssignment,
} from "@/lib/induction-form-builder";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface OutstandingInductionsWidgetProps {
  assignments: FormWorkerAssignment[];
  loading?: boolean;
  onComplete: (assignment: FormWorkerAssignment) => void;
  className?: string;
}

function statusLabel(status: FormWorkerAssignment["status"]): string {
  if (status === "in_progress") return "In Progress";
  return "Pending";
}

export default function OutstandingInductionsWidget({
  assignments,
  loading = false,
  onComplete,
  className,
}: OutstandingInductionsWidgetProps) {
  if (loading) {
    return (
      <div
        className={cn(
          cardClass,
          "mb-4 flex items-center gap-2 px-4 py-3 text-sm text-slate-500",
          className
        )}
      >
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading outstanding inductions…
      </div>
    );
  }

  if (assignments.length === 0) {
    return null;
  }

  return (
    <section
      className={cn(
        "mb-4 space-y-3 rounded-xl border border-orange-200 bg-orange-50/60 p-4",
        className
      )}
    >
      <div className="flex items-start justify-between gap-3">
        <div>
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="text-sm font-semibold text-slate-900">Outstanding Inductions</h2>
            <span className="rounded-full bg-orange-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white">
              {assignments.length} pending
            </span>
          </div>
          <p className="mt-1 text-sm font-medium text-orange-900">
            {assignments[0]?.form_title ?? "Site induction"}
          </p>
          {assignments.length > 1 ? (
            <p className="mt-0.5 text-xs text-slate-600">
              +{assignments.length - 1} more form{assignments.length - 1 === 1 ? "" : "s"} waiting
            </p>
          ) : null}
        </div>
      </div>

      <ul className="space-y-2">
        {assignments.map((assignment) => (
          <li
            key={assignment.id}
            className="flex flex-col gap-3 rounded-xl border border-orange-200 bg-white p-3 shadow-sm sm:flex-row sm:items-center sm:justify-between"
          >
            <div className="flex min-w-0 items-start gap-3">
              <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600">
                <ClipboardCheck className="h-4 w-4" />
              </div>
              <div className="min-w-0">
                <p className="font-semibold text-slate-900">
                  {assignment.form_title ?? "Site induction"}
                </p>
                <p className="mt-0.5 text-xs text-slate-500">
                  Assigned {assignmentDueLabel(assignment.assigned_at)} ·{" "}
                  {statusLabel(assignment.status)}
                </p>
                {assignment.project_name ? (
                  <p className="mt-0.5 text-xs text-slate-500">{assignment.project_name}</p>
                ) : null}
              </div>
            </div>
            <button
              type="button"
              onClick={() => onComplete(assignment)}
              className="shrink-0 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              Complete Induction
            </button>
          </li>
        ))}
      </ul>
    </section>
  );
}
