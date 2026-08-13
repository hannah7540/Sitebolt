"use client";

import { useState } from "react";
import Link from "next/link";
import { HardHat, Loader2 } from "lucide-react";
import { requestPasswordResetEmail } from "@/lib/auth-password-reset";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

interface ForgotPasswordFormProps {
  initialEmail?: string;
  onBackToSignIn: () => void;
}

export default function ForgotPasswordForm({
  initialEmail = "",
  onBackToSignIn,
}: ForgotPasswordFormProps) {
  const [email, setEmail] = useState(initialEmail);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [sent, setSent] = useState(false);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    const result = await requestPasswordResetEmail(email);
    setSubmitting(false);

    if (result.error) {
      setError(result.error);
      return;
    }

    setSent(true);
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
          link. Open the link to set a new password on{" "}
          <span className="font-medium text-slate-800">/auth/reset-password</span>.
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

      <form className="space-y-4" onSubmit={handleSubmit}>
        <label className="block space-y-1">
          <span className={labelClass}>Email</span>
          <input
            type="email"
            className={inputClass}
            value={email}
            onChange={(event) => setEmail(event.target.value)}
            autoComplete="email"
            required
          />
        </label>

        {error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {error}
          </p>
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
