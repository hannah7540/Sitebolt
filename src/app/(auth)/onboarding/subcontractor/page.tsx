"use client";

import { Suspense } from "react";
import { useSearchParams } from "next/navigation";
import { cardClass } from "@/lib/ui-classes";

function SubcontractorOnboardingContent() {
  const searchParams = useSearchParams();
  const email = searchParams.get("email")?.trim() ?? "";

  return (
    <div className="flex min-h-screen items-center justify-center bg-slate-50 px-4 py-10">
      <div className={`${cardClass} w-full max-w-lg p-8`}>
        <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
          SiteBolt
        </p>
        <h1 className="mt-2 text-2xl font-bold text-slate-900">
          Subcontractor <span className="text-orange-500">Onboarding</span>
        </h1>
        <p className="mt-3 text-sm leading-6 text-slate-600">
          You have been invited to manage your workers, plant, and compliance in
          SiteBolt.
          {email ? (
            <>
              {" "}
              We will continue setup for <strong>{email}</strong>.
            </>
          ) : null}
        </p>
        <p className="mt-4 text-sm text-slate-500">
          The full onboarding form is coming next. Keep this invite email so you
          can return to this page.
        </p>
      </div>
    </div>
  );
}

export default function SubcontractorOnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 text-sm text-slate-500">
          Loading invite…
        </div>
      }
    >
      <SubcontractorOnboardingContent />
    </Suspense>
  );
}
