import type { Metadata } from "next";
import SubcontractorDashboardPrototype from "@/components/prototype/SubcontractorDashboardPrototype";

export const metadata: Metadata = {
  title: "Subcontractor Portal Prototype — SiteBolt",
  description: "Static UI preview of the subcontractor dashboard.",
};

export default function SubcontractorPrototypePage() {
  return <SubcontractorDashboardPrototype />;
}
