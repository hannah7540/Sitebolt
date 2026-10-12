"use client";

import { useCallback, useSyncExternalStore } from "react";
import {
  readSidebarCollapsed,
  SIDEBAR_COLLAPSED_EVENT,
  writeSidebarCollapsed,
} from "@/lib/sidebar-collapsed";

function subscribeCollapsed(onStoreChange: () => void): () => void {
  window.addEventListener("storage", onStoreChange);
  window.addEventListener(SIDEBAR_COLLAPSED_EVENT, onStoreChange);
  return () => {
    window.removeEventListener("storage", onStoreChange);
    window.removeEventListener(SIDEBAR_COLLAPSED_EVENT, onStoreChange);
  };
}

function subscribeDesktop(onStoreChange: () => void): () => void {
  const media = window.matchMedia("(min-width: 1024px)");
  media.addEventListener("change", onStoreChange);
  return () => media.removeEventListener("change", onStoreChange);
}

/** Desktop-only collapse. SSR / first paint stay expanded to avoid hydration mismatch. */
export function useIsDesktopSidebar(): boolean {
  return useSyncExternalStore(
    subscribeDesktop,
    () => window.matchMedia("(min-width: 1024px)").matches,
    () => false
  );
}

export function usePersistedSidebarCollapsed(): [boolean, (next: boolean) => void] {
  const storedCollapsed = useSyncExternalStore(
    subscribeCollapsed,
    readSidebarCollapsed,
    () => false
  );
  const isDesktop = useIsDesktopSidebar();

  const setCollapsed = useCallback((next: boolean) => {
    writeSidebarCollapsed(next);
  }, []);

  return [storedCollapsed && isDesktop, setCollapsed];
}
