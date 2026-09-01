"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { EmailOtpType } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const EXPIRED_LINK_MESSAGE =
  "This password setup link has expired. Please request a new one.";

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
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [verifying, setVerifying] = useState(false);
  const [sessionReady, setSessionReady] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const hashError = readHashAuthError();
    if (hashError) {
      setErrorMsg(hashError);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname + window.location.search);
      }
      return;
    }

    const errorParam = searchParams.get("error");
    if (errorParam) {
      setErrorMsg(
        isExpiredAuthError(errorParam) ? EXPIRED_LINK_MESSAGE : errorParam
      );
    }

    const supabase = createSupabaseBrowserClient();

    async function verifyToken() {
      const tokenHash = searchParams.get("token_hash");
      const typeParam = (searchParams.get("type") || "recovery") as EmailOtpType;
      const type = OTP_TYPES.has(typeParam) ? typeParam : "recovery";

      if (!tokenHash) {
        const { data } = await supabase.auth.getSession();
        if (data.session) setSessionReady(true);
        return;
      }

      setVerifying(true);
      const { error } = await supabase.auth.verifyOtp({
        token_hash: tokenHash,
        type,
      });
      setVerifying(false);

      if (error) {
        setErrorMsg(
          isExpiredAuthError(error.message) ? EXPIRED_LINK_MESSAGE : error.message
        );
        return;
      }

      setSessionReady(true);
      setErrorMsg(null);
      if (typeof window !== "undefined") {
        window.history.replaceState(null, "", window.location.pathname);
      }
    }

    void verifyToken();
  }, [searchParams]);

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
      const { data, error } = await supabase.auth.updateUser({
        password: newPassword,
      });
      if (error) {
        setErrorMsg(
          isExpiredAuthError(error.message) ? EXPIRED_LINK_MESSAGE : error.message
        );
        return;
      }

      const { data: worker } = await supabase
        .from("workers")
        .select("onboarding_completed")
        .eq("email", data.user.email)
        .maybeSingle();

      if (worker && worker.onboarding_completed === false) {
        window.location.href = "/onboarding";
      } else {
        window.location.href =
          "/login?message=Password set successfully. Please log in.";
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

          {verifying ? (
            <p className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Verifying your invite link…
            </p>
          ) : null}

          {sessionReady && !errorMsg ? (
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
            disabled={submitting || verifying}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Setting password…
              </>
            ) : (
              "Set Your Password"
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
