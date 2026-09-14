"use client";

import { Suspense, useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { AuthChangeEvent, EmailOtpType, Session } from "@supabase/supabase-js";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import {
  resolvePostPasswordSetupHref,
  type WorkerPostPasswordStatus,
} from "@/lib/post-password-redirect";
import { isNativeMobileApp } from "@/lib/native-app";
import { resolveNativeWorkerDashboardPath } from "@/lib/native-app-paths";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";

const OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

function resolveOtpType(value: string | null): EmailOtpType {
  const type = (value || "recovery").toLowerCase() as EmailOtpType;
  return OTP_TYPES.has(type) ? type : "recovery";
}

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [sessionValid, setSessionValid] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  useEffect(() => {
    const supabase = createSupabaseBrowserClient();
    let isMounted = true;
    let timeoutId: ReturnType<typeof setTimeout> | undefined;
    let unsubscribe: (() => void) | undefined;

    async function initAuth() {
      const token_hash = searchParams.get("token_hash")?.trim() || "";
      const type = resolveOtpType(searchParams.get("type"));
      const code = searchParams.get("code")?.trim() || "";

      if (token_hash) {
        const { data, error } = await supabase.auth.verifyOtp({
          token_hash,
          type,
        });
        if (!error && (data.session || data.user) && isMounted) {
          setSessionValid(true);
          setLoading(false);
          return;
        }
        if (error) {
          console.warn("[setyourpassword] verifyOtp:", error.message);
        }
      }

      if (code) {
        const { data, error } = await supabase.auth.exchangeCodeForSession(code);
        if (!error && data.session && isMounted) {
          setSessionValid(true);
          setLoading(false);
          return;
        }
      }

      const {
        data: { session },
      } = await supabase.auth.getSession();
      if (session && isMounted) {
        setSessionValid(true);
        setLoading(false);
        return;
      }

      const {
        data: { subscription },
      } = supabase.auth.onAuthStateChange(
        (_event: AuthChangeEvent, nextSession: Session | null) => {
        if (nextSession && isMounted) {
          setSessionValid(true);
          setLoading(false);
        }
      });
      unsubscribe = () => subscription.unsubscribe();

      timeoutId = setTimeout(() => {
        if (isMounted) setLoading(false);
      }, 1500);
    }

    void initAuth();

    return () => {
      isMounted = false;
      unsubscribe?.();
      if (timeoutId !== undefined) clearTimeout(timeoutId);
    };
  }, [searchParams]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");

    const passwordError = validatePassword(password);
    if (passwordError) {
      setErrorMessage(passwordError);
      return;
    }

    if (password !== confirmPassword) {
      setErrorMessage("Passwords do not match.");
      return;
    }

    setSubmitting(true);
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.updateUser({ password });

    if (error) {
      setErrorMessage(error.message);
      setSubmitting(false);
      return;
    }

    setSuccessMessage("Password successfully updated! Redirecting...");

    if (isNativeMobileApp()) {
      window.location.href = resolveNativeWorkerDashboardPath(null);
      return;
    }

    const {
      data: { session },
    } = await supabase.auth.getSession();
    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (session?.access_token) {
      const statusRes = await fetch("/api/workers/check-status", {
        method: "POST",
        headers: {
          "Content-Type": "application/json",
          Authorization: `Bearer ${session.access_token}`,
        },
      });
      if (statusRes.ok) {
        const payload = (await statusRes.json()) as {
          worker?: WorkerPostPasswordStatus | null;
          redirectTo?: string;
        };
        window.location.href =
          payload.redirectTo ?? resolvePostPasswordSetupHref(payload.worker);
        return;
      }
    }

    let worker: WorkerPostPasswordStatus | null = null;
    if (user?.email) {
      const { data: clientWorker } = await supabase
        .from("workers")
        .select("id, onboarding_completed, status, invite_status")
        .eq("email", user.email)
        .maybeSingle();
      if (clientWorker?.id) {
        worker = {
          id: clientWorker.id,
          onboarding_completed:
            typeof clientWorker.onboarding_completed === "boolean"
              ? clientWorker.onboarding_completed
              : null,
          status:
            typeof clientWorker.status === "string" ? clientWorker.status : null,
          invite_status:
            typeof clientWorker.invite_status === "string"
              ? clientWorker.invite_status
              : null,
        };
      }
    }

    window.location.href = resolvePostPasswordSetupHref(worker);
  };

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50">
        <div className="text-center">
          <div className="mx-auto h-8 w-8 animate-spin rounded-full border-4 border-orange-500 border-t-transparent" />
          <p className="mt-4 text-sm font-medium text-slate-600">
            Verifying your secure link...
          </p>
        </div>
      </div>
    );
  }

  if (!sessionValid) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Link Expired or Invalid</h2>
          <p className="mt-2 text-sm text-slate-600">
            This setup link is no longer valid. Please ask an administrator to
            resend your invite link.
          </p>
          <a
            href="/login"
            className="mt-6 inline-block rounded-md bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
          >
            Back to Login
          </a>
        </div>
      </div>
    );
  }

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
      <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-8 shadow-sm">
        <div className="mb-6 text-center">
          <h1 className="text-2xl font-bold tracking-wider text-slate-900">SITEBOLT</h1>
          <p className="mt-2 text-sm text-slate-600">
            Set your account password to get started
          </p>
        </div>

        {errorMessage ? (
          <div className="mb-4 rounded-md border border-red-200 bg-red-50 p-3 text-sm text-red-600">
            {errorMessage}
          </div>
        ) : null}

        {successMessage ? (
          <div className="mb-4 rounded-md border border-green-200 bg-green-50 p-3 text-sm text-green-600">
            {successMessage}
          </div>
        ) : null}

        <form onSubmit={(event) => void handleSubmit(event)} className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-slate-700">
              New Password
            </label>
            <input
              type="password"
              required
              value={password}
              onChange={(event) => setPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="At least 8 characters"
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-slate-700">
              Confirm New Password
            </label>
            <input
              type="password"
              required
              value={confirmPassword}
              onChange={(event) => setConfirmPassword(event.target.value)}
              className="mt-1 w-full rounded-md border border-slate-300 px-3 py-2 text-sm focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
              placeholder="Re-enter password"
            />
          </div>

          <p className="text-xs text-slate-500">{passwordRequirementsLabel()}</p>

          <button
            type="submit"
            disabled={submitting}
            className="w-full rounded-md bg-orange-600 py-2.5 text-sm font-semibold text-white shadow hover:bg-orange-500 disabled:opacity-50"
          >
            {submitting ? "Saving Password..." : "Save Password & Continue"}
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
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-600">Loading...</p>
        </div>
      }
    >
      <SetPasswordForm />
    </Suspense>
  );
}
