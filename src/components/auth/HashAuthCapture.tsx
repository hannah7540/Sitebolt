"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  hasAuthCodeQuery,
  hasAuthHashFragment,
  isExemptFromAuthRedirect,
  resetPasswordLocationWithHash,
  shouldSkipAuthRedirect,
} from "@/lib/public-auth-paths";

/**
 * Recovery/invite links often put tokens in the URL hash or `?code=`, which
 * the homepage/login guards cannot use. Capture them and send the user to
 * /auth/callback or /reset-password instead of /login.
 */
export default function HashAuthCapture() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;

    const path = pathname || window.location.pathname;
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.includes("/setyourpassword") ||
        window.location.pathname.includes("/reset-password") ||
        window.location.pathname.includes("/onboarding"))
    ) {
      return;
    }
    if (shouldSkipAuthRedirect(path) && path !== "/auth/callback" && path !== "/auth/confirm") {
      return;
    }
    if (isExemptFromAuthRedirect(path) && path !== "/auth/callback" && path !== "/auth/confirm") {
      return;
    }

    if (hasAuthCodeQuery() && !path.startsWith("/auth/callback") && !path.startsWith("/auth/confirm")) {
      window.location.replace(
        `/auth/callback${window.location.search}${window.location.hash}`
      );
      return;
    }

    if (!hasAuthHashFragment()) return;
    if (path === "/setyourpassword" || path === "/reset-password" || path === "/set-password") return;

    window.location.replace(resetPasswordLocationWithHash());
  }, [pathname]);

  return null;
}
