"use client";

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
import {
  getProjectItcPath,
  getProjectViewPath,
  parseProjectRoute,
} from "@/lib/project-nav-routes";
import {
  buildConsoleNavHref,
  parseConsoleRoute,
  readConsoleOpenAdd,
} from "@/lib/console-nav-routes";
import { resolveAuthWorkerFromSession } from "@/lib/auth-profile";
import { redirectToLogin } from "@/lib/auth-guard";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  setAdminWorkerId,
} from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import Sidebar, { type ActiveView } from "@/components/Sidebar";
import PlantAdminPanel from "@/components/plant/PlantAdminPanel";
import ProjectPlantAssignmentsPanel from "@/components/plant/ProjectPlantAssignmentsPanel";
import AssetAdminPanel from "@/components/assets/AssetAdminPanel";
import ProjectAssetsPanel from "@/components/assets/ProjectAssetsPanel";
import ItcQualitySystemView from "@/components/itc/ItcQualitySystemView";
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
import ProjectsManagementPanel from "@/components/organisation/ProjectsManagementPanel";
import SecuritySettingsPanel from "@/components/organisation/SecuritySettingsPanel";
import SubcontractorsListView from "@/components/subcontractors/SubcontractorsListView";
import AdminPlantCalendarPanel from "@/components/administration/FullPlantCalendarView";
import AdminWorkerCalendarPanel from "@/components/administration/AdminWorkerCalendarPanel";
import SwmsManagementPanel from "@/components/administration/SwmsManagementPanel";
import DocumentPackView from "@/components/administration/DocumentPackView";
import AdminReportingTab from "@/components/administration/AdminReportingTab";
import {
  canViewFinancialFields,
  canAssignPayRules,
  normalizeSecurityRole,
  normalizeAccountsAccessRole,
  canAccessAdminConsole,
  canManageOrganisation,
  canManageSecuritySettings,
} from "@/lib/security-roles";
import {
  canNavigateToView,
  filterProjectsForRole,
  isOrganisationView,
  PROJECT_VIEWS,
} from "@/lib/rbac-guards";
import { getWorkerAssignedProjectIds } from "@/lib/supabase";
import {
  Menu,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AppScreenHeader from "@/components/layout/AppScreenHeader";
import CompanyLogo from "@/components/ui/CompanyLogo";

function HomeConsole() {
  const router = useRouter();
  const pathname = usePathname();
  const searchParams = useSearchParams();
  const [sidebarOpen, setSidebarOpen] = useState(false);
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
    const defaultProject =
      projects.find((p) => p.slug === "project-3") ?? projects[0] ?? null;
    setDashboardProject((prev) => prev ?? defaultProject);
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
    if (workers.length === 0 && loading) return;

    let cancelled = false;

    async function resolveAdminSession() {
      const authSession = await resolveAuthWorkerFromSession();
      if (cancelled) return;

      setHasAuthSession(authSession.hasSession);
      setSessionReady(true);

      if (!authSession.hasSession) {
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

  const adminProfilePhotoUrl = useMemo(() => {
    if (adminWorkerId) {
      const match = workers.find((w) => w.id === adminWorkerId);
      if (match?.photo_url?.trim()) return match.photo_url.trim();
    }
    return null;
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

  const accountsAccessRole = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return normalizeAccountsAccessRole(linked?.accounts_access_role);
  }, [workers, adminWorkerId]);

  const canAccessAccounts = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return linked?.can_access_accounts === true;
  }, [workers, adminWorkerId]);

  const consoleRoute = useMemo(
    () => parseConsoleRoute(pathname, searchParams),
    [pathname, searchParams]
  );
  const activeTab = consoleRoute?.view ?? "dashboard";
  const openAddFromUrl = readConsoleOpenAdd(searchParams);
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

  const routeContext = useMemo(() => parseProjectRoute(pathname), [pathname]);

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

  const handleOpenProfile = () => {
    setShowAddWorker(false);
    setShowAddPlant(false);
    setShowAddAsset(false);
    setShowAddSubcontractor(false);
    setSidebarOpen(false);
    router.push(buildConsoleNavHref("my-profile"));
  };

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

    if (view === "itps") {
      const projectId =
        options?.projectId ?? dashboardProject?.id ?? visibleProjects[0]?.id;
      if (
        projectId &&
        canNavigateToView(sessionRole, view, assignedProjectIds, projectId)
      ) {
        if (options?.projectId) {
          const project = visibleProjects.find((p) => p.id === options.projectId);
          if (project) setDashboardProject(project);
        }
        router.push(getProjectItcPath(projectId));
        setSidebarOpen(false);
        return;
      }
    }

    if (options?.projectId) {
      const project = visibleProjects.find((p) => p.id === options.projectId);
      if (project) setDashboardProject(project);
    }

    const projectId =
      options?.projectId ?? dashboardProject?.id ?? visibleProjects[0]?.id ?? null;

    setSidebarOpen(false);
    router.push(
      buildConsoleNavHref(view, {
        projectId,
        openAdd: options?.openAdd,
      })
    );
  };

  return (
    <div className="flex h-screen overflow-hidden bg-transparent">
      {!sessionReady && (
        <div className="flex min-h-screen w-full items-center justify-center">
          <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
        </div>
      )}
      {sessionReady && (
        <>
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
          activeView={activeTab}
          projects={sidebarProjects}
          assignedProjectIds={assignedProjectIds}
          selectedProjectId={routeContext?.projectId ?? dashboardProject?.id}
          sessionRole={sessionRole}
          accountsAccessRole={accountsAccessRole}
          canAccessAccounts={canAccessAccounts}
          permissionsLoading={loading}
          onNavigate={handleNavigate}
          profileName={adminProfileName}
          profileWorkerId={adminWorkerId}
          onOpenProfile={handleOpenProfile}
        />
      </div>

      <div className="flex min-w-0 flex-1 flex-col">
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab !== "my-profile" && (
            <AppScreenHeader
              profileName={adminProfileName}
              profilePhotoUrl={adminProfilePhotoUrl}
              profileActive={false}
              onOpenProfile={handleOpenProfile}
              className="hidden lg:flex"
            />
          )}

          {activeTab !== "my-profile" && (
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
          )}

          {activeTab === "my-profile" ? (
            <>
              <div className="flex items-center gap-3 border-b border-slate-200 bg-white px-4 py-3 lg:hidden">
                <button
                  type="button"
                  onClick={() => setSidebarOpen(!sidebarOpen)}
                  className="rounded-md p-2 text-slate-600 hover:bg-orange-50 hover:text-orange-600"
                  aria-label="Toggle sidebar"
                >
                  {sidebarOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
                </button>
                <span className="text-sm font-semibold text-slate-900">My Profile</span>
              </div>
              <div className="flex-1 overflow-y-auto">
                <WorkerDashboardView
                  workerId={adminWorkerId}
                  embedded
                  preferAdminProfile
                  sessionRole={sessionRole}
                />
              </div>
            </>
          ) : (
            <div className="flex-1 overflow-y-auto p-6 text-slate-800 lg:p-8">
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
                { id: "itps" as const, label: "ITPs & ITCs", icon: "📋" },
                { id: "swms" as const, label: "SWMS", icon: "📄" },
                { id: "scheduler" as const, label: "Plant Scheduler", icon: "📅" },
              ] as const
            ).map((tab) => (
              <button
                key={tab.id}
                type="button"
                onClick={() => {
                  if (tab.id === "itps") {
                    const projectId = dashboardProject?.id ?? sidebarProjects[0]?.id;
                    if (projectId) {
                      router.push(getProjectItcPath(projectId));
                      return;
                    }
                  }
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

          {activeTab === "itps" && dashboardProject?.id && adminWorkerId && (
            <ItcQualitySystemView
              projectId={dashboardProject.id}
              projectName={dashboardProject.name}
              workerId={adminWorkerId}
              workerName={adminProfileName}
              defaultPanel="batch"
            />
          )}

          {activeTab === "itps" && !dashboardProject?.id && (
            <div className="rounded-xl border border-slate-200 bg-white p-8 text-center text-sm text-slate-500">
              Select a project from the sidebar to open ITPs & ITCs.
            </div>
          )}

          {activeTab === "swms" && (
            <ProjectSwmsPanel
              projectId={dashboardProject?.id ?? null}
              projectName={dashboardProject?.name ?? "Project"}
              workers={workers}
            />
          )}

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
          {activeTab === "org-projects" && canManageOrganisation(sessionRole) && (
            <ProjectsManagementPanel
              workers={workers}
              onProjectsChanged={fetchData}
            />
          )}
          {activeTab === "org-workers" && canManageOrganisation(sessionRole) && (
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
          {activeTab === "org-plant" && canManageOrganisation(sessionRole) && (
            <PlantAdminPanel
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddPlant}
            />
          )}
          {activeTab === "org-assets" && canManageOrganisation(sessionRole) && (
            <AssetAdminPanel
              assets={assets}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddAsset}
            />
          )}
          {activeTab === "org-security" && canManageSecuritySettings(sessionRole) && (
            <SecuritySettingsPanel onUpdated={fetchData} />
          )}
          {isOrganisationView(activeTab) &&
            !canManageOrganisation(sessionRole) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                You do not have access to Organisation settings.
              </div>
            )}
          {activeTab === "org-security" &&
            canManageOrganisation(sessionRole) &&
            !canManageSecuritySettings(sessionRole) && (
              <div className="rounded-xl border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900">
                Security settings are restricted to Owner and Full Access roles.
              </div>
            )}
            </div>
          )}
        </div>
      </div>
        </>
      )}
    </div>
  );
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
      <HomeConsole />
    </Suspense>
  );
}
