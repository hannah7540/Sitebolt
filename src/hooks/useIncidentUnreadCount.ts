"use client";

import { useCallback, useEffect, useState } from "react";
import { INCIDENT_REPORTS_REFRESH_EVENT } from "@/lib/incident-reports";

export function useIncidentUnreadCount(enabled = true): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const response = await fetch(
        `/api/incidents/unread-count?_=${Date.now()}`,
        { cache: "no-store" }
      );
      const payload = (await response.json().catch(() => null)) as {
        count?: number;
        error?: string;
      } | null;
      if (response.ok) {
        const next =
          typeof payload?.count === "number" && Number.isFinite(payload.count)
            ? Math.max(0, Math.floor(payload.count))
            : 0;
        setCount(next);
      } else {
        if (payload?.error) {
          console.error("[useIncidentUnreadCount] fetch failed:", payload.error);
        }
        setCount(0);
      }
    } catch (cause) {
      console.error("[useIncidentUnreadCount] fetch failed:", cause);
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) return;

    const onRefresh = () => void load();
    window.addEventListener(INCIDENT_REPORTS_REFRESH_EVENT, onRefresh);
    const timer = window.setInterval(() => void load(), 60_000);
    return () => {
      window.removeEventListener(INCIDENT_REPORTS_REFRESH_EVENT, onRefresh);
      window.clearInterval(timer);
    };
  }, [enabled, load]);

  return count;
}
