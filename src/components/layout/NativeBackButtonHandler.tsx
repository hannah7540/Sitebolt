"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { isNativeMobileApp } from "@/lib/native-app";
import { resolveNativeWorkerDashboardPath } from "@/lib/native-app-paths";
import { tryHandleMobileBack } from "@/lib/mobile-back-navigation";
import { getStoredWorkerId } from "@/lib/user-session";

function isWorkerDashboardRoot(pathname: string): boolean {
  return pathname === "/worker-dashboard" || pathname === "/worker-dashboard/";
}

function isWorkerAppPath(pathname: string): boolean {
  return (
    pathname === "/worker-dashboard" ||
    pathname.startsWith("/worker-dashboard/") ||
    pathname.startsWith("/worker/") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/portal/")
  );
}

/**
 * Hardware / gesture back:
 * 1) Close the top registered modal/layer
 * 2) Browser history back when not on the worker dashboard root
 * 3) Minimize only when already on the root Worker Dashboard with nothing open
 */
export default function NativeBackButtonHandler() {
  const pathname = usePathname();
  const router = useRouter();

  useEffect(() => {
    if (!isNativeMobileApp()) return;

    let cancelled = false;
    let removeListener: (() => void) | undefined;

    void import("@capacitor/app").then(({ App }) => {
      if (cancelled) return;

      void App.addListener("backButton", ({ canGoBack }) => {
        if (tryHandleMobileBack()) return;

        const currentPath = window.location.pathname;
        if (isWorkerDashboardRoot(currentPath)) {
          // Root dashboard with no open layers — exit/minimize only here.
          void App.minimizeApp();
          return;
        }

        if (canGoBack || window.history.length > 1) {
          window.history.back();
          return;
        }

        if (isWorkerAppPath(currentPath)) {
          router.replace(resolveNativeWorkerDashboardPath(getStoredWorkerId()));
          return;
        }

        void App.minimizeApp();
      }).then((handle) => {
        removeListener = () => void handle.remove();
      });
    });

    return () => {
      cancelled = true;
      removeListener?.();
    };
  }, [pathname, router]);

  return null;
}
