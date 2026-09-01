import { redirect } from "next/navigation";

/** Static alias so /worker/dashboard is not captured by /worker/[id]. */
export default function WorkerDashboardAliasPage() {
  redirect("/worker-dashboard");
}
