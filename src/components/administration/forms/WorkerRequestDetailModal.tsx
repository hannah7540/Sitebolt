"use client";

import { useState } from "react";
import { X, Loader2, CheckCircle2 } from "lucide-react";
import {
  formatWorkerRequestDate,
  markWorkerRequestFulfilled,
  markWorkerRequestInProgress,
  updateWorkerRequest,
  workerRequestStatusBadgeClass,
  type WorkerRequestRecord,
  type WorkerRequestStatus,
} from "@/lib/worker-requests-service";
import WorkerRequestDetailsDisplay from "@/components/administration/forms/WorkerRequestDetailsDisplay";
import Toast from "@/components/ui/Toast";
import { useFormToast } from "@/hooks/useFormToast";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerRequestDetailModalProps {
  request: WorkerRequestRecord;
  adminName?: string;
  onClose: () => void;
  onUpdated: () => void;
}

export default function WorkerRequestDetailModal({
  request,
  adminName = "Admin",
  onClose,
  onUpdated,
}: WorkerRequestDetailModalProps) {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const [status, setStatus] = useState<WorkerRequestStatus>(request.status);
  const [adminComments, setAdminComments] = useState(request.admin_comments ?? "");
  const [fulfilledBy, setFulfilledBy] = useState(
    request.fulfilled_by ?? (request.status === "Fulfilled" ? adminName : "")
  );
  const [saving, setSaving] = useState(false);

  const handleSave = async () => {
    setSaving(true);
    try {
      const result = await updateWorkerRequest({
        requestId: request.id,
        status,
        adminComments,
        fulfilledBy: status === "Fulfilled" ? fulfilledBy || adminName : null,
      });

      if (result.error || !result.request) {
        showError(result.error ?? "Failed to update request.");
        return;
      }

      showSuccess("Request updated.");
      onUpdated();
      onClose();
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to update request.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkFulfilled = async () => {
    setSaving(true);
    try {
      const result = await markWorkerRequestFulfilled(
        request.id,
        fulfilledBy || adminName,
        adminComments
      );
      if (result.error) {
        showError(result.error);
        return;
      }
      showSuccess(`${request.request_number} marked as fulfilled.`);
      onUpdated();
      onClose();
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to fulfil request.");
    } finally {
      setSaving(false);
    }
  };

  const handleMarkInProgress = async () => {
    setSaving(true);
    try {
      const result = await markWorkerRequestInProgress(request.id, adminComments);
      if (result.error) {
        showError(result.error);
        return;
      }
      setStatus("In Progress");
      showSuccess(`${request.request_number} marked as in progress.`);
      onUpdated();
    } catch (cause) {
      showError(cause instanceof Error ? cause.message : "Failed to update request.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <>
      <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
        <div
          className={cn(modalClass, "max-h-[92vh] w-full max-w-lg overflow-y-auto p-0")}
          role="dialog"
          aria-modal="true"
          onClick={(event) => event.stopPropagation()}
        >
        <div className="sticky top-0 z-10 flex items-center justify-between border-b border-slate-200 bg-white px-6 py-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{request.request_number}</h2>
            <p className="text-xs text-slate-500">Worker request details</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="space-y-4 px-6 py-5">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <p className={labelClass}>Date Submitted</p>
              <p className="text-sm font-medium text-slate-900">
                {formatWorkerRequestDate(request.created_at)}
              </p>
            </div>
            <div>
              <p className={labelClass}>Status</p>
              <span
                className={cn(
                  "inline-flex rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset",
                  workerRequestStatusBadgeClass(request.status)
                )}
              >
                {request.status}
              </span>
            </div>
            <div>
              <p className={labelClass}>Worker</p>
              <p className="text-sm font-medium text-slate-900">{request.worker_name}</p>
            </div>
            <div>
              <p className={labelClass}>Project</p>
              <p className="text-sm font-medium text-slate-900">
                {request.project_name ?? "—"}
              </p>
            </div>
            <div>
              <p className={labelClass}>Type</p>
              <p className="text-sm font-medium text-slate-900">{request.request_type}</p>
            </div>
            <div className="col-span-2">
              <p className={labelClass}>Details</p>
              <WorkerRequestDetailsDisplay request={request} variant="inline" />
            </div>
          </div>

          <div>
            <label htmlFor="request-status" className={labelClass}>
              Update Status
            </label>
            <select
              id="request-status"
              value={status}
              onChange={(event) => setStatus(event.target.value as WorkerRequestStatus)}
              className={inputClass}
              disabled={request.status === "Fulfilled"}
            >
              <option value="Pending">Pending</option>
              <option value="In Progress">In Progress</option>
              <option value="Fulfilled">Fulfilled</option>
            </select>
          </div>

          {status === "Fulfilled" ? (
            <div>
              <label htmlFor="fulfilled-by" className={labelClass}>
                Fulfilled By
              </label>
              <input
                id="fulfilled-by"
                value={fulfilledBy}
                onChange={(event) => setFulfilledBy(event.target.value)}
                className={inputClass}
                placeholder={adminName}
              />
            </div>
          ) : null}

          <div>
            <label htmlFor="admin-comments" className={labelClass}>
              Admin Comments
            </label>
            <textarea
              id="admin-comments"
              value={adminComments}
              onChange={(event) => setAdminComments(event.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Notes for the worker or fulfilment team…"
            />
          </div>

          {request.fulfilled_at ? (
            <p className="text-xs text-slate-500">
              Fulfilled {formatWorkerRequestDate(request.fulfilled_at)}
              {request.fulfilled_by ? ` by ${request.fulfilled_by}` : ""}
            </p>
          ) : null}

          <div className="flex flex-wrap justify-end gap-2 border-t border-slate-200 pt-4">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg px-4 py-2 text-sm font-semibold text-slate-600 hover:bg-slate-100"
            >
              Close
            </button>
            {request.status !== "Fulfilled" && request.status === "Pending" ? (
              <button
                type="button"
                onClick={() => void handleMarkInProgress()}
                disabled={saving}
                className="rounded-lg border border-blue-200 bg-blue-50 px-4 py-2 text-sm font-semibold text-blue-700 hover:bg-blue-100 disabled:opacity-60"
              >
                Mark In Progress
              </button>
            ) : null}
            {request.status !== "Fulfilled" ? (
              <button
                type="button"
                onClick={() => void handleMarkFulfilled()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-700 disabled:opacity-60"
              >
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <CheckCircle2 className="h-4 w-4" />
                )}
                Mark as Fulfilled
              </button>
            ) : (
              <button
                type="button"
                onClick={() => void handleSave()}
                disabled={saving}
                className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
              >
                {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
                Save Comments
              </button>
            )}
          </div>
        </div>
        </div>
      </div>

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
