"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

function ResetPasswordContent() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  if (callbackError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-red-900">Reset link invalid</h1>
          <p className="mt-2 text-sm text-red-800">{callbackError}</p>
          <p className="mt-4 text-sm text-red-700">
            Request a new link from the{" "}
            <a href="/login" className="font-semibold underline">
              login page
            </a>
            .
          </p>
        </div>
      </div>
    );
  }

  return (
    <AuthSetPasswordForm
      title="Reset your password"
      description="Choose a new password for your SiteBolt account."
      submitLabel="Update password"
      successMessage="Password updated. Redirecting you to SiteBolt…"
    />
  );
}

export default function ResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <ResetPasswordContent />
    </Suspense>
  );
}
