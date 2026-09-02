"use client";

import { Suspense, useEffect, useRef, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import {
  resolvePostPasswordSetupHref,
  type WorkerPostPasswordStatus,
} from "@/lib/post-password-redirect";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const EXPIRED_LINK_MESSAGE =
  "This password setup link has expired or has already been used.";

function SetYourPasswordForm() {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [loading, setLoading] = useState(true);
  const [isReady, setIsReady] = useState(false);
  const [isExpired, setIsExpired] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);
  const [resendEmail, setResendEmail] = useState("");
  const [resending, setResending] = useState(false);
  const [resendSuccess, setResendSuccess] = useState<string | null>(null);
  const isReadyRef = useRef(false);

  useEffect(() => {
    const emailFromQuery = searchParams.get("email")?.trim() ?? "";
    if (emailFromQuery) {
      setResendEmail(emailFromQuery);
    }
  }, [searchParams]);

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let cancelled = false;
    let subscription: { unsubscribe: () => void } | null = null;
    let timeoutId: number | undefined;

    function markReady(session?: Session | null) {
      isReadyRef.current = true;
      setIsReady(true);
      setIsExpired(false);
      setErrorMsg(null);
      setLoading(false);
      const sessionEmail = session?.user?.email?.trim();
      if (sessionEmail) {
        setResendEmail((current) => current || sessionEmail);
      }
    }

    async function checkSession() {
      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (cancelled) return;
      if (session) {
        markReady(session);
        return;
      }

      const {
        data: { subscription: authSub },
      } = supabase.auth.onAuthStateChange(
        (_event: string, nextSession: Session | null) => {
          if (nextSession) {
            markReady(nextSession);
          }
        }
      );
      subscription = authSub;

      const params = new URLSearchParams(window.location.search);
      const hash = window.location.hash;
      if (
        params.get("error") === "expired" ||
        hash.includes("error=") ||
        hash.includes("otp_expired")
      ) {
        setErrorMsg(EXPIRED_LINK_MESSAGE);
        setIsExpired(true);
        setLoading(false);
        return;
      }

      timeoutId = window.setTimeout(async () => {
        const {
          data: { session: delayedSession },
        } = await supabase.auth.getSession();
        if (cancelled) return;
        if (delayedSession) {
          markReady(delayedSession);
          return;
        }
        if (!isReadyRef.current) {
          setErrorMsg("No active password reset session found.");
          setIsExpired(true);
          setLoading(false);
        }
      }, 1500);
    }

    void checkSession();

    return () => {
      cancelled = true;
      subscription?.unsubscribe();
      if (timeoutId !== undefined) {
        window.clearTimeout(timeoutId);
      }
    };
  }, []);

  const requestNewLink = async () => {
    const email = resendEmail.trim();
    if (!email || !email.includes("@")) {
      setErrorMsg("Enter your email to request a new password link.");
      return;
    }

    setResending(true);
    setResendSuccess(null);
    setErrorMsg(null);

    try {
      const response = await fetch("/api/auth/reset-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ email }),
      });
      const data = (await response.json()) as { error?: string };
      if (!response.ok) {
        setErrorMsg(data.error || "Unable to send a new password link.");
        return;
      }
      setResendSuccess(
        "If an account exists, a new password link has been sent."
      );
    } catch {
      setErrorMsg("Unable to send a new password link. Please try again.");
    } finally {
      setResending(false);
    }
  };

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
          "Auth session not found. Please request a new password link."
        );
        setIsExpired(true);
        return;
      }

      const { error } = await supabase.auth.updateUser({
        password: newPassword,
      });

      if (error) {
        setErrorMsg(error.message);
        return;
      }

      const {
        data: { user },
      } = await supabase.auth.getUser();

      let worker: WorkerPostPasswordStatus | null = null;
      if (user?.email) {
        const { data: clientWorker, error: workerErr } = await supabase
          .from("workers")
          .select("id, onboarding_completed, status, invite_status")
          .eq("email", user.email)
          .maybeSingle();

        if (!workerErr && clientWorker?.id) {
          worker = {
            id: clientWorker.id,
            onboarding_completed:
              typeof clientWorker.onboarding_completed === "boolean"
                ? clientWorker.onboarding_completed
                : null,
            status:
              typeof clientWorker.status === "string"
                ? clientWorker.status
                : null,
            invite_status:
              typeof clientWorker.invite_status === "string"
                ? clientWorker.invite_status
                : null,
          };
        }
      }

      if (!worker) {
        const accessToken =
          (await supabase.auth.getSession()).data.session?.access_token ??
          session.access_token;
        const statusRes = await fetch("/api/workers/check-status", {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            Authorization: `Bearer ${accessToken}`,
          },
        });
        if (statusRes.ok) {
          const payload = (await statusRes.json()) as {
            worker?: WorkerPostPasswordStatus | null;
            redirectTo?: string;
          };
          if (payload.redirectTo) {
            window.location.href = payload.redirectTo;
            return;
          }
          worker = payload.worker ?? null;
        }
      }

      window.location.href = resolvePostPasswordSetupHref(worker);
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

        {loading ? (
          <p className="mb-4 flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Verifying your invite link…
          </p>
        ) : null}

        {isReady && !errorMsg && !isExpired ? (
          <p className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            Link verified. Set your password below.
          </p>
        ) : null}

        {errorMsg ? (
          <div className="mb-4 rounded-md bg-red-50 p-3 text-sm text-red-600">
            {errorMsg}
          </div>
        ) : null}

        {resendSuccess ? (
          <div className="mb-4 rounded-md bg-emerald-50 p-3 text-sm text-emerald-700">
            {resendSuccess}
          </div>
        ) : null}

        {isExpired ? (
          <div className="space-y-4">
            <div className="space-y-1">
              <label htmlFor="setyourpassword-resend-email" className={labelClass}>
                Email
              </label>
              <input
                id="setyourpassword-resend-email"
                name="email"
                type="email"
                className={inputClass}
                value={resendEmail}
                onChange={(event) => setResendEmail(event.target.value)}
                autoComplete="email"
                required
              />
            </div>
            <button
              type="button"
              onClick={() => void requestNewLink()}
              disabled={resending}
              className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
            >
              {resending ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Sending new link…
                </>
              ) : (
                "Request New Password Link"
              )}
            </button>
          </div>
        ) : (
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
        )}
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
