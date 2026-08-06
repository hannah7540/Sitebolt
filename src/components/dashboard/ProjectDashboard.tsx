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
import { countSafetyWalkOpenHazards } from "@/lib/dashboard-form-utils";
import { resolveProjectScopeValues } from "@/lib/project-scope";
import ProjectLeaveRequestsWidget from "./ProjectLeaveRequestsWidget";
import ProjectPendingRequestsWidget from "./ProjectPendingRequestsWidget";
import ProjectDailyPrestartsWidget from "./ProjectDailyPrestartsWidget";
import ProjectToolboxTalksWidget from "./ProjectToolboxTalksWidget";
import ProjectPlantPrestartsWidget from "./ProjectPlantPrestartsWidget";
import ProjectSafetyWalksWidget from "./ProjectSafetyWalksWidget";
import SiteFormsListModal from "./SiteFormsListModal";
import SiteFormDetailModal from "./SiteFormDetailModal";
import PlantPrestartsListModal from "./PlantPrestartsListModal";
import PlantPrestartDetailModal from "./PlantPrestartDetailModal";
import DashboardCustomizeToolbar, {
  DashboardWidgetFrame,
} from "./DashboardCustomizeToolbar";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { canCustomizeDashboardLayout, type SecurityRole } from "@/lib/security-roles";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";
import { resolvePlantAssignedProjectId } from "@/lib/project-assignments";

interface ProjectDashboardProps {
  projectId: string | null;
  projectName: string;
  workers: Worker[];
  plant: PlantAsset[];
  loading: boolean;
  onRefresh: () => void;
  userId: string | null;
  sessionRole: SecurityRole;
}

type SiteFormListType = SiteFormType | "all";

export default function ProjectDashboard({
  projectId,
  projectName,
  workers,
  plant,
  loading,
  onRefresh,
  userId,
  sessionRole,
}: ProjectDashboardProps) {
  const canCustomize = canCustomizeDashboardLayout(sessionRole);
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);
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

  const todayDailyPrestarts = useMemo(() => {
    const today = localIsoDate();
    return siteForms.filter(
      (form) => form.form_type === "daily_prestart" && form.form_date === today
    ).length;
  }, [siteForms]);

  const todayPlantPrestarts = useMemo(() => {
    const today = localIsoDate();
    return plantPrestarts.filter((prestart) =>
      prestart.created_at.startsWith(today)
    ).length;
  }, [plantPrestarts]);

  const hazardCount = useMemo(
    () =>
      siteForms.filter((form) => {
        if (form.form_type === "safety_walk") {
          return countSafetyWalkOpenHazards(form) > 0;
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
          <div className={cn("flex items-center gap-4 p-6", cardClass)}>
            <Users className="h-10 w-10 text-orange-500" />
            <div>
              <p className="text-sm text-slate-500">Active Workers</p>
              <h2 className="text-2xl font-bold text-slate-900">{workers.length}</h2>
            </div>
          </div>
        );
      case "stats_plant":
        return (
          <div className={cn("flex items-center gap-4 p-6", cardClass)}>
            <HardHat className="h-10 w-10 text-amber-500" />
            <div>
              <p className="text-sm text-slate-500">Plant Assets</p>
              <h2 className="text-2xl font-bold text-slate-900">{plant.length}</h2>
            </div>
          </div>
        );
      case "stats_prestarts":
        return (
          <div className={cn("flex items-center gap-4 p-6", cardClass)}>
            <CheckCircle className="h-10 w-10 text-emerald-500" />
            <div>
              <p className="text-sm text-slate-500">Today&apos;s Pre-Starts</p>
              <h2 className="text-2xl font-bold text-slate-900">
                {todayDailyPrestarts + todayPlantPrestarts}
              </h2>
              <p className="text-xs text-slate-500">
                {todayDailyPrestarts} meeting · {todayPlantPrestarts} plant
              </p>
            </div>
          </div>
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
            onOpenList={() => setSiteFormsListType("daily_prestart")}
            onSelectForm={handleSiteFormSelect}
          />
        );
      case "toolbox_talks":
        return (
          <ProjectToolboxTalksWidget
            forms={siteForms}
            workers={workers}
            loading={siteFormsLoading || loading}
            onOpenList={() => setSiteFormsListType("toolbox_talk")}
            onSelectForm={handleSiteFormSelect}
          />
        );
      case "plant_prestarts":
        return (
          <ProjectPlantPrestartsWidget
            prestarts={plantPrestarts}
            plant={plant}
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
            onOpenList={() => setSiteFormsListType("safety_walk")}
            onSelectForm={handleSiteFormSelect}
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

      {siteFormsListType && (
        <SiteFormsListModal
          forms={siteForms}
          projectName={projectName}
          formType={siteFormsListType === "all" ? undefined : siteFormsListType}
          title={siteFormListTitle}
          onClose={() => setSiteFormsListType(null)}
          onSelectForm={handleSiteFormSelect}
        />
      )}

      {showPlantPrestartsList && (
        <PlantPrestartsListModal
          prestarts={plantPrestarts}
          plant={plant}
          projectName={projectName}
          onClose={() => setShowPlantPrestartsList(false)}
          onSelectPrestart={handlePlantPrestartSelect}
        />
      )}

      {selectedSiteForm && (
        <SiteFormDetailModal
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
    </div>
  );
}
