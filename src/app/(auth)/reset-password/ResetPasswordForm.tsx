"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { hasAuthHashFragment } from "@/lib/public-auth-paths";

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checking, setChecking] = useState(true);
  const [isRecoveryMode, setIsRecoveryMode] = useState(false);
  const [hasRecoverySession, setHasRecoverySession] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && !hasAuthHashFragment()) setError(errorParam);

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (event: string, session: Session | null) => {
        if (cancelled) return;
        if (event === "PASSWORD_RECOVERY") {
          setIsRecoveryMode(true);
          setHasRecoverySession(true);
          setChecking(false);
          return;
        }
        if (session) {
          setHasRecoverySession(true);
          setChecking(false);
        }
      }
    );

    async function captureSessionFromUrl() {
      const code = searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash.includes("access_token") && hash.includes("refresh_token")) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (!cancelled && data.session?.user) {
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}`
            );
          }
        }
      }

      const { data } = await supabase.auth.getSession();
      if (cancelled) return;
      if (data.session) {
        setHasRecoverySession(true);
      }
      setChecking(false);
    }

    void captureSessionFromUrl();

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [searchParams]);

  const showPasswordForm = isRecoveryMode || hasRecoverySession;

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

    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      showSuccess("Password updated successfully. Please log in.");
      await supabase.auth.signOut();
      window.location.assign("/login?reset=success");
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

        {checking ? (
          <div className="flex justify-center py-8">
            <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
          </div>
        ) : !showPasswordForm ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Open the password reset link from your email to continue. Invitation
            setup tokens are not used on this page.
          </p>
        ) : (
          <>
            <p className="mb-6 text-sm text-slate-600">
              Enter a new password for your SiteBolt account. You will be asked to
              log in after it is saved.
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
                  Confirm Password
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
