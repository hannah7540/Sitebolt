"use client";

import { Suspense } from "react";
import SubcontractorOnboardingForm from "@/components/subcontractors/SubcontractorOnboardingForm";

export default function SubcontractorOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading invite…
        </div>
      }
    >
      <SubcontractorOnboardingForm />
    </Suspense>
  );
}
