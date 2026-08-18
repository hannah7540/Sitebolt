"use client";

import { ArrowLeft } from "lucide-react";
import { cn } from "@/lib/utils";

interface WorkerMobileBackButtonProps {
  label: string;
  onClick: () => void;
  className?: string;
  /** Show on large screens too (default: mobile / native only). */
  alwaysVisible?: boolean;
}

/**
 * Thumb-friendly back control fixed to the bottom-left on mobile / native shells.
 * Hidden on lg+ where inline header navigation is used instead.
 */
export default function WorkerMobileBackButton({
  label,
  onClick,
  className,
  alwaysVisible = false,
}: WorkerMobileBackButtonProps) {
  return (
    <div
      className={cn(
        "pointer-events-none fixed inset-x-0 bottom-0 z-50",
        !alwaysVisible && "lg:hidden",
        className
      )}
      aria-hidden={false}
    >
      <div className="mobile-safe-area-bottom pointer-events-auto px-4 pb-2">
        <button
          type="button"
          onClick={onClick}
          aria-label={label}
          className={cn(
            "inline-flex min-h-12 min-w-11 cursor-pointer items-center gap-2 rounded-full",
            "border border-slate-200 bg-white/95 px-4 py-3 text-sm font-semibold text-slate-700",
            "shadow-lg backdrop-blur-sm transition",
            "hover:border-orange-300 hover:text-orange-600 active:scale-95"
          )}
        >
          <ArrowLeft className="h-5 w-5 shrink-0" aria-hidden />
          <span>{label}</span>
        </button>
      </div>
    </div>
  );
}
