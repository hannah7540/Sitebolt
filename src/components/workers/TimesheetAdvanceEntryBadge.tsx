"use client";

import { cn } from "@/lib/utils";

interface TimesheetAdvanceEntryBadgeProps {
  className?: string;
}

export default function TimesheetAdvanceEntryBadge({
  className,
}: TimesheetAdvanceEntryBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded bg-violet-100 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide text-violet-800 ring-1 ring-inset ring-violet-200",
        className
      )}
    >
      Advance Entry
    </span>
  );
}
