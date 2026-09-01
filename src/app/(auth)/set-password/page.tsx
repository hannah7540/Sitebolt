"use client";

import { Suspense } from "react";
import ResetPasswordForm from "../reset-password/ResetPasswordForm";

export default function SetPasswordPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6" />
      }
    >
      <ResetPasswordForm />
    </Suspense>
  );
}
