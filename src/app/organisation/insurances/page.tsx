"use client";

import { Suspense } from "react";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import InsurancesPanel from "@/components/organisation/InsurancesPanel";

function OrganisationInsurancesContent() {
  return <InsurancesPanel />;
}

export default function OrganisationInsurancesPage() {
  return (
    <AdminConsoleShell requireOrganisationAccess>
      <Suspense
        fallback={
          <div className="flex items-center gap-2 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading insurances…
          </div>
        }
      >
        <OrganisationInsurancesContent />
      </Suspense>
    </AdminConsoleShell>
  );
}
