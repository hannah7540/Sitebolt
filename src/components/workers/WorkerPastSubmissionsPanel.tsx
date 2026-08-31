"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { History, Loader2, X } from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import { useMobileBackHandler } from "@/hooks/useMobileBackHandler";
import { useWorkerHistoryLayer } from "@/hooks/useWorkerHistoryLayer";
import SiteFormDetailRouter from "@/components/dashboard/SiteFormDetailRouter";
import {
  fetchPlantPrestarts,
  fetchSiteForms,
  type PlantPrestart,
  type Worker,
} from "@/lib/supabase";
import {
  SITE_FORM_LABELS,
  formatSiteFormDate,
  type SiteFormSubmission,
  type SiteFormType,
} from "@/lib/site-forms";
import { fetchWorkerRfis, type RfiRecord } from "@/lib/rfi-service";
import {
  fetchWorkerRequests,
  type WorkerRequestRecord,
} from "@/lib/worker-requests-service";
import {
  fetchIncidentReports,
  type IncidentReportRecord,
} from "@/lib/incident-reports";
import {
  cardClass,
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  sectionClass,
} from "@/lib/ui-classes";
import ModalActionFooter from "@/components/ui/ModalActionFooter";
import { cn } from "@/lib/utils";

type SubmissionFilter =
  | "all"
  | SiteFormType
  | "rfi"
  | "request"
  | "incident"
  | "plant_prestart";

type PastItem =
  | {
      kind: "site_form";
      id: string;
      title: string;
      subtitle: string;
      dateLabel: string;
      form: SiteFormSubmission;
    }
  | {
      kind: "rfi";
      id: string;
      title: string;
      subtitle: string;
      dateLabel: string;
      rfi: RfiRecord;
    }
  | {
      kind: "request";
      id: string;
      title: string;
      subtitle: string;
      dateLabel: string;
      request: WorkerRequestRecord;
    }
  | {
      kind: "incident";
      id: string;
      title: string;
      subtitle: string;
      dateLabel: string;
      incident: IncidentReportRecord;
    }
  | {
      kind: "plant_prestart";
      id: string;
      title: string;
      subtitle: string;
      dateLabel: string;
      plant: PlantPrestart;
    };

const FILTER_OPTIONS: Array<{ value: SubmissionFilter; label: string }> = [
  { value: "all", label: "All submissions" },
  { value: "toolbox_talk", label: "Toolbox Talks" },
  { value: "daily_prestart", label: "Daily Pre-Starts" },
  { value: "safety_walk", label: "Safety Walks" },
  { value: "rfi", label: "RFIs" },
  { value: "request", label: "Request Forms" },
  { value: "incident", label: "Incident Reports" },
  { value: "plant_prestart", label: "Plant Pre-Starts" },
];

function formatIsoDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value.slice(0, 10);
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

interface WorkerPastSubmissionsPanelProps {
  worker: Worker;
  onBack: () => void;
}

export default function WorkerPastSubmissionsPanel({
  worker,
  onBack,
}: WorkerPastSubmissionsPanelProps) {
  const [filter, setFilter] = useState<SubmissionFilter>("all");
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [items, setItems] = useState<PastItem[]>([]);
  const [selected, setSelected] = useState<PastItem | null>(null);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const wantSite =
        filter === "all" ||
        filter === "toolbox_talk" ||
        filter === "daily_prestart" ||
        filter === "safety_walk";
      const wantRfi = filter === "all" || filter === "rfi";
      const wantRequest = filter === "all" || filter === "request";
      const wantIncident = filter === "all" || filter === "incident";
      const wantPlant = filter === "all" || filter === "plant_prestart";

      const [siteForms, rfis, requests, incidents, plants] = await Promise.all([
        wantSite
          ? fetchSiteForms({
              workerId: worker.id,
              formType:
                filter === "toolbox_talk" ||
                filter === "daily_prestart" ||
                filter === "safety_walk"
                  ? filter
                  : undefined,
              limit: 100,
            })
          : Promise.resolve([] as SiteFormSubmission[]),
        wantRfi ? fetchWorkerRfis(worker.id) : Promise.resolve({ submitted: [] as RfiRecord[], assigned: [] }),
        wantRequest
          ? fetchWorkerRequests({ workerId: worker.id, status: "all" })
          : Promise.resolve({ requests: [] as WorkerRequestRecord[], error: null }),
        wantIncident
          ? fetchIncidentReports({ status: "all" })
          : Promise.resolve({ reports: [] as IncidentReportRecord[], error: null }),
        wantPlant
          ? fetchPlantPrestarts({ workerId: worker.id, limit: 100 })
          : Promise.resolve([] as PlantPrestart[]),
      ]);

      const next: PastItem[] = [];

      for (const form of siteForms) {
        next.push({
          kind: "site_form",
          id: form.id,
          title: SITE_FORM_LABELS[form.form_type] ?? form.form_type,
          subtitle: form.location_scope || form.title || "Site safety form",
          dateLabel: formatSiteFormDate(form.form_date),
          form,
        });
      }

      for (const rfi of rfis.submitted ?? []) {
        next.push({
          kind: "rfi",
          id: rfi.id,
          title: rfi.rfi_number ? `RFI ${rfi.rfi_number}` : "RFI",
          subtitle: rfi.title || rfi.project_name || "Submitted RFI",
          dateLabel: formatIsoDate(rfi.created_at),
          rfi,
        });
      }

      for (const request of requests.requests ?? []) {
        next.push({
          kind: "request",
          id: request.id,
          title: request.request_type || "Worker Request",
          subtitle: request.description?.slice(0, 80) || request.project_name || "Request form",
          dateLabel: formatIsoDate(request.created_at),
          request,
        });
      }

      for (const incident of incidents.reports ?? []) {
        if (incident.submitted_by_id !== worker.id) continue;

        next.push({
          kind: "incident",
          id: incident.id,
          title: incident.reference_number
            ? `Incident ${incident.reference_number}`
            : "Incident Report",
          subtitle:
            incident.what_occurred?.slice(0, 80) ||
            incident.project_name ||
            "Incident",
          dateLabel: formatIsoDate(incident.created_at),
          incident,
        });
      }

      for (const plant of plants) {
        next.push({
          kind: "plant_prestart",
          id: plant.id,
          title: "Plant Pre-Start",
          subtitle: plant.operator_name || plant.plant_id,
          dateLabel: formatIsoDate(plant.submitted_at ?? plant.created_at),
          plant,
        });
      }

      next.sort((a, b) => {
        const aTime = Date.parse(a.dateLabel) || 0;
        const bTime = Date.parse(b.dateLabel) || 0;
        // Prefer original timestamps when available via kind-specific fields
        return b.dateLabel.localeCompare(a.dateLabel) || bTime - aTime;
      });

      setItems(next);
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to load submissions.");
      setItems([]);
    } finally {
      setLoading(false);
    }
  }, [filter, worker.id]);

  useEffect(() => {
    void load();
  }, [load]);

  const closeDetail = useCallback(() => setSelected(null), []);

  const handleMobileBack = useCallback(() => {
    if (selected) {
      closeDetail();
      return true;
    }
    onBack();
    return true;
  }, [closeDetail, onBack, selected]);

  useMobileBackHandler(handleMobileBack, true);
  useWorkerHistoryLayer(Boolean(selected), closeDetail, "past-submission-detail");

  const workers = useMemo(() => [worker], [worker]);

  return (
    <div className="space-y-4 worker-mobile-content-pad lg:pb-0">
      <button
        type="button"
        onClick={onBack}
        className="hidden items-center gap-2 text-sm font-semibold text-slate-600 hover:text-orange-600 lg:inline-flex"
      >
        ← Back to Forms & Safety
      </button>

      <WorkerMobileBackButton
        label={selected ? "Back to list" : "Back to Forms & Safety"}
        onClick={selected ? closeDetail : onBack}
      />

      <div>
        <h2 className="text-lg font-bold text-slate-900">Past Submissions</h2>
        <p className="mt-1 text-sm text-slate-500">
          Review previously submitted safety forms and plant pre-starts.
        </p>
      </div>

      <label className="block space-y-1">
        <span className={labelClass}>Form type</span>
        <select
          className={inputClass}
          value={filter}
          onChange={(event) => {
            setSelected(null);
            setFilter(event.target.value as SubmissionFilter);
          }}
        >
          {FILTER_OPTIONS.map((option) => (
            <option key={option.value} value={option.value}>
              {option.label}
            </option>
          ))}
        </select>
      </label>

      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading submissions…
        </div>
      ) : items.length === 0 ? (
        <div className={cn(cardClass, "p-6 text-center text-sm text-slate-500")}>
          No submissions found for this filter.
        </div>
      ) : (
        <ul className="space-y-2">
          {items.map((item) => (
            <li key={`${item.kind}-${item.id}`}>
              <button
                type="button"
                onClick={() => setSelected(item)}
                className={cn(
                  cardClass,
                  "flex w-full items-start gap-3 p-4 text-left transition hover:border-orange-300 hover:shadow-md"
                )}
              >
                <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600">
                  <History className="h-4 w-4" />
                </span>
                <span className="min-w-0 flex-1">
                  <span className="block font-semibold text-slate-900">{item.title}</span>
                  <span className="mt-0.5 block truncate text-xs text-slate-500">
                    {item.subtitle}
                  </span>
                  <span className="mt-1 block text-xs font-medium text-orange-600">
                    {item.dateLabel}
                  </span>
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}

      {selected?.kind === "site_form" ? (
        <SiteFormDetailRouter
          form={selected.form}
          workers={workers}
          onClose={closeDetail}
        />
      ) : null}

      {selected && selected.kind !== "site_form" ? (
        <div className={modalOverlayClass} onClick={closeDetail}>
          <div
            className={cn(modalShellClass, "max-w-lg")}
            onClick={(event) => event.stopPropagation()}
          >
            <div className={modalBodyClass}>
              <div className="mb-4 flex items-start justify-between gap-3">
                <div>
                  <h3 className="text-lg font-bold text-slate-900">{selected.title}</h3>
                  <p className="text-sm text-slate-500">{selected.dateLabel}</p>
                </div>
                <button
                  type="button"
                  onClick={closeDetail}
                  className={modalCloseIconButtonClass}
                  aria-label="Close"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              {selected.kind === "rfi" ? (
                <div className="space-y-3">
                  <div className={sectionClass}>
                    <p className={labelClass}>Subject</p>
                    <p className="text-sm text-slate-900">{selected.rfi.title}</p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Description</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {selected.rfi.description || "—"}
                    </p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Status</p>
                    <p className="text-sm text-slate-900">{selected.rfi.status}</p>
                  </div>
                </div>
              ) : null}

              {selected.kind === "request" ? (
                <div className="space-y-3">
                  <div className={sectionClass}>
                    <p className={labelClass}>Type</p>
                    <p className="text-sm text-slate-900">
                      {selected.request.request_type || "Request"}
                    </p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Details</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {selected.request.description || "—"}
                    </p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Status</p>
                    <p className="text-sm text-slate-900">{selected.request.status}</p>
                  </div>
                </div>
              ) : null}

              {selected.kind === "incident" ? (
                <div className="space-y-3">
                  <div className={sectionClass}>
                    <p className={labelClass}>What occurred</p>
                    <p className="whitespace-pre-wrap text-sm text-slate-800">
                      {selected.incident.what_occurred || "—"}
                    </p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Status</p>
                    <p className="text-sm text-slate-900">{selected.incident.status}</p>
                  </div>
                </div>
              ) : null}

              {selected.kind === "plant_prestart" ? (
                <div className="space-y-3">
                  <div className={sectionClass}>
                    <p className={labelClass}>Operator</p>
                    <p className="text-sm text-slate-900">
                      {selected.plant.operator_name || "—"}
                    </p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Plant ID</p>
                    <p className="text-sm text-slate-900">{selected.plant.plant_id}</p>
                  </div>
                  <div className={sectionClass}>
                    <p className={labelClass}>Defect</p>
                    <p className="text-sm text-slate-900">
                      {selected.plant.has_defect
                        ? selected.plant.defect_summary ||
                          selected.plant.defect_comments ||
                          "Yes"
                        : "No defects reported"}
                    </p>
                  </div>
                </div>
              ) : null}
            </div>

            <ModalActionFooter>
              <button
                type="button"
                onClick={closeDetail}
                className="flex min-h-11 w-full items-center justify-center rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
              >
                Back
              </button>
            </ModalActionFooter>
          </div>
        </div>
      ) : null}
    </div>
  );
}
