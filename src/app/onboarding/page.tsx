import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import OnboardingForm from "./OnboardingForm";

export const dynamic = "force-dynamic";

export default function OnboardingPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center bg-slate-50 p-6">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <OnboardingForm />
    </Suspense>
  );
}
