"use client";

import { useState, useEffect, useCallback, useMemo } from "react";
import { useRouter } from "next/navigation";
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
import { getProjectItpsItcsPath } from "@/lib/project-nav-routes";
import {
  DEFAULT_ADMIN_PROFILE_NAME,
  getAdminWorkerId,
  resolveAdminWorkerFromList,
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
import ComplianceNotificationsPanel from "@/components/administration/ComplianceNotificationsPanel";
import AdminReportingTab from "@/components/administration/AdminReportingTab";
import {
  canViewFinancialFields,
  normalizeSecurityRole,
  normalizeAccountsAccessRole,
  canAccessAdminConsole,
} from "@/lib/security-roles";
import {
  Menu,
  X,
  Loader2,
} from "lucide-react";
import { cn } from "@/lib/utils";
import AppScreenHeader from "@/components/layout/AppScreenHeader";
import CompanyLogo from "@/components/ui/CompanyLogo";

export default function Home() {
  const router = useRouter();
  const [sidebarOpen, setSidebarOpen] = useState(false);
  const [activeTab, setActiveTab] = useState<ActiveView>("dashboard");
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
    if (workers.length === 0) {
      setAdminWorkerIdState(getAdminWorkerId());
      return;
    }
    const resolved =
      resolveAdminWorkerFromList(workers) ?? workers[0]?.id ?? null;
    if (resolved) {
      setAdminWorkerId(resolved);
      setAdminWorkerIdState(resolved);
    } else {
      setAdminWorkerIdState(getAdminWorkerId());
    }
  }, [workers]);

  const adminProfileName = useMemo(() => {
    if (adminWorkerId) {
      const match = workers.find((w) => w.id === adminWorkerId);
      if (match) return getWorkerDisplayName(match);
    }
    return DEFAULT_ADMIN_PROFILE_NAME;
  }, [adminWorkerId, workers]);

  const sessionRole = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return normalizeSecurityRole(linked?.security_role ?? "full_access");
  }, [workers, adminWorkerId]);

  const accountsAccessRole = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return normalizeAccountsAccessRole(linked?.accounts_access_role);
  }, [workers, adminWorkerId]);

  const canAccessAccounts = useMemo(() => {
    const linked = workers.find((w) => w.id === adminWorkerId);
    return linked?.can_access_accounts === true;
  }, [workers, adminWorkerId]);

  const hideFinancialFields = !canViewFinancialFields(sessionRole);

  useEffect(() => {
    if (!adminWorkerId || workers.length === 0) return;
    const linked = workers.find((w) => w.id === adminWorkerId);
    const role = normalizeSecurityRole(linked?.security_role ?? "full_access");
    if (!canAccessAdminConsole(role)) {
      router.replace(`/worker-dashboard?worker_id=${adminWorkerId}`);
    }
  }, [adminWorkerId, workers, router]);

  const handleOpenProfile = () => {
    setActiveTab("my-profile");
    setShowAddWorker(false);
    setShowAddPlant(false);
    setShowAddAsset(false);
    setShowAddSubcontractor(false);
    setSidebarOpen(false);
  };

  const handleNavigate = (
    view: ActiveView,
    options?: { openAdd?: boolean; projectId?: string }
  ) => {
    if (view === "itps") {
      const projectId =
        options?.projectId ?? dashboardProject?.id ?? sidebarProjects[0]?.id;
      if (projectId) {
        if (options?.projectId) {
          const project = sidebarProjects.find((p) => p.id === options.projectId);
          if (project) setDashboardProject(project);
        }
        router.push(getProjectItpsItcsPath(projectId));
        setSidebarOpen(false);
        return;
      }
    }

    if (options?.projectId) {
      const project = sidebarProjects.find((p) => p.id === options.projectId);
      if (project) setDashboardProject(project);
    }
    setActiveTab(view);
    setShowAddWorker(view === "org-workers" && (options?.openAdd ?? false));
    setShowAddPlant(view === "org-plant" && (options?.openAdd ?? false));
    setShowAddAsset(view === "org-assets" && (options?.openAdd ?? false));
    setShowAddSubcontractor(
      view === "subcontractors" && (options?.openAdd ?? false)
    );
    setSidebarOpen(false);
  };

  return (
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
          activeView={activeTab}
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
        <div className="flex min-h-0 flex-1 flex-col overflow-hidden">
          {activeTab !== "my-profile" && (
            <AppScreenHeader
              profileName={adminProfileName}
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
                      router.push(getProjectItpsItcsPath(projectId));
                      return;
                    }
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
              projectName={dashboardProject?.name ?? "Project"}
              workers={workers}
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
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

          {activeTab === "itps" && dashboardProject?.id && (
            <ItcQualitySystemView
              projectId={dashboardProject.id}
              projectName={dashboardProject.name}
              workerId={adminWorkerId ?? "local-worker"}
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
            <SwmsManagementPanel workers={workers} projects={sidebarProjects} />
          )}

          {activeTab === "admin-document-pack" && (
            <DocumentPackView
              projects={sidebarProjects}
              workers={workers}
              plant={plant}
              exportedBy={adminProfileName}
            />
          )}

          {activeTab === "admin-compliance" && (
            <ComplianceNotificationsPanel onNavigate={handleNavigate} />
          )}

          {activeTab === "admin-reporting" && (
            <AdminReportingTab
              projects={sidebarProjects}
              actionedById={adminWorkerId}
              actionedByName={adminProfileName}
            />
          )}

          {activeTab === "org-dashboard" && (
            <OrganisationProfileDashboard
              workers={workers}
              plant={plant}
              assets={assets}
              loading={loading}
              userId={adminWorkerId}
              sessionRole={sessionRole}
            />
          )}
          {activeTab === "org-company" && <CompanyInformationPanel />}
          {activeTab === "org-insurances" && <InsurancesPanel />}
          {activeTab === "org-projects" && (
            <ProjectsManagementPanel
              workers={workers}
              onProjectsChanged={fetchData}
            />
          )}
          {activeTab === "org-workers" && (
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
            />
          )}
          {activeTab === "org-plant" && (
            <PlantAdminPanel
              plant={plant}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddPlant}
            />
          )}
          {activeTab === "org-assets" && (
            <AssetAdminPanel
              assets={assets}
              loading={loading}
              onRefresh={fetchData}
              initialShowAdd={showAddAsset}
            />
          )}
          {activeTab === "org-security" && (
            <SecuritySettingsPanel onUpdated={fetchData} />
          )}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
