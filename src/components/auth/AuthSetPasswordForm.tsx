"use client";

import { useEffect, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import type { AuthChangeEvent, EmailOtpType, Session } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolvePostAuthPathForUser } from "@/lib/auth-profile";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

interface AuthSetPasswordFormProps {
  title: string;
  description: string;
  submitLabel: string;
  successMessage: string;
  initialHasSession?: boolean;
}

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

async function wait(ms: number): Promise<void> {
  await new Promise((resolve) => window.setTimeout(resolve, ms));
}

async function resolveClientSession(
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  for (let attempt = 0; attempt < 4; attempt += 1) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) return true;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return true;

    if (attempt < 3) {
      await wait(200);
    }
  }

  return false;
}

export default function AuthSetPasswordForm({
  title,
  description,
  submitLabel,
  successMessage,
  initialHasSession = false,
}: AuthSetPasswordFormProps) {
  const router = useRouter();
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");
  const authCode = searchParams.get("code");
  const tokenHash = searchParams.get("token_hash");
  const otpType = searchParams.get("type");

  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(!initialHasSession);
  const [hasSession, setHasSession] = useState(initialHasSession);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [success, setSuccess] = useState(false);

  useEffect(() => {
    if (initialHasSession) {
      setHasSession(true);
      setCheckingSession(false);
      return;
    }

    let cancelled = false;
    const supabase = createSupabaseBrowserClient();

    async function establishSession() {
      if (
        tokenHash &&
        otpType &&
        VALID_OTP_TYPES.has(otpType as EmailOtpType)
      ) {
        const { data, error: verifyError } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type: otpType as EmailOtpType,
        });

        if (!cancelled) {
          if (verifyError) {
            setError(verifyError.message);
            setHasSession(false);
            setCheckingSession(false);
            return;
          }

          if (data.session) {
            setHasSession(true);
            setCheckingSession(false);
            router.replace(window.location.pathname);
            return;
          }
        }
      }

      if (authCode) {
        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(authCode);

        if (!cancelled) {
          if (exchangeError) {
            setError(exchangeError.message);
            setHasSession(false);
            setCheckingSession(false);
            return;
          }

          if (data.session) {
            setHasSession(true);
            setCheckingSession(false);
            router.replace(window.location.pathname);
            return;
          }
        }
      }

      const sessionReady = await resolveClientSession(supabase);
      if (!cancelled) {
        setHasSession(sessionReady);
        setCheckingSession(false);
      }
    }

    void establishSession();

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: AuthChangeEvent, session: Session | null) => {
      if (cancelled) return;

      if (
        event === "PASSWORD_RECOVERY" ||
        event === "SIGNED_IN" ||
        event === "INITIAL_SESSION" ||
        event === "TOKEN_REFRESHED" ||
        event === "USER_UPDATED"
      ) {
        setHasSession(Boolean(session));
        setCheckingSession(false);
      }
    });

    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [authCode, initialHasSession, otpType, router, tokenHash]);

  const handleSubmit = async (event: React.FormEvent) => {
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
      const { data: sessionData } = await supabase.auth.getSession();

      if (!sessionData.session) {
        setError("Your invitation session expired. Please open the link from your email again.");
        return;
      }

      const { data: sessionUserData, error: updateError } = await supabase.auth.updateUser({
        password,
      });

      if (updateError) {
        setError(updateError.message);
        return;
      }

      const user =
        sessionUserData.user ?? (await supabase.auth.getSession()).data.session?.user;
      const nextPath = user ? await resolvePostAuthPathForUser(user) : "/worker-dashboard";

      setSuccess(true);
      window.setTimeout(() => router.replace(nextPath), 2000);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to set password.");
    } finally {
      setSubmitting(false);
    }
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (success) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className={cardClass + " max-w-md p-8 text-center"}>
          <p className="text-lg font-semibold text-emerald-700">{successMessage}</p>
          <p className="mt-2 text-sm text-slate-600">Redirecting you to SiteBolt…</p>
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
            <h1 className="text-xl font-bold text-slate-900">{title}</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          {description}{" "}
          <span className="block mt-2 text-xs text-slate-500">
            {passwordRequirementsLabel()}
          </span>
        </p>

        {callbackError ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {callbackError}
          </p>
        ) : !hasSession ? (
          <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Open the link from your invitation or password reset email to continue. If
            your link expired, ask your administrator to send a new invite.
          </p>
        ) : (
          <form className="space-y-4" onSubmit={handleSubmit}>
            <label className="block space-y-1">
              <span className={labelClass}>New password</span>
              <input
                type="password"
                className={inputClass}
                value={password}
                onChange={(event) => setPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
                required
              />
            </label>

            <label className="block space-y-1">
              <span className={labelClass}>Confirm password</span>
              <input
                type="password"
                className={inputClass}
                value={confirmPassword}
                onChange={(event) => setConfirmPassword(event.target.value)}
                autoComplete="new-password"
                minLength={8}
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
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm disabled:opacity-60"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                submitLabel
              )}
            </button>
          </form>
        )}
      </div>
    </div>
  );
}
