import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AuthSetPasswordForm from "@/components/auth/AuthSetPasswordForm";
import { createSupabaseServerClient } from "@/lib/supabase/server";

export const dynamic = "force-dynamic";

export default async function ResetPasswordPage() {
  const supabase = await createSupabaseServerClient();
  const {
    data: { user },
  } = await supabase.auth.getUser();

  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <AuthSetPasswordForm
        initialHasSession={Boolean(user)}
        title="Reset your password"
        description="Choose a new password for your Site Bolt account."
        submitLabel="Reset password"
        successMessage="Your password has been successfully updated! Please sign in."
        passwordLabel="New Password"
        confirmPasswordLabel="Confirm New Password"
        successRedirectPath="/login?reset=success"
        signOutOnSuccess
        noSessionMessage="Open the link from your password reset email to continue. If your link expired, request a new reset link from the login page."
      />
    </Suspense>
  );
}
