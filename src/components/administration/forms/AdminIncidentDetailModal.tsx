"use client";

import { useMemo, useState } from "react";
import { Download, Loader2, X } from "lucide-react";
import {
  formatIncidentDateTime,
  incidentStatusBadgeClass,
  incidentStatusLabel,
  INCIDENT_STATUS_OPTIONS,
  type IncidentReportRecord,
  type IncidentStatus,
} from "@/lib/incident-reports";
import {
  modalClass,
  modalOverlayClass,
  labelClass,
  inputClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface AdminIncidentDetailModalProps {
  report: IncidentReportRecord;
  onClose: () => void;
  onUpdated: (report: IncidentReportRecord) => void;
}

export default function AdminIncidentDetailModal({
  report,
  onClose,
  onUpdated,
}: AdminIncidentDetailModalProps) {
  const [status, setStatus] = useState<IncidentStatus>(report.status);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const printHtml = useMemo(() => {
    return `
      <html><head><title>${report.reference_number}</title>
      <style>body{font-family:Arial,sans-serif;padding:24px;color:#0f172a}h1{font-size:20px}dt{font-weight:700;margin-top:12px}dd{margin:4px 0 0}</style>
      </head><body>
      <h1>Incident ${report.reference_number}</h1>
      <dl>
        <dt>Date/Time</dt><dd>${formatIncidentDateTime(report.incident_date_time)}</dd>
        <dt>Project</dt><dd>${report.project_name ?? "—"}</dd>
        <dt>Submitted By</dt><dd>${report.submitted_by_name ?? "—"}</dd>
        <dt>Injured Worker</dt><dd>${report.injured_worker_name ?? "—"}</dd>
        <dt>Injury Details</dt><dd>${report.injury_details ?? "—"}</dd>
        <dt>Treatment</dt><dd>${report.treatment_details}</dd>
        <dt>Treatment Given</dt><dd>${report.treatment_given ?? "—"}</dd>
        <dt>What Occurred</dt><dd>${report.what_occurred || "—"}</dd>
        <dt>Location</dt><dd>${report.incident_location_details || "—"}</dd>
        <dt>Witnesses</dt><dd>${report.witness_names.join(", ") || "—"}</dd>
        <dt>Notifiable</dt><dd>${report.is_notifiable_under_whs ? "Yes" : "No"}</dd>
        <dt>Immediate Corrective Action</dt><dd>${report.immediate_corrective_action_required ? "Yes" : "No"}</dd>
        <dt>Root Cause — What went wrong</dt><dd>${report.what_caused_to_go_wrong ?? "—"}</dd>
        <dt>Root Cause — Prevention</dt><dd>${report.what_could_have_prevented ?? "—"}</dd>
        <dt>Root Cause — Recommendations</dt><dd>${report.recommendations_to_prevent ?? "—"}</dd>
      </dl>
      </body></html>
    `;
  }, [report]);

  const handleSave = async (next?: {
    status?: IncidentStatus;
    is_read_admin?: boolean;
  }) => {
    setSaving(true);
    setError(null);
    try {
      const response = await fetch(`/api/incidents/${report.id}`, {
        method: "PATCH",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          status: next?.status ?? status,
          is_read_admin: next?.is_read_admin ?? true,
        }),
      });
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
        report?: IncidentReportRecord;
      } | null;
      if (!response.ok || !payload?.report) {
        setError(payload?.error ?? "Failed to update incident.");
        return;
      }
      onUpdated(payload.report);
      setStatus(payload.report.status);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to update incident.");
    } finally {
      setSaving(false);
    }
  };

  const handleExportPdf = () => {
    const popup = window.open("", "_blank", "noopener,noreferrer,width=900,height=700");
    if (!popup) return;
    popup.document.write(printHtml);
    popup.document.close();
    popup.focus();
    popup.print();
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-h-[92vh] max-w-3xl overflow-y-auto")}>
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 pb-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">{report.reference_number}</h2>
            <p className="mt-1 text-sm text-slate-500">
              {formatIncidentDateTime(report.incident_date_time)} ·{" "}
              {report.project_name ?? "No project"}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {error ? (
          <div className="mt-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </div>
        ) : null}

        <div className="mt-4 grid gap-4 sm:grid-cols-2">
          <Detail label="Submitted by" value={report.submitted_by_name} />
          <Detail label="Injured worker" value={report.injured_worker_name} />
          <Detail label="Injury details" value={report.injury_details} />
          <Detail label="Treatment type" value={report.treatment_details} />
          <Detail label="Treating person" value={report.treating_person_name} />
          <Detail
            label="Offsite treatment location"
            value={report.offsite_treatment_location}
          />
          <Detail label="Treatment given" value={report.treatment_given} />
          <Detail
            label="Witnesses"
            value={report.witness_names.join(", ") || null}
          />
          <Detail
            label="Immediate corrective action"
            value={report.immediate_corrective_action_required ? "Yes" : "No"}
          />
          <Detail
            label="Notifiable under WHS"
            value={report.is_notifiable_under_whs ? "Yes" : "No"}
          />
        </div>

        <Section title="What occurred" body={report.what_occurred} />
        <Section title="Where it occurred" body={report.incident_location_details} />
        <Section title="What caused it to go wrong" body={report.what_caused_to_go_wrong} />
        <Section
          title="What could have prevented this"
          body={report.what_could_have_prevented}
        />
        <Section
          title="Recommendations"
          body={report.recommendations_to_prevent}
        />

        {report.medical_certificate_urls.length > 0 ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Medical certificates</h3>
            <div className="flex flex-wrap gap-2">
              {report.medical_certificate_urls.map((url) => (
                <a
                  key={url}
                  href={url}
                  target="_blank"
                  rel="noreferrer"
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-xs font-semibold text-orange-700 hover:bg-orange-50"
                >
                  Open attachment
                </a>
              ))}
            </div>
          </div>
        ) : null}

        {report.submitter_signature_url ? (
          <div className="mt-4 space-y-2">
            <h3 className="text-sm font-semibold text-slate-900">Submitter signature</h3>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={report.submitter_signature_url}
              alt="Submitter signature"
              className="max-h-40 rounded-lg border border-slate-200 bg-white"
            />
          </div>
        ) : null}

        <div className="mt-5 grid gap-3 border-t border-slate-200 pt-4 sm:grid-cols-[1fr_auto]">
          <div>
            <label className={labelClass} htmlFor="incident-status">
              Status
            </label>
            <select
              id="incident-status"
              value={status}
              onChange={(e) => setStatus(e.target.value as IncidentStatus)}
              className={inputClass}
            >
              {INCIDENT_STATUS_OPTIONS.map((option) => (
                <option key={option} value={option}>
                  {incidentStatusLabel(option)}
                </option>
              ))}
            </select>
          </div>
          <div className="flex flex-wrap items-end gap-2">
            <button
              type="button"
              onClick={handleExportPdf}
              className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              <Download className="h-4 w-4" />
              Export / Print
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave({ is_read_admin: true })}
              className="rounded-lg border border-slate-200 px-3 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
            >
              Mark as read
            </button>
            <button
              type="button"
              disabled={saving}
              onClick={() => void handleSave({ status, is_read_admin: true })}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-700 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Save
            </button>
          </div>
        </div>

        <p className="mt-3 text-xs text-slate-500">
          Current status:{" "}
          <span
            className={cn(
              "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase",
              incidentStatusBadgeClass(report.status)
            )}
          >
            {incidentStatusLabel(report.status)}
          </span>
        </p>
      </div>
    </div>
  );
}

function Detail({ label, value }: { label: string; value?: string | null }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
        {label}
      </p>
      <p className="mt-1 text-sm text-slate-900">{value?.trim() || "—"}</p>
    </div>
  );
}

function Section({ title, body }: { title: string; body?: string | null }) {
  return (
    <div className="mt-4">
      <h3 className="text-sm font-semibold text-slate-900">{title}</h3>
      <p className="mt-1 whitespace-pre-wrap text-sm text-slate-700">
        {body?.trim() || "—"}
      </p>
    </div>
  );
}
