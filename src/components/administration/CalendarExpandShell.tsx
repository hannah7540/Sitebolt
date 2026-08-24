"use client";

import { useEffect, type ReactNode } from "react";
import { Maximize2, Minimize2, X } from "lucide-react";
import { cn } from "@/lib/utils";

interface CalendarExpandShellProps {
  title: ReactNode;
  subtitle?: ReactNode;
  expanded: boolean;
  onExpandedChange: (expanded: boolean) => void;
  /** Toolbar actions shown beside Expand (e.g. Add RDO). */
  toolbar?: ReactNode;
  /** Filters / controls rendered below the title row. */
  filters?: ReactNode;
  children: ReactNode;
  className?: string;
}

export default function CalendarExpandShell({
  title,
  subtitle,
  expanded,
  onExpandedChange,
  toolbar,
  filters,
  children,
  className,
}: CalendarExpandShellProps) {
  useEffect(() => {
    if (!expanded) return;

    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";

    const handleKeyDown = (event: KeyboardEvent) => {
      if (event.key === "Escape") {
        event.preventDefault();
        onExpandedChange(false);
      }
    };

    window.addEventListener("keydown", handleKeyDown);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", handleKeyDown);
    };
  }, [expanded, onExpandedChange]);

  return (
    <>
      {expanded ? (
        <button
          type="button"
          aria-label="Close expanded calendar"
          className="fixed inset-0 z-[9998] bg-slate-900/50"
          onClick={() => onExpandedChange(false)}
        />
      ) : null}

      <div
        className={cn(
          "space-y-6",
          expanded &&
            "fixed inset-0 z-[9999] m-auto flex h-[92vh] w-[96vw] max-w-[96vw] flex-col space-y-4 overflow-hidden rounded-xl bg-white p-4 shadow-2xl sm:p-6",
          className
        )}
        role={expanded ? "dialog" : undefined}
        aria-modal={expanded || undefined}
        aria-label={expanded ? "Expanded calendar" : undefined}
      >
        <div className="flex shrink-0 flex-wrap items-start justify-between gap-3">
          <div className="min-w-0 flex-1">
            {typeof title === "string" ? (
              <h1 className="text-3xl font-bold text-slate-900">{title}</h1>
            ) : (
              title
            )}
            {subtitle ? (
              typeof subtitle === "string" ? (
                <p className="mt-1 text-sm text-slate-500">{subtitle}</p>
              ) : (
                subtitle
              )
            ) : null}
          </div>

          <div className="flex flex-wrap items-center justify-end gap-2">
            {toolbar}
            {!expanded ? (
              <button
                type="button"
                onClick={() => onExpandedChange(true)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:border-orange-300 hover:bg-orange-50 hover:text-orange-700"
                aria-label="Expand calendar to full screen"
              >
                <Maximize2 className="h-4 w-4" />
                Expand Calendar
              </button>
            ) : (
              <button
                type="button"
                onClick={() => onExpandedChange(false)}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2.5 text-sm font-semibold text-slate-700 shadow-sm hover:bg-slate-50"
                aria-label="Exit full screen"
              >
                <Minimize2 className="h-4 w-4" />
                Exit Full Screen
              </button>
            )}
            {expanded ? (
              <button
                type="button"
                onClick={() => onExpandedChange(false)}
                className="inline-flex h-10 w-10 items-center justify-center rounded-full bg-red-600 text-white shadow-md hover:bg-red-500"
                aria-label="Close expanded calendar"
              >
                <X className="h-5 w-5" strokeWidth={2.5} />
              </button>
            ) : null}
          </div>
        </div>

        {filters ? <div className="shrink-0">{filters}</div> : null}

        <div
          className={cn(
            expanded && "min-h-0 flex-1 overflow-auto"
          )}
        >
          {children}
        </div>
      </div>
    </>
  );
}
