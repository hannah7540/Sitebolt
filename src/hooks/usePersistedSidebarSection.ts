"use client";

import { useCallback, useEffect, useState } from "react";

export const SIDEBAR_OPEN_SECTIONS_STORAGE_KEY = "sitebolt_sidebar_open_sections";

function readStoredSections(): Record<string, boolean> {
  if (typeof window === "undefined") return {};
  try {
    const raw = window.localStorage.getItem(SIDEBAR_OPEN_SECTIONS_STORAGE_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as unknown;
    if (!parsed || typeof parsed !== "object" || Array.isArray(parsed)) return {};

    const result: Record<string, boolean> = {};
    for (const [key, value] of Object.entries(parsed as Record<string, unknown>)) {
      if (typeof value === "boolean") result[key] = value;
    }
    return result;
  } catch {
    return {};
  }
}

function writeStoredSections(map: Record<string, boolean>): void {
  try {
    window.localStorage.setItem(
      SIDEBAR_OPEN_SECTIONS_STORAGE_KEY,
      JSON.stringify(map)
    );
  } catch {
    // Ignore quota / private-mode failures.
  }
}

/**
 * Persist a sidebar section's expanded state across route changes.
 * A section stays open if the user opened it, or if the current route belongs to it.
 * Explicit header clicks still collapse it for the current screen.
 */
export function usePersistedSidebarSection(
  sectionKey: string,
  routeActive: boolean,
  defaultOpen = false
): [boolean, () => void] {
  const [open, setOpen] = useState(routeActive || defaultOpen);

  useEffect(() => {
    const stored = readStoredSections()[sectionKey];
    if (typeof stored === "boolean") {
      setOpen(stored || routeActive);
      return;
    }
    setOpen(defaultOpen || routeActive);
  }, [sectionKey, routeActive, defaultOpen]);

  const toggle = useCallback(() => {
    setOpen((current) => {
      const next = !current;
      const map = readStoredSections();
      map[sectionKey] = next;
      writeStoredSections(map);
      return next;
    });
  }, [sectionKey]);

  return [open, toggle];
}
