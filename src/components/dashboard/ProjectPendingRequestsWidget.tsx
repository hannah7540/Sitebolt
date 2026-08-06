"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import Link from "next/link";
import { Package, Loader2, CheckCircle2 } from "lucide-react";
import {
  fetchPendingWorkerRequests,
  formatWorkerRequestDate,
  markWorkerRequestFulfilled,
  type WorkerRequestRecord,
} from "@/lib/worker-requests-service";
import WorkerRequestDetailsDisplay from "@/components/administration/forms/WorkerRequestDetailsDisplay";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface ProjectPendingRequestsWidgetProps {
  projectId?: string | null;
  loading?: boolean;
  onUpdated?: () => void;
}

export default function ProjectPendingRequestsWidget({
  projectId = null,
  loading: externalLoading = false,
  onUpdated,
}: ProjectPendingRequestsWidgetProps) {
  const [requests, setRequests] = useState<WorkerRequestRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actingId, setActingId] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [resolvedIds, setResolvedIds] = useState<Set<string>>(() => new Set());

  const loadRequests = useCallback(async () => {
    setLoading(true);
    try {
      const rows = await fetchPendingWorkerRequests({ projectId });
      setRequests(rows);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load requests.");
    } finally {
      setLoading(false);
    }
  }, [projectId]);

  useEffect(() => {
    void loadRequests();
  }, [loadRequests]);

  const pendingRequests = useMemo(
    () => requests.filter((row) => row.status === "Pending" && !resolvedIds.has(row.id)),
    [requests, resolvedIds]
  );

  const handleMarkFulfilled = async (request: WorkerRequestRecord) => {
    setError(null);
    setActingId(request.id);
    try {
      const result = await markWorkerRequestFulfilled(request.id, "Admin");
      if (result.error) {
        setError(result.error);
        return;
      }
      setResolvedIds((current) => new Set(current).add(request.id));
      onUpdated?.();
      await loadRequests();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to fulfil request.");
    } finally {
      setActingId(null);
    }
  };

  const isLoading = loading || externalLoading;

  return (
    <div className={cn(cardClass, "p-6")}>
      <div className="mb-4 flex items-start gap-4">
        <div className="relative">
          <Package className="h-10 w-10 shrink-0 text-orange-500" />
          {pendingRequests.length > 0 ? (
            <span className="absolute -right-1 -top-1 flex h-5 min-w-5 items-center justify-center rounded-full bg-orange-600 px-1 text-[10px] font-bold text-white">
              {pendingRequests.length}
            </span>
          ) : null}
        </div>
        <div className="min-w-0 flex-1">
          <p className="text-sm text-slate-500">Pending Requests</p>
          <h2 className="text-2xl font-bold text-slate-900">
            {isLoading
              ? "Loading…"
              : pendingRequests.length > 0
                ? `${pendingRequests.length} Awaiting Fulfilment`
                : "All Clear"}
          </h2>
          <p className="mt-0.5 text-xs text-slate-400">
            Uniform, tools, and equipment requests from workers
            {projectId ? " for this project" : ""}
          </p>
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {isLoading ? (
        <div className="flex items-center gap-2 py-6 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading worker requests…
        </div>
      ) : pendingRequests.length === 0 ? (
        <p className="py-4 text-sm text-slate-500">
          No pending worker requests{projectId ? " for this project" : ""}.
        </p>
      ) : (
        <ul className="max-h-[28rem] space-y-3 overflow-y-auto">
          {pendingRequests.map((request) => (
            <li
              key={request.id}
              className="rounded-xl border border-orange-200 bg-orange-50/60 p-4"
            >
              <div className="mb-3 flex flex-wrap items-start justify-between gap-2">
                <div>
                  <p className="font-semibold text-slate-900">
                    {request.request_number} · {request.worker_name}
                  </p>
                  <p className="text-xs text-slate-500">
                    {formatWorkerRequestDate(request.created_at)} · {request.request_type}
                  </p>
                  <WorkerRequestDetailsDisplay
                    request={request}
                    variant="inline"
                    className="mt-1"
                  />
                </div>
                <span className="rounded-full bg-orange-100 px-2 py-0.5 text-xs font-semibold text-orange-800">
                  Pending
                </span>
              </div>
              <div className="flex flex-wrap gap-2">
                <button
                  type="button"
                  onClick={() => void handleMarkFulfilled(request)}
                  disabled={actingId === request.id}
                  className="inline-flex items-center gap-1 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
                >
                  {actingId === request.id ? (
                    <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  ) : (
                    <CheckCircle2 className="h-3.5 w-3.5" />
                  )}
                  Mark as Fulfilled
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      <div className="mt-4 border-t border-slate-200 pt-3">
        <Link
          href="/admin/forms/requests"
          className="text-xs font-semibold text-orange-600 hover:text-orange-700"
        >
          Open full Requests Register →
        </Link>
      </div>
    </div>
  );
}
