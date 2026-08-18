"use client";

import { useEffect } from "react";
import { registerMobileBackHandler } from "@/lib/mobile-back-navigation";

/** Registers a handler while mounted (e.g. open modal or nested worker view). */
export function useMobileBackHandler(
  handler: () => boolean,
  enabled = true
): void {
  useEffect(() => {
    if (!enabled) return;
    return registerMobileBackHandler(handler);
  }, [enabled, handler]);
}
