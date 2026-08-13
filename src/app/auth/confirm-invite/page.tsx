"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

function ConfirmInvitePageContent() {
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
