"use client";

import { useEffect } from "react";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";
import { browserAuthHeaders } from "@/lib/browser-auth-headers";

interface AcceptInviteClientProps {
  initialHasSession: boolean;
}

export default function AcceptInviteClient({ initialHasSession }: AcceptInviteClientProps) {
  useEffect(() => {
    if (!initialHasSession) return;
    void (async () => {
      const headers = await browserAuthHeaders();
      await fetch("/api/workers/ensure-profile", {
        method: "POST",
        cache: "no-store",
        credentials: "same-origin",
        headers,
      });
    })();
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
