"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isNativeMobileApp,
  markNativeAppCookie,
  resolveNativeWorkerDashboardPath,
} from "@/lib/native-app";
import { shouldRedirectNativePath } from "@/lib/native-app-paths";
import { isStandalonePwa } from "@/lib/pwa-standalone";
import { getStoredWorkerId } from "@/lib/user-session";
import {
  hasAuthHashFragment,
  isPublicAuthFlowPath,
  resetPasswordLocationWithHash,
  shouldSkipAuthRedirect,
} from "@/lib/public-auth-paths";

/**
 * Keeps the Capacitor shell on worker-only routes and sets a cookie so the
 * server proxy can apply the same rules on full page loads.
 */
export default function NativeAppRouteGuard() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isNativeMobileApp()) return;
    markNativeAppCookie();
  }, []);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.includes("/setyourpassword") ||
        window.location.pathname.includes("/reset-password") ||
        window.location.pathname.includes("/onboarding") ||
        window.location.pathname.includes("/subcontractor/onboard") ||
        window.location.pathname.includes("/guest"))
    ) {
      return;
    }
    if ((!isNativeMobileApp() && !isStandalonePwa()) || !pathname) return;
    if (isPublicAuthFlowPath(pathname) || shouldSkipAuthRedirect(pathname)) return;
    if (hasAuthHashFragment()) {
      window.location.replace(resetPasswordLocationWithHash());
      return;
    }
    if (!shouldRedirectNativePath(pathname)) return;
    if (
      pathname.startsWith("/admin") ||
      pathname.startsWith("/organisation") ||
      pathname.startsWith("/accounts") ||
      pathname.startsWith("/subcontractor") ||
      pathname.startsWith("/dashboard") ||
      pathname.startsWith("/select-company")
    ) {
      return;
    }

    const storedWorkerId = getStoredWorkerId();
    if (storedWorkerId) {
      router.replace(resolveNativeWorkerDashboardPath(storedWorkerId));
      return;
    }
    router.replace("/login");
  }, [pathname, router]);

  return null;
}
