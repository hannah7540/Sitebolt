"use client";

import { useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import type { User } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

const WORKER_DASHBOARD_PATH = "/worker-dashboard";
const WORKER_ONBOARDING_PATH = "/onboarding";

function parseApiError(payload: unknown): string | null {
  if (!payload || typeof payload !== "object") return null;

  const error = (payload as { error?: unknown }).error;
  if (typeof error === "string" && error.trim()) {
    return error.trim();
  }

  return null;
}

async function fetchOnboardingCompletedForUser(user: User): Promise<boolean> {
  const supabase = createSupabaseBrowserClient();

  const byAuth = await supabase
    .from("workers")
    .select("onboarding_completed")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (
    !byAuth.error &&
    typeof byAuth.data?.onboarding_completed === "boolean"
  ) {
    return byAuth.data.onboarding_completed;
  }

  const email = user.email?.trim();
  if (email) {
    const byEmail = await supabase
      .from("workers")
      .select("onboarding_completed")
      .ilike("email", email)
      .maybeSingle();

    if (
      !byEmail.error &&
      typeof byEmail.data?.onboarding_completed === "boolean"
    ) {
      return byEmail.data.onboarding_completed;
    }
  }

  return false;
}

function redirectAfterPasswordUpdate(onboardingCompleted: boolean): void {
  window.location.href = onboardingCompleted
    ? WORKER_DASHBOARD_PATH
    : WORKER_ONBOARDING_PATH;
}

export default function ResetPasswordForm() {
  const searchParams = useSearchParams();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [hasSession, setHasSession] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const emailParam = searchParams.get("email");
    const errorParam = searchParams.get("error");
    if (emailParam) setEmail(emailParam);
    if (errorParam) setError(errorParam);

    let cancelled = false;

    async function loadSession() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      if (cancelled) return;

      if (data.user) {
        setHasSession(true);
        if (!emailParam && data.user.email) {
          setEmail(data.user.email);
        }
      }
      setCheckingSession(false);
    }

    void loadSession();
    return () => {
      cancelled = true;
    };
  }, [searchParams]);

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
      const { data: sessionData } = await supabase.auth.getUser();

      if (sessionData.user) {
        const { error: updateError } = await supabase.auth.updateUser({
          password,
        });

        if (updateError) {
          setError(updateError.message);
          return;
        }

        await fetch("/api/workers/ensure-profile", {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({ passwordAccepted: true }),
        }).catch(() => null);

        const onboardingCompleted = await fetchOnboardingCompletedForUser(
          sessionData.user
        );
        redirectAfterPasswordUpdate(onboardingCompleted);
        return;
      }

      const trimmedEmail = email.trim();
      if (!trimmedEmail) {
        setError("Enter your email address.");
        return;
      }

      const response = await fetch("/api/auth/update-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          email: trimmedEmail,
          newPassword: password,
        }),
      });

      const payload: unknown = await response.json().catch(() => null);

      if (!response.ok) {
        setError(parseApiError(payload) ?? "Failed to set password.");
        return;
      }

      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: trimmedEmail,
        password,
      });

      if (signInError || !data.user) {
        setError(
          "Your password was saved, but automatic sign-in failed. Please sign in manually."
        );
        return;
      }

      const onboardingCompleted = await fetchOnboardingCompletedForUser(data.user);
      redirectAfterPasswordUpdate(onboardingCompleted);
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
            <h1 className="text-xl font-bold text-slate-900">Set New Password</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          Create a password for your Site-Bolt account. You&apos;ll be signed in
          automatically once your password is saved.
        </p>

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
          {!hasSession ? (
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
                Setting password…
              </>
            ) : (
              "Set New Password"
            )}
          </button>
        </form>

        {!hasSession ? (
          <p className="mt-6 text-center text-sm text-slate-500">
            <Link href="/login" className="font-medium text-orange-600 hover:text-orange-700">
              Back to sign in
            </Link>
          </p>
        ) : null}
      </div>
    </div>
  );
}
