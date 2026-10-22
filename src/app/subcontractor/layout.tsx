"use client";

import type { ReactNode } from "react";
import { usePathname } from "next/navigation";
import SubcontractorPortalShell from "@/components/subcontractors/SubcontractorPortalShell";
import { isSubcontractorOnboardPath } from "@/lib/public-auth-paths";

export default function SubcontractorLayout({ children }: { children: ReactNode }) {
  const pathname = usePathname() ?? "";
  if (isSubcontractorOnboardPath(pathname)) {
    return children;
  }
  return <SubcontractorPortalShell>{children}</SubcontractorPortalShell>;
}
