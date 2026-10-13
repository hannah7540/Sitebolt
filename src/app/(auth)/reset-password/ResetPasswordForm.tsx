"use client";

import { useState } from "react";
import { useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { consumeAuthTokenAndUpdatePassword } from "@/lib/auth-recovery-consume";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const SUCCESS_MESSAGE = "Password updated successfully. Please log in.";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const emailFromLink = searchParams.get("email")?.trim().toLowerCase() || "";
  const tokenHash = searchParams.get("token_hash")?.trim() || "";
  const authCode = searchParams.get("code")?.trim() || "";
  const otpType = searchParams.get("type")?.trim() || "recovery";
  const hasLinkToken = Boolean(tokenHash || authCode);

  const [email, setEmail] = useState(emailFromLink);
  const [otpToken, setOtpToken] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showSuccess, dismissToast } = useFormToast();

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setError(null);

    const passwordError = validatePassword(password);
    if (passwordError) {
      setError(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setError("Passwords do not match.");
      return;
    }

    if (!hasLinkToken && !otpToken.trim()) {
      setError("Enter the 6-digit code from your email, or use the reset link.");
      return;
    }

    if (!hasLinkToken && !email.trim()) {
      setError("Enter the email address for this reset code.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();

      if (tokenHash) {
        const { error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: "recovery",
        });
        if (verifyError) {
          setError(verifyError.message);
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) {
          setError(updateError.message);
          return;
        }
      } else if (authCode) {
        const { error: exchangeError } = await supabase.auth.exchangeCodeForSession(
          authCode
        );
        if (exchangeError) {
          setError(exchangeError.message);
          return;
        }

        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });
        if (updateError) {
          setError(updateError.message);
          return;
        }
      } else {
        const result = await consumeAuthTokenAndUpdatePassword(supabase, {
          password,
          tokenHash,
          otpToken,
          email,
          otpType,
        });

        if (result.error) {
          setError(result.error);
          return;
        }
      }

      await supabase.auth.signOut();
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

        <p className="mb-6 text-sm text-slate-600">
          Choose a new password, then click Verify Link & Set Password. The reset
          link is not used until you click that button.
        </p>

        <form className="space-y-4" onSubmit={(event) => void handleSubmit(event)} autoComplete="on">
          {!hasLinkToken ? (
            <>
              <div className="space-y-1">
                <label htmlFor="reset-email" className={labelClass}>
                  Email
                </label>
                <input
                  id="reset-email"
                  name="email"
                  type="email"
                  className={inputClass}
                  value={email}
                  onChange={(event) => setEmail(event.target.value)}
                  autoComplete="email"
                  required
                />
              </div>

              <div className="space-y-1">
                <label htmlFor="reset-otp" className={labelClass}>
                  6-digit email code
                </label>
                <input
                  id="reset-otp"
                  name="otp"
                  type="text"
                  inputMode="numeric"
                  autoComplete="one-time-code"
                  className={inputClass}
                  value={otpToken}
                  onChange={(event) => setOtpToken(event.target.value.replace(/\D/g, "").slice(0, 8))}
                  placeholder="Enter the code from your email"
                  required
                />
                <p className="text-xs text-slate-500">
                  If your reset email includes a 6-digit code instead of a working link, enter it here.
                </p>
              </div>
            </>
          ) : null}

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
                Saving password…
              </>
            ) : (
              "Verify Link & Set Password"
            )}
          </button>
        </form>
      </div>
      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
