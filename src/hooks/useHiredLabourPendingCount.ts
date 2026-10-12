"use client";

import { useEffect, useState } from "react";
import { usePathname } from "next/navigation";
import { supabase } from "@/lib/supabase";
import { resolveActiveOrganisationId } from "@/lib/tenant-scope";

/** Count of hired labour waiting for admin approval in the active organisation. */
export function useHiredLabourPendingCount(): number {
  const pathname = usePathname();
  const [count, setCount] = useState(0);

  useEffect(() => {
    let cancelled = false;
    const orgId = resolveActiveOrganisationId();
    if (!orgId) {
      setCount(0);
      return;
    }

    void supabase
      .from("workers")
      .select("id", { count: "exact", head: true })
      .eq("organisation_id", orgId)
      .eq("worker_category", "hired_labour")
      .eq("hired_labour_status", "pending_approval")
      .then(({ count: next, error }) => {
        if (cancelled || error) return;
        setCount(next ?? 0);
      });

    return () => {
      cancelled = true;
    };
  }, [pathname]);

  return count;
}
