import { redirect } from "next/navigation";
import { SUBCONTRACTOR_PORTAL_PATH } from "@/lib/subcontractor-portal";

export default function SubcontractorDashboardRedirectPage() {
  redirect(SUBCONTRACTOR_PORTAL_PATH);
}
