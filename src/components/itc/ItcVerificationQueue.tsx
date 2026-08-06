"use client";

import { useCallback, useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import {
  fetchPendingChangeRequests,
  fetchVerificationQueue,
  reviewItcChangeRequest,
  verifyItcSignoff,
  type ItcChangeRequest,
  type ItcSignoff,
} from "@/lib/itc-service";
import { cardClass } from "@/lib/ui-classes";

interface ItcVerificationQueueProps {
  projectId: string;
  reviewerId: string;
  reviewerName: string;
  onUpdated: () => void;
}

export default function ItcVerificationQueue({
  projectId,
  reviewerId,
  reviewerName,
  onUpdated,
}: ItcVerificationQueueProps) {
  const [signoffs, setSignoffs] = useState<ItcSignoff[]>([]);
  const [changeRequests, setChangeRequests] = useState<ItcChangeRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const [actionMessage, setActionMessage] = useState<string | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    const [queue, crs] = await Promise.all([
      fetchVerificationQueue(projectId),
      fetchPendingChangeRequests(projectId),
    ]);
    setSignoffs(queue);
    setChangeRequests(crs);
    setLoading(false);
  }, [projectId]);

  useEffect(() => {
    void load();
  }, [load]);

  const handleVerify = async (signoffId: string) => {
    const result = await verifyItcSignoff({
      signoffId,
      verifiedBy: reviewerId,
      verifiedByName: reviewerName,
    });
    setActionMessage(result.error ?? "Sign-off verified.");
    await load();
    onUpdated();
  };

  const handleReviewCr = async (
    request: ItcChangeRequest,
    status: "approved" | "rejected"
  ) => {
    const result = await reviewItcChangeRequest({
      requestId: request.id,
      itcId: request.itc_id,
      status,
      reviewedBy: reviewerId,
      reviewedByName: reviewerName,
    });
    setActionMessage(result.error ?? `Change request ${status}.`);
    await load();
    onUpdated();
  };

  if (loading) {
    return (
      <div className="flex items-center gap-2 text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading queues…
      </div>
    );
  }

  return (
    <div className="grid gap-4 lg:grid-cols-2">
      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Crew Verification Queue</h3>
          <p className="text-xs text-slate-500">Leading hand counter-verification</p>
        </div>
        <div className="space-y-3 p-4">
          {signoffs.length === 0 ? (
            <p className="text-sm text-slate-500">No submitted sign-offs awaiting verification.</p>
          ) : (
            signoffs.map((signoff) => (
              <div key={signoff.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-900">
                  Step {signoff.step_index + 1} — {signoff.author_name}
                </p>
                <p className="text-xs text-slate-500">{signoff.comments ?? "No comments"}</p>
                <button
                  type="button"
                  onClick={() => void handleVerify(signoff.id)}
                  className="mt-2 rounded-lg bg-emerald-600 px-3 py-1.5 text-xs font-semibold text-white hover:bg-emerald-500"
                >
                  Counter-Verify
                </button>
              </div>
            ))
          )}
        </div>
      </div>

      <div className={cardClass}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h3 className="font-semibold text-slate-900">Admin Change Request Queue</h3>
          <p className="text-xs text-slate-500">Submitted entry alteration requests</p>
        </div>
        <div className="space-y-3 p-4">
          {changeRequests.length === 0 ? (
            <p className="text-sm text-slate-500">No pending change requests.</p>
          ) : (
            changeRequests.map((request) => (
              <div key={request.id} className="rounded-lg border border-slate-200 p-3">
                <p className="font-medium text-slate-900">{request.requested_by_name}</p>
                <p className="text-sm text-slate-600">{request.reason}</p>
                <div className="mt-2 flex gap-2">
                  <button
                    type="button"
                    onClick={() => void handleReviewCr(request, "approved")}
                    className="rounded-lg bg-orange-600 px-3 py-1.5 text-xs font-semibold text-white"
                  >
                    Approve
                  </button>
                  <button
                    type="button"
                    onClick={() => void handleReviewCr(request, "rejected")}
                    className="rounded-lg border border-slate-300 px-3 py-1.5 text-xs font-semibold text-slate-700"
                  >
                    Reject
                  </button>
                </div>
              </div>
            ))
          )}
        </div>
      </div>

      {actionMessage ? (
        <p className="lg:col-span-2 rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">
          {actionMessage}
        </p>
      ) : null}
    </div>
  );
}
