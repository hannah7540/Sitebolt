"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { useRouter } from "next/navigation";
import { Loader2, Menu, X } from "lucide-react";
import Sidebar, { type ActiveView } from "@/components/Sidebar";
import AppScreenHeader from "@/components/layout/AppScreenHeader";
import CompanyLogo from "@/components/ui/CompanyLogo";
import {
  AdminConsoleProvider,
  type AdminConsoleContextValue,
} from "@/contexts/AdminConsoleContext";
import {
  fetchWorkers,
  isSupabaseConfigured,
  type Worker,
} from "@/lib/supabase";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  getAdminWorkerId,
  resolveAdminWorkerFromList,
  setAdminWorkerId,
} from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  canAccessAccountsArea,
  canAccessAdminConsole,
  normalizeAccountsAccessRole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import { cn } from "@/lib/utils";

interface AdminConsoleShellProps {
  children: ReactNode;
  requireAccountsAccess?: boolean;
}

export default function AdminConsoleShell({
  children,
  requireAccountsAccess = false,
}: AdminConsoleShellProps) {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sidebarProjects, setSidebarProjects] = useState<DbProject[]>([]);
  const [dashboardProject, setDashboardProject] = useState<DbProject | null>(null);
  const [adminWorkerId, setAdminWorkerIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    setLoading(true);
    setSessionReady(false);
    setAccessDenied(null);

    if (!isSupabaseConfigured()) {
      setAccessDenied(
        "Supabase is not configured. Add your credentials to .env.local to use the admin console."
      );
      setLoading(false);
      setSessionReady(true);
      return;
    }

    const workerData = await fetchWorkers();
    await fetchProjects();
    const projects = getCachedProjects();

    const resolvedAdminId =
      resolveAdminWorkerFromList(workerData) ??
      workerData[0]?.id ??
      getAdminWorkerId();

    if (resolvedAdminId) {
      setAdminWorkerId(resolvedAdminId);
      setAdminWorkerIdState(resolvedAdminId);
    } else {
      setAdminWorkerIdState(getAdminWorkerId());
    }

    setWorkers(workerData);
    setSidebarProjects(projects);
    setDashboardProject(
      projects.find((project) => project.slug === "project-3") ?? projects[0] ?? null
    );
    setLoading(false);
    setSessionReady(true);
  }, []);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const adminProfileName = useMemo(() => {
    if (adminWorkerId) {
      const match = workers.find((worker) => worker.id === adminWorkerId);
      if (match) return getWorkerDisplayName(match);
    }
    return DEFAULT_ADMIN_PROFILE_NAME;
  }, [adminWorkerId, workers]);

  const sessionWorker = useMemo(
    () => workers.find((worker) => worker.id === adminWorkerId) ?? null,
    [workers, adminWorkerId]
  );

  const sessionRole = useMemo(
    () => normalizeSecurityRole(sessionWorker?.security_role ?? "full_access"),
    [sessionWorker]
  );

  const accountsAccessRole = useMemo(
    () => normalizeAccountsAccessRole(sessionWorker?.accounts_access_role),
    [sessionWorker]
  );

  const canAccessAccounts = sessionWorker?.can_access_accounts === true;

  useEffect(() => {
    if (!sessionReady || loading) return;

    if (requireAccountsAccess && sessionWorker) {
      if (
        !canAccessAccountsArea({
          securityRole: sessionWorker.security_role,
          accountsAccessRole: sessionWorker.accounts_access_role,
          canAccessAccounts: sessionWorker.can_access_accounts,
        })
      ) {
        setAccessDenied("You do not have Accounts access for this area.");
        return;
      }
      setAccessDenied(null);
    }

    if (!sessionWorker || workers.length === 0) return;

    if (!canAccessAdminConsole(normalizeSecurityRole(sessionWorker.security_role))) {
      router.replace(`/worker-dashboard?worker_id=${sessionWorker.id}`);
    }
  }, [
    sessionReady,
    loading,
    sessionWorker,
    workers.length,
    requireAccountsAccess,
    router,
  ]);

  const handleNavigate = (view: ActiveView) => {
    setSidebarOpen(false);
    router.push("/");
  };

  const handleOpenProfile = () => {
    setSidebarOpen(false);
    router.push("/");
  };

  const contextValue = useMemo<AdminConsoleContextValue>(
    () => ({
      workers,
      projects: sidebarProjects,
      adminWorkerId,
      sessionReady,
      loading,
      accessDenied,
      sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    }),
    [
      workers,
      sidebarProjects,
      adminWorkerId,
      sessionReady,
      loading,
      accessDenied,
      sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    ]
  );

  if (loading || !sessionReady) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (accessDenied) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-transparent p-6">
        <div className="w-full max-w-md rounded-xl border border-slate-200 bg-white p-6 shadow-sm">
          <h1 className="text-xl font-bold text-slate-900">Access restricted</h1>
          <p className="mt-3 text-sm text-slate-600">{accessDenied}</p>
          <button
            type="button"
            onClick={() => router.push("/")}
            className="mt-4 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
          >
            Return to dashboard
          </button>
        </div>
      </div>
    );
  }

  return (
    <AdminConsoleProvider value={contextValue}>
      <div className="flex h-screen overflow-hidden bg-transparent">
        {sidebarOpen && (
          <button
            type="button"
            aria-label="Close sidebar"
            className="fixed inset-0 z-40 bg-slate-900/30 lg:hidden"
            onClick={() => setSidebarOpen(false)}
          />
        )}

        <div
          className={cn(
            "fixed inset-y-0 left-0 z-50 transform transition-transform duration-200 lg:static lg:translate-x-0",
            sidebarOpen ? "translate-x-0" : "-translate-x-full"
          )}
        >
          <Sidebar
            activeView="dashboard"
            projects={sidebarProjects}
            selectedProjectId={dashboardProject?.id}
            sessionRole={sessionRole}
            accountsAccessRole={accountsAccessRole}
            canAccessAccounts={canAccessAccounts}
            permissionsLoading={loading}
            onNavigate={handleNavigate}
            profileName={adminProfileName}
            onOpenProfile={handleOpenProfile}
          />
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppScreenHeader
            profileName={adminProfileName}
            onOpenProfile={handleOpenProfile}
            className="hidden lg:flex"
          />

          <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-2 text-slate-600 hover:bg-orange-50 hover:text-orange-600"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <span className="flex-1 text-sm font-semibold text-slate-900">
              Site<span className="text-orange-500">Bolt</span>
            </span>
            <CompanyLogo size="sm" showFallback />
          </div>

          <div className="flex-1 overflow-y-auto p-6 text-slate-800 lg:p-8">{children}</div>
        </div>
      </div>
    </AdminConsoleProvider>
  );
}
