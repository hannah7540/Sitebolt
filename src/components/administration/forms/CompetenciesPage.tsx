"use client";

import { Loader2 } from "lucide-react";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import CompetencyMatrixTab from "@/components/administration/forms/CompetencyMatrixTab";

export default function CompetenciesPage() {
  const { workers, sessionReady, loading, accessDenied } = useAdminConsole();

  if (loading || !sessionReady) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading competency register…
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
        {accessDenied}
      </div>
    );
  }

  return <CompetencyMatrixTab workers={workers} />;
}
