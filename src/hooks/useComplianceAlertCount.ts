"use client";

import { useCallback, useEffect, useState } from "react";

export function useComplianceAlertCount(): number {
  const [count, setCount] = useState(0);

  const load = useCallback(async () => {
    try {
      const response = await fetch("/api/organisation/compliance-alerts", {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        data?: { counts?: { all?: number } };
      } | null;

      if (response.ok && payload?.data?.counts) {
        setCount(payload.data.counts.all ?? 0);
      }
    } catch {
      setCount(0);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  return count;
}
