"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { CheckCircle2, Eye, Loader2 } from "lucide-react";
import {
  fetchWorkerRequests,
  formatWorkerRequestDate,
  markWorkerRequestFulfilled,
  workerRequestStatusBadgeClass,
  WORKER_REQUEST_TYPES,
  type WorkerRequestRecord,
  type WorkerRequestStatus,
} from "@/lib/worker-requests-service";
import WorkerRequestDetailsDisplay from "@/components/administration/forms/WorkerRequestDetailsDisplay";
import FormsAdminTabs from "@/components/administration/forms/FormsAdminTabs";
import WorkerRequestDetailModal from "@/components/administration/forms/WorkerRequestDetailModal";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import { cardClass, inputClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

const STATUS_FILTERS: { id: WorkerRequestStatus | "all"; label: string }[] = [
  { id: "all", label: "All" },
  { id: "Pending", label: "Pending" },
  { id: "In Progress", label: "In Progress" },
  { id: "Fulfilled", label: "Fulfilled" },
];

export default function AdminRequestsRegisterTab() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [requests, setRequests] = useState<WorkerRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState<WorkerRequestStatus | "all">("all");
  const [typeFilter, setTypeFilter] = useState("");
  const [detailTarget, setDetailTarget] = useState<WorkerRequestRecord | null>(null);
  const [actingId, setActingId] = useState<string | null>(null);

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const { requests: rows, error } = await fetchWorkerRequests({ status: "all" });
      setRequests(rows);
      if (error) showError(error);
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to load requests.");
      setRequests([]);
    } finally {
      setLoading(false);
    }
  }, [showError]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const filteredRequests = useMemo(() => {
    return requests.filter((row) => {
      if (statusFilter !== "all" && row.status !== statusFilter) return false;
      if (typeFilter && row.request_type !== typeFilter) return false;
      return true;
    });
  }, [requests, statusFilter, typeFilter]);

  const pendingCount = useMemo(
    () => requests.filter((row) => row.status === "Pending").length,
    [requests]
  );

  const handleMarkFulfilled = async (request: WorkerRequestRecord) => {
    setActingId(request.id);
    try {
      const result = await markWorkerRequestFulfilled(request.id, "Admin");
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`${request.request_number} marked as fulfilled.`);
      await loadRequests();
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to fulfil request.");
    } finally {
      setActingId(null);
    }
  };

  return (
    <>
      <FormsAdminTabs active="requests" />

      <div className="mt-6 space-y-4">
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Requests Register</h2>
            <p className="text-sm text-slate-500">
              Uniform, tools, and equipment requests from workers.
              {pendingCount > 0 ? (
                <span className="ml-2 inline-flex rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                  {pendingCount} pending
                </span>
              ) : null}
            </p>
          </div>
          <button
            type="button"
            onClick={() => void loadRequests()}
            className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-50"
          >
            Refresh
          </button>
        </div>

        <div className={cn(cardClass, "grid gap-4 p-4 sm:grid-cols-2 lg:grid-cols-3")}>
          <div>
            <label htmlFor="request-status-filter" className={labelClass}>
              Status
            </label>
            <select
              id="request-status-filter"
              value={statusFilter}
              onChange={(event) =>
                setStatusFilter(event.target.value as WorkerRequestStatus | "all")
              }
              className={inputClass}
            >
              {STATUS_FILTERS.map((filter) => (
                <option key={filter.id} value={filter.id}>
                  {filter.label}
                </option>
              ))}
            </select>
          </div>
          <div>
            <label htmlFor="request-type-filter" className={labelClass}>
              Type
            </label>
            <select
              id="request-type-filter"
              value={typeFilter}
              onChange={(event) => setTypeFilter(event.target.value)}
              className={inputClass}
            >
              <option value="">All types</option>
              {WORKER_REQUEST_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className={cn(cardClass, "overflow-hidden")}>
          {loading ? (
            <div className="flex items-center gap-2 px-4 py-10 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading requests…
            </div>
          ) : filteredRequests.length === 0 ? (
            <p className="px-4 py-10 text-center text-sm text-slate-500">
              No worker requests match the current filters.
            </p>
          ) : (
            <div className="overflow-x-auto">
              <table className="min-w-[960px] w-full text-left text-sm">
                <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
                  <tr>
                    <th className="px-3 py-3">REQ No.</th>
                    <th className="px-3 py-3">Date Submitted</th>
                    <th className="px-3 py-3">Worker Name</th>
                    <th className="px-3 py-3">Project</th>
                    <th className="px-3 py-3">Type</th>
                    <th className="px-3 py-3">Details / Description</th>
                    <th className="px-3 py-3">Status</th>
                    <th className="px-3 py-3">Actions</th>
                  </tr>
                </thead>
                <tbody className="divide-y divide-slate-100">
                  {filteredRequests.map((request) => (
                    <tr key={request.id} className="hover:bg-slate-50/80">
                      <td className="px-3 py-3 font-semibold text-slate-900">
                        {request.request_number}
                      </td>
                      <td className="px-3 py-3 text-slate-700">
                        {formatWorkerRequestDate(request.created_at)}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{request.worker_name}</td>
                      <td className="px-3 py-3 text-slate-700">
                        {request.project_name ?? "—"}
                      </td>
                      <td className="px-3 py-3 text-slate-700">{request.request_type}</td>
                      <td className="max-w-xs px-3 py-3 text-slate-700">
                        <WorkerRequestDetailsDisplay request={request} />
                      </td>
                      <td className="px-3 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                            workerRequestStatusBadgeClass(request.status)
                          )}
                        >
                          {request.status}
                        </span>
                      </td>
                      <td className="px-3 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setDetailTarget(request)}
                            className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
                          >
                            <Eye className="h-3.5 w-3.5" />
                            Details
                          </button>
                          {request.status !== "Fulfilled" ? (
                            <button
                              type="button"
                              onClick={() => void handleMarkFulfilled(request)}
                              disabled={actingId === request.id}
                              className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-2.5 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                            >
                              {actingId === request.id ? (
                                <Loader2 className="h-3.5 w-3.5 animate-spin" />
                              ) : (
                                <CheckCircle2 className="h-3.5 w-3.5" />
                              )}
                              Mark as Fulfilled
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
        </div>
      </div>

      {detailTarget ? (
        <WorkerRequestDetailModal
          request={detailTarget}
          onClose={() => setDetailTarget(null)}
          onUpdated={() => {
            setDetailTarget(null);
            void loadRequests();
          }}
        />
      ) : null}

      {toast ? (
        <Toast
          message={toast.message}
          variant={toast.variant}
          onDismiss={dismissToast}
        />
      ) : null}
    </>
  );
}
