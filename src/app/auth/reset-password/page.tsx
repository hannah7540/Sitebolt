import { redirect } from "next/navigation";

export default async function AuthResetPasswordRedirectPage({
  searchParams,
}: {
  searchParams: Promise<Record<string, string | string[] | undefined>>;
}) {
  const params = await searchParams;
  const error = typeof params.error === "string" ? params.error : null;

  if (error) {
    redirect(`/update-password?error=${encodeURIComponent(error)}`);
  }

  redirect("/update-password");
}
