"use client";

import { useCallback, useEffect, useState } from "react";

export function useIncidentUnreadCount(enabled = true): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    if (!enabled) {
      setCount(0);
      return;
    }
    try {
      const response = await fetch("/api/incidents/unread-count", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        count?: number;
      } | null;
      if (response.ok) {
        setCount(typeof payload?.count === "number" ? payload.count : 0);
      }
    } catch {
      setCount(0);
    }
  }, [enabled]);

  useEffect(() => {
    void load();
    if (!enabled) return;
    const timer = window.setInterval(() => void load(), 60_000);
    return () => window.clearInterval(timer);
  }, [enabled, load]);

  return count;
}
