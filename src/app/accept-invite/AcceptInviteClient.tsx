"use client";

import { useEffect } from "react";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

interface AcceptInviteClientProps {
  initialHasSession: boolean;
}

export default function AcceptInviteClient({ initialHasSession }: AcceptInviteClientProps) {
  useEffect(() => {
    if (!initialHasSession) return;
    void fetch("/api/workers/ensure-profile", { method: "POST" });
  }, [initialHasSession]);

  return (
    <AuthSetPasswordForm
      initialHasSession={initialHasSession}
      title="Accept invitation"
      description="Create a password to activate your SiteBolt worker account."
      submitLabel="Activate account"
      successMessage="Account activated! Redirecting you to SiteBolt…"
      ensureWorkerProfileOnSuccess
    />
  );
}
