"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { bindAuthSessionForUser } from "@/lib/auth-profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { resolveDefaultLandingPathForRole } from "@/lib/user-session";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { readLoginReturnPath } from "@/lib/console-nav-routes";
import {
  WORKER_REVOKED_LOGIN_ERROR_PARAM,
  WORKER_REVOKED_LOGIN_MESSAGE,
} from "@/lib/worker-revocation";

async function waitForAuthSession(
  supabase: ReturnType<typeof createSupabaseBrowserClient>
): Promise<boolean> {
  for (let attempt = 0; attempt < 5; attempt += 1) {
    const { data } = await supabase.auth.getSession();
    if (data.session) return true;
    await new Promise((resolve) => window.setTimeout(resolve, 120));
  }

  const { data: refreshed } = await supabase.auth.refreshSession();
  return Boolean(refreshed.session);
}

function redirectAfterLogin(path: string): void {
  window.location.assign(path);
}

function LoginPageContent() {
  const searchParams = useSearchParams();
  const returnPath = readLoginReturnPath(searchParams);
  const resetSuccess = searchParams.get("reset") === "success";
  const revokedError = searchParams.get("error") === WORKER_REVOKED_LOGIN_ERROR_PARAM;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, dismissToast } = useFormToast();

  const handleLogin = useCallback(async () => {
    const cleanEmail = email.trim().toLowerCase();
    const cleanPassword = password.trim();

    if (!cleanEmail || !cleanPassword) {
      const message = "Please enter your email and password.";
      setError(message);
      showError(message);
      return;
    }

    setError(null);
    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: cleanEmail,
        password: cleanPassword,
      });

      if (signInError || !data.user) {
        const message = signInError?.message ?? "Invalid email or password";
        setError(message);
        showError(message);
        return;
      }

      const sessionReady = await waitForAuthSession(supabase);
      if (!sessionReady) {
        const message = "Sign in succeeded but the session could not be established. Please try again.";
        setError(message);
        showError(message);
        return;
      }

      const bound = await bindAuthSessionForUser(data.user);
      if (!bound.ok) {
        await supabase.auth.signOut();
        const message = bound.error ?? "Unable to sign in. Contact your administrator.";
        setError(message);
        showError(message);
        return;
      }

      const targetPath =
        returnPath ?? resolveDefaultLandingPathForRole(bound.role, bound.workerId);

      redirectAfterLogin(targetPath);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sign in failed.";
      console.error("Login error:", cause);
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, returnPath, showError]);

  useEffect(() => {
    let cancelled = false;

    async function redirectIfSignedIn() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!user) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      const bound = await bindAuthSessionForUser(user);
      if (!cancelled) {
        if (bound.ok) {
          redirectAfterLogin(
            returnPath ??
              resolveDefaultLandingPathForRole(bound.role, bound.workerId)
          );
        } else {
          await supabase.auth.signOut();
          if (bound.error === WORKER_REVOKED_LOGIN_MESSAGE) {
            redirectAfterLogin(`/login?error=${WORKER_REVOKED_LOGIN_ERROR_PARAM}`);
            return;
          }
          setCheckingSession(false);
        }
      }
    }

    void redirectIfSignedIn();
    return () => {
      cancelled = true;
    };
  }, [returnPath]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleLogin();
  };

  if (checkingSession) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (showForgotPassword) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <ForgotPasswordForm
          initialEmail={email}
          onBackToSignIn={() => setShowForgotPassword(false)}
        />
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
            <h1 className="text-xl font-bold text-slate-900">Admin Login</h1>
          </div>
        </div>

        <p className="mb-6 text-sm text-slate-600">
          Sign in with your administrator account to open the project dashboard.
        </p>

        {resetSuccess ? (
          <p className="mb-4 rounded-lg border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
            Password updated successfully! Please sign in with your new password.
          </p>
        ) : null}

        {revokedError ? (
          <p className="mb-4 rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
            {WORKER_REVOKED_LOGIN_MESSAGE}
          </p>
        ) : null}

        <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
          <div className="space-y-1">
            <label htmlFor="login-email" className={labelClass}>
              Email
            </label>
            <input
              id="login-email"
              name="email"
              type="email"
              className={inputClass}
              value={email}
              onChange={(event) => setEmail(event.target.value)}
              autoComplete="email"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              inputMode="email"
              enterKeyHint="next"
              disabled={submitting}
              required
            />
          </div>

          <div className="space-y-1">
            <div className="flex items-center justify-between gap-2">
              <label htmlFor="login-password" className={labelClass}>
                Password
              </label>
              <button
                type="button"
                onClick={() => setShowForgotPassword(true)}
                className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                disabled={submitting}
              >
                Forgot password?
              </button>
            </div>
            <input
              id="login-password"
              name="password"
              type="password"
              className={inputClass}
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              autoComplete="current-password"
              autoCapitalize="none"
              autoCorrect="off"
              spellCheck={false}
              enterKeyHint="go"
              disabled={submitting}
              required
            />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <button
            type="submit"
            disabled={submitting}
            aria-busy={submitting}
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:cursor-not-allowed disabled:opacity-60"
          >
            {submitting ? (
              <>
                <Loader2 className="h-4 w-4 animate-spin" />
                Signing in…
              </>
            ) : (
              "Sign in"
            )}
          </button>
        </form>

        {toast ? (
          <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
        ) : null}

        <p className="mt-6 text-center text-sm text-slate-500">
          <Link href="/" className="font-medium text-orange-600 hover:text-orange-700">
            Back to SiteBolt
          </Link>
        </p>
      </div>
    </div>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
