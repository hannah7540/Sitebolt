"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams, useRouter } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import ItcManagementHub from "@/components/itc/ItcManagementHub";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import { fetchWorkers, isSupabaseConfigured, type Worker } from "@/lib/supabase";
import {
  fetchProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { getWorkerDisplayName } from "@/lib/worker-utils";

export default function ProjectItcPage() {
  const params = useParams();
  const router = useRouter();
  const projectId = String(params.id ?? "");
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerId, setWorkerId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const authSession = await resolveAuthWorkerFromSession();
      if (!authSession.hasSession) {
        redirectToLogin(router, `/projects/${projectId}/itc`);
        return;
      }

      const [projectRows, workerRows] = await Promise.all([
        fetchProjects(),
        isSupabaseConfigured() ? fetchWorkers() : Promise.resolve([] as Worker[]),
      ]);

      if (cancelled) return;
      setProjects(projectRows);
      setWorkers(workerRows);
      setWorkerId(authSession.workerId);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, [projectId, router]);

  const project = useMemo(
    () => projects.find((row) => row.id === projectId || row.slug === projectId),
    [projects, projectId]
  );

  const workerName = useMemo(() => {
    if (!workerId) return "Signed-in user";
    const worker = workers.find((row) => row.id === workerId);
    return worker ? getWorkerDisplayName(worker) : "Signed-in user";
  }, [workers, workerId]);

  return (
    <div className="min-h-screen bg-transparent text-slate-900">
      <header className="border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-7xl items-center justify-between gap-4">
          <div className="flex min-w-0 items-center gap-3">
            <Link
              href="/"
              className="inline-flex items-center gap-1 text-sm font-semibold text-slate-600 hover:text-orange-600"
            >
              <ArrowLeft className="h-4 w-4" />
              Dashboard
            </Link>
            <div className="min-w-0">
              <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
                ITP Management
              </p>
              <p className="truncate text-sm text-slate-500">
                {project ? project.name : "Project ITC"}
              </p>
            </div>
          </div>
          <CompanyLogo size="md" showFallback />
        </div>
      </header>

      <main className="mx-auto max-w-7xl px-4 py-6">
        {loading ? (
          <div className="flex items-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-5 w-5 animate-spin text-orange-500" />
            Loading project context…
          </div>
        ) : !project ? (
          <div className="mx-auto flex max-w-md flex-col items-center gap-3 py-16 text-center">
            <AlertCircle className="h-12 w-12 text-red-500" />
            <p className="text-slate-600">
              Project not found. Return to the dashboard and open ITPs & ITCs from the project
              sidebar.
            </p>
            <Link
              href="/"
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white"
            >
              Back to Dashboard
            </Link>
          </div>
        ) : workerId ? (
          <ItcManagementHub
            projectId={project.id}
            projectName={project.name}
            workerId={workerId}
            workerName={workerName}
          />
        ) : (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
            Your account is signed in but is not linked to a worker profile.
          </div>
        )}
      </main>
    </div>
  );
}
