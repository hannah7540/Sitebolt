"use client";

import { useState, useEffect, useMemo, useCallback, useRef } from "react";
import {
  Plus,
  AlertTriangle,
  Link2,
  Pencil,
  UserX,
  UserCheck,
  Search,
  X,
} from "lucide-react";
import type { Worker, WorkerVoc } from "@/lib/supabase";
import {
  getWorkerAssignedProjectIds,
  isWorkerRevoked,
} from "@/lib/supabase";
import { requestWorkerRevokeAccess } from "@/lib/worker-revoke-client";
import {
  loadAssignmentMaps,
  resolveWorkerAssignedProjectName,
  setWorkerProjectAssignments,
} from "@/lib/project-assignments";
import { fetchProjects, getCachedProjects, type DbProject } from "@/lib/project-resolver";
import AssignToProjectsModal from "@/components/organisation/AssignToProjectsModal";
import {
  getExpiryWarningText,
  getTicketBadgeLabel,
  getWorkerTicketStatus,
  isNonCompliant,
} from "@/lib/worker-compliance";
import { isCompanyEmployeeWorker } from "@/lib/worker-utils";
import { groupVocsByWorker } from "@/lib/voc-utils";
import WorkerOnboardingModal from "./WorkerOnboardingModal";
import WorkerProfileView from "./WorkerProfileView";
import WorkerEditModal from "./WorkerEditModal";
import { ResendInviteButton } from "./ResendInviteButton";
import WorkerProfileAvatar from "@/components/ui/WorkerProfileAvatar";
import WorkerStateRegionBadge from "./WorkerStateRegionBadge";
import WorkerApprenticeBadge from "./WorkerApprenticeBadge";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  organisationRowDomId,
  scrollToOrganisationRow,
  shouldOpenDeepLinkModal,
  useOrganisationEntityDeepLink,
} from "@/hooks/useOrganisationEntityDeepLink";
import { cn } from "@/lib/utils";
import { inputClass } from "@/lib/ui-classes";

type WorkerTabFilter = "Current" | "Revoked" | "All";
type WorkerProfileTab = "basic" | "cards" | "inductions" | "financial";

interface WorkerDirectoryPanelProps {
  workers: Worker[];
  workerVocs: WorkerVoc[];
  loading: boolean;
  onRefresh: () => void;
  onWorkerUpdated?: (worker: Worker) => void;
  initialShowAdd?: boolean;
  hideFinancialFields?: boolean;
  canAssignPayRules?: boolean;
  canManageWorkerRoles?: boolean;
}

function TicketBadge({
  worker,
  vocs,
}: {
  worker: Worker;
  vocs: WorkerVoc[];
}) {
  const status = getWorkerTicketStatus(worker, vocs);
  const styles = {
    valid: "bg-emerald-100 text-emerald-800",
    expires_soon: "bg-amber-100 text-amber-800",
    expired: "bg-red-100 text-red-800",
    unknown: "bg-slate-100 text-slate-600",
  };
  return (
    <span className={cn("rounded px-2 py-1 text-xs font-bold", styles[status])}>
      {getTicketBadgeLabel(status)}
    </span>
  );
}

function WorkerStatusBadge({ worker }: { worker: Worker }) {
  if (isWorkerRevoked(worker)) {
    return (
      <span className="rounded bg-slate-200 px-2 py-1 text-xs font-bold text-slate-700">
        Revoked
      </span>
    );
  }

  const status = worker.status ?? "active";
  const map: Record<string, string> = {
    active: "bg-green-100 text-green-800",
    pending_induction: "bg-blue-100 text-blue-800",
    expired_ticket: "bg-red-100 text-red-800",
  };
  const completed = worker.onboarding_completed === true;
  const label =
    status === "expired_ticket"
      ? "Non-Compliant"
      : completed || status === "active"
        ? "Active"
        : status === "pending_induction"
          ? "Pending Induction"
          : "Active";
  const badgeClass =
    status === "expired_ticket"
      ? map.expired_ticket
      : completed || status === "active"
        ? map.active
        : map[status] ?? map.active;

  return (
    <span className={cn("rounded px-2 py-1 text-xs font-bold", badgeClass)}>
      {label}
    </span>
  );
}

const TAB_FILTERS: Array<{ id: WorkerTabFilter; label: string }> = [
  { id: "Current", label: "Current Workers" },
  { id: "Revoked", label: "Revoked Workers" },
  { id: "All", label: "All" },
];

async function loadWorkerAuthSignInStatus(
  workers: Worker[]
): Promise<{
  lastSignInByWorkerId: Record<string, string | null>;
  syncedWorkerIds: string[];
}> {
  const entries = workers.map((worker) => ({
    workerId: worker.id,
    authUserId: worker.auth_user_id ?? null,
  }));

  if (entries.length === 0) {
    return { lastSignInByWorkerId: {}, syncedWorkerIds: [] };
  }

  const response = await fetch("/api/workers/auth-status", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ entries }),
  });

  const data = (await response.json()) as {
    lastSignInByWorkerId?: Record<string, string | null>;
    syncedWorkerIds?: string[];
    error?: string;
  };

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to load worker auth status.");
  }

  return {
    lastSignInByWorkerId: data.lastSignInByWorkerId ?? {},
    syncedWorkerIds: data.syncedWorkerIds ?? [],
  };
}

export default function WorkerDirectoryPanel({
  workers,
  workerVocs,
  loading,
  onRefresh,
  onWorkerUpdated,
  initialShowAdd = false,
  hideFinancialFields = false,
  canAssignPayRules = false,
  canManageWorkerRoles = false,
}: WorkerDirectoryPanelProps) {
  const { target, hasDeepLink, clearDeepLink } = useOrganisationEntityDeepLink();
  const deepLinkHandledRef = useRef<string | null>(null);
  const [workerList, setWorkerList] = useState<Worker[]>(workers);
  const [workerTab, setWorkerTab] = useState<WorkerTabFilter>("Current");
  const [showModal, setShowModal] = useState(initialShowAdd);
  const [selectedWorker, setSelectedWorker] = useState<Worker | null>(null);
  const [editingWorker, setEditingWorker] = useState<Worker | null>(null);
  const [profileInitialTab, setProfileInitialTab] = useState<WorkerProfileTab>("basic");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [assignWorker, setAssignWorker] = useState<Worker | null>(null);
  const [workerProjectMap, setWorkerProjectMap] = useState<Map<string, string[]>>(new Map());
  const [projects, setProjects] = useState<DbProject[]>(() => getCachedProjects());
  const [actionId, setActionId] = useState<string | null>(null);
  const [lastSignInByWorkerId, setLastSignInByWorkerId] = useState<
    Record<string, string | null>
  >({});
  const [searchQuery, setSearchQuery] = useState("");
  const { toast, showError, showSuccess, dismissToast } = useFormToast();

  useEffect(() => {
    setWorkerList(workers);
  }, [workers]);

  useEffect(() => {
    let cancelled = false;

    void loadWorkerAuthSignInStatus(workers)
      .then(({ lastSignInByWorkerId: statuses, syncedWorkerIds }) => {
        if (cancelled) return;

        setLastSignInByWorkerId(statuses);

        if (syncedWorkerIds.length > 0) {
          setWorkerList((current) =>
            current.map((worker) =>
              syncedWorkerIds.includes(worker.id)
                ? { ...worker, status: "active" }
                : worker
            )
          );
        }
      })
      .catch(() => {
        if (!cancelled) setLastSignInByWorkerId({});
      });

    return () => {
      cancelled = true;
    };
  }, [workers]);

  const loadAssignments = useCallback(async () => {
    await fetchProjects();
    setProjects(getCachedProjects());
    const { workerByProject } = await loadAssignmentMaps();
    setWorkerProjectMap(workerByProject);
  }, []);

  useEffect(() => {
    void loadAssignments();
  }, [loadAssignments, workers.length]);

  const vocsByWorker = useMemo(
    () => groupVocsByWorker(workerVocs),
    [workerVocs]
  );

  const tabFilteredWorkers = useMemo(() => {
    return workerList.filter((w) => {
      if (!isCompanyEmployeeWorker(w)) return false;

      const isRevoked = Boolean(
        w.is_revoked === true ||
          String(w.is_revoked) === "true" ||
          w.status === "Revoked" ||
          w.is_archived === true
      );

      if (workerTab === "Revoked") return isRevoked;
      if (workerTab === "Current") return !isRevoked;
      return true;
    });
  }, [workerList, workerTab]);

  const filteredWorkers = useMemo(() => {
    if (!searchQuery.trim()) return tabFilteredWorkers;

    const q = searchQuery.toLowerCase().trim();

    return tabFilteredWorkers.filter((item) => {
      const firstName = (item.first_name || "").toLowerCase();
      const lastName = (item.last_name || "").toLowerCase();
      const fullName = (item.full_name || "").toLowerCase();
      const email = (item.email || "").toLowerCase();
      const phone = (item.phone || "").toLowerCase();
      const tradeRole = (
        item.trade ||
        (item as Worker & { trade_role?: string | null }).trade_role ||
        ""
      ).toLowerCase();
      const workerNumber = (
        item.worker_code ||
        (item as Worker & { worker_number?: string | null }).worker_number ||
        ""
      ).toLowerCase();

      return (
        firstName.includes(q) ||
        lastName.includes(q) ||
        fullName.includes(q) ||
        email.includes(q) ||
        phone.includes(q) ||
        tradeRole.includes(q) ||
        workerNumber.includes(q)
      );
    });
  }, [tabFilteredWorkers, searchQuery]);

  useEffect(() => {
    if (initialShowAdd) setShowModal(true);
  }, [initialShowAdd]);

  const patchWorker = (updated: Worker) => {
    setWorkerList((prev) =>
      prev.map((row) => (row.id === updated.id ? updated : row))
    );
    onWorkerUpdated?.(updated);
  };

  const handleRevokeToggle = async (worker: Worker) => {
    const revoked = !isWorkerRevoked(worker);
    const snapshot = worker;

    setActionId(worker.id);
    setWorkerList((prev) =>
      prev.map((row) =>
        row.id === worker.id
          ? {
              ...row,
              is_revoked: revoked,
              is_archived: revoked,
              status: revoked ? "Revoked" : "active",
              assigned_project_id: revoked ? null : row.assigned_project_id,
              assigned_project_name: revoked ? "Unassigned" : row.assigned_project_name,
              project_id: revoked ? null : row.project_id,
              project_name: revoked ? "Unassigned" : row.project_name,
              assigned_project_ids: revoked ? [] : row.assigned_project_ids,
            }
          : row
      )
    );

    const { error, message } = await requestWorkerRevokeAccess(worker.id, revoked);
    setActionId(null);

    if (error) {
      setWorkerList((prev) =>
        prev.map((row) => (row.id === worker.id ? snapshot : row))
      );
      showError(error);
      return;
    }

    if (revoked) {
      showSuccess(message ?? "Worker access successfully revoked.");
    } else {
      showSuccess(message ?? "Worker access restored.");
    }

    onWorkerUpdated?.({
      ...worker,
      is_revoked: revoked,
      is_archived: revoked,
      status: revoked ? "Revoked" : "active",
      assigned_project_id: revoked ? null : worker.assigned_project_id,
      assigned_project_name: revoked ? "Unassigned" : worker.assigned_project_name,
      project_id: revoked ? null : worker.project_id,
      project_name: revoked ? "Unassigned" : worker.project_name,
      assigned_project_ids: revoked ? [] : worker.assigned_project_ids,
    });
  };

  const openWorkerProfile = (worker: Worker, tab: WorkerProfileTab = "basic") => {
    setProfileInitialTab(tab);
    setSelectedWorker(worker);
  };

  useEffect(() => {
    if (!hasDeepLink || !target.id || loading) return;

    const deepLinkKey = `${target.id}:${target.ticketId ?? ""}:${target.tab ?? ""}`;
    if (deepLinkHandledRef.current === deepLinkKey) return;

    const worker = workerList.find((row) => row?.id === target.id);
    if (!worker) {
      console.warn("Worker deep link: worker not found", target.id);
      showError("Item not found or has been removed.");
      deepLinkHandledRef.current = deepLinkKey;
      clearDeepLink();
      return;
    }

    deepLinkHandledRef.current = deepLinkKey;
    setHighlightId(worker.id);
    scrollToOrganisationRow(organisationRowDomId("worker", worker.id));

    if (!shouldOpenDeepLinkModal(target)) return;

    const tab =
      target.tab === "cards" ||
      target.tab === "basic" ||
      target.tab === "inductions" ||
      target.tab === "financial"
        ? target.tab
        : target.ticketId
          ? "cards"
          : "basic";

    openWorkerProfile(worker, tab);
  }, [clearDeepLink, hasDeepLink, loading, showError, target, workerList]);

  const closeWorkerProfile = () => {
    setSelectedWorker(null);
    setHighlightId(null);
    clearDeepLink();
  };

  if (selectedWorker) {
    return (
      <WorkerProfileView
        worker={selectedWorker}
        workers={workers}
        initialVocs={vocsByWorker[selectedWorker.id] ?? []}
        projects={projects}
        initialTab={profileInitialTab}
        lastSignInAt={lastSignInByWorkerId[selectedWorker.id] ?? null}
        canAssignPayRules={canAssignPayRules}
        canManageWorkerRoles={canManageWorkerRoles}
        onBack={closeWorkerProfile}
        onWorkerUpdated={(updated) => {
          patchWorker(updated);
          setSelectedWorker(updated);
        }}
      />
    );
  }

  return (
    <div>
      <div className="mb-6 flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-orange-500">Worker Directory</h1>
          <p className="text-sm text-slate-500">
            Organisation master directory · onboarding, certifications, project allocation
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowModal(true)}
          className="flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 font-semibold text-white hover:bg-orange-500"
        >
          <Plus className="h-5 w-5" /> Add Worker
        </button>
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {TAB_FILTERS.map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setWorkerTab(tab.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              workerTab === tab.id
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600"
            )}
          >
            {tab.label}
          </button>
        ))}
      </div>

      <div className="relative mb-4">
        <Search
          className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400"
          aria-hidden
        />
        <input
          type="search"
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          placeholder="Search workers by Name, Email, Phone, Role/Trade, or Worker #..."
          className={cn(inputClass, "w-full py-2.5 pl-10", searchQuery ? "pr-10" : "pr-4")}
          aria-label="Search workers"
        />
        {searchQuery ? (
          <button
            type="button"
            onClick={() => setSearchQuery("")}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Clear search"
          >
            <X className="h-4 w-4" />
          </button>
        ) : null}
      </div>

      <div className="overflow-hidden rounded-xl border border-slate-200 bg-white shadow-sm">
        <table className="w-full text-left text-sm">
          <thead className="bg-slate-50 text-slate-500">
            <tr>
              <th className="p-4">Name</th>
              <th className="p-4">Contact</th>
              <th className="p-4">Trade</th>
              <th className="p-4">Licence Expiry</th>
              <th className="p-4">VOCs</th>
              <th className="p-4">Ticket Status</th>
              <th className="p-4">Worker Status</th>
              <th className="p-4">Projects</th>
              <th className="p-4">Actions</th>
            </tr>
          </thead>
          <tbody>
            {filteredWorkers.map((w) => {
              const vocs = vocsByWorker[w.id] ?? [];
              const warning = getExpiryWarningText(w, vocs);
              const nonCompliant = isNonCompliant(w, vocs);
              const revoked = isWorkerRevoked(w);
              const assignedProjectIds = [
                ...new Set([
                  ...getWorkerAssignedProjectIds(w),
                  ...(workerProjectMap.get(w.id) ?? []),
                ]),
              ];
              const assignedProjects = projects.filter((project) =>
                assignedProjectIds.includes(project.id)
              );
              return (
                <tr
                  key={w.id}
                  id={organisationRowDomId("worker", w.id)}
                  className={cn(
                    "border-t border-slate-200 cursor-pointer hover:bg-orange-50",
                    nonCompliant && "bg-red-50",
                    highlightId === w.id && "ring-2 ring-inset ring-orange-300 bg-orange-50"
                  )}
                  onClick={() => openWorkerProfile(w)}
                >
                  <td className="p-4">
                    <div className="flex flex-wrap items-center gap-2">
                      <div onClick={(event) => event.stopPropagation()}>
                        <WorkerProfileAvatar
                          photoUrl={w.photo_url}
                          worker={w}
                          displayName={w.full_name}
                          size="sm"
                        />
                      </div>
                      <p className="font-semibold text-slate-900">{w.full_name}</p>
                      {w.is_apprentice ? <WorkerApprenticeBadge /> : null}
                      <WorkerStateRegionBadge state={w.state} />
                    </div>
                    {warning && (
                      <p
                        className={cn(
                          "mt-1 flex items-center gap-1 text-xs",
                          nonCompliant ? "text-red-400" : "text-amber-400"
                        )}
                      >
                        <AlertTriangle className="h-3 w-3 shrink-0" />
                        {warning}
                      </p>
                    )}
                  </td>
                  <td className="p-4 text-slate-600">
                    <p>{w.email}</p>
                    <p className="text-xs text-slate-500">{w.phone || "—"}</p>
                  </td>
                  <td className="p-4 text-slate-600">{w.trade || "—"}</td>
                  <td className="p-4 text-slate-600">
                    {w.drivers_licence_expiry ?? "—"}
                  </td>
                  <td className="p-4 text-slate-600">
                    {vocs.length > 0 ? (
                      <span className="text-xs">
                        {vocs.length} VOC{vocs.length === 1 ? "" : "s"}
                      </span>
                    ) : (
                      "—"
                    )}
                  </td>
                  <td className="p-4">
                    <TicketBadge worker={w} vocs={vocs} />
                  </td>
                  <td className="p-4">
                    <WorkerStatusBadge worker={w} />
                  </td>
                  <td className="p-4 text-slate-500">
                    {assignedProjects.length > 0
                      ? assignedProjects.map((project) => project.name).join(", ")
                      : resolveWorkerAssignedProjectName(w)}
                  </td>
                  <td className="p-4">
                    <div
                      className="flex flex-wrap gap-1.5"
                      onClick={(event) => event.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setEditingWorker(w)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
                      >
                        <Pencil className="h-3.5 w-3.5" />
                        Edit
                      </button>
                      {!revoked && (
                        <button
                          type="button"
                          onClick={() => setAssignWorker(w)}
                          className="inline-flex items-center gap-1 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1.5 text-xs font-semibold text-orange-800 hover:bg-orange-100"
                        >
                          <Link2 className="h-3.5 w-3.5" />
                          Assign
                        </button>
                      )}
                      <ResendInviteButton
                        worker={w}
                        lastSignInAt={lastSignInByWorkerId[w.id] ?? null}
                        onSuccess={(message, inviteSentAt) => {
                          showSuccess(message);
                          if (inviteSentAt) {
                            patchWorker({ ...w, invite_sent_at: inviteSentAt });
                          }
                        }}
                        onError={showError}
                      />
                      <button
                        type="button"
                        disabled={actionId === w.id}
                        onClick={() => void handleRevokeToggle(w)}
                        className={cn(
                          "inline-flex items-center gap-1 rounded-lg border px-2.5 py-1.5 text-xs font-semibold disabled:opacity-50",
                          revoked
                            ? "border-emerald-200 text-emerald-700 hover:bg-emerald-50"
                            : "border-red-200 text-red-700 hover:bg-red-50"
                        )}
                      >
                        {revoked ? (
                          <>
                            <UserCheck className="h-3.5 w-3.5" />
                            Reactivate
                          </>
                        ) : (
                          <>
                            <UserX className="h-3.5 w-3.5" />
                            Revoke
                          </>
                        )}
                      </button>
                    </div>
                  </td>
                </tr>
              );
            })}
            {filteredWorkers.length === 0 && !loading && searchQuery.trim() ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
                  <p>No workers match &quot;{searchQuery.trim()}&quot;.</p>
                  <button
                    type="button"
                    onClick={() => setSearchQuery("")}
                    className="mt-4 inline-flex items-center gap-1.5 rounded-lg border border-slate-200 bg-white px-4 py-2 text-sm font-semibold text-slate-700 hover:border-orange-300 hover:text-orange-600"
                  >
                    <X className="h-4 w-4" />
                    Clear Search
                  </button>
                </td>
              </tr>
            ) : null}
            {filteredWorkers.length === 0 && !loading && !searchQuery.trim() ? (
              <tr>
                <td colSpan={9} className="p-8 text-center text-slate-500">
                  {workerTab === "Current"
                    ? "No current workers. Add a worker or reactivate someone from Revoked Workers."
                    : workerTab === "Revoked"
                      ? "No revoked workers."
                      : 'No workers yet. Click "Add Worker" to start onboarding.'}
                </td>
              </tr>
            ) : null}
          </tbody>
        </table>
      </div>

      {showModal && (
        <WorkerOnboardingModal
          onClose={() => setShowModal(false)}
          onSaved={onRefresh}
          hideFinancialFields={hideFinancialFields}
        />
      )}

      {toast && (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      )}

      {editingWorker && (
        <WorkerEditModal
          worker={editingWorker}
          onClose={() => setEditingWorker(null)}
          onSaved={(updated) => {
            patchWorker(updated);
          }}
          canManageWorkerRoles={canManageWorkerRoles}
        />
      )}

      {assignWorker && (
        <AssignToProjectsModal
          title={`Assign ${assignWorker.full_name} to Projects`}
          subtitle="Select one or more active projects for this worker."
          initialProjectIds={[
            ...new Set([
              ...getWorkerAssignedProjectIds(assignWorker),
              ...(workerProjectMap.get(assignWorker.id) ?? []),
            ]),
          ]}
          onClose={() => setAssignWorker(null)}
          onSave={async (projectIds) => {
            const { error } = await setWorkerProjectAssignments(assignWorker, projectIds);
            if (!error) {
              await loadAssignments();
              onRefresh();
            }
            return { error };
          }}
        />
      )}
    </div>
  );
}
