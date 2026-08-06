"use client";

import { useEffect } from "react";
import { AlertCircle, CheckCircle2, X } from "lucide-react";
import { cn } from "@/lib/utils";

export type ToastVariant = "error" | "success";

interface ToastProps {
  message: string;
  variant?: ToastVariant;
  onDismiss: () => void;
  durationMs?: number;
}

export default function Toast({
  message,
  variant = "error",
  onDismiss,
  durationMs = 7000,
}: ToastProps) {
  useEffect(() => {
    const timer = window.setTimeout(onDismiss, durationMs);
    return () => window.clearTimeout(timer);
  }, [durationMs, message, onDismiss]);

  const isError = variant === "error";

  return (
    <div
      role="status"
      aria-live="polite"
      className={cn(
        "fixed bottom-6 right-6 z-[70] flex max-w-md items-start gap-3 rounded-xl border px-4 py-3 shadow-lg",
        isError
          ? "border-red-200 bg-red-50 text-red-900"
          : "border-emerald-200 bg-emerald-50 text-emerald-900"
      )}
    >
      {isError ? (
        <AlertCircle className="mt-0.5 h-5 w-5 shrink-0 text-red-600" />
      ) : (
        <CheckCircle2 className="mt-0.5 h-5 w-5 shrink-0 text-emerald-600" />
      )}
      <p className="flex-1 text-sm leading-snug">{message}</p>
      <button
        type="button"
        onClick={onDismiss}
        className="shrink-0 rounded p-0.5 opacity-70 hover:opacity-100"
        aria-label="Dismiss notification"
      >
        <X className="h-4 w-4" />
      </button>
    </div>
  );
}
