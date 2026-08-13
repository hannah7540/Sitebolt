"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import { useSearchParams } from "next/navigation";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

function ConfirmInvitePageContent() {
  const searchParams = useSearchParams();
  const callbackError = searchParams.get("error");

  if (callbackError) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
        <div className="max-w-md rounded-xl border border-red-200 bg-red-50 p-8 text-center">
          <h1 className="text-lg font-semibold text-red-900">Invite link invalid</h1>
          <p className="mt-2 text-sm text-red-800">{callbackError}</p>
        </div>
      </div>
    );
  }

  return (
    <AuthSetPasswordForm
      title="Accept invitation"
      description="Create a password to activate your SiteBolt worker account."
      submitLabel="Activate account"
      successMessage="Your account is ready. You can sign in with your new password."
    />
  );
}

export default function ConfirmInvitePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <ConfirmInvitePageContent />
    </Suspense>
  );
}
