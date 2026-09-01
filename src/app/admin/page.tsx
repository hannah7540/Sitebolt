import { redirect } from "next/navigation";
import { MASTER_PROJECT_DASHBOARD_PATH } from "@/lib/user-session";

export default function AdminIndexPage() {
  redirect(MASTER_PROJECT_DASHBOARD_PATH);
}
