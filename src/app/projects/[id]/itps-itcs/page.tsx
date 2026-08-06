"use client";

import { useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { useParams } from "next/navigation";
import { AlertCircle, ArrowLeft, Loader2 } from "lucide-react";
import ItcQualitySystemView from "@/components/itc/ItcQualitySystemView";
import CompanyLogo from "@/components/ui/CompanyLogo";
import { fetchWorkers, isSupabaseConfigured, type Worker } from "@/lib/supabase";
import {
  fetchProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import {
  getAdminWorkerId,
  resolveAdminWorkerFromList,
} from "@/lib/user-session";

export default function ProjectItpsItcsPage() {
  const params = useParams();
  const projectId = String(params.id ?? "");
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    let cancelled = false;

    async function load() {
      const [projectRows, workerRows] = await Promise.all([
        fetchProjects(),
        isSupabaseConfigured() ? fetchWorkers() : Promise.resolve([] as Worker[]),
      ]);

      if (cancelled) return;
      setProjects(projectRows);
      setWorkers(workerRows);
      setLoading(false);
    }

    void load();
    return () => {
      cancelled = true;
    };
  }, []);

  const project = useMemo(
    () => projects.find((row) => row.id === projectId || row.slug === projectId),
    [projects, projectId]
  );

  const workerId = useMemo(() => {
    return (
      resolveAdminWorkerFromList(workers) ??
      workers[0]?.id ??
      getAdminWorkerId() ??
      "local-worker"
    );
  }, [workers]);

  const workerName = useMemo(() => {
    const worker = workers.find((row) => row.id === workerId);
    return worker?.full_name?.trim() || "Site Admin";
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
                Quality System
              </p>
              <p className="truncate text-sm text-slate-500">
                {project ? project.name : "Project ITCs"}
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
        ) : (
          <ItcQualitySystemView
            projectId={project.id}
            projectName={project.name}
            workerId={workerId}
            workerName={workerName}
            defaultPanel="batch"
          />
        )}
      </main>
    </div>
  );
}
