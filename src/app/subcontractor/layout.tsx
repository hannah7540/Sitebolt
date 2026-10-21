import type { ReactNode } from "react";
import SubcontractorPortalShell from "@/components/subcontractors/SubcontractorPortalShell";

export default function SubcontractorLayout({ children }: { children: ReactNode }) {
  return <SubcontractorPortalShell>{children}</SubcontractorPortalShell>;
}
