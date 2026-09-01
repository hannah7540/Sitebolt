"use client";

import { usePathname } from "next/navigation";
import BrandingRoot from "@/components/branding/BrandingRoot";
import { isExemptFromAuthRedirect } from "@/lib/public-auth-paths";

/**
 * Password-setup and onboarding routes skip BrandingRoot so they are never
 * wrapped in admin/native guards that bounce to /login.
 */
export default function AppShell({ children }: { children: React.ReactNode }) {
  const pathname = usePathname() ?? "";

  if (
    isExemptFromAuthRedirect(pathname) ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/auth/")
  ) {
    return <>{children}</>;
  }

  return <BrandingRoot>{children}</BrandingRoot>;
}
