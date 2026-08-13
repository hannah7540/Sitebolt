"use client";

import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

interface ResetPasswordClientProps {
  initialHasSession: boolean;
}

export default function ResetPasswordClient({ initialHasSession }: ResetPasswordClientProps) {
  return (
    <AuthSetPasswordForm
      initialHasSession={initialHasSession}
      title="Reset your password"
      description="Choose a new password for your SiteBolt account."
      submitLabel="Update password"
      successMessage="Password updated. Redirecting you to SiteBolt…"
    />
  );
}
