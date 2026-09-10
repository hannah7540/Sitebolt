"use client";

import { useEffect, useRef } from "react";

/**
 * Pushes a history layer while a nested worker view/modal is open so iOS
 * swipe-back and browser back close that layer instead of exiting the app.
 */
export function useWorkerHistoryLayer(
  active: boolean,
  onPop: () => void,
  key = "worker-layer"
): void {
  const onPopRef = useRef(onPop);
  onPopRef.current = onPop;
  const ignoreNextPopRef = useRef(false);

  useEffect(() => {
    if (!active || typeof window === "undefined") return;

    ignoreNextPopRef.current = false;
    window.history.pushState({ workerLayer: key }, "");

    const handlePopState = () => {
      if (ignoreNextPopRef.current) {
        ignoreNextPopRef.current = false;
        return;
      }
      onPopRef.current();
    };

    window.addEventListener("popstate", handlePopState);

    return () => {
      window.removeEventListener("popstate", handlePopState);
      const state = window.history.state as { workerLayer?: string } | null;
      if (state?.workerLayer !== key) return;

      // Defer the back() so a newly opened layer (e.g. FormViewer after
      // closing the inductions list) can pushState first. Immediate back()
      // on iOS/Capacitor pops the new layer and looks like Complete did nothing.
      ignoreNextPopRef.current = true;
      window.setTimeout(() => {
        const latest = window.history.state as { workerLayer?: string } | null;
        if (latest?.workerLayer === key) {
          window.history.back();
        } else {
          ignoreNextPopRef.current = false;
        }
      }, 0);
    };
  }, [active, key]);
}
