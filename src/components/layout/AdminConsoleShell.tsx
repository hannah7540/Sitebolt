"use client";

import { Suspense, useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import { usePathname, useRouter } from "next/navigation";
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
  getWorkerAssignedProjectIds,
  isSupabaseConfigured,
  type Worker,
} from "@/lib/supabase";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { resolveAdminWorkerFromAuthSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import { isExemptFromAuthRedirect } from "@/lib/public-auth-paths";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  setAdminWorkerId,
  workerProfileDashboardPath,
} from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import {
  canAccessAccountsArea,
  canAccessAdminConsole,
  canAccessEmailsModule,
  canAccessSmsModule,
  canAccessPayRules,
  canAddAccountsTimesheets,
  canManageAccountsTimesheets,
  canViewAccountsTimesheets,
  isAccountsTimesheetsReadOnly,
  normalizeAccountsAccessRole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import {
  canAccessOrganisationRoute,
  filterProjectsForRole,
  isEmailsPath,
  isSmsPath,
  isOrganisationPath,
  isPayRulesPath,
  isTimesheetsPath,
  isAddTimesheetsPath,
  PROJECT_VIEWS,
} from "@/lib/rbac-guards";
import {
  extractProjectIdFromPathname,
  getProjectViewPath,
  parseProjectRoute,
} from "@/lib/project-nav-routes";
import {
  buildConsoleNavHref,
  parseConsoleRoute,
} from "@/lib/console-nav-routes";
import { resolveOrganisationActiveView } from "@/lib/organisation-nav-routes";
import type { NavigateOptions } from "@/components/Sidebar";
import { cn } from "@/lib/utils";

interface AdminConsoleShellProps {
  children: ReactNode;
  requireAccountsAccess?: boolean;
  requireOrganisationAccess?: boolean;
  requirePayRulesAccess?: boolean;
  requireEmailsAccess?: boolean;
  requireSmsAccess?: boolean;
}

export default function AdminConsoleShell({
  children,
  requireAccountsAccess = false,
  requireOrganisationAccess = false,
  requirePayRulesAccess = false,
  requireEmailsAccess = false,
  requireSmsAccess = false,
}: AdminConsoleShellProps) {
  const router = useRouter();
  const pathname = usePathname();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [sidebarProjects, setSidebarProjects] = useState<DbProject[]>([]);
  const [dashboardProject, setDashboardProject] = useState<DbProject | null>(null);
  const [adminWorkerId, setAdminWorkerIdState] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionReady, setSessionReady] = useState(false);
  const [accessDenied, setAccessDenied] = useState<string | null>(null);

  const loadSession = useCallback(async () => {
    if (isExemptFromAuthRedirect(pathname)) {
      setLoading(false);
      setSessionReady(true);
      return;
    }

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

    const authSession = await resolveAdminWorkerFromAuthSession();

    if (!authSession.hasSession) {
      setLoading(false);
      setSessionReady(true);
      redirectToLogin(router, pathname);
      return;
    }

    if (authSession.workerId) {
      setAdminWorkerId(authSession.workerId);
      setAdminWorkerIdState(authSession.workerId);
    } else {
      setAccessDenied(
        "Your account is signed in but does not have admin console access. Sign in with an owner or admin account at /login."
      );
      setAdminWorkerIdState(null);
    }

    setWorkers(workerData);
    setSidebarProjects(projects);
    setDashboardProject(
      projects.find((project) => project.slug === "project-3") ?? projects[0] ?? null
    );
    setLoading(false);
    setSessionReady(true);
  }, [pathname, router]);

  useEffect(() => {
    void loadSession();
  }, [loadSession]);

  const sessionWorker = useMemo(
    () => workers.find((worker) => worker.id === adminWorkerId) ?? null,
    [workers, adminWorkerId]
  );

  const adminProfileName = useMemo(() => {
    if (sessionWorker) return getWorkerDisplayName(sessionWorker);
    return DEFAULT_ADMIN_PROFILE_NAME;
  }, [sessionWorker]);

  const adminProfilePhotoUrl = useMemo(
    () => sessionWorker?.photo_url?.trim() || null,
    [sessionWorker]
  );

  const sessionRole = useMemo(
    () => normalizeSecurityRole(sessionWorker?.security_role),
    [sessionWorker]
  );

  const assignedProjectIds = useMemo(
    () => (sessionWorker ? getWorkerAssignedProjectIds(sessionWorker) : []),
    [sessionWorker]
  );

  const visibleProjects = useMemo(
    () => filterProjectsForRole(sessionRole, sidebarProjects, assignedProjectIds),
    [sessionRole, sidebarProjects, assignedProjectIds]
  );

  const sessionSecurityRoleRaw = useMemo(
    () => sessionWorker?.security_role?.trim() || null,
    [sessionWorker]
  );

  const accountsAccessRole = useMemo(
    () => normalizeAccountsAccessRole(sessionWorker?.accounts_access_role),
    [sessionWorker]
  );

  const canAccessAccounts = sessionWorker?.can_access_accounts === true;

  const accountsReadOnly = useMemo(
    () => isAccountsTimesheetsReadOnly(sessionRole, accountsAccessRole),
    [sessionRole, accountsAccessRole]
  );

  useEffect(() => {
    if (!sessionReady || loading) return;

    if (!sessionWorker || workers.length === 0) return;

    if (!canAccessAdminConsole(sessionRole)) {
      router.replace(`/worker-dashboard?worker_id=${sessionWorker.id}`);
      return;
    }

    const organisationRoute =
      requireOrganisationAccess || isOrganisationPath(pathname);
    if (organisationRoute && !canAccessOrganisationRoute(sessionRole)) {
      setAccessDenied("You do not have access to Organisation settings.");
      return;
    }

    const payRulesRoute = requirePayRulesAccess || isPayRulesPath(pathname);
    if (payRulesRoute && !canAccessPayRules(sessionRole)) {
      setAccessDenied("You do not have access to Pay Rules.");
      return;
    }

    const timesheetsRoute =
      requireAccountsAccess ||
      isTimesheetsPath(pathname) ||
      isAddTimesheetsPath(pathname);
    if (timesheetsRoute) {
      const allowed =
        canViewAccountsTimesheets(sessionRole) ||
        canAccessAccountsArea({
          securityRole: sessionWorker.security_role,
          accountsAccessRole: sessionWorker.accounts_access_role,
          canAccessAccounts: sessionWorker.can_access_accounts,
        });
      if (!allowed) {
        setAccessDenied("You do not have Accounts access for this area.");
        return;
      }
    }

    if (
      isAddTimesheetsPath(pathname) &&
      !canAddAccountsTimesheets(
        sessionSecurityRoleRaw ?? sessionRole,
        sessionWorker.accounts_access_role,
        sessionWorker.can_access_accounts
      )
    ) {
      setAccessDenied("You do not have permission to add timesheets.");
      return;
    }

    const emailsRoute = requireEmailsAccess || isEmailsPath(pathname);
    if (emailsRoute && !canAccessEmailsModule(sessionRole)) {
      setAccessDenied(
        "Access Denied: You do not have permission to view communications."
      );
      return;
    }

    const smsRoute = requireSmsAccess || isSmsPath(pathname);
    if (smsRoute && !canAccessSmsModule(sessionRole)) {
      setAccessDenied(
        "Access Denied: You do not have permission to view communications."
      );
      return;
    }

    setAccessDenied(null);
  }, [
    sessionReady,
    loading,
    sessionWorker,
    workers.length,
    sessionRole,
    sessionSecurityRoleRaw,
    requireAccountsAccess,
    requireOrganisationAccess,
    requirePayRulesAccess,
    requireEmailsAccess,
    requireSmsAccess,
    pathname,
    router,
  ]);

  const routeContext = useMemo(() => parseProjectRoute(pathname), [pathname]);
  const sidebarActiveView = useMemo(() => {
    const organisationView = resolveOrganisationActiveView(pathname);
    if (organisationView) return organisationView;
    return (
      parseConsoleRoute(pathname, null)?.view ?? routeContext?.view ?? "dashboard"
    );
  }, [pathname, routeContext?.view]);

  const handleNavigate = (view: ActiveView, options?: NavigateOptions) => {
    setSidebarOpen(false);
    const projectId =
      options?.projectId ??
      routeContext?.projectId ??
      extractProjectIdFromPathname(pathname) ??
      dashboardProject?.id ??
      visibleProjects[0]?.id ??
      null;

    if (projectId && PROJECT_VIEWS.includes(view)) {
      router.push(getProjectViewPath(projectId, view));
      return;
    }

    router.push(
      buildConsoleNavHref(view, {
        projectId,
        openAdd: options?.openAdd,
      })
    );
  };

  const handleOpenProfile = () => {
    setSidebarOpen(false);
    router.push(workerProfileDashboardPath(adminWorkerId, { fromAdmin: true }));
  };

  const contextValue = useMemo<AdminConsoleContextValue>(
    () => ({
      workers,
      projects: visibleProjects,
      adminWorkerId,
      sessionReady,
      loading,
      accessDenied,
      sessionRole,
      sessionSecurityRoleRaw,
      accountsAccessRole,
      canAccessAccounts,
      assignedProjectIds,
      accountsReadOnly,
      canManageAccounts: canManageAccountsTimesheets(sessionRole),
    }),
    [
      workers,
      visibleProjects,
      adminWorkerId,
      sessionReady,
      loading,
      accessDenied,
      sessionRole,
      sessionSecurityRoleRaw,
      accountsAccessRole,
      canAccessAccounts,
      assignedProjectIds,
      accountsReadOnly,
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
            sidebarOpen ? "translate-x-0" : "-translate-x-full lg:translate-x-0"
          )}
        >
          <Suspense
            fallback={
              <aside className="flex h-full w-72 shrink-0 flex-col border-r border-slate-200 bg-white lg:w-80" />
            }
          >
            <Sidebar
              activeView={sidebarActiveView}
              projects={sidebarProjects}
              assignedProjectIds={assignedProjectIds}
              selectedProjectId={routeContext?.projectId ?? dashboardProject?.id}
              sessionRole={sessionRole}
              sessionSecurityRoleRaw={sessionSecurityRoleRaw}
              accountsAccessRole={accountsAccessRole}
              canAccessAccounts={canAccessAccounts}
              permissionsLoading={loading}
              onNavigate={handleNavigate}
              profileName={adminProfileName}
              profileWorkerId={adminWorkerId}
              onOpenProfile={handleOpenProfile}
            />
          </Suspense>
        </div>

        <div className="flex min-w-0 flex-1 flex-col">
          <AppScreenHeader
            profileName={adminProfileName}
            profilePhotoUrl={adminProfilePhotoUrl}
            onOpenProfile={handleOpenProfile}
            className="hidden lg:flex"
          />

          <div className="mobile-safe-area-y flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
            <button
              type="button"
              onClick={() => setSidebarOpen(!sidebarOpen)}
              className="rounded-md p-2 text-slate-600 hover:bg-orange-50 hover:text-orange-600"
              aria-label="Toggle sidebar"
            >
              {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <CompanyLogo size="sm" showFallback className="flex-1" />
          </div>

          <div className="relative z-0 flex-1 overflow-y-auto p-6 text-slate-800 lg:p-8">
            {children}
          </div>
        </div>
      </div>
    </AdminConsoleProvider>
  );
}
