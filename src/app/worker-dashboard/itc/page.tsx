"use client";

import { Suspense, useEffect, useMemo, useState } from "react";
import { useRouter, useSearchParams } from "next/navigation";
import { Loader2 } from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import WorkerItcFloorplanViewer from "@/components/workers/itc/WorkerItcFloorplanViewer";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import {
  fetchProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { fetchWorkerById, getWorkerAssignedProjectIds } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  DASHBOARD_LOADING_TIMEOUT_MS,
  resolveDashboardWorkerId,
  workerDashboardUrl,
} from "@/lib/user-session";

function WorkerItcContent() {
  const router = useRouter();
  const searchParams = useSearchParams();
  const queryWorkerId = searchParams.get("worker_id");
  const queryProjectId = searchParams.get("project_id");

  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [workerName, setWorkerName] = useState("Worker");
  const [grantedProjects, setGrantedProjects] = useState<DbProject[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const authSession = await resolveAuthWorkerFromSession();
      if (!authSession.hasSession) {
        redirectToLogin(router, "/worker-dashboard/itc");
        return;
      }

      const resolvedWorkerId = await resolveDashboardWorkerId({
        queryWorkerId,
        sessionWorkerId: authSession.workerId,
      });

      if (!resolvedWorkerId) {
        if (!cancelled) setLoading(false);
        return;
      }

      const [projectRows, worker] = await Promise.all([
        fetchProjects(),
        fetchWorkerById(resolvedWorkerId),
      ]);

      if (cancelled) return;

      setProjects(projectRows);
      setWorkerId(resolvedWorkerId);
      setWorkerName(worker ? getWorkerDisplayName(worker) : "Worker");

      const grantedIds = worker ? getWorkerAssignedProjectIds(worker) : [];
      const granted = projectRows.filter((project) => grantedIds.includes(project.id));
      setGrantedProjects(granted.length > 0 ? granted : projectRows.slice(0, 1));
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
  }, [queryWorkerId, router]);

  const defaultProjectId = useMemo(() => {
    if (queryProjectId && grantedProjects.some((project) => project.id === queryProjectId)) {
      return queryProjectId;
    }
    return grantedProjects[0]?.id ?? null;
  }, [grantedProjects, queryProjectId]);

  if (loading) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (!workerId || grantedProjects.length === 0) {
    const goDashboard = () => router.push("/worker-dashboard");

    return (
      <div className="mx-auto max-w-lg p-4 mobile-safe-area-top worker-mobile-content-pad">
        <button
          type="button"
          onClick={goDashboard}
          className="mb-4 hidden text-sm font-semibold text-orange-600 lg:inline-flex"
        >
          ← Back to dashboard
        </button>
        <WorkerMobileBackButton label="Back to dashboard" onClick={goDashboard} />
        <p className="rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
          No assigned projects found. Contact your administrator to be linked to a job before
          using ITC&apos;s.
        </p>
      </div>
    );
  }

  return (
    <div className="min-h-screen bg-slate-50 mobile-safe-area-top">
      <div className="mx-auto max-w-5xl p-4">
        <WorkerItcFloorplanViewer
          workerId={workerId}
          workerName={workerName}
          projects={grantedProjects}
          defaultProjectId={defaultProjectId}
          onBack={() => router.push(workerDashboardUrl(workerId))}
        />
      </div>
    </div>
  );
}

export default function WorkerItcPage() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <WorkerItcContent />
    </Suspense>
  );
}
