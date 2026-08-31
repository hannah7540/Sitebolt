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
      if (state?.workerLayer === key) {
        ignoreNextPopRef.current = true;
        window.history.back();
      }
    };
  }, [active, key]);
}
