"use client";

import {
  formatWorkerRequestDetailLines,
  type WorkerRequestRecord,
} from "@/lib/worker-requests-service";
import { cn } from "@/lib/utils";

interface WorkerRequestDetailsDisplayProps {
  request: WorkerRequestRecord;
  variant?: "table" | "inline";
  className?: string;
}

export default function WorkerRequestDetailsDisplay({
  request,
  variant = "table",
  className,
}: WorkerRequestDetailsDisplayProps) {
  const lines = formatWorkerRequestDetailLines(request);
  const isUniform = request.request_type === "Uniform";

  if (variant === "inline") {
    return (
      <div className={cn("space-y-1", className)}>
        {lines.map((line, index) => (
          <p key={`${line}-${index}`} className="text-sm text-slate-800">
            {line}
          </p>
        ))}
      </div>
    );
  }

  return (
    <div className={cn("flex flex-col gap-1.5", className)}>
      {lines.map((line, index) => (
        <span
          key={`${line}-${index}`}
          className={cn(
            "inline-flex w-fit max-w-full rounded-full px-2.5 py-1 text-xs font-medium ring-1 ring-inset",
            isUniform
              ? "bg-sky-50 text-sky-800 ring-sky-200"
              : "bg-slate-50 text-slate-700 ring-slate-200"
          )}
        >
          {line}
        </span>
      ))}
    </div>
  );
}
