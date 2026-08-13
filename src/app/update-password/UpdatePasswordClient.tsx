"use client";

import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";

interface UpdatePasswordClientProps {
  initialHasSession: boolean;
}

export default function UpdatePasswordClient({
  initialHasSession,
}: UpdatePasswordClientProps) {
  return (
    <AuthSetPasswordForm
      initialHasSession={initialHasSession}
      trustServerSession
      title="Set new password"
      description="Choose a new password for your SiteBolt account."
      submitLabel="Update password"
      successMessage="Password updated. Redirecting you to SiteBolt…"
    />
  );
}
