import type { SecurityRole } from "./security-roles";

export type DashboardType = "organisation" | "project" | "my_profile";

export interface DashboardWidgetConfig {
  id: string;
  position: number;
  isVisible: boolean;
}

export interface DashboardLayoutRecord {
  id?: string;
  user_id: string;
  role: SecurityRole | string;
  dashboard_type: DashboardType;
  project_id: string | null;
  widget_order: DashboardWidgetConfig[];
}

export const PROJECT_DASHBOARD_DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: "stats_workers", position: 0, isVisible: true },
  { id: "stats_plant", position: 1, isVisible: true },
  { id: "stats_prestarts", position: 2, isVisible: true },
  { id: "stats_hazards", position: 3, isVisible: true },
  { id: "leave_requests", position: 4, isVisible: true },
  { id: "pending_requests", position: 5, isVisible: true },
  { id: "daily_prestarts", position: 6, isVisible: true },
  { id: "toolbox_talks", position: 7, isVisible: true },
  { id: "plant_prestarts", position: 8, isVisible: true },
  { id: "safety_walks", position: 9, isVisible: true },
];

export const ORGANISATION_DASHBOARD_DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: "company_profile", position: 0, isVisible: true },
  { id: "workers_summary", position: 1, isVisible: true },
  { id: "plant_summary", position: 2, isVisible: true },
  { id: "assets_summary", position: 3, isVisible: true },
  { id: "projects_summary", position: 4, isVisible: true },
  { id: "insurances_summary", position: 5, isVisible: true },
  { id: "expiring_fleet_documents", position: 6, isVisible: true },
];

export const MY_PROFILE_DASHBOARD_DEFAULT_WIDGETS: DashboardWidgetConfig[] = [
  { id: "assigned_projects", position: 0, isVisible: true },
  { id: "swms", position: 1, isVisible: true },
  { id: "details", position: 2, isVisible: true },
  { id: "forms_hub", position: 3, isVisible: true },
  { id: "timesheets", position: 4, isVisible: true },
  { id: "inductions", position: 5, isVisible: true },
  { id: "itcs", position: 6, isVisible: true },
];

export const DASHBOARD_WIDGET_LABELS: Record<string, string> = {
  stats_workers: "Active Workers",
  stats_plant: "Plant Assets",
  stats_prestarts: "Today's Pre-Starts",
  stats_hazards: "Forms With Hazards",
  leave_requests: "Leave Requests",
  pending_requests: "Pending Requests",
  daily_prestarts: "Daily Pre-Starts",
  toolbox_talks: "Toolbox Talks",
  plant_prestarts: "Plant Pre-Starts",
  safety_walks: "Safety Walks",
  company_profile: "Company Profile",
  workers_summary: "Workers Overview",
  plant_summary: "Plant Overview",
  assets_summary: "Assets Overview",
  projects_summary: "Projects Overview",
  insurances_summary: "Insurances Overview",
  expiring_fleet_documents: "Expiring Fleet Documents",
  assigned_projects: "My Assigned Projects",
  swms: "SWMS Sign-On",
  details: "My Details & Compliance",
  forms_hub: "Forms & Safety Submissions",
  inductions: "Inductions / Tickets",
  prestart: "Daily Pre-Start Meeting",
  leave: "Leave Requests",
  toolbox: "Toolbox Talk",
  safety_walk: "Safety Walk",
  timesheets: "My Timesheets",
  itcs: "ITC's",
};

export function getDefaultWidgets(dashboardType: DashboardType): DashboardWidgetConfig[] {
  const source =
    dashboardType === "organisation"
      ? ORGANISATION_DASHBOARD_DEFAULT_WIDGETS
      : dashboardType === "my_profile"
        ? MY_PROFILE_DASHBOARD_DEFAULT_WIDGETS
        : PROJECT_DASHBOARD_DEFAULT_WIDGETS;
  return source.map((widget, index) => ({ ...widget, position: index }));
}

export function normalizeWidgetOrder(
  saved: DashboardWidgetConfig[] | null | undefined,
  defaults: DashboardWidgetConfig[]
): DashboardWidgetConfig[] {
  if (!saved || saved.length === 0) {
    return defaults.map((widget, index) => ({ ...widget, position: index }));
  }

  const defaultIds = new Set(defaults.map((widget) => widget.id));
  const defaultById = new Map(defaults.map((widget) => [widget.id, widget]));
  const merged = new Map<string, DashboardWidgetConfig>();

  for (const widget of saved) {
    if (defaultIds.has(widget.id)) {
      merged.set(widget.id, {
        id: widget.id,
        position: widget.position,
        isVisible: widget.isVisible,
      });
    }
  }

  let maxPosition = -1;
  for (const widget of merged.values()) {
    maxPosition = Math.max(maxPosition, widget.position);
  }

  for (const widget of defaults) {
    if (!merged.has(widget.id)) {
      maxPosition += 1;
      merged.set(widget.id, {
        id: widget.id,
        position: maxPosition,
        isVisible: defaultById.get(widget.id)?.isVisible ?? true,
      });
    }
  }

  return [...merged.values()]
    .sort((a, b) => a.position - b.position)
    .map((widget, index) => ({
      ...widget,
      position: index,
    }));
}

export function getVisibleWidgets(widgets: DashboardWidgetConfig[]): DashboardWidgetConfig[] {
  return [...widgets]
    .filter((widget) => widget.isVisible)
    .sort((a, b) => a.position - b.position);
}

export function getHiddenWidgets(widgets: DashboardWidgetConfig[]): DashboardWidgetConfig[] {
  return [...widgets]
    .filter((widget) => !widget.isVisible)
    .sort((a, b) => a.position - b.position);
}

export function moveWidget(
  widgets: DashboardWidgetConfig[],
  widgetId: string,
  direction: "up" | "down"
): DashboardWidgetConfig[] {
  const sorted = [...widgets].sort((a, b) => a.position - b.position);
  const index = sorted.findIndex((widget) => widget.id === widgetId);
  if (index < 0) return widgets;

  const targetIndex = direction === "up" ? index - 1 : index + 1;
  if (targetIndex < 0 || targetIndex >= sorted.length) return widgets;

  const next = sorted.map((widget) => ({ ...widget }));
  [next[index], next[targetIndex]] = [next[targetIndex]!, next[index]!];
  return next.map((widget, position) => ({ ...widget, position }));
}

export function setWidgetVisibility(
  widgets: DashboardWidgetConfig[],
  widgetId: string,
  isVisible: boolean
): DashboardWidgetConfig[] {
  return widgets.map((widget) =>
    widget.id === widgetId ? { ...widget, isVisible } : widget
  );
}
