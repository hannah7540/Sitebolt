import type { Metadata } from "next";
import CampManagementShowcasePage from "@/components/marketing/camp-management/CampManagementShowcasePage";

export const metadata: Metadata = {
  title: "Workforce Camp & Accommodation Management | Site-Bolt",
  description:
    "See how Site-Bolt adapts for 50–500+ room camp and accommodation management — bookings, check-ins, site mapping, gatehouse, catering, housekeeping, and progress claims. Built for unlimited scale.",
};

export default function CampManagementModulePage() {
  return <CampManagementShowcasePage />;
}
