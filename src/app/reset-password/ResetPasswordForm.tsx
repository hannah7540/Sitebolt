"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [code, setCode] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    if (emailParam) {
      setEmail(emailParam);
    }
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const trimmedEmail = email.trim();
    const trimmedCode = code.trim();

    if (!trimmedEmail) {
      setError("Enter your email address.");
      return;
    }

    if (!/^\d{6}$/.test(trimmedCode)) {
      setError("Enter the 6-digit code from your email.");
      return;
    }

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: verifyError } = await supabase.auth.verifyOtp({
        email: trimmedEmail,
        token: trimmedCode,
        type: "recovery",
      });

      if (verifyError) {
        setError(verifyError.message);
        return;
      }

      if (!data.session) {
        setError("Invalid or expired reset code. Request a new code from the login page.");
        return;
      }

      const { error: updateError } = await supabase.auth.updateUser({ password });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      await supabase.auth.signOut();
      setSuccess(true);

      window.setTimeout(() => {
        router.replace("/login?reset=success");
      }, 1500);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to reset password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className={cardClass + " w-full max-w-md p-8 text-center"}>
          <p className="text-lg font-semibold text-emerald-700">Password updated successfully!</p>
          <p className="mt-2 text-sm text-slate-600">Redirecting you to sign in…</p>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
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
          Enter the 6-digit code from your email, then set a new password.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
          <div className="space-y-1">
            <label htmlFor="reset-email" className={labelClass}>
              Email Address
            </label>
            <input
              id="reset-email"
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

          <div className="space-y-1">
            <label htmlFor="reset-code" className={labelClass}>
              6-Digit Reset Code
            </label>
            <input
              id="reset-code"
              name="code"
              type="text"
              inputMode="numeric"
              pattern="\d{6}"
              maxLength={6}
              className={inputClass}
              value={code}
              onChange={(event) => setCode(event.target.value.replace(/\D/g, "").slice(0, 6))}
              autoComplete="one-time-code"
              placeholder="123456"
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reset-password" className={labelClass}>
              New Password
            </label>
            <input
              id="reset-password"
              name="password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="reset-confirm-password" className={labelClass}>
              Confirm New Password
            </label>
            <input
              id="reset-confirm-password"
              name="confirmPassword"
              type="password"
              className={inputClass}
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <p className="text-xs text-slate-500">{passwordRequirementsLabel()}</p>

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
                Updating password…
              </>
            ) : (
              "Reset password"
            )}
          </button>
        </form>

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
            Back to sign in
          </Link>
        </p>
      </div>
    </div>
  );
}
