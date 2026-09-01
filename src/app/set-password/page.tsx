import { redirect } from "next/navigation";

export default function SetPasswordRedirectPage() {
  redirect("/reset-password");
}
