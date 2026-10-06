import { redirect } from "next/navigation";
import { MASTER_PROJECT_DASHBOARD_PATH } from "@/lib/user-session";

/** `/projects` is the master list landing — never a specific project. */
export default function ProjectsIndexPage() {
  redirect(MASTER_PROJECT_DASHBOARD_PATH);
}
