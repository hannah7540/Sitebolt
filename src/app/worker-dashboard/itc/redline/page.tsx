"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import RedlineMarkupView from "@/components/itc/redline/RedlineMarkupView";
import { listItcs, type FieldItcRecord } from "@/lib/api/itc";
import type { RedlineItcOption, RedlineMe } from "@/lib/api/redline";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import { shouldSkipAuthRedirect } from "@/lib/public-auth-paths";
import { fetchProjects } from "@/lib/project-resolver";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { fetchWorkerById, getWorkerAssignedProjectIds } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  DASHBOARD_LOADING_TIMEOUT_MS,
  resolveDashboardWorkerId,
} from "@/lib/user-session";

function mapItc(row: FieldItcRecord): RedlineItcOption {
  return {
    id: row.id,
    number: row.itc_number,
    type: row.service_name || row.service_code || "ITC",
    issued: row.status === "complete",
  };
}

function WorkerRedlineContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryWorkerId = searchParams.get("worker_id");
  const queryProjectId = searchParams.get("project_id");
  const queryItcId = searchParams.get("itc_id");

  const [loading, setLoading] = useState(true);
  const [me, setMe] = useState<RedlineMe | null>(null);
  const [itcs, setItcs] = useState<RedlineItcOption[]>([]);
  const [backHref, setBackHref] = useState("/worker-dashboard/itc");

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const authSession = await resolveAuthWorkerFromSession();
      if (!authSession.hasSession) {
        if (shouldSkipAuthRedirect()) return;
        redirectToLogin(router, "/worker-dashboard/itc/redline");
        return;
      }

      const resolvedWorkerId = await resolveDashboardWorkerId({
        queryWorkerId,
        sessionWorkerId: authSession.workerId,
      });

      const supabase = createSupabaseBrowserClient();
      const { data: userData } = await supabase.auth.getUser();
      const authUserId = userData.user?.id ?? "";
      const worker = resolvedWorkerId ? await fetchWorkerById(resolvedWorkerId) : null;
      const name = worker ? getWorkerDisplayName(worker) : userData.user?.email || "Worker";

      const projectRows = await fetchProjects();
      const grantedIds = worker ? getWorkerAssignedProjectIds(worker) : [];
      const granted =
        grantedIds.length > 0
          ? projectRows.filter((project) => grantedIds.includes(project.id))
          : projectRows;
      const selectedProjectId =
        queryProjectId && granted.some((project) => project.id === queryProjectId)
          ? queryProjectId
          : granted[0]?.id ?? null;

      const listed = await listItcs({ projectId: selectedProjectId });

      if (cancelled) return;

      const params = new URLSearchParams();
      if (resolvedWorkerId) params.set("worker_id", resolvedWorkerId);
      if (selectedProjectId) params.set("project_id", selectedProjectId);
      const query = params.toString();

      setMe({
        authUserId,
        workerId: resolvedWorkerId,
        name,
      });
      setItcs(listed.itcs.map(mapItc));
      setBackHref(query ? `/worker-dashboard/itc?${query}` : "/worker-dashboard/itc");
      setLoading(false);
    }

    const timeout = window.setTimeout(() => {
      if (!cancelled) setLoading(false);
    }, DASHBOARD_LOADING_TIMEOUT_MS);

    void load();
    return () => {
      cancelled = true;
      window.clearTimeout(timeout);
    };
  }, [queryProjectId, queryWorkerId, router]);

  const initialItcId = useMemo(() => queryItcId, [queryItcId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!me) {
    return (
      <div className="mx-auto max-w-lg p-6 text-sm text-slate-600">
        Could not load the signed-in worker for red line markup.
      </div>
    );
  }

  return (
    <RedlineMarkupView
      me={me}
      itcs={itcs}
      backHref={backHref}
      initialItcId={initialItcId}
    />
  );
}

export default function WorkerRedlinePage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <WorkerRedlineContent />
    </Suspense>
  );
}
