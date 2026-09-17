"use client";

import { useEffect, useState } from "react";
import { isNativeMobileApp } from "@/lib/native-app";

/**
 * True inside Capacitor/Cordova wrappers, installed PWAs, and standalone
 * display modes. Standard desktop/laptop browsers return false.
 */
export function isNativeOrStandaloneAppShell(): boolean {
  if (typeof window === "undefined") return false;

  try {
    if (isNativeMobileApp()) return true;
  } catch {
    // Capacitor may be unavailable in some browser bundles.
  }

  const nav = window.navigator as Navigator & { standalone?: boolean };
  if (nav.standalone === true) return true;

  try {
    if (window.matchMedia("(display-mode: standalone)").matches) return true;
    if (window.matchMedia("(display-mode: fullscreen)").matches) return true;
    if (window.matchMedia("(display-mode: minimal-ui)").matches) return true;
  } catch {
    // matchMedia is not available in every test/runtime.
  }

  const ua = nav.userAgent || "";
  if (/Capacitor|Cordova/i.test(ua)) return true;
  if ("cordova" in window) return true;

  return false;
}

/** Web browsers should inherit the pinned left sidebar dashboard shell. */
export function useWebDashboardProfileShell(): boolean {
  const [webShell, setWebShell] = useState(false);

  useEffect(() => {
    setWebShell(!isNativeOrStandaloneAppShell());
  }, []);

  return webShell;
}
