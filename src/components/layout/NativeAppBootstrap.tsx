"use client";

import { useEffect } from "react";
import { usePathname, useRouter } from "next/navigation";
import { Capacitor } from "@capacitor/core";
import { markNativeAppCookie } from "@/lib/native-app";

const NATIVE_MARKETING_START_PATHS = new Set(["/", "/marketing"]);

/**
 * Native-shell only. Web browsers never enter this path, so marketing layout
 * on www stays unchanged.
 */
export default function NativeAppBootstrap() {
  const pathname = usePathname() ?? "";
  const router = useRouter();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!Capacitor.isNativePlatform()) return;

    document.documentElement.classList.add("capacitor-native");
    markNativeAppCookie();

    void import("@capacitor/status-bar")
      .then(({ StatusBar }) => StatusBar.setOverlaysWebView({ overlay: false }))
      .catch(() => undefined);

    if (NATIVE_MARKETING_START_PATHS.has(pathname)) {
      router.replace("/login");
    }
  }, [pathname, router]);

  return null;
}
