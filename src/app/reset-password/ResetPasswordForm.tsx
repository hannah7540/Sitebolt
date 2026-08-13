"use client";

import { useEffect, useRef, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import type { AuthChangeEvent, EmailOtpType, Session } from "@supabase/supabase-js";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

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

function parseHashSessionParams(): { accessToken: string; refreshToken: string } | null {
  if (typeof window === "undefined") return null;

  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;

  const params = new URLSearchParams(hash);
  const accessToken = params.get("access_token");
  const refreshToken = params.get("refresh_token");

  if (!accessToken || !refreshToken) return null;

  return { accessToken, refreshToken };
}

async function resolveClientSession(
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  for (let attempt = 0; attempt < 6; attempt += 1) {
    const { data: userData } = await supabase.auth.getUser();
    if (userData.user) return true;

    const { data: sessionData } = await supabase.auth.getSession();
    if (sessionData.session) return true;

    if (attempt < 5) {
      await wait(250);
    }
  }

  return false;
}

export default function ResetPasswordForm() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const supabaseRef = useRef(createSupabaseBrowserClient());
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;
    const supabase = supabaseRef.current;
    const authCode = searchParams.get("code");
    const tokenHash = searchParams.get("token_hash");
    const otpType = searchParams.get("type");

    async function establishSession() {
      const hashSession = parseHashSessionParams();
      if (hashSession) {
        const { error: setSessionError } = await supabase.auth.setSession({
          access_token: hashSession.accessToken,
          refresh_token: hashSession.refreshToken,
        });

        if (!cancelled && setSessionError) {
          setError(setSessionError.message);
        } else if (!cancelled) {
          window.history.replaceState(null, "", window.location.pathname);
        }
      }

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
          } else if (data.session) {
            router.replace(window.location.pathname);
          }
        }
      }

      if (authCode) {
        const { data, error: exchangeError } =
          await supabase.auth.exchangeCodeForSession(authCode);

        if (!cancelled) {
          if (exchangeError) {
            setError(exchangeError.message);
          } else if (data.session) {
            router.replace(window.location.pathname);
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
  }, [router, searchParams]);

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
      const supabase = supabaseRef.current;

      if (!hasSession) {
        const sessionReady = await resolveClientSession(supabase);
        setHasSession(sessionReady);
      }

      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ password }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (response.ok) {
        await supabase.auth.signOut();
        router.replace("/login?reset=success");
        return;
      }

      const apiError =
        payload &&
        typeof payload === "object" &&
        "error" in payload &&
        typeof payload.error === "string"
          ? payload.error
          : null;

      if (response.status === 401) {
        const { data: sessionData } = await supabase.auth.getSession();
        if (sessionData.session) {
          const { error: updateError } = await supabase.auth.updateUser({ password });
          if (!updateError) {
            await supabase.auth.signOut();
            router.replace("/login?reset=success");
            return;
          }
          setError(updateError.message);
          return;
        }

        setError(
          apiError ??
            "Your reset link expired or the session was lost. Request a new password reset link."
        );
        return;
      }

      setError(apiError ?? "Failed to reset password.");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to reset password.");
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
