"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  closeOutRfi,
  formatRfiDate,
  rfiPriorityBadgeClass,
  rfiStatusBadgeClass,
  type RfiRecord,
} from "@/lib/rfi-service";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface RFIDetailModalProps {
  rfi: RfiRecord;
  closedByDefault?: string;
  onClose: () => void;
  onAssign?: () => void;
  onUpdated?: (rfi: RfiRecord) => void;
}

function todayIso(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function RFIDetailModal({
  rfi,
  closedByDefault = "",
  onClose,
  onAssign,
  onUpdated,
}: RFIDetailModalProps) {
  const [responseResolution, setResponseResolution] = useState(
    rfi.response_resolution ?? rfi.action_response ?? ""
  );
  const [actionRequired, setActionRequired] = useState(rfi.action_required ?? "");
  const [closeOutDate, setCloseOutDate] = useState(
    rfi.close_out_date?.slice(0, 10) ?? todayIso()
  );
  const [closedBy, setClosedBy] = useState(rfi.closed_by ?? closedByDefault);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const canCloseOut = rfi.status !== "Closed";

  const handleCloseOut = async () => {
    setSaving(true);
    setError(null);
    try {
      const result = await closeOutRfi({
        rfiId: rfi.id,
        responseResolution,
        actionRequired,
        closeOutDate,
        closedBy,
      });
      if (result.error || !result.rfi) {
        setError(result.error ?? "Failed to close out RFI.");
        return;
      }
      onUpdated?.(result.rfi);
      onClose();
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-3xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              {rfi.rfi_number}
            </p>
            <h2 className="text-lg font-bold text-slate-900">{rfi.subject || rfi.title}</h2>
            <div className="mt-2 flex flex-wrap gap-2">
              <span
                className={cn(
                  "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  rfiStatusBadgeClass(rfi.status)
                )}
              >
                {rfi.status}
              </span>
              <span
                className={cn(
                  "inline-block rounded-full px-2.5 py-0.5 text-xs font-semibold",
                  rfiPriorityBadgeClass(rfi.priority)
                )}
              >
                {rfi.priority}
              </span>
            </div>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
            <div>
              <p className={labelClass}>Date Raised</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRfiDate(rfi.date_raised ?? rfi.created_at)}
              </p>
            </div>
            <div>
              <p className={labelClass}>Raised By</p>
              <p className="text-sm font-medium text-slate-900">{rfi.raised_by}</p>
            </div>
            <div>
              <p className={labelClass}>Assigned To</p>
              <p className="text-sm font-medium text-slate-900">
                {rfi.assigned_to_name ?? "Unassigned"}
              </p>
            </div>
            <div>
              <p className={labelClass}>Project</p>
              <p className="text-sm font-medium text-slate-900">
                {rfi.project_name ?? "—"}
              </p>
            </div>
            <div>
              <p className={labelClass}>Zone / Area</p>
              <p className="text-sm font-medium text-slate-900">{rfi.zone_area ?? "—"}</p>
            </div>
            <div>
              <p className={labelClass}>Category</p>
              <p className="text-sm font-medium text-slate-900">{rfi.category ?? "—"}</p>
            </div>
            <div>
              <p className={labelClass}>Discipline</p>
              <p className="text-sm font-medium text-slate-900">{rfi.discipline ?? "—"}</p>
            </div>
            <div>
              <p className={labelClass}>Due Date</p>
              <p className="text-sm font-medium text-slate-900">
                {formatRfiDate(rfi.due_date)}
              </p>
            </div>
          </div>

          <div className="rounded-xl border border-slate-200 bg-white p-4">
            <p className={labelClass}>RFI Description</p>
            <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{rfi.description}</p>
          </div>

          {rfi.comments ? (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className={labelClass}>Comments</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{rfi.comments}</p>
            </div>
          ) : null}

          {(rfi.attachments.length > 0 || rfi.document_url) && (
            <div className="rounded-xl border border-slate-200 bg-white p-4">
              <p className={labelClass}>Photos / Links / Files</p>
              <ul className="mt-2 space-y-1 text-sm">
                {rfi.attachments.map((attachment) => (
                  <li key={`${attachment.url}-${attachment.name}`}>
                    <a
                      href={attachment.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-orange-600 hover:underline"
                    >
                      {attachment.name}
                    </a>
                  </li>
                ))}
                {rfi.document_url ? (
                  <li>
                    <a
                      href={rfi.document_url}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="font-medium text-orange-600 hover:underline"
                    >
                      Document
                    </a>
                  </li>
                ) : null}
              </ul>
            </div>
          )}

          {rfi.request_signature_url ? (
            <div>
              <p className={labelClass}>Requester signature</p>
              <img
                src={rfi.request_signature_url}
                alt="Requester signature"
                className="mt-2 max-h-32 rounded-lg border border-slate-200 bg-white p-2"
              />
            </div>
          ) : null}

          {canCloseOut ? (
            <div className="rounded-xl border border-orange-200 bg-orange-50/40 p-4">
              <h3 className="text-sm font-semibold text-slate-900">
                Resolution & Close-Out
              </h3>
              <div className="mt-3 space-y-3">
                <label className="block space-y-1">
                  <span className={labelClass}>Response / Resolution</span>
                  <textarea
                    className={cn(inputClass, "min-h-[100px] resize-y")}
                    value={responseResolution}
                    onChange={(event) => setResponseResolution(event.target.value)}
                    disabled={saving}
                  />
                </label>
                <label className="block space-y-1">
                  <span className={labelClass}>Action Required</span>
                  <textarea
                    className={cn(inputClass, "min-h-[80px] resize-y")}
                    value={actionRequired}
                    onChange={(event) => setActionRequired(event.target.value)}
                    disabled={saving}
                  />
                </label>
                <div className="grid gap-3 sm:grid-cols-2">
                  <label className="block space-y-1">
                    <span className={labelClass}>Close-Out Date</span>
                    <input
                      type="date"
                      className={inputClass}
                      value={closeOutDate}
                      onChange={(event) => setCloseOutDate(event.target.value)}
                      disabled={saving}
                    />
                  </label>
                  <label className="block space-y-1">
                    <span className={labelClass}>Closed By</span>
                    <input
                      className={inputClass}
                      value={closedBy}
                      onChange={(event) => setClosedBy(event.target.value)}
                      disabled={saving}
                    />
                  </label>
                </div>
              </div>
            </div>
          ) : (
            <div className="rounded-xl border border-emerald-200 bg-emerald-50/60 p-4">
              <p className={labelClass}>Response / Resolution</p>
              <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                {rfi.response_resolution ?? "—"}
              </p>
              {rfi.action_required ? (
                <>
                  <p className={`${labelClass} mt-3`}>Action Required</p>
                  <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">
                    {rfi.action_required}
                  </p>
                </>
              ) : null}
              <div className="mt-3 grid gap-2 text-sm sm:grid-cols-2">
                <p>
                  <span className="font-semibold text-slate-500">Close-Out Date: </span>
                  {formatRfiDate(rfi.close_out_date)}
                </p>
                <p>
                  <span className="font-semibold text-slate-500">Closed By: </span>
                  {rfi.closed_by ?? "—"}
                </p>
              </div>
              {rfi.action_signature_url ? (
                <img
                  src={rfi.action_signature_url}
                  alt="Action signature"
                  className="mt-3 max-h-32 rounded-lg border border-slate-200 bg-white p-2"
                />
              ) : null}
            </div>
          )}

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className="mt-4 flex flex-wrap gap-2">
          {rfi.status === "Open" && onAssign ? (
            <button
              type="button"
              onClick={onAssign}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              Assign Worker
            </button>
          ) : null}
          {canCloseOut ? (
            <button
              type="button"
              onClick={() => void handleCloseOut()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-emerald-600 px-4 py-2 text-sm font-semibold text-white hover:bg-emerald-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save Close-Out
            </button>
          ) : null}
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
          >
            Close
          </button>
        </div>
      </div>
    </div>
  );
}
