"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import type { EmailOtpType, Session } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const EXPIRED_LINK_MESSAGE =
  "This password setup link is invalid or has expired. Please request a new one.";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

function isExpiredAuthError(message: string | null | undefined): boolean {
  const value = (message ?? "").toLowerCase();
  return (
    value.includes("otp_expired") ||
    value.includes("expired") ||
    value.includes("access_denied") ||
    value.includes("already been used")
  );
}

function readHashAuthError(): string | null {
  if (typeof window === "undefined") return null;
  const hash = window.location.hash.replace(/^#/, "");
  if (!hash) return null;
  const params = new URLSearchParams(hash);
  const error = params.get("error");
  const code = params.get("error_code");
  const description = params.get("error_description")?.replace(/\+/g, " ");
  if (!error && !code && !description) return null;
  if (isExpiredAuthError(`${error} ${code} ${description}`)) {
    return EXPIRED_LINK_MESSAGE;
  }
  return description?.trim() || EXPIRED_LINK_MESSAGE;
}

function SetYourPasswordForm() {
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const startedRef = useRef(false);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;

    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;

    async function establishSession() {
      const hashError = readHashAuthError();
      if (hashError) {
        if (!cancelled) {
          setErrorMsg(hashError);
          setLoading(false);
        }
        return;
      }

      const params = new URLSearchParams(window.location.search);
      const tokenHash = params.get("token_hash");
      const typeParam = (params.get("type") || "recovery") as EmailOtpType;
      const type = OTP_TYPES.has(typeParam) ? typeParam : "recovery";

      if (tokenHash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash: tokenHash,
          type,
        });
        if (cancelled) return;
        if (error) {
          console.error("verifyOtp error:", error.message);
          setErrorMsg(EXPIRED_LINK_MESSAGE);
          setLoading(false);
          return;
        }
        if (data.session) {
          setIsReady(true);
          setErrorMsg(null);
          setLoading(false);
          window.history.replaceState(null, "", window.location.pathname);
          return;
        }
      }

      const hash = window.location.hash.replace(/^#/, "");
      if (hash.includes("access_token") && hash.includes("refresh_token")) {
        const hashParams = new URLSearchParams(hash);
        const accessToken = hashParams.get("access_token");
        const refreshToken = hashParams.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (cancelled) return;
          if (data.session) {
            setIsReady(true);
            setErrorMsg(null);
            setLoading(false);
            window.history.replaceState(null, "", window.location.pathname);
            return;
          }
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        setIsReady(true);
        setErrorMsg(null);
        setLoading(false);
        return;
      }

      const {
        data: { subscription: authSub },
      } = supabase.auth.onAuthStateChange(
        (event: string, nextSession: Session | null) => {
          if (
            event === "PASSWORD_RECOVERY" ||
            (event === "SIGNED_IN" && nextSession)
          ) {
            setIsReady(true);
            setErrorMsg(null);
            setLoading(false);
          }
        }
      );
      subscription = authSub;

      if (!tokenHash && !window.location.hash.includes("access_token")) {
        setErrorMsg(
          "No active password reset session found. Please request a new link."
        );
        setLoading(false);
      } else {
        setLoading(false);
      }
    }

    void establishSession();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    setErrorMsg(null);

    const passwordError = validatePassword(newPassword);
    if (passwordError) {
      setErrorMsg(passwordError);
      return;
    }

    if (newPassword !== confirmPassword) {
      setErrorMsg("Passwords do not match.");
      return;
    }

    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (!session) {
        setErrorMsg(
          "Auth session not found. Please reload the link or request a new one."
        );
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const { data: worker } = await supabase
        .from("workers")
        .select("onboarding_completed")
        .eq("email", session.user.email)
        .maybeSingle();

      if (worker && worker.onboarding_completed === false) {
        window.location.href = "/onboarding";
      } else {
        window.location.href =
          "/login?message=Password updated successfully. Please log in.";
      }
    } catch (cause) {
      setErrorMsg(
        cause instanceof Error ? cause.message : "Failed to set password."
      );
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
            <h1 className="text-xl font-bold text-slate-900">Set Your Password</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          Create a password for your Site-Bolt account.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
          <div className="space-y-1">
            <label htmlFor="setyourpassword-new" className={labelClass}>
              New Password
            </label>
            <input
              id="setyourpassword-new"
              name="password"
              type="password"
              className={inputClass}
              value={newPassword}
              onChange={(event) => setNewPassword(event.target.value)}
              autoComplete="new-password"
              minLength={8}
              required
            />
          </div>

          <div className="space-y-1">
            <label htmlFor="setyourpassword-confirm" className={labelClass}>
              Confirm Password
            </label>
            <input
              id="setyourpassword-confirm"
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

          {loading ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Verifying your invite link…
            </p>
          ) : null}

          {isReady && !errorMsg ? (
            <p className="rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
              Link verified. Set your password below.
            </p>
          ) : null}

          {errorMsg ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {errorMsg}
            </div>
          ) : null}

          <button
            type="submit"
            disabled={!isReady || submitting || loading}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting password…
              </>
            ) : (
              "Set Password"
            )}
          </button>
        </form>
      </div>
    </div>
  );
}

export default function SetYourPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <div className="w-full max-w-md rounded-2xl border border-slate-200 bg-white p-8 shadow-sm">
            <h1 className="text-xl font-bold text-slate-900">Set Your Password</h1>
          </div>
        </div>
      }
    >
      <SetYourPasswordForm />
    </Suspense>
  );
}
