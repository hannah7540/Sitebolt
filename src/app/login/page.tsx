"use client";

import { Suspense, useCallback, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import SiteFooter from "@/components/layout/SiteFooter";
import Toast from "@/components/ui/Toast";
import TechAmbientBackdrop from "@/components/marketing/TechAmbientBackdrop";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import { useFormToast } from "@/hooks/useFormToast";
import { bindAuthSessionForUser, resolvePostAuthPathForUser } from "@/lib/auth-profile";
import { clearOrganisationWorkspace } from "@/lib/activate-organisation";
import { isSuperAdminAccount } from "@/lib/super-admin";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { isPasswordRecoverySession } from "@/lib/auth-session-utils";
import { resolvePostLoginPath } from "@/lib/native-app";
import { readLoginReturnPath } from "@/lib/console-nav-routes";
import {
  hasAuthHashFragment,
  hasAuthCodeQuery,
  isExemptFromAuthRedirect,
  shouldSkipAuthRedirect,
} from "@/lib/public-auth-paths";
import {
  WORKER_REVOKED_LOGIN_ERROR_PARAM,
  WORKER_REVOKED_LOGIN_MESSAGE,
} from "@/lib/worker-revocation";

const loginFieldClass =
  "w-full rounded-lg border border-white/15 bg-white/[0.06] px-3 py-2.5 text-sm text-white placeholder:text-zinc-500 outline-none transition focus:border-[#FF6B00] focus:ring-2 focus:ring-[#FF6B00]/40";
const loginLabelClass = "text-xs font-semibold uppercase tracking-wider text-zinc-400";

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

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const returnPath = readLoginReturnPath(searchParams);
  const resetSuccess = searchParams.get("reset") === "success";
  const passwordSetMessage = searchParams.get("message");
  const revokedError = searchParams.get("error") === WORKER_REVOKED_LOGIN_ERROR_PARAM;
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const { toast, showError, dismissToast } = useFormToast();

  const navigateAfterLogin = useCallback(
    (path: string) => {
      const target = path.trim();
      if (!target.startsWith("/")) {
        const message = "Sign in succeeded but the destination was invalid.";
        setError(message);
        showError(message);
        return;
      }

      try {
        router.replace(target);
      } catch (cause) {
        const message =
          cause instanceof Error ? cause.message : "Unable to open the app after sign in.";
        console.error("Post-login navigation failed:", cause);
        setError(message);
        showError(message);
      }
    },
    [router, showError]
  );

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

      if (
        isSuperAdminAccount({
          email: data.user.email,
          metadata: (data.user.user_metadata ?? null) as Record<string, unknown> | null,
        })
      ) {
        await clearOrganisationWorkspace();
        navigateAfterLogin("/select-company");
        return;
      }

      const targetPath = resolvePostLoginPath(bound.role, bound.workerId, {
        returnPath,
        defaultPath: await resolvePostAuthPathForUser(data.user),
      });

      navigateAfterLogin(targetPath);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Sign in failed.";
      console.error("Login error:", cause);
      setError(message);
      showError(message);
    } finally {
      setSubmitting(false);
    }
  }, [email, password, navigateAfterLogin, returnPath, showError]);

  useEffect(() => {
    let cancelled = false;

    if (
      typeof window !== "undefined" &&
      (window.location.pathname.includes("/setyourpassword") ||
        window.location.pathname.includes("/reset-password") ||
        window.location.pathname.includes("/onboarding"))
    ) {
      setCheckingSession(false);
      return;
    }

    if (isExemptFromAuthRedirect() || shouldSkipAuthRedirect()) {
      setCheckingSession(false);
      return;
    }

    if (hasAuthCodeQuery()) {
      window.location.replace(
        `/auth/callback${window.location.search}${window.location.hash}`
      );
      return;
    }

    if (hasAuthHashFragment()) {
      window.location.replace(
        `/reset-password${window.location.search}${window.location.hash}`
      );
      return;
    }

    let supabase: ReturnType<typeof createSupabaseBrowserClient>;
    try {
      supabase = createSupabaseBrowserClient();
    } catch (cause) {
      console.error("Login client init failed:", cause);
      setCheckingSession(false);
      return;
    }

    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange((event: string) => {
      try {
        if (isExemptFromAuthRedirect()) return;
        if (event === "PASSWORD_RECOVERY" || event === "SIGNED_IN") {
          const path = window.location.pathname;
          if (
            path.startsWith("/setyourpassword") ||
            path.startsWith("/reset-password") ||
            path.startsWith("/set-password") ||
            path.startsWith("/onboarding")
          ) {
            return;
          }
        }
        if (event === "PASSWORD_RECOVERY") {
          router.replace("/reset-password");
        }
      } catch (cause) {
        console.error("Login auth state handler failed:", cause);
      }
    });

    async function redirectIfSignedIn() {
      const { data } = await supabase.auth.getSession();
      const user = data.session?.user;

      if (!user) {
        if (!cancelled) setCheckingSession(false);
        return;
      }

      if (isPasswordRecoverySession(data.session)) {
        router.replace("/reset-password");
        return;
      }

      const bound = await bindAuthSessionForUser(user);
      if (cancelled) return;

      if (bound.ok) {
        navigateAfterLogin(
          resolvePostLoginPath(bound.role, bound.workerId, {
            returnPath,
            defaultPath: await resolvePostAuthPathForUser(user),
          })
        );
        return;
      }

      if (bound.error === WORKER_REVOKED_LOGIN_MESSAGE) {
        await supabase.auth.signOut();
        navigateAfterLogin(`/login?error=${WORKER_REVOKED_LOGIN_ERROR_PARAM}`);
        return;
      }

      navigateAfterLogin("/setyourpassword");
    }

    void redirectIfSignedIn().catch((cause) => {
      console.error("Login session restore failed:", cause);
      if (!cancelled) setCheckingSession(false);
    });
    return () => {
      cancelled = true;
      subscription.unsubscribe();
    };
  }, [navigateAfterLogin, returnPath, router]);

  const handleSubmit = (event: React.FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    void handleLogin().catch((cause) => {
      const message = cause instanceof Error ? cause.message : "Sign in failed.";
      console.error("Login submission failed:", cause);
      setError(message);
      showError(message);
      setSubmitting(false);
    });
  };

  if (checkingSession) {
    return (
      <TechAmbientBackdrop className="flex min-h-screen items-center justify-center p-6">
        <Loader2 className="h-8 w-8 animate-spin text-[#FF6B00]" />
      </TechAmbientBackdrop>
    );
  }

  if (showForgotPassword) {
    return (
      <TechAmbientBackdrop className="flex min-h-screen flex-col">
        <div className="flex flex-1 items-center justify-center p-6">
          <ForgotPasswordForm
            initialEmail={email}
            onBackToSignIn={() => setShowForgotPassword(false)}
          />
        </div>
        <SiteFooter variant="dark" />
      </TechAmbientBackdrop>
    );
  }

  return (
    <TechAmbientBackdrop className="flex min-h-screen flex-col">
      <div className="flex flex-1 items-center justify-center p-6">
        <div className="relative w-full max-w-md">
          <div
            aria-hidden
            className="pointer-events-none absolute -inset-6 rounded-[2rem] bg-[#FF6B00]/20 blur-3xl"
          />
          <div className="relative rounded-2xl border border-white/10 bg-[#1F2429]/80 p-8 shadow-[0_0_60px_rgba(255,107,0,0.18)] backdrop-blur-md">
            <div className="mb-6 flex items-center gap-3">
              <SiteBoltMark className="h-11 w-11" />
              <div>
                <p className="text-xs font-semibold uppercase tracking-[0.18em] text-[#FF6B00]">
                  SiteBolt
                </p>
                <h1 className="text-xl font-bold text-white">Log In</h1>
              </div>
            </div>

            <p className="mb-6 text-sm text-zinc-400">Sign in to your account.</p>

            {resetSuccess || passwordSetMessage ? (
              <p className="mb-4 rounded-lg border border-emerald-400/30 bg-emerald-500/10 px-4 py-3 text-sm text-emerald-200">
                {passwordSetMessage ||
                  "Password updated successfully! Please sign in with your new password."}
              </p>
            ) : null}

            {revokedError ? (
              <p className="mb-4 rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                {WORKER_REVOKED_LOGIN_MESSAGE}
              </p>
            ) : null}

            <form className="space-y-4" onSubmit={handleSubmit} autoComplete="on">
              <div className="space-y-1">
                <label htmlFor="login-email" className={loginLabelClass}>
                  Email
                </label>
                <input
                  id="login-email"
                  name="email"
                  type="email"
                  className={loginFieldClass}
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
                  <label htmlFor="login-password" className={loginLabelClass}>
                    Password
                  </label>
                  <button
                    type="button"
                    onClick={() => setShowForgotPassword(true)}
                    className="text-xs font-semibold text-[#FF8533] hover:text-[#FF6B00]"
                    disabled={submitting}
                  >
                    Forgot password?
                  </button>
                </div>
                <input
                  id="login-password"
                  name="password"
                  type="password"
                  className={loginFieldClass}
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
                <p className="rounded-lg border border-red-400/30 bg-red-500/10 px-4 py-3 text-sm text-red-200">
                  {error}
                </p>
              ) : null}

              <button
                type="submit"
                disabled={submitting}
                aria-busy={submitting}
                className="flex w-full items-center justify-center gap-2 rounded-xl bg-gradient-to-r from-[#FF6B00] to-[#FF8533] py-3 text-sm font-semibold text-white shadow-[0_0_28px_rgba(255,107,0,0.45)] transition hover:from-[#FF8533] hover:to-[#FF6B00] disabled:cursor-not-allowed disabled:opacity-60"
              >
                {submitting ? (
                  <>
                    <Loader2 className="h-4 w-4 animate-spin" />
                    Signing in…
                  </>
                ) : (
                  "Sign In to SiteBolt"
                )}
              </button>
            </form>

            {toast ? (
              <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
            ) : null}

            <p className="mt-6 text-center text-sm text-zinc-500">
              <Link href="/" className="font-medium text-[#FF8533] hover:text-[#FF6B00]">
                Back to SiteBolt
              </Link>
            </p>
          </div>
        </div>
      </div>
      <SiteFooter variant="dark" />
    </TechAmbientBackdrop>
  );
}

export default function LoginPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-[#13171B] p-6">
          <Loader2 className="h-8 w-8 animate-spin text-[#FF6B00]" />
        </div>
      }
    >
      <LoginPageContent />
    </Suspense>
  );
}
