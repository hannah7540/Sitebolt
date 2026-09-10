"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { createPortal } from "react-dom";
import { ArrowLeft, History, Loader2, Search, X } from "lucide-react";
import {
  fetchPlant,
  fetchWorkers,
  type PlantAsset,
  type Worker,
} from "@/lib/supabase";
import {
  fetchPastSubmissionsPage,
  formatPastSubmissionTimestamp,
  matchesPastSubmissionSearch,
  PAST_SUBMISSION_TITLES,
  PAST_SUBMISSIONS_PAGE_SIZE,
  toPastSubmissionListItem,
  type PastSubmissionRecord,
  type PastSubmissionStatusTone,
  type PastSubmissionWidgetType,
} from "@/lib/past-submissions";
import type { FormWorkerAssignment, InductionFormBlock } from "@/lib/induction-form-builder";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import PlantPrestartDetailModal from "@/components/dashboard/PlantPrestartDetailModal";
import SiteFormDetailRouter from "@/components/dashboard/SiteFormDetailRouter";
import ImageLightboxGallery from "@/components/ui/ImageLightboxGallery";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  sectionClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

export function PastSubmissionsTrigger({
  onClick,
  className,
  label = "Past Submissions",
}: {
  onClick: () => void;
  className?: string;
  label?: string;
}) {
  return (
    <button
      type="button"
      onClick={(event) => {
        event.preventDefault();
        event.stopPropagation();
        onClick();
      }}
      className={cn(
        "inline-flex min-h-8 shrink-0 items-center rounded-lg px-2 py-1 text-xs font-semibold text-slate-600 hover:bg-slate-100 hover:text-slate-900",
        className
      )}
    >
      {label}
      <History className="ml-1 h-3.5 w-3.5" />
    </button>
  );
}

const STATUS_BADGE_CLASS: Record<PastSubmissionStatusTone, string> = {
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
  danger: "border-red-200 bg-red-50 text-red-800",
};

function isLikelyImageUrl(value: string): boolean {
  const trimmed = value.trim();
  if (!/^https?:\/\//i.test(trimmed)) return false;
  return (
    /\/storage\//i.test(trimmed) ||
    /\.(jpe?g|png|webp|gif|heic)(\?|$)/i.test(trimmed)
  );
}

function formatResponseValue(value: unknown): string {
  if (value == null || value === "") return "—";
  if (typeof value === "boolean") return value ? "Yes" : "No";
  if (Array.isArray(value)) return value.map((item) => String(item)).join(", ");
  if (typeof value === "object") return JSON.stringify(value);
  return String(value);
}

function collectInductionPhotoUrls(assignment: FormWorkerAssignment): string[] {
  const urls = new Set<string>();
  const add = (value: unknown) => {
    if (typeof value === "string" && isLikelyImageUrl(value)) {
      urls.add(value.trim());
    }
  };
  add(assignment.signature_url);
  for (const value of Object.values(assignment.responses ?? {})) {
    add(value);
    if (Array.isArray(value)) value.forEach(add);
  }
  return Array.from(urls);
}

function inductionFieldLabel(assignment: FormWorkerAssignment, key: string): string {
  const blocks: InductionFormBlock[] = [
    ...(assignment.blocks ?? []),
    ...(assignment.schema_fields ?? []),
  ];
  const match = blocks.find((block) => block.id === key);
  return match?.label?.trim() || key.replace(/_/g, " ");
}

function InductionHistoryDetail({
  assignment,
  workers,
}: {
  assignment: FormWorkerAssignment;
  workers: Worker[];
}) {
  const [lightboxIndex, setLightboxIndex] = useState<number | null>(null);
  const worker =
    assignment.worker_name?.trim() ||
    (() => {
      const match = workers.find((row) => row.id === assignment.worker_id);
      return match ? getWorkerDisplayName(match) : "Unknown worker";
    })();
  const photos = collectInductionPhotoUrls(assignment).filter(
    (url) => url !== assignment.signature_url
  );
  const responses = Object.entries(assignment.responses ?? {}).filter(
    ([key]) => !key.startsWith("_")
  );

  return (
    <div className="space-y-4">
      <div className={sectionClass}>
        <p className="text-base font-semibold text-slate-900">
          {assignment.form_title?.trim() || "Induction"}
        </p>
        <p className="mt-1 text-sm text-slate-600">{worker}</p>
        {assignment.project_name ? (
          <p className="mt-0.5 text-xs text-slate-500">{assignment.project_name}</p>
        ) : null}
      </div>
      <div className="grid gap-3 sm:grid-cols-2">
        <div className={sectionClass}>
          <p className={labelClass}>Completed</p>
          <p className="text-sm font-semibold text-slate-900">
            {assignment.completed_at
              ? formatPastSubmissionTimestamp(assignment.completed_at)
              : "—"}
          </p>
        </div>
        <div className={sectionClass}>
          <p className={labelClass}>Assigned</p>
          <p className="text-sm font-semibold text-slate-900">
            {formatPastSubmissionTimestamp(assignment.assigned_at)}
          </p>
        </div>
      </div>
      {responses.length > 0 ? (
        <div className={sectionClass}>
          <p className="mb-2 text-sm font-semibold text-slate-900">Form answers</p>
          <dl className="space-y-2">
            {responses.map(([key, value]) => (
              <div key={key}>
                <dt className={labelClass}>{inductionFieldLabel(assignment, key)}</dt>
                <dd className="whitespace-pre-wrap text-sm text-slate-900">
                  {formatResponseValue(value)}
                </dd>
              </div>
            ))}
          </dl>
        </div>
      ) : (
        <div className={sectionClass}>
          <p className="text-sm text-slate-500">No recorded answers for this induction.</p>
        </div>
      )}
      {photos.length > 0 ? (
        <div className={sectionClass}>
          <p className="mb-2 text-sm font-semibold text-slate-900">Photos</p>
          <div className="flex flex-wrap gap-2">
            {photos.map((url, index) => (
              <button
                key={`${url}-${index}`}
                type="button"
                onClick={() => setLightboxIndex(index)}
                className="overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img src={url} alt={`Attachment ${index + 1}`} className="h-20 w-20 object-cover" />
              </button>
            ))}
          </div>
        </div>
      ) : null}
      {assignment.signature_url ? (
        <div className={sectionClass}>
          <p className={labelClass}>Signature</p>
          <div className="mt-2 overflow-hidden rounded-lg border border-slate-200 bg-white p-2">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assignment.signature_url}
              alt="Induction signature"
              className="max-h-28 w-full object-contain"
            />
          </div>
        </div>
      ) : null}
      {lightboxIndex != null && photos.length > 0 ? (
        <ImageLightboxGallery
          images={photos.map((url, index) => ({
            url,
            alt: `Attachment ${index + 1}`,
          }))}
          initialIndex={lightboxIndex}
          onClose={() => setLightboxIndex(null)}
        />
      ) : null}
    </div>
  );
}

interface PastSubmissionsModalProps {
  widgetType: PastSubmissionWidgetType;
  projectId?: string | null;
  isOpen: boolean;
  onClose: () => void;
  workers?: Worker[];
  plant?: PlantAsset[];
}

export default function PastSubmissionsModal({
  widgetType,
  projectId = null,
  isOpen,
  onClose,
  workers: workersProp,
  plant: plantProp,
}: PastSubmissionsModalProps) {
  const [records, setRecords] = useState<PastSubmissionRecord[]>([]);
  const [workers, setWorkers] = useState<Worker[]>(workersProp ?? []);
  const [plant, setPlant] = useState<PlantAsset[]>(plantProp ?? []);
  const [loading, setLoading] = useState(false);
  const [loadingMore, setLoadingMore] = useState(false);
  const [hasMore, setHasMore] = useState(false);
  const [offset, setOffset] = useState(0);
  const [error, setError] = useState<string | null>(null);
  const [search, setSearch] = useState("");
  const [startDate, setStartDate] = useState("");
  const [endDate, setEndDate] = useState("");
  const [selectedId, setSelectedId] = useState<string | null>(null);
  const [mobileShowDetail, setMobileShowDetail] = useState(false);
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  useEffect(() => {
    if (workersProp?.length) setWorkers(workersProp);
  }, [workersProp]);

  useEffect(() => {
    if (plantProp?.length) setPlant(plantProp);
  }, [plantProp]);

  const loadPage = useCallback(
    async (nextOffset: number, append: boolean) => {
      if (nextOffset === 0) setLoading(true);
      else setLoadingMore(true);
      setError(null);
      const result = await fetchPastSubmissionsPage({
        widgetType,
        projectId,
        offset: nextOffset,
        startDate: startDate || undefined,
        endDate: endDate || undefined,
      });
      if (result.error) setError(result.error);
      setHasMore(result.hasMore);
      setOffset(nextOffset + PAST_SUBMISSIONS_PAGE_SIZE);
      setRecords((current) => (append ? [...current, ...result.records] : result.records));
      if (!append && result.records[0]) {
        setSelectedId(result.records[0].id);
      }
      setLoading(false);
      setLoadingMore(false);
    },
    [widgetType, projectId, startDate, endDate]
  );

  useEffect(() => {
    if (!isOpen) return;
    if (!workersProp?.length) {
      void fetchWorkers().then((rows) => setWorkers(rows));
    }
    if (
      (widgetType === "plant_prestarts" || widgetType === "defects") &&
      !plantProp?.length
    ) {
      void fetchPlant().then((rows) => setPlant(rows));
    }
  }, [isOpen, widgetType, workersProp, plantProp]);

  useEffect(() => {
    if (!isOpen) return;
    setRecords([]);
    setSelectedId(null);
    setMobileShowDetail(false);
    void loadPage(0, false);
  }, [isOpen, widgetType, projectId, startDate, endDate, loadPage]);

  useEffect(() => {
    if (!isOpen) return;
    const previous = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = previous;
    };
  }, [isOpen]);

  useEffect(() => {
    if (!isOpen) return;
    const onKeyDown = (event: KeyboardEvent) => {
      if (event.key !== "Escape") return;
      event.preventDefault();
      onClose();
    };
    window.addEventListener("keydown", onKeyDown);
    return () => window.removeEventListener("keydown", onKeyDown);
  }, [isOpen, onClose]);

  const items = useMemo(
    () =>
      records
        .map((record) => toPastSubmissionListItem(record, workers, plant))
        .filter((item) => matchesPastSubmissionSearch(item, search)),
    [records, workers, plant, search]
  );

  const selectedItem =
    items.find((item) => item.id === selectedId) ?? items[0] ?? null;

  const handleSelect = (id: string) => {
    setSelectedId(id);
    setMobileShowDetail(true);
  };

  if (!isOpen || !mounted) return null;

  const title = PAST_SUBMISSION_TITLES[widgetType];

  const listPane = (
    <div className="flex min-h-0 min-w-0 flex-1 flex-col">
      <div className="space-y-3 border-b border-slate-200 p-4">
        <label className="block">
          <span className={cn(labelClass, "mb-1 flex items-center gap-1")}>
            <Search className="h-3.5 w-3.5" />
            Search
          </span>
          <input
            type="search"
            value={search}
            onChange={(event) => setSearch(event.target.value)}
            placeholder="Worker, unit, or keyword"
            className={inputClass}
          />
        </label>
        <div className="grid grid-cols-2 gap-2">
          <label className="block">
            <span className={labelClass}>From</span>
            <input
              type="date"
              value={startDate}
              onChange={(event) => setStartDate(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <label className="block">
            <span className={labelClass}>To</span>
            <input
              type="date"
              value={endDate}
              onChange={(event) => setEndDate(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
        </div>
      </div>
      <div className="min-h-0 flex-1 overflow-y-auto p-3">
        {loading ? (
          <div className="flex items-center gap-2 px-2 py-8 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading submissions…
          </div>
        ) : error ? (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : items.length === 0 ? (
          <p className="px-2 py-8 text-center text-sm text-slate-500">
            No past submissions found.
          </p>
        ) : (
          <ul className="space-y-2">
            {items.map((item) => {
              const active = selectedItem?.id === item.id;
              return (
                <li key={item.id}>
                  <button
                    type="button"
                    onClick={() => handleSelect(item.id)}
                    className={cn(
                      "w-full rounded-xl border px-3 py-3 text-left transition",
                      active
                        ? "border-orange-300 bg-orange-50/70"
                        : "border-slate-200 bg-white hover:border-orange-200 hover:bg-orange-50/40"
                    )}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="min-w-0">
                        <p className="truncate text-sm font-semibold text-slate-900">
                          {item.submitterName}
                        </p>
                        <p className="mt-0.5 truncate text-xs text-slate-500">{item.title}</p>
                        <p className="mt-1 text-xs text-slate-500">
                          {formatPastSubmissionTimestamp(item.occurredAt)}
                        </p>
                      </div>
                      <span
                        className={cn(
                          "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                          STATUS_BADGE_CLASS[item.statusTone]
                        )}
                      >
                        {item.statusLabel}
                      </span>
                    </div>
                  </button>
                </li>
              );
            })}
          </ul>
        )}
        {hasMore && !loading ? (
          <button
            type="button"
            disabled={loadingMore}
            onClick={() => void loadPage(offset, true)}
            className="mt-3 w-full rounded-lg border border-slate-200 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-60"
          >
            {loadingMore ? (
              <span className="inline-flex items-center gap-2">
                <Loader2 className="h-4 w-4 animate-spin" />
                Loading…
              </span>
            ) : (
              "Load more"
            )}
          </button>
        ) : null}
      </div>
    </div>
  );

  const selectedRecord = selectedItem?.record ?? null;
  const followUp =
    selectedRecord?.kind === "site_form" && selectedRecord.form.viewed_at
      ? `Marked as read ${formatPastSubmissionTimestamp(selectedRecord.form.viewed_at)}`
      : selectedRecord?.kind === "plant" && selectedRecord.prestart.acknowledged_by
        ? `Follow-up recorded${
            selectedRecord.prestart.acknowledged_at
              ? ` ${formatPastSubmissionTimestamp(selectedRecord.prestart.acknowledged_at)}`
              : ""
          }`
        : null;

  const detailPane = (
    <div
      className={cn(
        "flex min-h-0 min-w-0 flex-1 flex-col",
        !mobileShowDetail && "hidden md:flex"
      )}
    >
      <div className="flex items-center gap-2 border-b border-slate-200 px-4 py-3 md:hidden">
        <button
          type="button"
          onClick={() => setMobileShowDetail(false)}
          className="inline-flex min-h-10 items-center gap-1 rounded-lg px-2 text-sm font-semibold text-slate-700 hover:bg-slate-100"
        >
          <ArrowLeft className="h-4 w-4" />
          Back
        </button>
        <p className="truncate text-sm font-semibold text-slate-900">Submission detail</p>
      </div>
      <div className={cn(modalBodyClass, "p-4 sm:p-5")}>
        {followUp ? (
          <p className="mb-4 rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-xs text-slate-600">
            {followUp}
          </p>
        ) : null}
        {!selectedRecord ? (
          <p className="py-10 text-center text-sm text-slate-500">
            Select a submission to preview it here.
          </p>
        ) : selectedRecord.kind === "plant" ? (
          <PlantPrestartDetailModal
            prestart={selectedRecord.prestart}
            plant={plant}
            onClose={onClose}
            embedded
          />
        ) : selectedRecord.kind === "site_form" ? (
          <SiteFormDetailRouter
            form={selectedRecord.form}
            workers={workers}
            onClose={onClose}
            embedded
          />
        ) : (
          <InductionHistoryDetail assignment={selectedRecord.assignment} workers={workers} />
        )}
      </div>
    </div>
  );

  const modal = (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalShellClass, "h-[min(92dvh,100%)] max-w-6xl")}
        onClick={(event) => event.stopPropagation()}
        role="dialog"
        aria-modal="true"
        aria-labelledby="past-submissions-title"
      >
        <div className="flex items-start justify-between gap-3 border-b border-slate-200 px-4 py-3 sm:px-5">
          <div>
            <h2 id="past-submissions-title" className="text-lg font-bold text-slate-900">
              {title}
            </h2>
            <p className="text-xs text-slate-500">
              {projectId ? "Filtered to this project" : "All projects"} · newest first
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            aria-label="Close past submissions"
            className={modalCloseIconButtonClass}
          >
            <X className="h-5 w-5" />
          </button>
        </div>
        <div className="flex min-h-0 flex-1 flex-col md:flex-row">
          <div
            className={cn(
              "flex min-h-0 min-w-0 flex-col md:w-[38%] md:flex-none md:border-r md:border-slate-200",
              mobileShowDetail && "hidden md:flex"
            )}
          >
            {listPane}
          </div>
          {detailPane}
        </div>
      </div>
    </div>
  );

  return createPortal(modal, document.body);
}
