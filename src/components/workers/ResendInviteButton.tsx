"use client";

import { Loader2, Mail } from "lucide-react";
import { useState } from "react";
import type { Worker } from "@/lib/supabase";
import { requestWorkerInviteResend } from "@/lib/worker-invite-client";
import { canResendWorkerInvite } from "@/lib/worker-utils";
import { cn } from "@/lib/utils";

export function ResendInviteButton({
  worker,
  lastSignInAt,
  label = "Resend Invite",
  variant = "table",
  onSuccess,
  onError,
}: {
  worker: Worker;
  lastSignInAt?: string | null;
  label?: string;
  variant?: "table" | "profile";
  onSuccess?: (message: string, inviteSentAt: string | null) => void;
  onError?: (message: string) => void;
}) {
  const [sending, setSending] = useState(false);

  if (!canResendWorkerInvite(worker, lastSignInAt)) {
    return null;
  }

  const handleClick = async () => {
    setSending(true);
    try {
      const result = await requestWorkerInviteResend(worker.id, worker.email);
      const email = worker.email?.trim() || "the worker";
      const message =
        result.message ?? `Invitation email resent successfully to ${email}`;
      onSuccess?.(message, result.inviteSentAt ?? null);
    } catch (error) {
      onError?.(
        error instanceof Error ? error.message : "Failed to resend invitation email."
      );
    } finally {
      setSending(false);
    }
  };

  return (
    <button
      type="button"
      disabled={sending}
      onClick={() => void handleClick()}
      className={cn(
        "inline-flex items-center gap-1.5 font-semibold disabled:opacity-50",
        variant === "profile"
          ? "rounded-lg border border-blue-200 bg-blue-50 px-3 py-1.5 text-xs text-blue-800 hover:bg-blue-100"
          : "rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs text-slate-700 hover:border-blue-300 hover:text-blue-700"
      )}
    >
      {sending ? (
        <Loader2 className="h-3.5 w-3.5 animate-spin" />
      ) : (
        <Mail className="h-3.5 w-3.5" />
      )}
      {sending ? "Sending…" : label}
    </button>
  );
}
