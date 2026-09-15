import { redirect } from "next/navigation";
import { ADMIN_ITC_PATH } from "@/lib/console-nav-routes";

export default function ProjectItpsItcsRedirectPage() {
  redirect(ADMIN_ITC_PATH);
}
