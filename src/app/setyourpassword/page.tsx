"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import type { Session } from "@supabase/supabase-js";
import { HardHat, Loader2 } from "lucide-react";
import { Suspense } from "react";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { hasAuthHashFragment } from "@/lib/public-auth-paths";

function SetYourPasswordForm() {
  const searchParams = useSearchParams();
  const [newPassword, setNewPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState<string | null>(null);

  useEffect(() => {
    const errorParam = searchParams.get("error");
    if (errorParam && !hasAuthHashFragment()) setErrorMsg(errorParam);

    const supabase = createSupabaseBrowserClient();
    const {
      data: { subscription },
    } = supabase.auth.onAuthStateChange(
      (_event: string, _session: Session | null) => {
        // Persist recovery/invite tokens from the URL hash or cookies.
      }
    );

    async function captureSessionFromUrl() {
      const code = searchParams.get("code");
      if (code) {
        await supabase.auth.exchangeCodeForSession(code);
      }

      const hash = typeof window !== "undefined" ? window.location.hash : "";
      if (hash.includes("access_token") && hash.includes("refresh_token")) {
        const params = new URLSearchParams(hash.replace(/^#/, ""));
        const accessToken = params.get("access_token");
        const refreshToken = params.get("refresh_token");
        if (accessToken && refreshToken) {
          const { data } = await supabase.auth.setSession({
            access_token: accessToken,
            refresh_token: refreshToken,
          });
          if (data.session) {
            window.history.replaceState(
              null,
              "",
              `${window.location.pathname}${window.location.search}`
            );
          }
        }
      }

      await supabase.auth.getSession();
    }

    void captureSessionFromUrl();
    return () => subscription.unsubscribe();
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
        setErrorMsg(error.message);
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

          {errorMsg ? (
            <div className="rounded-md bg-red-50 p-3 text-sm text-red-600">
              {errorMsg}
            </div>
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
