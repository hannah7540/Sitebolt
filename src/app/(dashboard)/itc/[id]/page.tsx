import { redirect } from "next/navigation";
import { getAdminItcPath } from "@/lib/console-nav-routes";

export default async function IsolatedItcDetailRedirectPage({
  params,
}: {
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  redirect(getAdminItcPath(id));
}
