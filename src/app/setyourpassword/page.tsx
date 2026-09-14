"use client";

import { Suspense, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  passwordRequirementsLabel,
  validatePassword,
} from "@/lib/password-validation";

function SetPasswordForm() {
  const searchParams = useSearchParams();
  const token = searchParams.get("token")?.trim() || "";
  const [password, setPassword] = useState("");
  const [confirmPassword, setConfirmPassword] = useState("");
  const [submitting, setSubmitting] = useState(false);
  const [errorMessage, setErrorMessage] = useState("");
  const [successMessage, setSuccessMessage] = useState("");

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setErrorMessage("");

    if (!token) {
      setErrorMessage("Missing setup token. Please check your invitation link.");
      return;
    }

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
    try {
      const response = await fetch("/api/auth/set-worker-password", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ token, password }),
      });
      const payload = (await response.json().catch(() => ({}))) as {
        error?: string;
        success?: boolean;
      };

      if (!response.ok || !payload.success) {
        setErrorMessage(payload.error || "Unable to set password.");
        setSubmitting(false);
        return;
      }

      setSuccessMessage("Password successfully updated! Redirecting...");
      window.location.href = "/login";
    } catch {
      setErrorMessage("Unable to set password.");
      setSubmitting(false);
    }
  };

  if (!token) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-4">
        <div className="w-full max-w-md rounded-lg border border-slate-200 bg-white p-6 text-center shadow-sm">
          <h2 className="text-lg font-bold text-slate-900">Missing setup token</h2>
          <p className="mt-2 text-sm text-slate-600">
            Missing setup token. Please check your invitation link.
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
