"use client";

import { Suspense, useEffect, useState } from "react";
import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { HardHat, Loader2 } from "lucide-react";
import ForgotPasswordForm from "@/components/auth/ForgotPasswordForm";
import { bindAdminSessionForUser } from "@/lib/auth-profile";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";

function LoginPageContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const nextPath = searchParams.get("next");
  const resetSuccess = searchParams.get("reset") === "success";
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [showForgotPassword, setShowForgotPassword] = useState(false);
  const [checkingSession, setCheckingSession] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

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

      const bound = await bindAdminSessionForUser(user);
      if (!cancelled) {
        if (bound.ok) {
          router.replace(nextPath?.startsWith("/") ? nextPath : "/admin");
        } else {
          setCheckingSession(false);
        }
      }
    }

    void redirectIfSignedIn();
    return () => {
      cancelled = true;
    };
  }, [router]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    setSubmitting(true);

    try {
      const supabase = createSupabaseBrowserClient();
      const { data, error: signInError } = await supabase.auth.signInWithPassword({
        email: email.trim(),
        password,
      });

      if (signInError || !data.user) {
        setError("Invalid email or password");
        return;
      }

      const bound = await bindAdminSessionForUser(data.user);
      if (!bound.ok) {
        await supabase.auth.signOut();
        setError(bound.error ?? "You do not have permission to access the admin console.");
        return;
      }

      router.replace(nextPath?.startsWith("/") ? nextPath : "/admin");
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Sign in failed.");
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
            Password successfully updated! Please log in.
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
              inputMode="email"
              spellCheck={false}
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
            className="flex w-full items-center justify-center gap-2 rounded-xl bg-orange-500 py-3 text-sm font-semibold text-white shadow-sm hover:bg-orange-600 disabled:opacity-60"
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
