"use client";

import { cn } from "@/lib/utils";

interface TimesheetLeaveEntryBadgeProps {
  label: string;
  badgeClass: string;
  className?: string;
}

export default function TimesheetLeaveEntryBadge({
  label,
  badgeClass,
  className,
}: TimesheetLeaveEntryBadgeProps) {
  return (
    <span
      className={cn(
        "inline-flex rounded-full px-2.5 py-0.5 text-[11px] font-semibold ring-1 ring-inset",
        badgeClass,
        className
      )}
    >
      {label}
    </span>
  );
}
