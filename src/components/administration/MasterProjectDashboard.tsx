"use client";

import { useCallback, useEffect, useMemo, useState, type ReactNode } from "react";
import {
  AlertTriangle,
  Ban,
  Bell,
  CalendarOff,
  Check,
  ClipboardCheck,
  FileSignature,
  HardHat,
  Loader2,
  MessageSquare,
  ShieldCheck,
} from "lucide-react";
import type { LucideIcon } from "lucide-react";
import { fetchWorkers, type LeaveRequest, type Worker } from "@/lib/supabase";
import {
  fetchProjects,
  filterActiveProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import {
  createEmptyMasterProjectDashboardSnapshot,
  fetchMasterProjectDashboardSnapshot,
  filterMasterDashboardSnapshot,
  toMasterDashboardWidgetData,
  type MasterDashboardWidgetData,
  type MasterProjectDashboardSnapshot,
} from "@/lib/master-project-dashboard";
import {
  approveLeaveRequestAction,
  getLeaveEndDate,
  getLeaveStartDate,
  rejectLeaveRequestAction,
} from "@/lib/leave-requests";
import { markPlantPrestartRead } from "@/lib/plant-prestart-mutations";
import { markSiteFormViewed } from "@/lib/site-form-mutations";
import { sendInductionReminderNotification } from "@/lib/induction-reminder-notifications";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";
import AdminIncidentDetailModal from "@/components/administration/forms/AdminIncidentDetailModal";
import PlantPrestartDetailModal from "@/components/dashboard/PlantPrestartDetailModal";
import SiteFormDetailModal from "@/components/dashboard/SiteFormDetailModal";
import LeaveRequestReviewModal from "@/components/dashboard/LeaveRequestReviewModal";
import MasterDashboardInfoModal from "@/components/administration/MasterDashboardInfoModal";
import type { IncidentReportRecord } from "@/lib/incident-reports";
import type { PlantPrestart } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import type { FormWorkerAssignment } from "@/lib/induction-form-builder";
import type { SwmsAssignmentRecord } from "@/lib/supabase";

const LEFT_WIDGETS: Array<{
  key: Exclude<keyof MasterProjectDashboardSnapshot, "swmsDocuments" | "plant">;
  title: string;
  empty: string;
  icon: LucideIcon;
  iconClassName: string;
}> = [
  {
    key: "incidents",
    title: "Incidents",
    empty: "No open incidents.",
    icon: AlertTriangle,
    iconClassName: "text-red-500",
  },
  {
    key: "swmsWaitingSignOff",
    title: "SWMS Waiting Sign Off",
    empty: "No SWMS waiting for sign-off.",
    icon: FileSignature,
    iconClassName: "text-orange-600",
  },
  {
    key: "incompleteInductions",
    title: "Incomplete Inductions",
    empty: "No incomplete inductions.",
    icon: ClipboardCheck,
    iconClassName: "text-emerald-600",
  },
  {
    key: "leaveRequests",
    title: "Leave Requests",
    empty: "No pending leave requests.",
    icon: CalendarOff,
    iconClassName: "text-violet-600",
  },
  {
    key: "safetyWalks",
    title: "Safety Walks",
    empty: "No unread safety walks.",
    icon: ShieldCheck,
    iconClassName: "text-orange-500",
  },
  {
    key: "toolboxTalks",
    title: "Toolbox Talks",
    empty: "No unread toolbox talks.",
    icon: MessageSquare,
    iconClassName: "text-sky-600",
  },
];

type ExpandedView =
  | { type: "incident"; record: IncidentReportRecord }
  | { type: "prestart"; record: PlantPrestart }
  | { type: "siteForm"; record: SiteFormSubmission }
  | { type: "leave"; record: LeaveRequest }
  | { type: "swms"; record: SwmsAssignmentRecord }
  | { type: "induction"; record: FormWorkerAssignment };

function WidgetCard({
  title,
  data,
  empty,
  icon: Icon,
  iconClassName,
  onSelect,
  renderActions,
}: {
  title: string;
  data: MasterDashboardWidgetData;
  empty: string;
  icon: LucideIcon;
  iconClassName: string;
  onSelect: (id: string) => void;
  renderActions?: (id: string) => ReactNode;
}) {
  return (
    <section className={cn(cardClass, "flex h-full flex-col p-5")}>
      <button
        type="button"
        onClick={() => {
          if (data.items[0]) onSelect(data.items[0].id);
        }}
        className="mb-4 flex w-full items-start gap-3 text-left"
      >
        <Icon className={cn("h-9 w-9 shrink-0", iconClassName)} />
        <div className="min-w-0 flex-1">
          <h2 className="text-lg font-bold text-slate-900">{title}</h2>
          <p className="text-sm text-slate-500">{data.count} recorded</p>
        </div>
        <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
          {data.count}
        </span>
      </button>

      {data.count === 0 ? (
        <div className="flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
          {empty}
        </div>
      ) : (
        <ul className="min-h-0 flex-1 space-y-2">
          {data.items.map((item) => (
            <li key={item.id}>
              <div className="flex items-start gap-2 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2">
                <button
                  type="button"
                  onClick={() => onSelect(item.id)}
                  className="min-w-0 flex-1 text-left"
                >
                  <p className="truncate font-semibold text-slate-900">{item.title}</p>
                  {item.subtitle ? (
                    <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                  ) : null}
                </button>
                {renderActions?.(item.id)}
              </div>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}

export default function MasterProjectDashboard() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [snapshot, setSnapshot] = useState<MasterProjectDashboardSnapshot>(
    createEmptyMasterProjectDashboardSnapshot()
  );
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>([]);
  const [projectFilter, setProjectFilter] = useState<string>("all");
  const [loading, setLoading] = useState(true);
  const [expanded, setExpanded] = useState<ExpandedView | null>(null);
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [leaveActingId, setLeaveActingId] = useState<string | null>(null);
  const [sendingInductionId, setSendingInductionId] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    try {
      await fetchProjects();
      const nextWorkers = await fetchWorkers();
      const nextSnapshot = await fetchMasterProjectDashboardSnapshot();
      setWorkers(nextWorkers ?? []);
      setProjects(filterActiveProjects(getCachedProjects()));
      setSnapshot(nextSnapshot);
    } catch (error) {
      console.warn("[master-dashboard] load failed:", error);
      setSnapshot(createEmptyMasterProjectDashboardSnapshot());
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const selectedProjectId = projectFilter === "all" ? null : projectFilter;
  const filteredSnapshot = useMemo(
    () => filterMasterDashboardSnapshot(snapshot, selectedProjectId),
    [snapshot, selectedProjectId]
  );
  const data = useMemo(
    () => toMasterDashboardWidgetData(filteredSnapshot, workers),
    [filteredSnapshot, workers]
  );

  const removeRecord = useCallback(
    (key: keyof MasterProjectDashboardSnapshot, id: string) => {
      setSnapshot((current) => ({
        ...current,
        [key]: (current[key] as Array<{ id: string }>).filter((row) => row.id !== id),
      }));
    },
    []
  );

  const handleMarkSiteFormRead = async (form: SiteFormSubmission) => {
    setMarkingId(form.id);
    const result = await markSiteFormViewed(form.id);
    setMarkingId(null);
    if (result.error) {
      showError(result.error);
      return;
    }
    const key = form.form_type === "toolbox_talk" ? "toolboxTalks" : "safetyWalks";
    removeRecord(key, form.id);
    showSuccess("Marked as read");
    setExpanded(null);
  };

  const handleMarkPrestartRead = async (prestart: PlantPrestart) => {
    setMarkingId(prestart.id);
    const result = await markPlantPrestartRead(prestart.id);
    setMarkingId(null);
    if (result.error) {
      showError(result.error);
      return;
    }
    removeRecord("plantPrestarts", prestart.id);
    showSuccess("Plant pre-start marked as read");
  };

  const openPrestart = async (prestart: PlantPrestart) => {
    setExpanded({ type: "prestart", record: prestart });
    await handleMarkPrestartRead(prestart);
  };

  const handleLeaveAction = async (
    request: LeaveRequest,
    action: "approve" | "reject"
  ) => {
    setLeaveActingId(request.id);
    const payload = {
      requestId: request.id,
      workerId: request.worker_id,
      startDate: getLeaveStartDate(request),
      endDate: getLeaveEndDate(request),
    };
    const result =
      action === "approve"
        ? await approveLeaveRequestAction(payload)
        : await rejectLeaveRequestAction(payload);
    setLeaveActingId(null);
    if (result.error) {
      showError(result.error);
      return;
    }
    removeRecord("leaveRequests", request.id);
    showSuccess(action === "approve" ? "Leave request authorized" : "Leave request rejected");
    if (expanded?.type === "leave" && expanded.record.id === request.id) {
      setExpanded(null);
    }
  };

  const resolveWorkerName = (workerId: string, fallback?: string | null) => {
    const worker = workers.find((row) => row.id === workerId);
    return fallback?.trim() || (worker ? getWorkerDisplayName(worker) : "Worker");
  };

  const handleSendInductionNotification = async (assignment: FormWorkerAssignment) => {
    const workerName = resolveWorkerName(assignment.worker_id, assignment.worker_name);
    setSendingInductionId(assignment.id);
    const result = await sendInductionReminderNotification({
      workerId: assignment.worker_id,
      inductionTitle: assignment.form_title?.trim() || "your assigned induction",
      templateId: assignment.form_id,
    });
    setSendingInductionId(null);
    if (result.error) {
      showError(result.error);
      return;
    }
    showSuccess(`Notification sent to ${workerName}`);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Master <span className="text-orange-500">Project Dashboard</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Open items only. Changing the project filter scopes every widget instantly.
          </p>
        </div>
        <label className="block w-full max-w-xs">
          <span className="mb-1 block text-xs font-semibold uppercase tracking-wide text-slate-500">
            Project Filter
          </span>
          <select
            className={inputClass}
            value={projectFilter}
            onChange={(event) => setProjectFilter(event.target.value)}
          >
            <option value="all">All Projects</option>
            {projects.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-10 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading master dashboard…
        </div>
      ) : (
        <div className="flex flex-col gap-4 lg:flex-row lg:items-start">
          <div className="grid min-w-0 flex-1 gap-4 md:grid-cols-2">
            {LEFT_WIDGETS.map((widget) => (
              <WidgetCard
                key={widget.key}
                title={widget.title}
                data={data[widget.key] ?? { count: 0, items: [] }}
                empty={widget.empty}
                icon={widget.icon}
                iconClassName={widget.iconClassName}
                onSelect={(id) => {
                  if (widget.key === "incidents") {
                    const record = filteredSnapshot.incidents.find((row) => row.id === id);
                    if (record) setExpanded({ type: "incident", record });
                    return;
                  }
                  if (widget.key === "safetyWalks" || widget.key === "toolboxTalks") {
                    const record = filteredSnapshot[widget.key].find((row) => row.id === id);
                    if (record) setExpanded({ type: "siteForm", record });
                    return;
                  }
                  if (widget.key === "leaveRequests") {
                    const record = filteredSnapshot.leaveRequests.find((row) => row.id === id);
                    if (record) setExpanded({ type: "leave", record });
                    return;
                  }
                  if (widget.key === "swmsWaitingSignOff") {
                    const record = filteredSnapshot.swmsWaitingSignOff.find(
                      (row) => row.id === id
                    );
                    if (record) setExpanded({ type: "swms", record });
                    return;
                  }
                  const record = filteredSnapshot.incompleteInductions.find(
                    (row) => row.id === id
                  );
                  if (record) setExpanded({ type: "induction", record });
                }}
                renderActions={
                  widget.key === "leaveRequests"
                    ? (id) => {
                        const request = filteredSnapshot.leaveRequests.find(
                          (row) => row.id === id
                        );
                        if (!request) return null;
                        const busy = leaveActingId === request.id;
                        return (
                          <div className="flex shrink-0 flex-col gap-1">
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleLeaveAction(request, "approve")}
                              className="inline-flex items-center gap-1 rounded-md bg-emerald-600 px-2 py-1 text-[11px] font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {busy ? <Loader2 className="h-3 w-3 animate-spin" /> : <Check className="h-3 w-3" />}
                              Authorize
                            </button>
                            <button
                              type="button"
                              disabled={busy}
                              onClick={() => void handleLeaveAction(request, "reject")}
                              className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2 py-1 text-[11px] font-semibold text-red-700 hover:bg-red-100 disabled:opacity-60"
                            >
                              <Ban className="h-3 w-3" />
                              Reject
                            </button>
                          </div>
                        );
                      }
                    : undefined
                }
              />
            ))}
          </div>

          <aside className="w-full shrink-0 lg:sticky lg:top-4 lg:w-[380px] xl:w-[420px]">
            <section className={cn(cardClass, "flex flex-col p-5")}>
              <div className="mb-4 flex items-start gap-3">
                <HardHat className="h-9 w-9 shrink-0 text-amber-500" />
                <div className="min-w-0 flex-1">
                  <h2 className="text-lg font-bold text-slate-900">Plant Pre-starts</h2>
                  <p className="text-sm text-slate-500">
                    {data.plantPrestarts.count} unread
                  </p>
                </div>
                <span className="rounded-full bg-slate-100 px-2.5 py-1 text-sm font-bold text-slate-800">
                  {data.plantPrestarts.count}
                </span>
              </div>

              {data.plantPrestarts.count === 0 ? (
                <div className="rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500">
                  No unread plant pre-starts.
                </div>
              ) : (
                <ul className="max-h-[calc(100vh-180px)] space-y-2 overflow-y-auto pr-2">
                  {data.plantPrestarts.items.map((item) => {
                    const record = filteredSnapshot.plantPrestarts.find(
                      (row) => row.id === item.id
                    );
                    return (
                      <li key={item.id}>
                        <button
                          type="button"
                          onClick={() => {
                            if (record) void openPrestart(record);
                          }}
                          className="w-full rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-left hover:border-orange-300 hover:bg-orange-50"
                        >
                          <p className="truncate font-semibold text-slate-900">{item.title}</p>
                          {item.subtitle ? (
                            <p className="truncate text-xs text-slate-500">{item.subtitle}</p>
                          ) : null}
                        </button>
                      </li>
                    );
                  })}
                </ul>
              )}
            </section>
          </aside>
        </div>
      )}

      {expanded?.type === "incident" ? (
        <AdminIncidentDetailModal
          report={expanded.record}
          onClose={() => setExpanded(null)}
          onUpdated={(report) => {
            if (String(report.status).toLowerCase() === "closed") {
              removeRecord("incidents", report.id);
              setExpanded(null);
              showSuccess("Incident closed");
              return;
            }
            setSnapshot((current) => ({
              ...current,
              incidents: current.incidents.map((row) =>
                row.id === report.id ? report : row
              ),
            }));
          }}
        />
      ) : null}

      {expanded?.type === "prestart" ? (
        <PlantPrestartDetailModal
          prestart={expanded.record}
          plant={snapshot.plant}
          onClose={() => setExpanded(null)}
          markingRead={markingId === expanded.record.id}
          onMarkRead={() => handleMarkPrestartRead(expanded.record)}
        />
      ) : null}

      {expanded?.type === "siteForm" ? (
        <SiteFormDetailModal
          form={expanded.record}
          workers={workers}
          onClose={() => setExpanded(null)}
          markingRead={markingId === expanded.record.id}
          onMarkRead={() => handleMarkSiteFormRead(expanded.record)}
        />
      ) : null}

      {expanded?.type === "leave" ? (
        <LeaveRequestReviewModal
          leaveRequest={expanded.record}
          workerName={resolveWorkerName(
            expanded.record.worker_id,
            expanded.record.worker_name
          )}
          onClose={() => setExpanded(null)}
          onUpdated={(result) => {
            removeRecord("leaveRequests", expanded.record.id);
            setExpanded(null);
            showSuccess(
              result === "approved" ? "Leave request authorized" : "Leave request rejected"
            );
          }}
        />
      ) : null}

      {expanded?.type === "swms" ? (
        <MasterDashboardInfoModal
          title="SWMS waiting sign-off"
          subtitle={expanded.record.assignee_name || "Worker"}
          rows={[
            { label: "Assignee", value: expanded.record.assignee_name || "—" },
            { label: "Status", value: expanded.record.status || "pending" },
            {
              label: "Document",
              value:
                snapshot.swmsDocuments.find(
                  (doc) =>
                    doc.id === expanded.record.swms_id ||
                    doc.swms_id === expanded.record.swms_id
                )?.title ?? expanded.record.swms_id,
            },
            { label: "Signed at", value: expanded.record.signed_at || "Not signed" },
          ]}
          onClose={() => setExpanded(null)}
        />
      ) : null}

      {expanded?.type === "induction" ? (
        <MasterDashboardInfoModal
          title="Incomplete induction"
          subtitle={resolveWorkerName(expanded.record.worker_id, expanded.record.worker_name)}
          rows={[
            {
              label: "Worker",
              value: resolveWorkerName(expanded.record.worker_id, expanded.record.worker_name),
            },
            { label: "Induction", value: expanded.record.form_title || "—" },
            { label: "Status", value: expanded.record.status },
            {
              label: "Assigned",
              value: expanded.record.assigned_at?.slice(0, 10) || "—",
            },
          ]}
          actions={
            <button
              type="button"
              disabled={sendingInductionId === expanded.record.id}
              onClick={() => void handleSendInductionNotification(expanded.record)}
              className="inline-flex items-center gap-2 rounded-md bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {sendingInductionId === expanded.record.id ? (
                <Loader2 className="h-4 w-4 animate-spin" />
              ) : (
                <Bell className="h-4 w-4" />
              )}
              Send Notification
            </button>
          }
          onClose={() => setExpanded(null)}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
