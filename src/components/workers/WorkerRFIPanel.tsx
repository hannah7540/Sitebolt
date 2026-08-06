"use client";

import { useCallback, useEffect, useState } from "react";
import { ChevronRight, Eye, Loader2 } from "lucide-react";
import {
  fetchWorkerRfis,
  formatRfiDate,
  rfiStatusBadgeClass,
  type RfiRecord,
} from "@/lib/rfi-service";
import WorkerActionRFIModal from "@/components/workers/WorkerActionRFIModal";
import RFIDetailModal from "@/components/administration/forms/RFIDetailModal";
import { cardClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerRFIPanelProps {
  workerId: string;
  onRefresh?: () => void;
}

export default function WorkerRFIPanel({ workerId, onRefresh }: WorkerRFIPanelProps) {
  const [assigned, setAssigned] = useState<RfiRecord[]>([]);
  const [submitted, setSubmitted] = useState<RfiRecord[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionTarget, setActionTarget] = useState<RfiRecord | null>(null);
  const [detailTarget, setDetailTarget] = useState<RfiRecord | null>(null);

  const loadRfis = useCallback(async () => {
    setLoading(true);
    try {
      const result = await fetchWorkerRfis(workerId);
      setAssigned(result.assigned);
      setSubmitted(result.submitted);
    } finally {
      setLoading(false);
    }
  }, [workerId]);

  useEffect(() => {
    void loadRfis();
  }, [loadRfis]);

  const handleCompleted = () => {
    void loadRfis();
    onRefresh?.();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 py-4 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading your RFIs…
      </div>
    );
  }

  const hasContent = assigned.length > 0 || submitted.length > 0;

  return (
    <div className="space-y-4">
      {assigned.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">
            Assigned RFIs ({assigned.length})
          </h3>
          <div className="space-y-2">
            {assigned.map((rfi) => (
              <div
                key={rfi.id}
                className={cn(
                  cardClass,
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                )}
              >
                <div className="min-w-0 flex-1">
                  <p className="text-xs font-semibold text-orange-600">{rfi.rfi_number}</p>
                  <p className="font-semibold text-slate-900">{rfi.title}</p>
                  <p className="mt-1 line-clamp-2 text-xs text-slate-500">{rfi.description}</p>
                  <p className="mt-1 text-xs text-slate-400">
                    From {rfi.requested_by_name}
                    {rfi.project_name ? ` · ${rfi.project_name}` : ""}
                  </p>
                </div>
                <button
                  type="button"
                  onClick={() => setActionTarget(rfi)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
                >
                  Action RFI
                  <ChevronRight className="h-4 w-4" />
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {submitted.length > 0 ? (
        <section className="space-y-3">
          <h3 className="text-sm font-semibold text-slate-800">My RFIs</h3>
          <div className="space-y-2">
            {submitted.map((rfi) => (
              <div
                key={rfi.id}
                className={cn(
                  cardClass,
                  "flex flex-col gap-3 p-4 sm:flex-row sm:items-center sm:justify-between"
                )}
              >
                <div className="min-w-0 flex-1">
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="text-xs font-semibold text-orange-600">{rfi.rfi_number}</p>
                    <span
                      className={cn(
                        "rounded-full px-2 py-0.5 text-xs font-semibold",
                        rfiStatusBadgeClass(rfi.status)
                      )}
                    >
                      {rfi.status}
                    </span>
                  </div>
                  <p className="font-semibold text-slate-900">{rfi.title}</p>
                  <p className="mt-1 text-xs text-slate-500">
                    Submitted {formatRfiDate(rfi.created_at)}
                    {rfi.assigned_to_name ? ` · Assigned to ${rfi.assigned_to_name}` : ""}
                  </p>
                  {(rfi.status === "Resolved" || rfi.status === "Closed") &&
                  (rfi.response_resolution || rfi.action_response) ? (
                    <p className="mt-2 line-clamp-2 rounded-lg bg-emerald-50 px-2 py-1.5 text-xs text-emerald-900">
                      {rfi.response_resolution ?? rfi.action_response}
                    </p>
                  ) : null}
                </div>
                <button
                  type="button"
                  onClick={() => setDetailTarget(rfi)}
                  className="inline-flex shrink-0 items-center justify-center gap-1 rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
                >
                  <Eye className="h-4 w-4" />
                  View
                </button>
              </div>
            ))}
          </div>
        </section>
      ) : null}

      {!hasContent ? (
        <p className="text-sm text-slate-500">
          No RFIs yet. Submit a request using the RFI tile above.
        </p>
      ) : null}

      {actionTarget ? (
        <WorkerActionRFIModal
          rfi={actionTarget}
          onClose={() => setActionTarget(null)}
          onCompleted={handleCompleted}
        />
      ) : null}

      {detailTarget ? (
        <RFIDetailModal rfi={detailTarget} onClose={() => setDetailTarget(null)} />
      ) : null}
    </div>
  );
}
