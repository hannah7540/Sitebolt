"use client";

import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

interface AcceptInviteClientProps {
  initialHasSession: boolean;
}

export default function AcceptInviteClient({ initialHasSession }: AcceptInviteClientProps) {
  return (
    <AuthSetPasswordForm
      initialHasSession={initialHasSession}
      title="Accept invitation"
      description="Create a password to activate your SiteBolt worker account."
      submitLabel="Activate account"
      successMessage="Account activated! Complete your profile setup next."
      successRedirectPath="/onboarding"
      ensureWorkerProfileOnSuccess
    />
  );
}
