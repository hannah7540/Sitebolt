import { redirect } from "next/navigation";
import { ADMIN_ITC_PATH } from "@/lib/console-nav-routes";

export default function IsolatedItcRedirectPage() {
  redirect(ADMIN_ITC_PATH);
}
