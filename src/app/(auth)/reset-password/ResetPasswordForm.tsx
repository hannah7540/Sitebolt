"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const SUCCESS_MESSAGE = "Password updated successfully. Please log in.";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim().toLowerCase() || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showSuccess, dismissToast } = useFormToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    if (!email) {
      setError("This reset link is missing an email address. Request a new one from the login page.");
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
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email, newPassword: password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !payload.success) {
        setError(payload.error || "Failed to update password.");
        return;
      }

      showSuccess(SUCCESS_MESSAGE);
      window.location.assign(
        `/login?reset=success&message=${encodeURIComponent(SUCCESS_MESSAGE)}`
      );
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update password.");
    } finally {
      setSubmitting(false);
    }
  };

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

        {!email ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            This reset link is missing an email address. Request a new one from the login page.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-600">
              Resetting password for: {email}
            </p>

            <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
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
                  "Update password"
                )}
              </button>
            </form>
          </>
        )}
      </div>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
