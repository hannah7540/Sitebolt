"use client";

import { useEffect, useMemo } from "react";
import { X } from "lucide-react";
import {
  resolveInductionFormBlocks,
  type FormWorkerAssignment,
  type InductionFormTemplate,
} from "@/lib/induction-form-builder";
import { modalClass, modalOverlayClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface InductionAssignmentDetailModalProps {
  assignment: FormWorkerAssignment;
  form: InductionFormTemplate;
  workerLabel: string;
  onClose: () => void;
}

function formatAnswerValue(value: unknown): string {
  if (value === null || value === undefined) return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.length > 0 ? value.join(", ") : "—";
  if (typeof value === "string" && value.startsWith("data:image")) {
    return "Signature captured";
  }
  return String(value);
}

export default function InductionAssignmentDetailModal({
  assignment,
  form,
  workerLabel,
  onClose,
}: InductionAssignmentDetailModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const blocks = useMemo(() => resolveInductionFormBlocks(form), [form]);
  const responses = assignment.responses ?? {};

  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-2xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Submitted Induction</h2>
            <p className="text-sm text-slate-500">
              {workerLabel} · {form.title}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-3">
          {blocks
            .filter((block) => !["section_header", "rich_text", "pdf_viewer"].includes(block.type))
            .map((block) => {
              const answer = responses[block.id];
              const signatureDataUrl =
                block.type === "signature" && typeof answer === "string" && answer.startsWith("data:")
                  ? answer
                  : assignment.signature_url;

              return (
                <div
                  key={block.id}
                  className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3"
                >
                  <p className={labelClass}>{block.label}</p>
                  {block.type === "signature" && signatureDataUrl ? (
                    <img
                      src={signatureDataUrl}
                      alt={`${workerLabel} signature`}
                      className="mt-2 max-h-32 rounded-lg border border-slate-200 bg-white p-2"
                    />
                  ) : (
                    <p className="mt-1 text-sm font-medium text-slate-900">
                      {formatAnswerValue(answer)}
                    </p>
                  )}
                </div>
              );
            })}

          {Object.keys(responses).length === 0 && !assignment.signature_url ? (
            <p className="rounded-xl border border-dashed border-slate-200 px-4 py-8 text-center text-sm text-slate-500">
              No response data stored for this assignment.
            </p>
          ) : null}
        </div>

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
