import { MASTER_ADMIN_EMAIL } from "@/lib/master-admin-config";

export function isSuperAdminEmail(email: string | null | undefined): boolean {
  return email?.trim().toLowerCase() === MASTER_ADMIN_EMAIL;
}

export function isSuperAdminAccount(input: {
  email?: string | null;
  metadata?: Record<string, unknown> | null;
  isSuperAdminFlag?: boolean | null;
}): boolean {
  if (isSuperAdminEmail(input.email)) return true;
  if (input.isSuperAdminFlag === true) return true;
  const metadata = input.metadata ?? {};
  return metadata.is_super_admin === true || metadata.isSuperAdmin === true;
}
