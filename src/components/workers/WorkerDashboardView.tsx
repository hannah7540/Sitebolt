"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import {
  Loader2,
  User,
  Camera,
  ClipboardCheck,
  ClipboardList,
  ChevronRight,
  LayoutDashboard,
  Clock,
  MapPin,
} from "lucide-react";
import type { Worker, WorkerScheduleEntry, WorkerVoc, WorkerTimesheet, LeaveRequest } from "@/lib/supabase";
import {
  fetchWorkerById,
  fetchLeaveRequests,
  fetchWorkerSchedules,
  fetchWorkerTimesheets,
  fetchWorkerVocs,
  getWorkerAssignedProjectIds,
  isSupabaseConfigured,
  supabase,
} from "@/lib/supabase";
import {
  DATABASE_CONNECTION_ERROR_MESSAGE,
  fetchProjects,
  isNetworkFetchError,
  type DbProject,
} from "@/lib/project-resolver";
import { getProjectName } from "@/lib/projects";
import {
  getTicketBadgeLabel,
  getWorkerTicketStatus,
} from "@/lib/worker-compliance";
import WorkerMyDetailsPanel from "./WorkerMyDetailsPanel";
import WorkerTimesheetsWidget from "./WorkerTimesheetsWidget";
import WorkerTimesheetModal from "./WorkerTimesheetModal";
import WorkerTimesheetHistoryDrawer from "./WorkerTimesheetHistoryDrawer";
import WorkerLeaveSubmitModal from "./WorkerLeaveSubmitModal";
import WorkerSwmsWidget from "./WorkerSwmsWidget";
import WorkerPhotoEditModal from "./WorkerPhotoEditModal";
import SiteSafetyFormModal from "./SiteSafetyFormModal";
import { localIsoDate } from "@/lib/timesheet-utils";
import { mapTimesheetRow } from "@/lib/timesheet-entries";
import type { SiteFormType } from "@/lib/site-forms";
import { cardClass } from "@/lib/ui-classes";
import CompanyLogo from "@/components/ui/CompanyLogo";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getPayWeekRange } from "@/lib/pay-week-utils";
import { cn } from "@/lib/utils";
import {
  DASHBOARD_LOADING_TIMEOUT_MS,
  resolveDashboardWorkerId,
} from "@/lib/user-session";
import DashboardCustomizeToolbar, {
  DashboardWidgetFrame,
} from "@/components/dashboard/DashboardCustomizeToolbar";
import { useDashboardLayout } from "@/hooks/useDashboardLayout";
import WorkerItcsWidget from "./itc/WorkerItcsWidget";
import WorkerInductionAssignmentsModal from "./WorkerInductionAssignmentsModal";
import WorkerFormsSubDashboard, {
  FormsHubPreviewBadges,
} from "./WorkerFormsSubDashboard";
import FormViewer from "./FormViewer";
import {
  fetchOutstandingWorkerFormAssignments,
  resolveAssignmentProjectLabel,
  FORM_WORKER_ASSIGNMENTS_TABLE,
  type FormWorkerAssignment,
} from "@/lib/induction-form-builder";
import { WORKER_INDUCTIONS_CHANGED_EVENT } from "@/lib/worker-induction-events";
import {
  canCustomizeDashboardLayout,
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import { isNativeMobileApp } from "@/lib/native-app";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";

const LOADING_TIMEOUT_MS = DASHBOARD_LOADING_TIMEOUT_MS;

/** Widgets that span the full grid width on the worker profile dashboard. */
const MY_PROFILE_FULL_WIDTH_WIDGET_IDS = new Set([
  "assigned_projects",
  "swms",
  "forms_hub",
  "itcs",
]);

/** Widgets removed from My Profile — filter saved layouts that still reference them. */
const REMOVED_PROFILE_WIDGET_IDS = new Set(["plant_prestarts"]);

/** Widgets relocated into the Forms sub-dashboard — hidden from the main grid. */
const FORMS_HUB_RELOCATED_WIDGET_IDS = new Set([
  "prestart",
  "leave",
  "toolbox",
  "safety_walk",
]);

interface DashboardWidget {
  id: string;
  title: string;
  description: string;
  icon: React.ReactNode;
  accent: string;
  available: boolean;
}

const WIDGETS: DashboardWidget[] = [
  {
    id: "details",
    title: "My Details & Compliance",
    description: "Update profile, tickets & VOCs",
    icon: <User className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    available: true,
  },
  {
    id: "inductions",
    title: "Outstanding Inductions",
    description: "Complete site inductions",
    icon: <ClipboardCheck className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    available: true,
  },
  {
    id: "forms_hub",
    title: "Forms & Safety Submissions",
    description: "Toolbox talks, pre-starts, safety walks & leave",
    icon: <ClipboardList className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    available: true,
  },
  {
    id: "timesheets",
    title: "My Timesheets",
    description: "Log hours & view history",
    icon: <Clock className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    available: true,
  },
  {
    id: "itcs",
    title: "ITC's",
    description: "Floorplan pins & collaborative checklists",
    icon: <MapPin className="h-6 w-6" />,
    accent: "border-orange-200 bg-orange-50 text-orange-600",
    available: true,
  },
];

function statusBadgeClass(status: string): string {
  switch (status) {
    case "active":
      return "bg-emerald-100 text-emerald-800";
    case "expired_ticket":
      return "bg-red-100 text-red-800";
    default:
      return "bg-blue-100 text-blue-800";
  }
}

function statusLabel(status: string): string {
  switch (status) {
    case "active":
      return "Active";
    case "expired_ticket":
      return "Non-Compliant";
    case "pending_induction":
      return "Pending Induction";
    default:
      return status;
  }
}

interface WorkerDashboardViewProps {
  workerId?: string | null;
  showAdminSwitch?: boolean;
  /** Render inside the admin shell (no full-page layout). */
  embedded?: boolean;
  /** Prefer admin-linked worker id when resolving automatically. */
  preferAdminProfile?: boolean;
  /** Session role for layout customization (admin shell passes this explicitly). */
  sessionRole?: SecurityRole;
}

export default function WorkerDashboardView({
  workerId,
  showAdminSwitch = false,
  embedded = false,
  preferAdminProfile = false,
  sessionRole,
}: WorkerDashboardViewProps) {
  const [effectiveWorkerId, setEffectiveWorkerId] = useState<string | null>(
    workerId?.trim() ?? null
  );
  const [resolvingWorker, setResolvingWorker] = useState(!workerId?.trim());
  const [worker, setWorker] = useState<Worker | null>(null);
  const [vocs, setVocs] = useState<WorkerVoc[]>([]);
  const [schedules, setSchedules] = useState<WorkerScheduleEntry[]>([]);
  const [timesheets, setTimesheets] = useState<WorkerTimesheet[]>([]);
  const [leaveRequests, setLeaveRequests] = useState<LeaveRequest[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [selectedProjectId, setSelectedProjectId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);
  const [loadingTimedOut, setLoadingTimedOut] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [connectionWarning, setConnectionWarning] = useState<string | null>(null);
  const [showDetails, setShowDetails] = useState(false);
  const [showPhotoModal, setShowPhotoModal] = useState(false);
  const [showTimesheetSubmit, setShowTimesheetSubmit] = useState(false);
  const [showTimesheetHistory, setShowTimesheetHistory] = useState(false);
  const [showLeaveSubmit, setShowLeaveSubmit] = useState(false);
  const [activeSiteForm, setActiveSiteForm] = useState<SiteFormType | null>(null);
  const [comingSoon, setComingSoon] = useState<string | null>(null);
  const [formProjectWarning, setFormProjectWarning] = useState<string | null>(null);
  const [showHiddenDrawer, setShowHiddenDrawer] = useState(false);
  const [pendingInductions, setPendingInductions] = useState<FormWorkerAssignment[]>([]);
  const [showInductionsModal, setShowInductionsModal] = useState(false);
  const [activeInductionAssignment, setActiveInductionAssignment] =
    useState<FormWorkerAssignment | null>(null);
  const [showFormsSubDashboard, setShowFormsSubDashboard] = useState(false);

  const resolvedRole = useMemo(
    () => sessionRole ?? normalizeSecurityRole(worker?.security_role),
    [sessionRole, worker?.security_role]
  );
  const canCustomize =
    canCustomizeDashboardLayout(resolvedRole) && !isNativeMobileApp();
  const layout = useDashboardLayout({
    userId: effectiveWorkerId,
    role: resolvedRole,
    dashboardType: "my_profile",
    canCustomize,
  });

  const payWeek = useMemo(() => getPayWeekRange(new Date()), []);
  const payWeekStartIso = payWeek.startIso;
  const payWeekEndIso = payWeek.endIso;
  const todayIso = useMemo(() => localIsoDate(), []);

  useEffect(() => {
    setEffectiveWorkerId(workerId?.trim() ?? null);
  }, [workerId]);

  useEffect(() => {
    let cancelled = false;

    async function resolveWorker() {
      if (workerId?.trim()) {
        setEffectiveWorkerId(workerId.trim());
        setResolvingWorker(false);
        return;
      }

      setResolvingWorker(true);
      const resolved = await resolveDashboardWorkerId({
        propWorkerId: workerId,
        preferAdmin: preferAdminProfile || embedded,
      });

      if (cancelled) return;

      setEffectiveWorkerId(resolved);
      setResolvingWorker(false);
    }

    resolveWorker();

    return () => {
      cancelled = true;
    };
  }, [workerId, embedded, preferAdminProfile]);

  useEffect(() => {
    if (!loading && !resolvingWorker) {
      setLoadingTimedOut(false);
      return;
    }

    const timer = window.setTimeout(
      () => setLoadingTimedOut(true),
      LOADING_TIMEOUT_MS
    );
    return () => window.clearTimeout(timer);
  }, [loading, resolvingWorker]);

  const loadData = useCallback(async () => {
    const resolvedWorkerId = effectiveWorkerId?.trim();

    if (!resolvedWorkerId) {
      if (!resolvingWorker) {
        setLoading(false);
        setError("No worker profiles are available yet.");
        setWorker(null);
        setProjects([]);
      }
      return;
    }

    if (!isSupabaseConfigured()) {
      setLoading(false);
      setError("Supabase is not configured.");
      return;
    }

    setLoading(true);
    setError(null);
    setConnectionWarning(null);

    let projectList: DbProject[] = [];
    let hadConnectionFailure = false;

    try {
    try {
      projectList = await fetchProjects();
      } catch (projectError) {
        projectList = [];
        if (isNetworkFetchError(projectError)) {
          hadConnectionFailure = true;
        }
        console.error("Worker dashboard failed to load projects:", projectError);
      }
      setProjects(projectList);

      let workerData: Worker | null = null;
      try {
        workerData = await fetchWorkerById(resolvedWorkerId);
      } catch (workerError) {
        if (isNetworkFetchError(workerError)) {
          hadConnectionFailure = true;
        }
        console.error("Worker dashboard failed to load worker profile:", workerError);
      }

      const workerDisplayName = workerData
        ? getWorkerDisplayName(workerData)
        : null;

      const [
        vocResult,
        scheduleResult,
        timesheetResult,
        leaveResult,
        inductionResult,
      ] = await Promise.allSettled([
        fetchWorkerVocs(resolvedWorkerId),
        fetchWorkerSchedules(payWeekStartIso, payWeekEndIso),
        fetchWorkerTimesheets(resolvedWorkerId, { limit: 100 }),
        fetchLeaveRequests({ workerId: resolvedWorkerId }),
        fetchOutstandingWorkerFormAssignments({
          workerId: resolvedWorkerId,
          workerName: workerDisplayName,
          profileFullName: workerData?.full_name ?? workerDisplayName,
        }).then((result) => result.assignments),
      ]);

      const unwrap = <T,>(result: PromiseSettledResult<T>, fallback: T): T => {
        if (result.status === "fulfilled") return result.value;
        if (isNetworkFetchError(result.reason)) {
          hadConnectionFailure = true;
        }
        console.error("Worker dashboard data fetch failed:", result.reason);
        return fallback;
      };

      const vocData = unwrap(vocResult, [] as WorkerVoc[]);
      const scheduleData = unwrap(scheduleResult, [] as WorkerScheduleEntry[]);
      const timesheetData = unwrap(timesheetResult, [] as WorkerTimesheet[]);
      const leaveData = unwrap(leaveResult, [] as LeaveRequest[]);
      const inductionData = unwrap(inductionResult, [] as FormWorkerAssignment[]);

      if (hadConnectionFailure) {
        setConnectionWarning(DATABASE_CONNECTION_ERROR_MESSAGE);
      }

      if (!workerData) {
        setWorker(null);
        setSelectedProjectId(null);
        setVocs([]);
        setSchedules([]);
        setTimesheets([]);
        setLeaveRequests([]);
        setPendingInductions([]);
        if (hadConnectionFailure) {
          setError(null);
        } else {
          setError("Worker profile not found.");
        }
      } else {
        setError(null);
        setWorker(workerData);
        setVocs(vocData);
        setSchedules(scheduleData.filter((s) => s.worker_id === resolvedWorkerId));
        setTimesheets(
          timesheetData.map((row) =>
            mapTimesheetRow(row as unknown as Record<string, unknown>)
          )
        );
        setLeaveRequests(leaveData);
        setPendingInductions(inductionData);

        const grantedIds = getWorkerAssignedProjectIds(workerData);
        const granted = projectList.filter((p) => grantedIds.includes(p.id));
        const initialProject =
          granted.find((p) => p.id === workerData.assigned_project_id)?.id ??
          granted[0]?.id ??
          workerData.assigned_project_id;
        setSelectedProjectId(initialProject);
      }
    } catch (loadError) {
      console.error("Worker dashboard load failed:", loadError);
      setProjects([]);
      setConnectionWarning(DATABASE_CONNECTION_ERROR_MESSAGE);
      setError(null);
      setWorker(null);
    } finally {
      setLoading(false);
    }
  }, [effectiveWorkerId, resolvingWorker, payWeekStartIso, payWeekEndIso, todayIso]);

  useEffect(() => {
    loadData();
  }, [loadData]);

  const refreshTimesheets = useCallback(async () => {
    const resolvedWorkerId = effectiveWorkerId?.trim();
    if (!resolvedWorkerId || !isSupabaseConfigured()) return;

    const timesheetData = await fetchWorkerTimesheets(resolvedWorkerId, { limit: 100 });
    setTimesheets(
      timesheetData.map((row) =>
        mapTimesheetRow(row as unknown as Record<string, unknown>)
      )
    );
  }, [effectiveWorkerId]);

  const refreshPendingInductions = useCallback(async () => {
    const resolvedWorkerId = effectiveWorkerId?.trim();
    if (!resolvedWorkerId || !isSupabaseConfigured()) return;

    try {
      const workerDisplayName = worker ? getWorkerDisplayName(worker) : null;
      const { assignments } = await fetchOutstandingWorkerFormAssignments({
        workerId: resolvedWorkerId,
        workerName: workerDisplayName,
        profileFullName: worker?.full_name ?? workerDisplayName,
      });
      setPendingInductions(assignments);
    } catch (cause) {
      console.warn("Worker dashboard induction refresh failed:", cause);
    }
  }, [effectiveWorkerId, worker]);

  useEffect(() => {
    const resolvedWorkerId = effectiveWorkerId?.trim();
    if (!resolvedWorkerId || !isSupabaseConfigured()) return;

    const channel = supabase
      .channel(`timesheets_changes_${resolvedWorkerId}`)
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: "worker_timesheets",
          filter: `worker_id=eq.${resolvedWorkerId}`,
        },
        () => {
          void refreshTimesheets();
        }
      )
      .on(
        "postgres_changes",
        {
          event: "*",
          schema: "public",
          table: FORM_WORKER_ASSIGNMENTS_TABLE,
          filter: `worker_id=eq.${resolvedWorkerId}`,
        },
        () => {
          void refreshPendingInductions();
        }
      )
      .subscribe();

    return () => {
      void supabase.removeChannel(channel);
    };
  }, [effectiveWorkerId, refreshTimesheets, refreshPendingInductions]);

  useEffect(() => {
    const handleFocusRefresh = () => {
      void refreshTimesheets();
      void refreshPendingInductions();
    };

    const handleVisibilityRefresh = () => {
      if (document.visibilityState === "visible") {
        void refreshTimesheets();
        void refreshPendingInductions();
      }
    };

    const handleInductionsChanged = (event: Event) => {
      const detail = (event as CustomEvent<{ workerId?: string | null }>).detail;
      const targetId = detail?.workerId?.trim();
      const resolvedWorkerId = effectiveWorkerId?.trim();
      if (targetId && resolvedWorkerId && targetId !== resolvedWorkerId) {
        return;
      }
      void refreshPendingInductions();
    };

    window.addEventListener("focus", handleFocusRefresh);
    document.addEventListener("visibilitychange", handleVisibilityRefresh);
    window.addEventListener(WORKER_INDUCTIONS_CHANGED_EVENT, handleInductionsChanged);

    return () => {
      window.removeEventListener("focus", handleFocusRefresh);
      document.removeEventListener("visibilitychange", handleVisibilityRefresh);
      window.removeEventListener(
        WORKER_INDUCTIONS_CHANGED_EVENT,
        handleInductionsChanged
      );
    };
  }, [effectiveWorkerId, refreshTimesheets, refreshPendingInductions]);

  const grantedProjectIds = useMemo(
    () => (worker ? getWorkerAssignedProjectIds(worker) : []),
    [worker]
  );

  const grantedProjects = useMemo(
    () => projects.filter((p) => grantedProjectIds.includes(p.id)),
    [projects, grantedProjectIds]
  );

  const activeProjects = useMemo(() => {
    if (grantedProjects.length > 0) {
      return grantedProjects.map((p) => p.name);
    }

    const names = new Set<string>();
    if (worker?.assigned_project_id) {
      const name = getProjectName(worker.assigned_project_id);
      if (name) names.add(name);
    }
    for (const s of schedules) {
      if (s.project_name) names.add(s.project_name);
    }
    return Array.from(names);
  }, [grantedProjects, worker, schedules]);

  const weekTimesheets = useMemo(
    () =>
      timesheets.filter(
        (t) => t.work_date >= payWeekStartIso && t.work_date <= payWeekEndIso
      ),
    [timesheets, payWeekStartIso, payWeekEndIso]
  );

  const selectedProjectName = useMemo(() => {
    if (!selectedProjectId) return "";
    const match = grantedProjects.find((p) => p.id === selectedProjectId);
    return match?.name ?? getProjectName(selectedProjectId) ?? "Selected project";
  }, [selectedProjectId, grantedProjects]);

  const handleHardwareBack = useCallback(() => {
    if (activeInductionAssignment) {
      setActiveInductionAssignment(null);
      return true;
    }
    if (showInductionsModal) {
      setShowInductionsModal(false);
      return true;
    }
    if (activeSiteForm) {
      setActiveSiteForm(null);
      return true;
    }
    if (showLeaveSubmit) {
      setShowLeaveSubmit(false);
      return true;
    }
    if (showTimesheetHistory) {
      setShowTimesheetHistory(false);
      return true;
    }
    if (showTimesheetSubmit) {
      setShowTimesheetSubmit(false);
      return true;
    }
    if (showDetails) {
      setShowDetails(false);
      return true;
    }
    if (showPhotoModal) {
      setShowPhotoModal(false);
      return true;
    }
    if (showFormsSubDashboard) {
      setShowFormsSubDashboard(false);
      return true;
    }
    if (showHiddenDrawer) {
      setShowHiddenDrawer(false);
      return true;
    }
    if (comingSoon) {
      setComingSoon(null);
      return true;
    }
    return false;
  }, [
    activeInductionAssignment,
    activeSiteForm,
    comingSoon,
    showDetails,
    showFormsSubDashboard,
    showHiddenDrawer,
    showInductionsModal,
    showLeaveSubmit,
    showPhotoModal,
    showTimesheetHistory,
    showTimesheetSubmit,
  ]);

  useMobileBackHandler(handleHardwareBack, true);

  const openSiteForm = (formType: SiteFormType) => {
    if (!selectedProjectId) {
      setFormProjectWarning("Select a project before submitting a site safety form.");
      window.setTimeout(() => setFormProjectWarning(null), 3500);
      return;
    }
    setActiveSiteForm(formType);
  };

  const openInductions = () => {
    if (pendingInductions.length === 1) {
      setActiveInductionAssignment(pendingInductions[0]);
      return;
    }
    setShowInductionsModal(true);
  };

  const handleWidgetClick = (widget: DashboardWidget) => {
    if (!worker) return;

    if (widget.id === "details") {
      setShowDetails(true);
      return;
    }
    if (widget.id === "timesheets") {
      setShowTimesheetSubmit(true);
      return;
    }
    if (widget.id === "forms_hub") {
      setShowFormsSubDashboard(true);
      return;
    }
    if (widget.id === "inductions") {
      openInductions();
      return;
    }
    setComingSoon(widget.title);
    setTimeout(() => setComingSoon(null), 2500);
  };

  const widgetMetaById = useMemo(
    () => new Map(WIDGETS.map((widget) => [widget.id, widget])),
    []
  );

  const renderAssignedProjectsWidget = () => (
    <div className={cn("p-4", cardClass)}>
      <p className="text-xs font-medium text-slate-500">My Assigned Projects</p>
      {grantedProjects.length === 0 ? (
        activeProjects.length === 0 ? (
          <p className="mt-2 text-sm text-slate-400">No projects assigned yet</p>
        ) : (
          <div className="mt-2 flex flex-wrap gap-1.5">
            {activeProjects.map((name) => (
              <span
                key={name}
                className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700"
              >
                {name}
              </span>
            ))}
          </div>
        )
      ) : grantedProjects.length === 1 ? (
        <div className="mt-2">
          <span className="rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-xs font-medium text-orange-700">
            {grantedProjects[0].name}
          </span>
        </div>
      ) : (
        <div className="mt-2 space-y-2">
          <select
            className="w-full rounded-lg border border-slate-300 bg-white px-3 py-2 text-sm text-slate-900 focus:border-orange-500 focus:outline-none focus:ring-1 focus:ring-orange-500"
            value={selectedProjectId ?? ""}
            onChange={(e) => setSelectedProjectId(e.target.value || null)}
          >
            {grantedProjects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
          <div className="flex flex-wrap gap-1.5">
            {grantedProjects.slice(0, 3).map((project) => (
              <span
                key={project.id}
                className={cn(
                  "rounded-full border px-2.5 py-0.5 text-xs font-medium",
                  project.id === selectedProjectId
                    ? "border-orange-300 bg-orange-100 text-orange-800"
                    : "border-orange-200 bg-orange-50 text-orange-700"
                )}
              >
                {project.name}
              </span>
            ))}
            {grantedProjects.length > 3 && (
              <span className="text-xs font-medium text-slate-500">
                +{grantedProjects.length - 3} more
              </span>
            )}
          </div>
        </div>
      )}
    </div>
  );

  const renderProfileWidget = (widgetId: string) => {
    if (widgetId === "assigned_projects") {
      return renderAssignedProjectsWidget();
    }

    if (widgetId === "swms") {
      return worker ? <WorkerSwmsWidget workerId={worker.id} /> : null;
    }

    if (widgetId === "timesheets") {
      return (
        <WorkerTimesheetsWidget
          payWeekStart={payWeek.start}
          payWeekEnd={payWeek.end}
          payWeekStartIso={payWeekStartIso}
          payWeekEndIso={payWeekEndIso}
          weekTimesheets={weekTimesheets}
          todayIso={todayIso}
          onSubmitToday={() => setShowTimesheetSubmit(true)}
          onViewPast={() => setShowTimesheetHistory(true)}
        />
      );
    }

    if (widgetId === "forms_hub") {
      return (
        <button
          type="button"
          onClick={() => setShowFormsSubDashboard(true)}
          className={cn(
            cardClass,
            "relative flex h-full flex-col items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99] sm:col-span-2"
          )}
        >
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
            <ClipboardList className="h-6 w-6" />
          </div>
          <div className="flex-1">
            <p className="font-semibold text-slate-900">Forms & Safety Submissions</p>
            <FormsHubPreviewBadges />
          </div>
          <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-slate-400" />
        </button>
      );
    }

    if (widgetId === "itcs") {
      return (
        <WorkerItcsWidget
          workerId={worker?.id ?? effectiveWorkerId}
          projectId={selectedProjectId}
          layoutEditMode={layout.editMode}
        />
      );
    }

    if (widgetId === "inductions") {
      const pendingCount = pendingInductions.length;
      const firstAssignment = pendingInductions[0];
      const firstTitle = firstAssignment?.form_title ?? "Site induction";
      const firstProjectLabel = firstAssignment
        ? resolveAssignmentProjectLabel(firstAssignment)
        : null;

      return (
        <button
          type="button"
          onClick={openInductions}
          className={cn(
            cardClass,
            "relative flex h-full flex-col items-start gap-2 p-4 text-left transition hover:border-orange-300 hover:shadow-md active:scale-[0.99]",
            pendingCount > 0 && "border-orange-200 bg-orange-50/40"
          )}
        >
          <div className="flex w-full items-start justify-between gap-2">
            <p className="font-semibold text-slate-900">Outstanding Inductions</p>
            {pendingCount > 0 ? (
              <span className="shrink-0 rounded-full bg-orange-600 px-2.5 py-0.5 text-[10px] font-bold uppercase tracking-wide text-white shadow-sm">
                {pendingCount} pending
              </span>
            ) : null}
          </div>

          {pendingCount > 0 ? (
            <div className="space-y-1">
              <div className="flex flex-wrap items-center gap-2">
                <p className="line-clamp-2 text-sm font-medium text-orange-900">
                  {firstTitle}
                </p>
                {firstProjectLabel ? (
                  <span className="rounded-full border border-sky-200 bg-sky-50 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-sky-800">
                    {firstProjectLabel}
                  </span>
                ) : null}
              </div>
              {pendingCount > 1 ? (
                <p className="text-sm font-normal text-orange-700">
                  +{pendingCount - 1} more
                </p>
              ) : null}
            </div>
          ) : (
            <p className="text-xs text-slate-500">No pending inductions</p>
          )}

          <div
            className={cn(
              "flex h-11 w-11 items-center justify-center rounded-xl border",
              pendingCount > 0
                ? "border-orange-200 bg-orange-50 text-orange-600"
                : "border-slate-200 bg-slate-50 text-slate-600"
            )}
          >
            <ClipboardCheck className="h-6 w-6" />
          </div>

          <p className="text-xs text-slate-500">
            {pendingCount > 0
              ? "Tap to complete your induction"
              : "Assigned forms will appear here"}
          </p>
          <ChevronRight className="absolute bottom-4 right-4 h-4 w-4 text-slate-400" />
        </button>
      );
    }

    const widget = widgetMetaById.get(widgetId);
    if (!widget) return null;

    return (
      <button
        type="button"
        onClick={() => handleWidgetClick(widget)}
        className={cn(
          cardClass,
          "flex h-full flex-col items-start gap-3 p-4 text-left transition",
          widget.available
            ? "hover:border-orange-300 hover:shadow-md active:scale-[0.99]"
            : "opacity-90 hover:border-slate-300"
        )}
      >
        <div
          className={cn(
            "flex h-11 w-11 items-center justify-center rounded-xl border",
            widget.accent
          )}
        >
          {widget.icon}
        </div>
        <div className="flex-1">
          <p className="font-semibold text-slate-900">{widget.title}</p>
          <p className="mt-0.5 text-xs text-slate-500">{widget.description}</p>
        </div>
        <ChevronRight className="h-4 w-4 text-slate-400" />
      </button>
    );
  };

  const widgetsToRender = useMemo(() => {
    const source = layout.editMode ? layout.orderedWidgets : layout.visibleWidgets;
    return source.filter(
      (widget) =>
        !FORMS_HUB_RELOCATED_WIDGET_IDS.has(widget.id) &&
        !REMOVED_PROFILE_WIDGET_IDS.has(widget.id)
    );
  }, [layout.editMode, layout.orderedWidgets, layout.visibleWidgets]);
  const hiddenWidgetIds = layout.hiddenWidgets.map((widget) => widget.id);

  if ((loading || resolvingWorker) && !loadingTimedOut && !worker) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-transparent",
          embedded ? "py-24" : "min-h-screen"
        )}
      >
        <Loader2 className="h-8 w-8 animate-spin text-orange-500" />
      </div>
    );
  }

  if (error && !worker && !loadingTimedOut) {
    return (
      <div
        className={cn(
          "flex items-center justify-center bg-transparent p-6",
          embedded ? "py-24" : "min-h-screen"
        )}
      >
        <p className="text-center text-slate-600">{error}</p>
      </div>
    );
  }

  const ticketStatus = worker ? getWorkerTicketStatus(worker, vocs) : "unknown";
  const showAdminNav = showAdminSwitch && !embedded && !isNativeMobileApp();
  const profileName = worker ? getWorkerDisplayName(worker, "Worker Profile") : "Worker Profile";
  const profileStatus = worker?.status ?? "pending_induction";
  const isProfileLoading = (loading || resolvingWorker) && !worker;

  return (
    <div className={cn("bg-transparent", embedded ? "min-h-full" : "min-h-screen")}>
      <header className="mobile-safe-area-top border-b border-slate-200 bg-white px-4 py-4 shadow-sm">
        <div className="mx-auto flex max-w-lg items-start justify-between gap-3">
          <div className="flex min-w-0 flex-1 items-start gap-3">
            <div
              className={cn(
                "relative shrink-0",
                (!worker || isProfileLoading) && "opacity-60"
              )}
            >
              <WorkerProfileAvatar
                photoUrl={worker?.photo_url}
                worker={worker ?? undefined}
                displayName={profileName}
                size="md"
                ringClassName="ring-2 ring-orange-200"
              />
              <button
                type="button"
                onClick={() => worker && setShowPhotoModal(true)}
                disabled={!worker || isProfileLoading}
                className="absolute -bottom-1 -right-1 inline-flex h-7 w-7 items-center justify-center rounded-full border border-orange-200 bg-white text-orange-600 shadow-sm transition hover:border-orange-400 hover:bg-orange-50 disabled:cursor-not-allowed disabled:opacity-60"
                aria-label="Edit profile photo"
              >
                <Camera className="h-3.5 w-3.5" />
              </button>
            </div>
            <div className="min-w-0 flex-1">
              <p className="text-xs font-semibold uppercase tracking-wider text-orange-600">
                SiteBolt Worker
              </p>
              <h1 className="truncate text-lg font-bold text-slate-900">
                {profileName}
              </h1>
              <div className="mt-1.5 flex flex-wrap items-center gap-1.5">
                <span
                  className={cn(
                    "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                    statusBadgeClass(profileStatus)
                  )}
                >
                  {statusLabel(profileStatus)}
                </span>
                {worker && (
                  <span
                    className={cn(
                      "rounded px-2 py-0.5 text-[10px] font-bold",
                      ticketStatus === "valid" && "bg-emerald-100 text-emerald-800",
                      ticketStatus === "expires_soon" && "bg-amber-100 text-amber-800",
                      ticketStatus === "expired" && "bg-red-100 text-red-800",
                      ticketStatus === "unknown" && "bg-slate-100 text-slate-600"
                    )}
                  >
                    {getTicketBadgeLabel(ticketStatus)}
                  </span>
                )}
              </div>
            </div>
          </div>
          <div className="flex shrink-0 items-center gap-2">
            <CompanyLogo size="sm" showFallback />
            {showAdminNav && (
            <Link
              href="/"
              className="flex shrink-0 items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-2.5 py-2 text-xs font-semibold text-slate-700 shadow-sm transition hover:border-orange-300 hover:text-orange-600"
            >
              <LayoutDashboard className="h-3.5 w-3.5" />
              <span className="hidden sm:inline">Switch to Admin View</span>
              <span className="sm:hidden">Admin</span>
            </Link>
            )}
          </div>
        </div>
      </header>

      <main className="mx-auto max-w-lg p-4 pb-8">
        {isProfileLoading && (
          <div className="mb-4 flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading your profile…
          </div>
        )}

        {connectionWarning && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {connectionWarning}
          </div>
        )}

        {error && !connectionWarning && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {error}
          </div>
        )}

        {comingSoon && (
          <div className="mb-4 rounded-lg border border-slate-200 bg-white px-4 py-3 text-sm text-slate-600 shadow-sm">
            <strong>{comingSoon}</strong> — coming soon.
          </div>
        )}

        {formProjectWarning && (
          <div
            role="alert"
            className="mb-4 rounded-lg border border-amber-200 bg-amber-50 px-4 py-3 text-sm text-amber-900"
          >
            {formProjectWarning}
          </div>
        )}

        {showFormsSubDashboard && worker ? (
          <WorkerFormsSubDashboard
            worker={worker}
            projects={grantedProjects}
            defaultProjectId={selectedProjectId}
            leaveRequests={leaveRequests}
            onBack={() => setShowFormsSubDashboard(false)}
            onOpenSiteForm={openSiteForm}
            onSubmitLeave={() => setShowLeaveSubmit(true)}
          />
        ) : (
          <>
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <h2 className="text-sm font-semibold text-slate-700">Your dashboard</h2>
              {canCustomize ? (
                <div className="ml-auto">
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
                </div>
              ) : null}
            </div>

            <div className="grid grid-cols-1 gap-3 sm:grid-cols-2">
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
                  className={
                    MY_PROFILE_FULL_WIDTH_WIDGET_IDS.has(widget.id)
                      ? "sm:col-span-2"
                      : undefined
                  }
                >
                  {renderProfileWidget(widget.id)}
                </DashboardWidgetFrame>
              ))}
            </div>
          </>
        )}
      </main>

      {worker && showPhotoModal && (
        <WorkerPhotoEditModal
          workerId={worker.id}
          currentPhotoUrl={worker.photo_url}
          onClose={() => setShowPhotoModal(false)}
          onPhotoUpdated={(photoUrl) => {
            setWorker((current) =>
              current ? { ...current, photo_url: photoUrl } : current
            );
          }}
        />
      )}

      {worker && showDetails && (
        <WorkerMyDetailsPanel
          worker={worker}
          initialVocs={vocs}
          onClose={() => setShowDetails(false)}
          onSaved={(updated) => {
            setWorker(updated);
            loadData();
          }}
        />
      )}

      {worker && showTimesheetSubmit && (
        <WorkerTimesheetModal
          worker={worker}
          projectId={selectedProjectId}
          allowedProjectIds={grantedProjectIds}
          timesheets={timesheets}
          onClose={() => setShowTimesheetSubmit(false)}
          onSubmitted={loadData}
        />
      )}

      {showTimesheetHistory && (
        <WorkerTimesheetHistoryDrawer
          timesheets={timesheets}
          onClose={() => setShowTimesheetHistory(false)}
        />
      )}

      {worker && showLeaveSubmit && (
        <WorkerLeaveSubmitModal
          worker={worker}
          projectId={selectedProjectId}
          allowedProjectIds={grantedProjectIds}
          onClose={() => setShowLeaveSubmit(false)}
          onSubmitted={loadData}
        />
      )}

      {worker && activeSiteForm && selectedProjectId && (
        <SiteSafetyFormModal
          formType={activeSiteForm}
          worker={worker}
          projectId={selectedProjectId}
          projectName={selectedProjectName}
          onClose={() => setActiveSiteForm(null)}
          onSubmitted={() => {
            setActiveSiteForm(null);
            loadData();
          }}
        />
      )}

      {showInductionsModal ? (
        <WorkerInductionAssignmentsModal
          assignments={pendingInductions}
          onClose={() => setShowInductionsModal(false)}
          onSelectAssignment={(assignment) => {
            setShowInductionsModal(false);
            setActiveInductionAssignment(assignment);
          }}
        />
      ) : null}

      {activeInductionAssignment ? (
        <FormViewer
          assignment={activeInductionAssignment}
          onClose={() => setActiveInductionAssignment(null)}
          onSubmitted={() => {
            setActiveInductionAssignment(null);
            void loadData();
          }}
        />
      ) : null}
    </div>
  );
}
