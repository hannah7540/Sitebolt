"use client";

import dynamic from "next/dynamic";
import { Suspense, useState, useEffect, useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  fetchWorkers,
  fetchPlant,
  fetchAllWorkerVocs,
  isSupabaseConfigured,
  type Worker,
  type PlantAsset,
  type WorkerVoc,
} from "@/lib/supabase";
import { fetchAssets, type Asset } from "@/lib/assets";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import { getProjectViewPath } from "@/lib/project-nav-routes";
import {
  buildConsoleNavHref,
  CONSOLE_VIEW_SEARCH_PARAM,
  getDedicatedConsoleHref,
  parseConsoleRoute,
  readConsoleOpenAdd,
} from "@/lib/console-nav-routes";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { isPasswordRecoverySession } from "@/lib/auth-session-utils";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import { redirectToLogin } from "@/lib/auth-guard";
import {
  hasAuthCodeQuery,
  hasAuthHashFragment,
  isPublicAuthFlowPath,
  resetPasswordLocationWithHash,
  shouldSkipAuthRedirect,
} from "@/lib/public-auth-paths";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  MASTER_PROJECT_DASHBOARD_PATH,
  setAdminWorkerId,
} from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { type ActiveView } from "@/components/Sidebar";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import PlantAdminPanel from "@/components/plant/PlantAdminPanel";
import ProjectPlantAssignmentsPanel from "@/components/plant/ProjectPlantAssignmentsPanel";
import AssetAdminPanel from "@/components/assets/AssetAdminPanel";
import ProjectAssetsPanel from "@/components/assets/ProjectAssetsPanel";
import ProjectSwmsPanel from "@/components/swms/ProjectSwmsPanel";
import PlantFleetScheduler from "@/components/plant/PlantFleetScheduler";
import WorkerDirectoryPanel from "@/components/workers/WorkerDirectoryPanel";
import ProjectWorkerAssignmentsPanel from "@/components/workers/ProjectWorkerAssignmentsPanel";
import WorkerProjectScheduler from "@/components/workers/WorkerProjectScheduler";
import WorkerDashboardView from "@/components/workers/WorkerDashboardView";
import ProjectDashboard from "@/components/dashboard/ProjectDashboard";
import OrganisationProfileDashboard from "@/components/dashboard/OrganisationProfileDashboard";
import CompanyInformationPanel from "@/components/organisation/CompanyInformationPanel";
import InsurancesPanel from "@/components/organisation/InsurancesPanel";
import TagsPanel from "@/components/organisation/TagsPanel";
import OrganisationDocumentsPanel from "@/components/organisation/OrganisationDocumentsPanel";
import FormTemplateManager from "@/components/forms/FormTemplateManager";
import EntityFormsTab from "@/components/forms/EntityFormsTab";
import ProjectsManagementPanel from "@/components/organisation/ProjectsManagementPanel";
import SecuritySettingsPanel from "@/components/organisation/SecuritySettingsPanel";
import SubcontractorsListView from "@/components/subcontractors/SubcontractorsListView";
import AdminPlantCalendarPanel from "@/components/administration/FullPlantCalendarView";
import AdminWorkerCalendarPanel from "@/components/administration/AdminWorkerCalendarPanel";
import SwmsManagementPanel from "@/components/administration/SwmsManagementPanel";
import AdminReportingTab from "@/components/administration/AdminReportingTab";
import MasterProjectDashboard from "@/components/administration/MasterProjectDashboard";
import {
  canViewFinancialFields,
  canAssignPayRules,
  normalizeSecurityRole,
  canAccessAdminConsole,
  canManageOrganisation,
  canManageSecuritySettings,
} from "@/lib/security-roles";
import {
  canAccessOrganisationView,
  canNavigateToView,
  filterProjectsForRole,
  isOrganisationView,
  PROJECT_VIEWS,
} from "@/lib/rbac-guards";
import { getWorkerAssignedProjectIds } from "@/lib/supabase";
import { Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";
import MarketingLandingPage from "@/components/marketing/MarketingLandingPage";
import { Capacitor } from "@capacitor/core";

const DocumentPackView = dynamic(
  () => import("@/components/administration/DocumentPackView"),
  { ssr: false }
);

function isAppSubdomainHost(): boolean {
  if (typeof window === "undefined") return false;
  const host = window.location.host.toLowerCase();
  return host.startsWith("app.") || host.startsWith("app.localhost");
}

function HomeConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workerVocs, setWorkerVocs] = useState<WorkerVoc[]>([]);
  const [plant, setPlant] = useState<PlantAsset[]>([]);
  const [assets, setAssets] = useState<Asset[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [showAddWorker, setShowAddWorker] = useState(false);
  const [showAddPlant, setShowAddPlant] = useState(false);
  const [showAddAsset, setShowAddAsset] = useState(false);
  const [showAddSubcontractor, setShowAddSubcontractor] = useState(false);
  const [adminWorkerId, setAdminWorkerIdState] = useState<string | null>(null);
  const [dashboardProject, setDashboardProject] = useState<DbProject | null>(null);
  const [sidebarProjects, setSidebarProjects] = useState<DbProject[]>([]);
  const [sessionReady, setSessionReady] = useState(false);
  const [hasAuthSession, setHasAuthSession] = useState(false);

  const fetchData = useCallback(async () => {
    setLoading(true);
    setError(null);

    if (!isSupabaseConfigured()) {
      setError(
        "Supabase is not configured. Add your NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local"
      );
      setWorkers([]);
      setWorkerVocs([]);
      setPlant([]);
      setAssets([]);
      setLoading(false);
      return;
    }

    const [workerData, plantData, vocData, assetData] = await Promise.all([
      fetchWorkers(),
      fetchPlant(),
      fetchAllWorkerVocs(),
      fetchAssets(),
    ]);
    await fetchProjects();
    const projects = getCachedProjects();
    setSidebarProjects(projects);
    setWorkers(workerData);
    setWorkerVocs(vocData);
    setPlant(plantData);
    setAssets(assetData);
    setLoading(false);
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  useEffect(() => {
    if (
      typeof window !== "undefined" &&
      (window.location.pathname.includes("/setyourpassword") ||
        window.location.pathname.includes("/reset-password") ||
        window.location.pathname.includes("/onboarding"))
    ) {
      return;
    }

    if (hasAuthCodeQuery()) {
      window.location.replace(
        `/reset-password${window.location.search}${window.location.hash}`
      );
      return;
    }
    if (hasAuthHashFragment()) {
      window.location.replace(resetPasswordLocationWithHash());
      return;
    }
    if (isPublicAuthFlowPath(pathname) || shouldSkipAuthRedirect(pathname)) return;

    if (workers.length === 0 && loading) return;

    let cancelled = false;

    async function resolveAdminSession() {
      if (shouldSkipAuthRedirect(pathname)) return;

      const supabase = createSupabaseBrowserClient();
      const { data: sessionData } = await supabase.auth.getSession();
      if (cancelled) return;
      if (isPasswordRecoverySession(sessionData.session)) {
        window.location.replace("/setyourpassword");
        return;
      }

      const authSession = await resolveAuthWorkerFromSession();
      if (cancelled) return;

      setHasAuthSession(authSession.hasSession);
      setSessionReady(true);

      if (!authSession.hasSession) {
        if (shouldSkipAuthRedirect(pathname) || hasAuthHashFragment() || hasAuthCodeQuery()) {
          return;
        }
        if (!isAppSubdomainHost()) return;
        redirectToLogin(router, pathname);
        return;
      }

      if (authSession.workerId) {
        setAdminWorkerId(authSession.workerId);
        setAdminWorkerIdState(authSession.workerId);
        return;
      }

      setAdminWorkerIdState(null);
    }

    void resolveAdminSession();
    return () => {
      cancelled = true;
    };
  }, [workers.length, loading, router, pathname]);

  const adminProfileName = useMemo(() => {
    if (adminWorkerId) {
      const match = workers.find((w) => w.id === adminWorkerId);
      if (match) return getWorkerDisplayName(match);
    }
    return DEFAULT_ADMIN_PROFILE_NAME;
  }, [adminWorkerId, workers]);

  const sessionRole = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return normalizeSecurityRole(linked?.security_role);
  }, [workers, adminWorkerId]);

  const assignedProjectIds = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return linked ? getWorkerAssignedProjectIds(linked) : [];
  }, [workers, adminWorkerId]);

  const visibleProjects = useMemo(
    () => filterProjectsForRole(sessionRole, sidebarProjects, assignedProjectIds),
    [sessionRole, sidebarProjects, assignedProjectIds]
  );

  const consoleRoute = useMemo(
    () => parseConsoleRoute(pathname, searchParams),
    [pathname, searchParams]
  );
  const activeTab = consoleRoute?.view ?? "dashboard";
  const openAddFromUrl = readConsoleOpenAdd(searchParams);
  const emailsAccessDenied = searchParams.get("access") === "emails_denied";
  const hideFinancialFields = !canViewFinancialFields(sessionRole);
  const assignPayRules = canAssignPayRules(sessionRole);
  const manageWorkerRoles = canManageSecuritySettings(sessionRole);

  useEffect(() => {
    setShowAddWorker(activeTab === "org-workers" && openAddFromUrl);
    setShowAddPlant(activeTab === "org-plant" && openAddFromUrl);
    setShowAddAsset(activeTab === "org-assets" && openAddFromUrl);
    setShowAddSubcontractor(
      activeTab === "subcontractors" && openAddFromUrl
    );
  }, [activeTab, openAddFromUrl]);

  useEffect(() => {
    if (pathname !== "/") return;
    const viewParam = searchParams.get(CONSOLE_VIEW_SEARCH_PARAM)?.trim();
    if (viewParam) {
      const dedicated = getDedicatedConsoleHref(viewParam as ActiveView, {
        openAdd: openAddFromUrl,
      });
      if (dedicated) {
        router.replace(dedicated);
      }
      return;
    }
    if (!isAppSubdomainHost()) return;
    if (hasAuthCodeQuery() || hasAuthHashFragment()) return;
    router.replace(MASTER_PROJECT_DASHBOARD_PATH);
  }, [pathname, router, searchParams, openAddFromUrl]);

  useEffect(() => {
    if (!sessionReady || !hasAuthSession || !adminWorkerId || workers.length === 0) {
      return;
    }
    const linked = workers.find((w) => w.id === adminWorkerId);
    const role = normalizeSecurityRole(linked?.security_role);
    if (!canAccessAdminConsole(role)) {
      router.replace(`/worker-dashboard?worker_id=${adminWorkerId}`);
    }
  }, [sessionReady, hasAuthSession, adminWorkerId, workers, router]);

  useEffect(() => {
    if (!sessionReady || !hasAuthSession || sidebarProjects.length === 0) return;

    const projectId = consoleRoute?.projectId;
    if (!projectId) return;

    const project =
      sidebarProjects.find(
        (row) => row.id === projectId || row.slug === projectId
      ) ?? null;
    if (project) {
      setDashboardProject((prev) => (prev?.id === project.id ? prev : project));
    }
  }, [sessionReady, hasAuthSession, sidebarProjects, consoleRoute?.projectId]);

  useEffect(() => {
    if (!sessionReady || !hasAuthSession || visibleProjects.length === 0) return;
    if (
      dashboardProject &&
      !visibleProjects.some((project) => project.id === dashboardProject.id)
    ) {
      setDashboardProject(visibleProjects[0] ?? null);
    }
  }, [sessionReady, hasAuthSession, visibleProjects, dashboardProject]);

  const handleNavigate = (
    view: ActiveView,
    options?: { openAdd?: boolean; projectId?: string }
  ) => {
    const targetProjectId = options?.projectId ?? dashboardProject?.id ?? null;
    if (
      !canNavigateToView(sessionRole, view, assignedProjectIds, targetProjectId)
    ) {
      return;
    }

    if (options?.projectId) {
      const project = visibleProjects.find((p) => p.id === options.projectId);
      if (project) setDashboardProject(project);
    }

    const projectId =
      options?.projectId ?? dashboardProject?.id ?? visibleProjects[0]?.id ?? null;

    router.push(
      buildConsoleNavHref(view, {
        projectId,
        openAdd: options?.openAdd,
      })
    );
  };

  return (
    <AdminConsoleShell>
      {activeTab === "my-profile" ? (
        <WorkerDashboardView
          workerId={adminWorkerId}
          embedded
          preferAdminProfile
          sessionRole={sessionRole}
        />
      ) : (
        <>
          {emailsAccessDenied ? (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              The EMAIL&apos;s module is restricted to Owner and Full Access users.
            </div>
          ) : null}

          {error && (
            <div className="mb-6 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-800">
              {error}
            </div>
          )}

          {loading && (
            <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading from Supabase…
            </div>
          )}

          {!activeTab.startsWith("org-") &&
            !activeTab.startsWith("admin-") &&
            activeTab !== "subcontractors" && (
          <div className="mb-8 flex flex-wrap gap-2 border-b border-slate-200 pb-4">
            {(
              [
                { id: "dashboard" as const, label: "Project Dashboard", icon: "📊" },
                { id: "workers" as const, label: "Assigned Workers", icon: "👷" },
                { id: "worker-scheduler" as const, label: "Worker Scheduler", icon: "🗓️" },
                { id: "plant" as const, label: "Assigned Plant", icon: "🚜" },
                { id: "assets" as const, label: "Assets", icon: "📐" },
                { id: "swms" as const, label: "SWMS", icon: "📄" },
                { id: "forms" as const, label: "Forms", icon: "📝" },
                { id: "scheduler" as const, label: "Plant Scheduler", icon: "📅" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  const projectId = dashboardProject?.id ?? visibleProjects[0]?.id ?? null;
                  if (projectId && PROJECT_VIEWS.includes(tab.id)) {
                    router.push(getProjectViewPath(projectId, tab.id));
                    return;
                  }
                  handleNavigate(tab.id);
                }}
                className={cn(
                  "rounded-lg px-4 py-2 text-sm font-medium transition",
                  activeTab === tab.id
                    ? "bg-orange-500 text-white shadow-sm"
                    : "bg-white text-slate-700 shadow-sm ring-1 ring-slate-200 hover:bg-orange-50 hover:text-orange-600"
                )}
              >
                {tab.icon} {tab.label}
              </button>
            ))}
          </div>
          )}

          {activeTab === "dashboard" && (
            <ProjectDashboard
              projectId={dashboardProject?.id ?? null}
              project={dashboardProject}
              projectName={dashboardProject?.name ?? "Project"}
              workers={workers}
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
              onProjectUpdated={(saved) => {
                setDashboardProject(saved);
                setSidebarProjects(getCachedProjects());
              }}
              userId={adminWorkerId}
              sessionRole={sessionRole}
            />
          )}

          {activeTab === "workers" && (
            <ProjectWorkerAssignmentsPanel
              projectId={dashboardProject?.id ?? null}
              projectName={dashboardProject?.name ?? "Project"}
              workers={workers}
              workerVocs={workerVocs}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "worker-scheduler" && (
            <WorkerProjectScheduler
              workers={workers}
              workerVocs={workerVocs}
              loading={loading}
              onRefresh={fetchData}
              filterProjectIds={
                dashboardProject?.id ? [dashboardProject.id] : undefined
              }
              title={`${dashboardProject?.name ?? "Project"} Worker Calendar`}
              subtitle="Project assignments, RDO blocks, and leave for this site"
            />
          )}

          {activeTab === "plant" && (
            <ProjectPlantAssignmentsPanel
              projectId={dashboardProject?.id ?? null}
              projectName={dashboardProject?.name ?? "Project"}
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "assets" && (
            <ProjectAssetsPanel
              projectId={dashboardProject?.id ?? null}
              projectName={dashboardProject?.name ?? "Project"}
              assets={assets}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "swms" && (
            <ProjectSwmsPanel
              projectId={dashboardProject?.id ?? null}
              projectName={dashboardProject?.name ?? "Project"}
              workers={workers}
            />
          )}

          {activeTab === "forms" && dashboardProject?.id ? (
            <EntityFormsTab
              entityType="project"
              entityId={dashboardProject.id}
              projectId={dashboardProject.id}
            />
          ) : null}

          {activeTab === "scheduler" && (
            <PlantFleetScheduler
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "subcontractors" && (
            <SubcontractorsListView
              loading={loading}
              initialShowAdd={showAddSubcontractor}
            />
          )}

          {activeTab === "admin-master-dashboard" && <MasterProjectDashboard />}

          {activeTab === "admin-plant-calendar" && (
            <AdminPlantCalendarPanel
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "admin-worker-calendar" && (
            <AdminWorkerCalendarPanel
              workers={workers}
              workerVocs={workerVocs}
              loading={loading}
              onRefresh={fetchData}
            />
          )}

          {activeTab === "admin-swms" && (
            <SwmsManagementPanel workers={workers} projects={visibleProjects} />
          )}

          {activeTab === "admin-document-pack" && (
            <DocumentPackView
              projects={visibleProjects}
              workers={workers}
              plant={plant}
              exportedBy={adminProfileName}
            />
          )}

          {activeTab === "admin-reporting" && (
            <AdminReportingTab
              projects={visibleProjects}
              actionedById={adminWorkerId}
              actionedByName={adminProfileName}
            />
          )}

          {activeTab === "org-dashboard" && canManageOrganisation(sessionRole) && (
            <OrganisationProfileDashboard
              workers={workers}
              plant={plant}
              assets={assets}
              loading={loading}
              userId={adminWorkerId}
              sessionRole={sessionRole}
            />
          )}
          {activeTab === "org-company" && canManageOrganisation(sessionRole) && (
            <CompanyInformationPanel />
          )}
          {activeTab === "org-insurances" && canManageOrganisation(sessionRole) && (
            <InsurancesPanel />
          )}
          {activeTab === "org-documents" && canAccessOrganisationView(sessionRole, "org-documents") && (
            <OrganisationDocumentsPanel />
          )}
          {activeTab === "org-forms" && canAccessOrganisationView(sessionRole, "org-forms") && (
            <FormTemplateManager />
          )}
          {activeTab === "org-projects" && canAccessOrganisationView(sessionRole, "org-projects") && (
            <ProjectsManagementPanel
              workers={workers}
              onProjectsChanged={fetchData}
            />
          )}
          {activeTab === "org-tags" && canAccessOrganisationView(sessionRole, "org-tags") && (
            <TagsPanel />
          )}
          {activeTab === "org-workers" && canAccessOrganisationView(sessionRole, "org-workers") && (
            <WorkerDirectoryPanel
              workers={workers}
              workerVocs={workerVocs}
              loading={loading}
              onRefresh={fetchData}
              onWorkerUpdated={(updated) => {
                setWorkers((prev) =>
                  prev.map((row) => (row.id === updated.id ? updated : row))
                );
              }}
              initialShowAdd={showAddWorker}
              hideFinancialFields={hideFinancialFields}
              canAssignPayRules={assignPayRules}
              canManageWorkerRoles={manageWorkerRoles}
            />
          )}
          {activeTab === "org-plant" && canAccessOrganisationView(sessionRole, "org-plant") && (
            <PlantAdminPanel
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddPlant}
            />
          )}
          {activeTab === "org-assets" && canAccessOrganisationView(sessionRole, "org-assets") && (
            <AssetAdminPanel
              assets={assets}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddAsset}
            />
          )}
          {activeTab === "org-security" && canAccessOrganisationView(sessionRole, "org-security") && (
            <SecuritySettingsPanel onUpdated={fetchData} />
          )}
          {isOrganisationView(activeTab) &&
            activeTab !== "admin-swms" &&
            !canAccessOrganisationView(sessionRole, activeTab) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                You do not have access to this Organisation section.
              </div>
            )}
        </>
      )}
    </AdminConsoleShell>
  );
}

function RootEntry() {
  const pathname = usePathname();
  const [isAppHost, setIsAppHost] = useState(false);
  const [hostReady, setHostReady] = useState(false);
  const [isNativeApp, setIsNativeApp] = useState(false);

  useEffect(() => {
    const native = Capacitor.isNativePlatform();
    setIsNativeApp(native);
    setIsAppHost(isAppSubdomainHost());
    setHostReady(true);
    if (native) {
      window.location.replace("/login");
    }
  }, []);

  if (isNativeApp) {
    return (
      <div className="flex min-h-screen items-center justify-center">
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  const isMarketingRoot =
    pathname === "/" ||
    pathname === "/marketing" ||
    Boolean(pathname?.startsWith("/enquire"));

  if (isMarketingRoot && (!hostReady || !isAppHost)) {
    return <MarketingLandingPage />;
  }

  return <HomeConsole />;
}

export default function Home() {
  return (
    <Suspense
      fallback={
        <div className="flex min-h-screen items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      }
    >
      <RootEntry />
    </Suspense>
  );
}
