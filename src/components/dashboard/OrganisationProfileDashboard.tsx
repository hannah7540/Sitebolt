"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Building2,
  FolderKanban,
  HardHat,
  Loader2,
  Shield,
  Truck,
  Users,
} from "lucide-react";
import type { Asset } from "@/lib/assets";
import type { PlantAsset, Worker } from "@/lib/supabase";
import {
  fetchCompanyInsurances,
  fetchCompanyProfile,
  type CompanyInsurance,
  type CompanyProfile,
} from "@/lib/supabase";
import { filterActiveProjects, getCachedProjects } from "@/lib/project-resolver";
import { getInsuranceExpiryStatus } from "@/lib/insurance-utils";
import { isCompanyEmployeeWorker } from "@/lib/worker-utils";
import DashboardCustomizeToolbar, {
  DashboardWidgetFrame,
} from "./DashboardCustomizeToolbar";
import ExpiringFleetWidget from "./ExpiringFleetWidget";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import { canCustomizeDashboardLayout, type SecurityRole } from "@/lib/security-roles";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface OrganisationProfileDashboardProps {
  workers: Worker[];
  plant: PlantAsset[];
  assets: Asset[];
  loading: boolean;
  userId: string | null;
  sessionRole: SecurityRole;
}

function SummaryCard({
  icon,
  title,
  value,
  subtitle,
  iconClassName,
}: {
  icon: React.ReactNode;
  title: string;
  value: string | number;
  subtitle?: string;
  iconClassName?: string;
}) {
  return (
    <div className={cn("flex items-center gap-4 p-6", cardClass)}>
      <div className={cn("shrink-0", iconClassName)}>{icon}</div>
      <div>
        <p className="text-sm text-slate-500">{title}</p>
        <h2 className="text-2xl font-bold text-slate-900">{value}</h2>
        {subtitle ? <p className="text-xs text-slate-500">{subtitle}</p> : null}
      </div>
    </div>
  );
}

export default function OrganisationProfileDashboard({
  workers,
  plant,
  assets,
  loading,
  userId,
  sessionRole,
}: OrganisationProfileDashboardProps) {
  const canCustomize = canCustomizeDashboardLayout(sessionRole);
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);
  const [companyProfile, setCompanyProfile] = useState<CompanyProfile | null>(null);
  const [insurances, setInsurances] = useState<CompanyInsurance[]>([]);
  const [detailsLoading, setDetailsLoading] = useState(true);

  const layout = useDashboardLayout({
    userId,
    role: sessionRole,
    dashboardType: "organisation",
    canCustomize,
  });

  const loadDetails = useCallback(async () => {
    setDetailsLoading(true);
    const [profile, insuranceRows] = await Promise.all([
      fetchCompanyProfile(),
      fetchCompanyInsurances(),
    ]);
    setCompanyProfile(profile);
    setInsurances(insuranceRows);
    setDetailsLoading(false);
  }, []);

  useEffect(() => {
    void loadDetails();
  }, [loadDetails]);

  const employeeWorkers = useMemo(
    () => workers.filter(isCompanyEmployeeWorker),
    [workers]
  );

  const activeProjects = useMemo(() => filterActiveProjects(getCachedProjects()), []);

  const expiringInsurances = useMemo(
    () =>
      insurances.filter((row) => {
        const { status } = getInsuranceExpiryStatus(row.expiry_date);
        return status === "expires_soon" || status === "expired";
      }).length,
    [insurances]
  );

  const renderWidget = (widgetId: string) => {
    switch (widgetId) {
      case "company_profile":
        return (
          <SummaryCard
            icon={<Building2 className="h-10 w-10 text-orange-500" />}
            title="Company Profile"
            value={companyProfile?.company_name || "Not set"}
            subtitle={
              companyProfile?.abn
                ? `ABN ${companyProfile.abn}`
                : "Add company details in Organisation → Company Information"
            }
          />
        );
      case "workers_summary":
        return (
          <SummaryCard
            icon={<Users className="h-10 w-10 text-orange-500" />}
            title="Workers Overview"
            value={employeeWorkers.length}
            subtitle={`${workers.length} total records in directory`}
          />
        );
      case "plant_summary":
        return (
          <SummaryCard
            icon={<HardHat className="h-10 w-10 text-amber-500" />}
            title="Plant Overview"
            value={plant.length}
            subtitle="Registered organisation plant assets"
          />
        );
      case "assets_summary":
        return (
          <SummaryCard
            icon={<Truck className="h-10 w-10 text-slate-600" />}
            title="Assets Overview"
            value={assets.length}
            subtitle="Site lasers and pressure gauges"
          />
        );
      case "projects_summary":
        return (
          <SummaryCard
            icon={<FolderKanban className="h-10 w-10 text-emerald-500" />}
            title="Projects Overview"
            value={activeProjects.length}
            subtitle="Active projects in the organisation"
          />
        );
      case "insurances_summary":
        return (
          <SummaryCard
            icon={<Shield className="h-10 w-10 text-blue-500" />}
            title="Insurances Overview"
            value={insurances.length}
            subtitle={
              expiringInsurances > 0
                ? `${expiringInsurances} expiring or expired`
                : "Policies on file"
            }
          />
        );
      case "expiring_fleet_documents":
        return <ExpiringFleetWidget />;
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
            Organisation <span className="text-orange-500">Profile Dashboard</span>
          </h1>
          <p className="mt-2 text-sm text-slate-500">
            Organisation-wide overview across company profile, workers, plant, assets, and projects.
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

      {layout.loading || loading || detailsLoading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading dashboard…
        </div>
      ) : (
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
      )}
    </div>
  );
}
