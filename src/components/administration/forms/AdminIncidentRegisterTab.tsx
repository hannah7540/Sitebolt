"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Eye, Loader2 } from "lucide-react";
import {
  buildIncidentCsv,
  dispatchIncidentReportsRefresh,
  formatIncidentDateTime,
  incidentStatusBadgeClass,
  incidentStatusLabel,
  isIncidentUnread,
  INCIDENT_REPORTS_REFRESH_EVENT,
  INCIDENT_STATUS_OPTIONS,
  type IncidentReportRecord,
  type IncidentStatus,
} from "@/lib/incident-reports";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import AdminIncidentDetailModal from "@/components/administration/forms/AdminIncidentDetailModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export default function AdminIncidentRegisterTab() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [reports, setReports] = useState<IncidentReportRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<IncidentStatus | "all">("all");
  const [detailTarget, setDetailTarget] = useState<IncidentReportRecord | null>(null);

  const loadReports = useCallback(async () => {
    setLoading(true);
    try {
      const response = await fetch(`/api/incidents?_=${Date.now()}`, {
        cache: "no-store",
      });
      const payload = (await response.json().catch(() => null)) as {
        reports?: IncidentReportRecord[];
        error?: string;
      } | null;
      if (!response.ok) {
        const message = payload?.error ?? "Failed to load incidents.";
        console.error("[AdminIncidentRegisterTab] load failed:", message);
        showError(message);
        setReports([]);
        return;
      }
      setReports(Array.isArray(payload?.reports) ? payload.reports : []);
    } catch (cause) {
      const message = cause instanceof Error ? cause.message : "Failed to load incidents.";
      console.error("[AdminIncidentRegisterTab] load failed:", cause);
      showError(message);
      setReports([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadReports();
    const onRefresh = () => void loadReports();
    window.addEventListener(INCIDENT_REPORTS_REFRESH_EVENT, onRefresh);
    return () => window.removeEventListener(INCIDENT_REPORTS_REFRESH_EVENT, onRefresh);
  }, [loadReports]);

  const filteredReports = useMemo(() => {
    return (Array.isArray(reports) ? reports : []).filter((row) => {
      if (!row || typeof row !== "object") return false;
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      return true;
    });
  }, [reports, statusFilter]);

  const unreadCount = useMemo(
    () =>
      reports.filter((row) => row && isIncidentUnread(row)).length,
    [reports]
  );

  const handleExportCsv = () => {
    const csv = buildIncidentCsv(filteredReports);
    const blob = new Blob([csv], { type: "text/csv;charset=utf-8" });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement("a");
    anchor.href = url;
    anchor.download = `incident-register-${new Date().toISOString().slice(0, 10)}.csv`;
    anchor.click();
    URL.revokeObjectURL(url);
    showSuccess("CSV exported.");
  };

  return (
    <>
      <FormsAdminTabs active="incidents" unreadIncidents={unreadCount} />

      <div className="mt-6 space-y-4">
        {toast ? (
          <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
        ) : null}

        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Incidents Register</h2>
            <p className="text-sm text-slate-500">
              Review worker-submitted incident reports.
              {unreadCount > 0 ? (
                <span className="ml-2 inline-flex rounded-full bg-red-500 px-2 py-0.5 text-xs font-bold text-white">
                  {unreadCount} unread
                </span>
              ) : null}
            </p>
          </div>
          <div className="flex flex-wrap gap-2">
            <button
              type="button"
              onClick={handleExportCsv}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Export CSV
            </button>
            <button
              type="button"
              onClick={() => void loadReports()}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
            >
              Refresh
            </button>
          </div>
        </div>

        <div className={cn(cardClass, "p-4")}>
          <label htmlFor="incident-status-filter" className={labelClass}>
            Status
          </label>
          <select
            id="incident-status-filter"
            value={statusFilter}
            onChange={(e) =>
              setStatusFilter(e.target.value as IncidentStatus | "all")
            }
            className={cn(inputClass, "max-w-xs")}
          >
            <option value="all">All</option>
            {INCIDENT_STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {incidentStatusLabel(status)}
              </option>
            ))}
          </select>
        </div>

        <div className={cn(cardClass, "overflow-x-auto")}>
          {loading ? (
            <div className="flex items-center gap-2 p-6 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading incidents…
            </div>
          ) : filteredReports.length === 0 ? (
            <p className="p-6 text-sm text-slate-500">No incident reports found.</p>
          ) : (
            <table className="min-w-full text-left text-sm">
              <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                <tr>
                  <th className="px-4 py-3">Ref #</th>
                  <th className="px-4 py-3">Date/Time</th>
                  <th className="px-4 py-3">Project</th>
                  <th className="px-4 py-3">Injured Worker</th>
                  <th className="px-4 py-3">Treatment</th>
                  <th className="px-4 py-3">Notifiable</th>
                  <th className="px-4 py-3">Submitted By</th>
                  <th className="px-4 py-3">Status</th>
                  <th className="px-4 py-3">Actions</th>
                </tr>
              </thead>
              <tbody>
                {filteredReports.map((row) => (
                  <tr
                    key={row.id}
                    className={cn(
                      "border-b border-slate-100",
                      isIncidentUnread(row) ? "bg-red-50/40" : "bg-white"
                    )}
                  >
                    <td className="px-4 py-3 font-semibold text-slate-900">
                      {row.reference_number || "—"}
                      {isIncidentUnread(row) ? (
                        <span className="ml-2 rounded-full bg-red-500 px-1.5 py-0.5 text-[10px] font-bold text-white">
                          NEW
                        </span>
                      ) : null}
                    </td>
                    <td className="px-4 py-3 text-slate-600">
                      {formatIncidentDateTime(row.incident_date_time)}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.project_name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.injured_worker_name?.trim() || "—"}
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.treatment_details || "None"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          row.is_notifiable_under_whs
                            ? "bg-red-100 text-red-800"
                            : "bg-slate-100 text-slate-600"
                        )}
                      >
                        {row.is_notifiable_under_whs ? "Yes" : "No"}
                      </span>
                    </td>
                    <td className="px-4 py-3 text-slate-700">
                      {row.submitted_by_name ?? "—"}
                    </td>
                    <td className="px-4 py-3">
                      <span
                        className={cn(
                          "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
                          incidentStatusBadgeClass(row.status)
                        )}
                      >
                        {incidentStatusLabel(row.status)}
                      </span>
                    </td>
                    <td className="px-4 py-3">
                      <button
                        type="button"
                        onClick={() => setDetailTarget(row)}
                        className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                      >
                        <Eye className="h-3.5 w-3.5" />
                        View
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
        </div>
      </div>

      {detailTarget ? (
        <AdminIncidentDetailModal
          report={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={(updated) => {
            setReports((current) =>
              current.map((row) => (row.id === updated.id ? updated : row))
            );
            setDetailTarget(updated);
            dispatchIncidentReportsRefresh();
            showSuccess("Incident updated.");
          }}
        />
      ) : null}
    </>
  );
}
