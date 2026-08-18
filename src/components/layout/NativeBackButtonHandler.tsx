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

/**
 * Android hardware back: close modals first, then return to worker dashboard.
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

      void App.addListener("backButton", () => {
        if (tryHandleMobileBack()) return;

        const currentPath = window.location.pathname;
        if (isWorkerDashboardRoot(currentPath)) {
          void App.minimizeApp();
          return;
        }

        router.replace(resolveNativeWorkerDashboardPath(getStoredWorkerId()));
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
