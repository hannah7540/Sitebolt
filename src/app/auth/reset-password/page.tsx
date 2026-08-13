import { redirect } from "next/navigation";

export default function AuthResetPasswordRedirectPage() {
  redirect("/reset-password");
}
