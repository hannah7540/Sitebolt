"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  isNativeMobileApp,
  markNativeAppCookie,
  resolveNativeWorkerDashboardPath,
} from "@/lib/native-app";
import { shouldRedirectNativePath } from "@/lib/native-app-paths";
import { getStoredWorkerId } from "@/lib/user-session";

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
    if (!isNativeMobileApp() || !pathname) return;
    if (!shouldRedirectNativePath(pathname)) return;

    router.replace(resolveNativeWorkerDashboardPath(getStoredWorkerId()));
  }, [pathname, router]);

  return null;
}
