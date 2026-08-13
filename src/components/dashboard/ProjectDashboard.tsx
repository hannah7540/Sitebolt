"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Users,
  HardHat,
  AlertTriangle,
  CheckCircle,
  Loader2,
} from "lucide-react";
import type { PlantAsset, PlantPrestart, Worker } from "@/lib/supabase";
import {
  fetchPlantPrestarts,
  fetchSiteForms,
} from "@/lib/supabase";
import type { SiteFormSubmission, SiteFormType } from "@/lib/site-forms";
import { fetchProjectLeaveRequests } from "@/lib/leave-requests";
import { subscribeLeaveRequestsUpdated } from "@/lib/leave-events";
import { localIsoDate } from "@/lib/timesheet-utils";
import { hasSafetyWalkOpenHazards, isSiteFormViewed } from "@/lib/dashboard-form-utils";
import { resolveProjectScopeValues } from "@/lib/project-scope";
import {
  filterPlantForProject,
  filterWorkersForProject,
  loadAssignmentMaps,
} from "@/lib/project-assignments";
import { fetchProjects } from "@/lib/project-resolver";
import ProjectLeaveRequestsWidget from "./ProjectLeaveRequestsWidget";
import ProjectLeaveRequestsModal from "./ProjectLeaveRequestsModal";
import ProjectPendingRequestsWidget from "./ProjectPendingRequestsWidget";
import ProjectDailyPrestartsWidget from "./ProjectDailyPrestartsWidget";
import ProjectDailyPrestartsModal from "./ProjectDailyPrestartsModal";
import ProjectToolboxTalksWidget from "./ProjectToolboxTalksWidget";
import ProjectToolboxTalksModal from "./ProjectToolboxTalksModal";
import ProjectPlantPrestartsWidget from "./ProjectPlantPrestartsWidget";
import ProjectPlantPrestartsModal from "./ProjectPlantPrestartsModal";
import ProjectSafetyWalksWidget from "./ProjectSafetyWalksWidget";
import ProjectSafetyWalksModal from "./ProjectSafetyWalksModal";
import ProjectClickableStatCard from "./ProjectClickableStatCard";
import ProjectActiveWorkersModal from "./ProjectActiveWorkersModal";
import ProjectPlantAssetsModal from "./ProjectPlantAssetsModal";
import SiteFormsListModal from "./SiteFormsListModal";
import SiteFormDetailRouter from "./SiteFormDetailRouter";
import PlantPrestartDetailModal from "./PlantPrestartDetailModal";
import DashboardCustomizeToolbar, {
  DashboardWidgetFrame,
} from "./DashboardCustomizeToolbar";
import ProjectPersonnelCard from "./ProjectPersonnelCard";
import ProjectFormModal from "@/components/organisation/ProjectFormModal";
import type { DbProject } from "@/lib/project-resolver";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { canCustomizeDashboardLayout, type SecurityRole } from "@/lib/security-roles";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";
import { resolvePlantAssignedProjectId } from "@/lib/project-assignments";

interface ProjectDashboardProps {
  projectId: string | null;
  project: DbProject | null;
  projectName: string;
  workers: Worker[];
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
  onProjectUpdated?: (project: DbProject) => void;
  userId: string | null;
  sessionRole: SecurityRole;
}

type SiteFormListType = SiteFormType | "all";

export default function ProjectDashboard({
  projectId,
  project,
  projectName,
  workers,
  plant,
  loading,
  onRefresh,
  onProjectUpdated,
  userId,
  sessionRole,
}: ProjectDashboardProps) {
  const canCustomize = canCustomizeDashboardLayout(sessionRole);
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);
  const [showPersonnelEdit, setShowPersonnelEdit] = useState(false);
  const layout = useDashboardLayout({
    userId,
    role: sessionRole,
    dashboardType: "project",
    projectId,
    canCustomize,
  });

  const [leaveRequests, setLeaveRequests] = useState<
    Awaited<ReturnType<typeof fetchProjectLeaveRequests>>
  >([]);
  const [siteForms, setSiteForms] = useState<SiteFormSubmission[]>([]);
  const [plantPrestarts, setPlantPrestarts] = useState<PlantPrestart[]>([]);
  const [leaveLoading, setLeaveLoading] = useState(true);
  const [siteFormsLoading, setSiteFormsLoading] = useState(true);
  const [plantPrestartsLoading, setPlantPrestartsLoading] = useState(true);
  const [siteFormsListType, setSiteFormsListType] = useState<SiteFormListType | null>(
    null
  );
  const [showPlantPrestartsList, setShowPlantPrestartsList] = useState(false);
  const [showLeaveRequestsModal, setShowLeaveRequestsModal] = useState(false);
  const [showSafetyWalksModal, setShowSafetyWalksModal] = useState(false);
  const [showActiveWorkersModal, setShowActiveWorkersModal] = useState(false);
  const [showPlantAssetsModal, setShowPlantAssetsModal] = useState(false);
  const [showDailyPrestartsModal, setShowDailyPrestartsModal] = useState(false);
  const [showToolboxTalksModal, setShowToolboxTalksModal] = useState(false);
  const [workerProjectMap, setWorkerProjectMap] = useState<Map<string, string[]>>(
    () => new Map()
  );
  const [plantProjectMap, setPlantProjectMap] = useState<Map<string, string[]>>(
    () => new Map()
  );
  const [assignmentsLoading, setAssignmentsLoading] = useState(true);
  const [selectedSiteForm, setSelectedSiteForm] = useState<SiteFormSubmission | null>(
    null
  );
  const [selectedPlantPrestart, setSelectedPlantPrestart] =
    useState<PlantPrestart | null>(null);

  const loadLeave = useCallback(async () => {
    setLeaveLoading(true);
    if (!projectId) {
      setLeaveRequests([]);
      setLeaveLoading(false);
      return;
    }
    const data = await fetchProjectLeaveRequests(projectId);
    setLeaveRequests(data);
    setLeaveLoading(false);
  }, [projectId]);

  const loadSiteForms = useCallback(async () => {
    if (!projectId) {
      setSiteForms([]);
      setSiteFormsLoading(false);
      return;
    }
    setSiteFormsLoading(true);
    const data = await fetchSiteForms({ projectId, limit: 100 });
    setSiteForms(data);
    setSiteFormsLoading(false);
  }, [projectId]);

  const loadPlantPrestarts = useCallback(async () => {
    if (!projectId) {
      setPlantPrestarts([]);
      setPlantPrestartsLoading(false);
      return;
    }
    setPlantPrestartsLoading(true);
    const scopeValues = await resolveProjectScopeValues(projectId);
    const projectPlantIds = plant
      .filter((asset) => {
        const assetProjectId = resolvePlantAssignedProjectId(asset);
        if (!assetProjectId) return false;
        return scopeValues.includes(assetProjectId);
      })
      .map((asset) => asset.id);

    const data = await fetchPlantPrestarts({
      projectId,
      plantIds: projectPlantIds,
      limit: 100,
    });
    setPlantPrestarts(data);
    setPlantPrestartsLoading(false);
  }, [projectId, plant]);

  useEffect(() => {
    loadLeave();
  }, [loadLeave]);

  useEffect(() => {
    return subscribeLeaveRequestsUpdated(() => {
      void loadLeave();
    });
  }, [loadLeave]);

  useEffect(() => {
    loadSiteForms();
  }, [loadSiteForms]);

  useEffect(() => {
    loadPlantPrestarts();
  }, [loadPlantPrestarts]);

  const loadAssignments = useCallback(async () => {
    setAssignmentsLoading(true);
    await fetchProjects();
    const { workerByProject, plantByProject } = await loadAssignmentMaps();
    setWorkerProjectMap(workerByProject);
    setPlantProjectMap(plantByProject);
    setAssignmentsLoading(false);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, workers.length, plant.length, projectId]);

  const projectWorkers = useMemo(() => {
    if (!projectId) return [];
    return filterWorkersForProject(workers, projectId, workerProjectMap);
  }, [workers, projectId, workerProjectMap]);

  const projectPlant = useMemo(() => {
    if (!projectId) return [];
    return filterPlantForProject(plant, projectId, plantProjectMap);
  }, [plant, projectId, plantProjectMap]);

  const todayIso = localIsoDate();

  const todayDailyPrestarts = useMemo(() => {
    return siteForms.filter(
      (form) => form.form_type === "daily_prestart" && form.form_date === todayIso
    ).length;
  }, [siteForms, todayIso]);

  const todayUnviewedDailyPrestarts = useMemo(() => {
    return siteForms.filter(
      (form) =>
        form.form_type === "daily_prestart" &&
        form.form_date === todayIso &&
        !isSiteFormViewed(form)
    ).length;
  }, [siteForms, todayIso]);

  const hazardCount = useMemo(
    () =>
      siteForms.filter((form) => {
        if (form.form_type === "safety_walk") {
          return hasSafetyWalkOpenHazards(form);
        }
        const data = form.form_data;
        const significant = data.significant_hazards;
        if (Array.isArray(significant)) {
          const meaningful = significant.filter((item) => item !== "None");
          if (meaningful.length > 0) return true;
        }
        if (data.hazards_to_report === "yes") return true;
        const relatedSwms = data.related_swms;
        if (Array.isArray(relatedSwms) && relatedSwms.length > 0) return true;
        return false;
      }).length,
    [siteForms]
  );

  const handleLeaveUpdated = () => {
    loadLeave();
    onRefresh();
  };

  const handleSiteFormSelect = (form: SiteFormSubmission) => {
    setSiteFormsListType(null);
    setShowSafetyWalksModal(false);
    setShowDailyPrestartsModal(false);
    setShowToolboxTalksModal(false);
    setSelectedSiteForm(form);
  };

  const handlePlantPrestartSelect = (prestart: PlantPrestart) => {
    setShowPlantPrestartsList(false);
    setSelectedPlantPrestart(prestart);
  };

  const siteFormListTitle =
    siteFormsListType && siteFormsListType !== "all"
      ? ({
          daily_prestart: "Daily Pre-Starts",
          toolbox_talk: "Toolbox Talks",
          safety_walk: "Safety Walks",
        }[siteFormsListType] ?? "Site Forms")
      : "Site Forms & Safety";

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "stats_workers":
        return (
          <ProjectClickableStatCard
            icon={Users}
            label="Active Workers"
            value={assignmentsLoading ? "—" : projectWorkers.length}
            subtitle="Assigned to this project"
            onClick={() => setShowActiveWorkersModal(true)}
          />
        );
      case "stats_plant":
        return (
          <ProjectClickableStatCard
            icon={HardHat}
            iconClassName="text-amber-500"
            label="Plant Assets"
            value={assignmentsLoading ? "—" : projectPlant.length}
            subtitle="Equipment on site"
            onClick={() => setShowPlantAssetsModal(true)}
          />
        );
      case "stats_prestarts":
        return (
          <ProjectClickableStatCard
            icon={CheckCircle}
            iconClassName="text-emerald-500"
            label="Today's Pre-Starts"
            value={todayDailyPrestarts}
            subtitle={
              todayUnviewedDailyPrestarts > 0
                ? `${todayUnviewedDailyPrestarts} unviewed meeting${todayUnviewedDailyPrestarts === 1 ? "" : "s"} today`
                : "Daily pre-start meetings only"
            }
            onClick={() => setShowDailyPrestartsModal(true)}
          />
        );
      case "stats_hazards":
        return (
          <div className={cn("flex items-center gap-4 p-6", cardClass)}>
            <AlertTriangle className="h-10 w-10 text-red-500" />
            <div>
              <p className="text-sm text-slate-500">Forms With Hazards / Follow-up</p>
              <h2 className="text-2xl font-bold text-slate-900">{hazardCount}</h2>
            </div>
          </div>
        );
      case "leave_requests":
        return (
          <ProjectLeaveRequestsWidget
            leaveRequests={leaveRequests}
            workers={workers}
            projectId={projectId}
            loading={leaveLoading || loading}
            onUpdated={handleLeaveUpdated}
            onOpenAll={() => setShowLeaveRequestsModal(true)}
          />
        );
      case "pending_requests":
        return (
          <ProjectPendingRequestsWidget
            projectId={projectId}
            loading={loading}
          />
        );
      case "daily_prestarts":
        return (
          <ProjectDailyPrestartsWidget
            forms={siteForms}
            workers={workers}
            loading={siteFormsLoading || loading}
            onOpenList={() => setShowDailyPrestartsModal(true)}
            onSelectForm={handleSiteFormSelect}
            onViewed={() => void loadSiteForms()}
          />
        );
      case "toolbox_talks":
        return (
          <ProjectToolboxTalksWidget
            forms={siteForms}
            workers={workers}
            loading={siteFormsLoading || loading}
            onOpenList={() => setShowToolboxTalksModal(true)}
            onSelectForm={handleSiteFormSelect}
            onViewed={() => void loadSiteForms()}
          />
        );
      case "plant_prestarts":
        return (
          <ProjectPlantPrestartsWidget
            prestarts={plantPrestarts}
            plant={plant}
            workers={workers}
            loading={plantPrestartsLoading || loading}
            onOpenList={() => setShowPlantPrestartsList(true)}
            onSelectPrestart={handlePlantPrestartSelect}
          />
        );
      case "safety_walks":
        return (
          <ProjectSafetyWalksWidget
            forms={siteForms}
            workers={workers}
            loading={siteFormsLoading || loading}
            onOpenList={() => setShowSafetyWalksModal(true)}
            onSelectForm={handleSiteFormSelect}
            onViewed={() => void loadSiteForms()}
          />
        );
      default:
        return null;
    }
  };

  const widgetsToRender = layout.editMode ? layout.orderedWidgets : layout.visibleWidgets;
  const hiddenWidgetIds = layout.hiddenWidgets.map((widget) => widget.id);

  return (
    <div>
      <div className="mb-2 flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="text-3xl font-bold text-slate-900">
            {projectName} <span className="text-orange-500">Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Live project submissions from Supabase · {workers.length} workers ·{" "}
            {plant.length} plant assets
          </p>
        </div>
        <div className="flex flex-wrap items-start justify-end gap-3">
          <ProjectPersonnelCard
            project={project}
            workers={workers}
            onEditPersonnel={() => setShowPersonnelEdit(true)}
          />
          {canCustomize ? (
            <DashboardCustomizeToolbar
              editMode={layout.editMode}
              saving={layout.saving}
              message={layout.message}
              hiddenWidgetIds={hiddenWidgetIds}
              showHiddenDrawer={showHiddenDrawer}
              onToggleEditMode={layout.toggleEditMode}
              onSaveLayout={() => void layout.saveLayout()}
              onResetToDefault={() => void layout.resetToDefault()}
              onToggleHiddenDrawer={() => setShowHiddenDrawer((open) => !open)}
              onRestoreWidget={layout.restoreHiddenWidget}
            />
          ) : null}
        </div>
      </div>

      {layout.loading ? (
        <div className="mb-6 flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading layout…
        </div>
      ) : null}

      <div className="grid grid-cols-1 gap-6 md:grid-cols-2 xl:grid-cols-3">
        {widgetsToRender.map((widget) => (
          <DashboardWidgetFrame
            key={widget.id}
            widgetId={widget.id}
            editMode={layout.editMode}
            isVisible={widget.isVisible}
            canMoveUp={layout.canMoveUp(widget.id)}
            canMoveDown={layout.canMoveDown(widget.id)}
            onMoveUp={() => layout.moveWidgetUp(widget.id)}
            onMoveDown={() => layout.moveWidgetDown(widget.id)}
            onToggleVisibility={(visible) =>
              layout.toggleWidgetVisibility(widget.id, visible)
            }
          >
            {renderWidget(widget.id)}
          </DashboardWidgetFrame>
        ))}
      </div>

      {siteFormsListType &&
      siteFormsListType !== "safety_walk" &&
      siteFormsListType !== "daily_prestart" &&
      siteFormsListType !== "toolbox_talk" ? (
        <SiteFormsListModal
          forms={siteForms}
          projectName={projectName}
          formType={siteFormsListType === "all" ? undefined : siteFormsListType}
          title={siteFormListTitle}
          onClose={() => setSiteFormsListType(null)}
          onSelectForm={handleSiteFormSelect}
        />
      ) : null}

      {showActiveWorkersModal ? (
        <ProjectActiveWorkersModal
          workers={projectWorkers}
          siteForms={siteForms}
          leaveRequests={leaveRequests}
          projectName={projectName}
          onClose={() => setShowActiveWorkersModal(false)}
        />
      ) : null}

      {showPlantAssetsModal ? (
        <ProjectPlantAssetsModal
          plant={projectPlant}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowPlantAssetsModal(false)}
        />
      ) : null}

      {showDailyPrestartsModal ? (
        <ProjectDailyPrestartsModal
          forms={siteForms}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowDailyPrestartsModal(false)}
          onSelectForm={handleSiteFormSelect}
        />
      ) : null}

      {showToolboxTalksModal ? (
        <ProjectToolboxTalksModal
          forms={siteForms}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowToolboxTalksModal(false)}
          onSelectForm={handleSiteFormSelect}
        />
      ) : null}

      {showSafetyWalksModal ? (
        <ProjectSafetyWalksModal
          forms={siteForms}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowSafetyWalksModal(false)}
          onSelectForm={handleSiteFormSelect}
        />
      ) : null}

      {showPlantPrestartsList ? (
        <ProjectPlantPrestartsModal
          prestarts={plantPrestarts}
          plant={plant}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowPlantPrestartsList(false)}
          onSelectPrestart={handlePlantPrestartSelect}
        />
      ) : null}

      {selectedSiteForm && (
        <SiteFormDetailRouter
          form={selectedSiteForm}
          workers={workers}
          onClose={() => setSelectedSiteForm(null)}
        />
      )}

      {selectedPlantPrestart && (
        <PlantPrestartDetailModal
          prestart={selectedPlantPrestart}
          plant={plant}
          onClose={() => setSelectedPlantPrestart(null)}
        />
      )}

      {showPersonnelEdit && project ? (
        <ProjectFormModal
          workers={workers}
          project={project}
          onClose={() => setShowPersonnelEdit(false)}
          onSaved={(saved) => {
            setShowPersonnelEdit(false);
            if (saved) onProjectUpdated?.(saved);
            onRefresh();
          }}
        />
      ) : null}

      {showLeaveRequestsModal ? (
        <ProjectLeaveRequestsModal
          leaveRequests={leaveRequests}
          workers={workers}
          projectName={projectName}
          onClose={() => setShowLeaveRequestsModal(false)}
          onUpdated={handleLeaveUpdated}
        />
      ) : null}
    </div>
  );
}
