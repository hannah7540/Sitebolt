"use client";

import { useState } from "react";
import Link from "next/link";
import { HardHat, Loader2 } from "lucide-react";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onBackToSignIn: () => void;
}

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  if (error && typeof error === "object" && "message" in error) {
    const message = (error as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) {
      return message.trim();
    }
  }

  return null;
}

export default function ForgotPasswordForm({
  initialEmail = "",
  onBackToSignIn,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    setSubmitting(true);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email: trimmedEmail }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(parseApiError(payload) ?? "Failed to send reset email.");
        return;
      }

      setSent(true);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to send reset email.");
    } finally {
      setSubmitting(false);
    }
  };

  if (sent) {
    return (
      <div className={cardClass + " w-full max-w-md p-8"}>
        <div className="mb-6 flex items-center gap-3">
          <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
            <HardHat className="h-5 w-5 text-white" />
          </div>
          <div>
            <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
              SiteBolt
            </p>
            <h1 className="text-xl font-bold text-slate-900">Check your email</h1>
          </div>
        </div>

        <p className="text-sm text-slate-600">
          If an account exists for <strong>{email.trim()}</strong>, we sent a password reset
          link. Check your email and click the link to set a new password.
        </p>

        <button
          type="button"
          onClick={onBackToSignIn}
          className="mt-6 w-full rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          Back to sign in
        </button>
      </div>
    );
  }

  return (
    <div className={cardClass + " w-full max-w-md p-8"}>
      <div className="mb-6 flex items-center gap-3">
        <div className="flex h-10 w-10 items-center justify-center rounded-lg bg-orange-500">
          <HardHat className="h-5 w-5 text-white" />
        </div>
        <div>
          <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
            SiteBolt
          </p>
          <h1 className="text-xl font-bold text-slate-900">Reset your password</h1>
        </div>
      </div>

      <p className="mb-6 text-sm text-slate-600">
        Enter your email and we&apos;ll send a link to reset your password.
      </p>

      <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
        <div className="space-y-1">
          <label htmlFor="forgot-password-email" className={labelClass}>
            Email
          </label>
          <input
            id="forgot-password-email"
            name="email"
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            inputMode="email"
            spellCheck={false}
            required
          />
        </div>

        {typeof error === "string" && error ? (
          <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">{error}</div>
        ) : null}

        <button
          type="submit"
          disabled={submitting}
          className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
        >
          {submitting ? (
            <>
              <Loader2 className="h-4 w-4 animate-spin" />
              Sending reset link…
            </>
          ) : (
            "Send reset link"
          )}
        </button>
      </form>

      <p className="mt-6 text-center text-sm text-slate-500">
        <button
          type="button"
          onClick={onBackToSignIn}
          className="font-medium text-orange-600 hover:text-orange-700"
        >
          Back to sign in
        </button>
        {" · "}
        <Link href="/" className="font-medium text-orange-600 hover:text-orange-700">
          Home
        </Link>
      </p>
    </div>
  );
}
