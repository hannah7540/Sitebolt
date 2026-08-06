"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2, UserPlus } from "lucide-react";
import type { DbProject } from "@/lib/project-resolver";
import type { Worker } from "@/lib/supabase";
import {
  assignRfi,
  collectRfiFilterOptions,
  fetchRfis,
  fetchRfiProjectOptions,
  filterRfisByRegisterOptions,
  formatRfiDate,
  RFI_PRIORITY_OPTIONS,
  rfiPriorityBadgeClass,
  rfiStatusBadgeClass,
  type RfiPriority,
  type RfiProjectOption,
  type RfiRecord,
  type RfiRegisterFilter,
} from "@/lib/rfi-service";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import RFIAssignModal from "@/components/administration/forms/RFIAssignModal";
import RFIDetailModal from "@/components/administration/forms/RFIDetailModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { id: RfiRegisterFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "open", label: "Open" },
  { id: "pending", label: "Pending" },
  { id: "resolved", label: "Resolved" },
  { id: "closed", label: "Closed" },
];

interface RFIRegisterTabProps {
  workers: Worker[];
  projects: DbProject[];
}

function truncate(value: string | null | undefined, length = 48): string {
  if (!value) return "—";
  return value.length > length ? `${value.slice(0, length)}…` : value;
}

export default function RFIRegisterTab({ workers, projects }: RFIRegisterTabProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [allRfis, setAllRfis] = useState<RfiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<RfiRegisterFilter>("all");
  const [priorityFilter, setPriorityFilter] = useState<RfiPriority | "">("");
  const [categoryFilter, setCategoryFilter] = useState("");
  const [zoneFilter, setZoneFilter] = useState("");
  const [projectFilterId, setProjectFilterId] = useState("");
  const [detailTarget, setDetailTarget] = useState<RfiRecord | null>(null);
  const [assignTarget, setAssignTarget] = useState<RfiRecord | null>(null);
  const [assigning, setAssigning] = useState(false);
  const [actionId, setActionId] = useState<string | null>(null);
  const [projectOptions, setProjectOptions] = useState<RfiProjectOption[]>([]);

  const loadRfis = useCallback(async () => {
    setLoading(true);
    try {
      const { rfis: rows, error } = await fetchRfis({ filter: "all" });
      setAllRfis(rows);
      if (error) showError(error);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to load RFIs.");
      setAllRfis([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadRfis();
  }, [loadRfis]);

  useEffect(() => {
    let cancelled = false;
    void fetchRfiProjectOptions(projects).then((options) => {
      if (!cancelled) setProjectOptions(options);
    });
    return () => {
      cancelled = true;
    };
  }, [projects]);

  const filterOptions = useMemo(
    () => collectRfiFilterOptions(allRfis),
    [allRfis]
  );

  const rfis = useMemo(
    () =>
      filterRfisByRegisterOptions(allRfis, {
        status: statusFilter,
        priority: priorityFilter,
        category: categoryFilter,
        zoneArea: zoneFilter,
        projectId: projectFilterId || null,
      }),
    [
      allRfis,
      statusFilter,
      priorityFilter,
      categoryFilter,
      zoneFilter,
      projectFilterId,
    ]
  );

  const handleAssign = async (workerId: string, workerName: string) => {
    if (!assignTarget) return;
    setAssigning(true);
    setActionId(assignTarget.id);
    try {
      const result = await assignRfi({
        rfiId: assignTarget.id,
        assignedToId: workerId,
        assignedToName: workerName,
      });
      if (result.error || !result.rfi) {
        showError(result.error ?? "Assignment failed.");
        return;
      }
      showSuccess(`RFI assigned to ${workerName}.`);
      setAssignTarget(null);
      if (detailTarget?.id === result.rfi.id) {
        setDetailTarget(result.rfi);
      }
      await loadRfis();
    } finally {
      setAssigning(false);
      setActionId(null);
    }
  };

  return (
    <div className="space-y-4">
      <FormsAdminTabs active="rfi" />

      <div>
        <h2 className="text-2xl font-bold text-slate-900">RFI Register</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review, assign, resolve, and close out Requests for Information.
        </p>
      </div>

      <div className="flex flex-wrap items-end gap-3">
        <label className="space-y-1">
          <span className={labelClass}>Status</span>
          <select
            className={inputClass}
            value={statusFilter}
            onChange={(event) => setStatusFilter(event.target.value as RfiRegisterFilter)}
          >
            {STATUS_FILTERS.map((filter) => (
              <option key={filter.id} value={filter.id}>
                {filter.label}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Priority</span>
          <select
            className={inputClass}
            value={priorityFilter}
            onChange={(event) =>
              setPriorityFilter(event.target.value as RfiPriority | "")
            }
          >
            <option value="">All priorities</option>
            {RFI_PRIORITY_OPTIONS.map((priority) => (
              <option key={priority} value={priority}>
                {priority}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Category</span>
          <select
            className={inputClass}
            value={categoryFilter}
            onChange={(event) => setCategoryFilter(event.target.value)}
          >
            <option value="">All categories</option>
            {filterOptions.categories.map((category) => (
              <option key={category} value={category}>
                {category}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Zone / Area</span>
          <select
            className={inputClass}
            value={zoneFilter}
            onChange={(event) => setZoneFilter(event.target.value)}
          >
            <option value="">All zones</option>
            {filterOptions.zoneAreas.map((zone) => (
              <option key={zone} value={zone}>
                {zone}
              </option>
            ))}
          </select>
        </label>

        <label className="space-y-1">
          <span className={labelClass}>Project</span>
          <select
            className={inputClass}
            value={projectFilterId}
            onChange={(event) => setProjectFilterId(event.target.value)}
          >
            <option value="">All projects</option>
            {projectOptions.map((project) => (
              <option key={project.id} value={project.id}>
                {project.name}
              </option>
            ))}
          </select>
        </label>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading RFIs…
        </div>
      ) : rfis.length === 0 ? (
        <div className={cn(cardClass, "px-4 py-8 text-center text-sm text-slate-500")}>
          No RFIs match the current filters.
        </div>
      ) : (
        <div className="overflow-x-auto rounded-xl border border-slate-200 bg-white">
          <table className="min-w-[1800px] text-left text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-xs font-semibold uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-3 py-3">RFI No.</th>
                <th className="px-3 py-3">Date Raised</th>
                <th className="px-3 py-3">Zone / Area</th>
                <th className="px-3 py-3">Category</th>
                <th className="px-3 py-3">Discipline</th>
                <th className="px-3 py-3">Subject</th>
                <th className="px-3 py-3">Raised By</th>
                <th className="px-3 py-3">Assigned To</th>
                <th className="px-3 py-3">Priority</th>
                <th className="px-3 py-3">Status</th>
                <th className="px-3 py-3">Due Date</th>
                <th className="px-3 py-3">Response / Resolution</th>
                <th className="px-3 py-3">Action Required</th>
                <th className="px-3 py-3">Close-Out Date</th>
                <th className="px-3 py-3">Closed By</th>
                <th className="px-3 py-3">Attachments</th>
                <th className="px-3 py-3">Comments</th>
                <th className="px-3 py-3 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {rfis.map((rfi) => (
                <tr key={rfi.id} className="hover:bg-slate-50/80">
                  <td className="px-3 py-3 font-medium text-orange-700">{rfi.rfi_number}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {formatRfiDate(rfi.date_raised ?? rfi.created_at)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{rfi.zone_area ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{rfi.category ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">{rfi.discipline ?? "—"}</td>
                  <td className="max-w-[220px] px-3 py-3 font-medium text-slate-900">
                    {truncate(rfi.subject || rfi.title, 60)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{rfi.raised_by}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {rfi.assigned_to_name ?? "—"}
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        rfiPriorityBadgeClass(rfi.priority)
                      )}
                    >
                      {rfi.priority}
                    </span>
                  </td>
                  <td className="px-3 py-3">
                    <span
                      className={cn(
                        "inline-flex rounded-full px-2 py-0.5 text-xs font-semibold",
                        rfiStatusBadgeClass(rfi.status)
                      )}
                    >
                      {rfi.status}
                    </span>
                  </td>
                  <td className="px-3 py-3 text-slate-700">{formatRfiDate(rfi.due_date)}</td>
                  <td className="max-w-[180px] px-3 py-3 text-slate-700">
                    {truncate(rfi.response_resolution)}
                  </td>
                  <td className="max-w-[160px] px-3 py-3 text-slate-700">
                    {truncate(rfi.action_required)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">
                    {formatRfiDate(rfi.close_out_date)}
                  </td>
                  <td className="px-3 py-3 text-slate-700">{rfi.closed_by ?? "—"}</td>
                  <td className="px-3 py-3 text-slate-700">
                    {rfi.attachments.length + (rfi.document_url ? 1 : 0) || "—"}
                  </td>
                  <td className="max-w-[160px] px-3 py-3 text-slate-700">
                    {truncate(rfi.comments)}
                  </td>
                  <td className="px-3 py-3">
                    <div className="flex items-center justify-end gap-2">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(rfi)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                      {rfi.status === "Open" ? (
                        <button
                          type="button"
                          disabled={actionId === rfi.id}
                          onClick={() => setAssignTarget(rfi)}
                          className="inline-flex items-center gap-1 rounded-lg bg-orange-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
                        >
                          {actionId === rfi.id ? (
                            <Loader2 className="h-3.5 w-3.5 animate-spin" />
                          ) : (
                            <UserPlus className="h-3.5 w-3.5" />
                          )}
                          Assign
                        </button>
                      ) : null}
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {detailTarget ? (
        <RFIDetailModal
          rfi={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={(updated) => {
            setDetailTarget(updated);
            void loadRfis();
          }}
          onAssign={
            detailTarget.status === "Open"
              ? () => {
                  setAssignTarget(detailTarget);
                  setDetailTarget(null);
                }
              : undefined
          }
        />
      ) : null}

      {assignTarget ? (
        <RFIAssignModal
          workers={workers}
          assigning={assigning}
          onClose={() => setAssignTarget(null)}
          onAssign={handleAssign}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </div>
  );
}
