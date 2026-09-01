"use client";

import { Suspense, type ReactNode } from "react";
import { usePathname } from "next/navigation";
import { Loader2 } from "lucide-react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import OrganisationSubNav from "@/components/organisation/OrganisationSubNav";
import { isExemptFromAuthRedirect } from "@/lib/public-auth-paths";

function OrganisationContentFallback() {
  return (
    <div className="flex items-center gap-2 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
      Loading…
    </div>
  );
}

export default function OrganisationLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isExemptFromAuthRedirect(pathname)) {
    return <>{children}</>;
  }

  return (
    <AdminConsoleShell requireOrganisationAccess>
      <OrganisationSubNav />
      <Suspense fallback={<OrganisationContentFallback />}>{children}</Suspense>
    </AdminConsoleShell>
  );
}
