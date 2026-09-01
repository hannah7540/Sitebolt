"use client";

import { useEffect } from "react";
import { usePathname } from "next/navigation";
import {
  hasAuthHashFragment,
  isPublicAuthFlowPath,
  resetPasswordLocationWithHash,
} from "@/lib/public-auth-paths";

/**
 * Recovery/invite links often put tokens in the URL hash, which the server
 * never sees. Capture them on any other route and keep the user on
 * /reset-password instead of bouncing to /login.
 */
export default function HashAuthCapture() {
  const pathname = usePathname();

  useEffect(() => {
    if (typeof window === "undefined") return;
    if (!hasAuthHashFragment()) return;

    const path = pathname || window.location.pathname;
    if (path === "/reset-password" || path === "/set-password") return;
    if (isPublicAuthFlowPath(path) && path !== "/auth/callback" && path !== "/auth/confirm") {
      return;
    }

    window.location.replace(resetPasswordLocationWithHash());
  }, [pathname]);

  return null;
}
