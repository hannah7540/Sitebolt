import { Suspense } from "react";
import ResetPasswordForm from "@/app/(auth)/reset-password/ResetPasswordForm";

export default function AuthResetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50">
          <p className="text-sm text-slate-600">Loading…</p>
        </div>
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
