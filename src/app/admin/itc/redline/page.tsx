"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import RedlineMarkupView from "@/components/itc/redline/RedlineMarkupView";
import { listAdminItcs } from "@/components/itc/admin/itp-itc-admin-api";
import { listItcs } from "@/lib/api/itc";
import type { RedlineItcOption, RedlineMe } from "@/lib/api/redline";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { ADMIN_ITC_PATH } from "@/lib/console-nav-routes";

function AdminRedlineContent() {
  const searchParams = useSearchParams();
  const queryProjectId = searchParams.get("project_id");
  const queryItcId = searchParams.get("itc_id");
  const { adminWorkerId, workers, loading: sessionLoading } = useAdminConsole();
  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<RedlineMe | null>(null);
  const [itcs, setItcs] = useState<RedlineItcOption[]>([]);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const supabase = createSupabaseBrowserClient();
      const { data } = await supabase.auth.getUser();
      const authUserId = data.user?.id ?? "";
      const worker = adminWorkerId
        ? workers.find((row) => row.id === adminWorkerId)
        : null;
      const name = worker
        ? getWorkerDisplayName(worker)
        : data.user?.email || "Signed-in user";

      const [adminRows, field] = await Promise.all([
        listAdminItcs(queryProjectId),
        listItcs({ projectId: queryProjectId }),
      ]);

      const byId = new Map<string, RedlineItcOption>();
      for (const row of field.itcs) {
        byId.set(row.id, {
          id: row.id,
          number: row.itc_number,
          type: row.service_name || row.service_code || "ITC",
          issued: row.status === "complete",
        });
      }
      for (const row of adminRows) {
        if (!byId.has(row.id)) {
          byId.set(row.id, {
            id: row.id,
            number: row.number,
            type: row.service || "ITC",
            issued: row.status === "completed",
          });
        }
      }

      if (cancelled) return;
      setMe({
        authUserId,
        workerId: adminWorkerId,
        name,
      });
      setItcs([...byId.values()]);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [adminWorkerId, queryProjectId, workers]);

  const initialItcId = useMemo(() => queryItcId, [queryItcId]);

  if (sessionLoading || loading || !me) {
    return (
      <div className="flex min-h-[50vh] items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  return (
    <RedlineMarkupView
      me={me}
      itcs={itcs}
      backHref={ADMIN_ITC_PATH}
      initialItcId={initialItcId}
    />
  );
}

export default function AdminRedlinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-[50vh] items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <AdminRedlineContent />
    </Suspense>
  );
}
