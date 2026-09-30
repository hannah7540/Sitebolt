"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import {
  Bell,
  CheckCircle2,
  Clock,
  FileText,
  Loader2,
  Printer,
  TriangleAlert,
} from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";
import { fetchProjectSwmsDocuments, type SwmsDocumentSummary } from "@/lib/swms";
import {
  classifySwmsReviewDue,
  DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS,
  fetchProjectScopedWorkers,
  fetchProjectSwmsReviews,
  fetchProjectSwmsReviewSchedule,
  formatSwmsReviewDate,
  submitProjectSwmsReview,
  tallySwmsReviewItems,
  upsertProjectSwmsReviewSchedule,
  workerNameFromList,
  type ProjectSwmsReview,
  type ProjectSwmsReviewSchedule,
  type SwmsReviewItem,
  type SwmsReviewItemStatus,
} from "@/lib/swms-review";
import { getAdminWorkerId, getStoredWorkerId } from "@/lib/user-session";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import type { Worker } from "@/lib/supabase";
import { downloadSwmsReviewPdf, generateSwmsReviewPdf } from "@/lib/swms-review-pdf";

type ReviewHubView = "dashboard" | "form" | "history";

interface ProjectSwmsReviewPanelProps {
  projectId: string;
  projectName: string;
  workers: Worker[];
  initialView?: ReviewHubView;
}

const DUE_BADGE: Record<
  ReturnType<typeof classifySwmsReviewDue>,
  { label: string; className: string }
> = {
  good: { label: "On track", className: "bg-emerald-50 text-emerald-800 border-emerald-200" },
  due_soon: { label: "Due soon", className: "bg-amber-50 text-amber-800 border-amber-200" },
  overdue: { label: "Overdue", className: "bg-red-50 text-red-800 border-red-200" },
  unset: { label: "Not scheduled", className: "bg-slate-100 text-slate-600 border-slate-200" },
};

function todayIsoDate(): string {
  return new Date().toISOString().slice(0, 10);
}

export default function ProjectSwmsReviewPanel({
  projectId,
  projectName,
  workers,
  initialView = "dashboard",
}: ProjectSwmsReviewPanelProps) {
  const [view, setView] = useState<ReviewHubView>(initialView);
  const [projectWorkers, setProjectWorkers] = useState<Worker[]>([]);
  const [documents, setDocuments] = useState<SwmsDocumentSummary[]>([]);
  const [schedule, setSchedule] = useState<ProjectSwmsReviewSchedule | null>(null);
  const [reviews, setReviews] = useState<ProjectSwmsReview[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingSchedule, setSavingSchedule] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [sendingReminder, setSendingReminder] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<string | null>(null);

  const [responsibleWorkerId, setResponsibleWorkerId] = useState("");
  const [frequencyDays, setFrequencyDays] = useState(DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS);

  const [reviewDate] = useState(todayIsoDate);
  const [reviewingManagerId, setReviewingManagerId] = useState("");
  const [consultedWorkerId, setConsultedWorkerId] = useState("");
  const [items, setItems] = useState<SwmsReviewItem[]>([]);
  const [managerSignature, setManagerSignature] = useState<string | null>(null);
  const [consultedSignature, setConsultedSignature] = useState<string | null>(null);
  const [printReview, setPrintReview] = useState<ProjectSwmsReview | null>(null);
  const [exportingPdf, setExportingPdf] = useState(false);

  const loadData = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const [scopedResult, docsResult, scheduleResult, reviewsResult] = await Promise.allSettled([
        fetchProjectScopedWorkers(projectId, workers),
        fetchProjectSwmsDocuments(projectId),
        fetchProjectSwmsReviewSchedule(projectId),
        fetchProjectSwmsReviews(projectId),
      ]);

      const scoped = scopedResult.status === "fulfilled" ? scopedResult.value : [];
      const docs = docsResult.status === "fulfilled" ? docsResult.value : [];
      const schedulePayload =
        scheduleResult.status === "fulfilled"
          ? scheduleResult.value
          : { schedule: null, error: null };
      const reviewsPayload =
        reviewsResult.status === "fulfilled"
          ? reviewsResult.value
          : { reviews: [], error: null };

      setProjectWorkers(scoped);
      setDocuments(docs);
      setSchedule(schedulePayload.schedule);
      setReviews(reviewsPayload.reviews);
      setResponsibleWorkerId(schedulePayload.schedule?.responsible_worker_id ?? "");
      setFrequencyDays(
        schedulePayload.schedule?.frequency_days ?? DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS
      );
    } catch {
      setSchedule(null);
      setReviews([]);
      setResponsibleWorkerId("");
      setFrequencyDays(DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS);
    } finally {
      setLoading(false);
    }
  }, [projectId, workers]);

  useEffect(() => {
    void loadData();
  }, [loadData]);

  useEffect(() => {
    setView(initialView);
  }, [initialView]);

  useEffect(() => {
    if (view !== "form" || items.length > 0 || documents.length === 0) return;
    setItems(
      documents.map((doc) => ({
        swms_id: doc.id,
        title: doc.title || "SWMS",
        status: "accepted" as const,
        notes: "",
      }))
    );
  }, [view, documents, items.length]);

  const sessionWorkerId = useMemo(
    () => getAdminWorkerId()?.trim() || getStoredWorkerId()?.trim() || "",
    []
  );

  const dueKind = classifySwmsReviewDue(schedule?.next_review_due);
  const dueBadge = DUE_BADGE[dueKind];

  const startReview = () => {
    const managerFromSession = projectWorkers.some((worker) => worker.id === sessionWorkerId)
      ? sessionWorkerId
      : "";
    const managerId =
      managerFromSession || schedule?.responsible_worker_id || responsibleWorkerId;
    setReviewingManagerId(managerId);
    setConsultedWorkerId("");
    setManagerSignature(null);
    setConsultedSignature(null);
    setItems(
      documents.map((doc) => ({
        swms_id: doc.id,
        title: doc.title || "SWMS",
        status: "accepted" as const,
        notes: "",
      }))
    );
    setError(null);
    setView("form");
  };

  const updateItem = (swmsId: string, patch: Partial<SwmsReviewItem>) => {
    setItems((current) =>
      current.map((item) => (item.swms_id === swmsId ? { ...item, ...patch } : item))
    );
  };

  const handleSaveSchedule = async () => {
    setSavingSchedule(true);
    setError(null);
    setToast(null);
    const result = await upsertProjectSwmsReviewSchedule({
      projectId,
      responsibleWorkerId,
      frequencyDays,
    });
    setSavingSchedule(false);
    if (result.error || !result.schedule) {
      if (result.error) {
        console.error("[SWMS Schedule Save Error]:", result.error);
      }
      setError(result.error ?? "Schedule write returned no row.");
      return;
    }
    setSchedule(result.schedule);
    setToast("Responsible worker and review frequency saved.");
  };

  const handleSubmitReview = async () => {
    setSubmitting(true);
    setError(null);
    const result = await submitProjectSwmsReview({
      projectId,
      reviewDate,
      reviewingManagerId,
      consultedWorkerId,
      reviewingManagerSignature: managerSignature ?? "",
      consultedWorkerSignature: consultedSignature ?? "",
      items,
      frequencyDays,
    });
    setSubmitting(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    setToast("SWMS review saved. Next review date has been updated.");
    setView("history");
    await loadData();
  };

  const handleReminder = async () => {
    setSendingReminder(true);
    setError(null);
    setToast(null);
    try {
      const response = await fetch("/api/swms/review-reminder", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ projectId, projectName }),
      });
      const payload = (await response.json()) as { error?: string };
      if (!response.ok) {
        setError(payload.error ?? "Failed to send review reminder.");
      } else {
        setToast("Review reminder emailed to the responsible worker.");
      }
    } catch {
      setError("Failed to send review reminder.");
    } finally {
      setSendingReminder(false);
    }
  };

  const consultedOptions = projectWorkers.filter((worker) => worker.id !== reviewingManagerId);

  const handleDownloadReviewPdf = async (review: ProjectSwmsReview) => {
    setExportingPdf(true);
    setError(null);
    try {
      const { blob, fileName } = await generateSwmsReviewPdf({
        review,
        projectName,
        reviewingManagerName: workerNameFromList(projectWorkers, review.reviewing_manager_id),
        consultedWorkerName: workerNameFromList(projectWorkers, review.consulted_worker_id),
      });
      downloadSwmsReviewPdf(blob, fileName);
    } catch (exportError) {
      const message =
        exportError instanceof Error ? exportError.message : "Failed to generate SWMS review PDF.";
      console.error("[SWMS Review PDF Error]:", exportError);
      setError(message);
    } finally {
      setExportingPdf(false);
    }
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap gap-2">
        {(
          [
            ["dashboard", "Review dashboard"],
            ["form", "Start review"],
            ["history", "Completed reviews"],
          ] as const
        ).map(([key, label]) => (
          <button
            key={key}
            type="button"
            onClick={() => {
              if (key === "form") startReview();
              else setView(key);
            }}
            className={cn(
              "rounded-full border px-3 py-1.5 text-sm font-medium",
              view === key
                ? "border-orange-500 bg-orange-50 text-orange-700"
                : "border-slate-200 bg-white text-slate-600 hover:border-orange-200"
            )}
          >
            {label}
          </button>
        ))}
      </div>

      {toast ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-900">
          {toast}
        </p>
      ) : null}
      {error ? (
        <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading SWMS review…
        </div>
      ) : view === "form" ? (
        <section className={cn("space-y-6 p-5", cardClass)}>
          <div>
            <h2 className="text-xl font-bold text-slate-900">SWMS periodic review</h2>
            <p className="mt-1 text-sm text-slate-500">
              Review each active SWMS with a consulted site worker from this project.
            </p>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <label className="text-sm font-medium text-slate-700">
              Today&apos;s date
              <input className={cn(inputClass, "mt-1 bg-slate-50")} value={reviewDate} readOnly />
            </label>
            <label className="text-sm font-medium text-slate-700">
              Reviewing manager
              <select
                className={cn(inputClass, "mt-1")}
                value={reviewingManagerId}
                onChange={(event) => {
                  setReviewingManagerId(event.target.value);
                  if (event.target.value === consultedWorkerId) setConsultedWorkerId("");
                }}
              >
                <option value="">Select reviewing manager</option>
                {projectWorkers.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {getWorkerDisplayName(worker)}
                  </option>
                ))}
              </select>
            </label>
            <label className="text-sm font-medium text-slate-700">
              Consulted worker
              <select
                className={cn(inputClass, "mt-1")}
                value={consultedWorkerId}
                onChange={(event) => setConsultedWorkerId(event.target.value)}
              >
                <option value="">Select consulted worker</option>
                {consultedOptions.map((worker) => (
                  <option key={worker.id} value={worker.id}>
                    {getWorkerDisplayName(worker)}
                  </option>
                ))}
              </select>
            </label>
          </div>

          <div className="space-y-3">
            <h3 className="text-sm font-semibold text-slate-800">Active SWMS checklist</h3>
            {items.length === 0 ? (
              <p className="text-sm text-slate-500">No active site-specific SWMS on this project.</p>
            ) : (
              items.map((item) => (
                <article key={item.swms_id} className="rounded-lg border border-slate-200 p-4">
                  <p className="font-medium text-slate-900">{item.title}</p>
                  <p className="text-xs text-slate-500">Ref {item.swms_id.slice(0, 8)}</p>
                  <div className="mt-3 flex flex-wrap gap-2">
                    {(
                      [
                        ["accepted", "Reviewed and Accepted"],
                        ["requires_update", "Reviewed and Requires Update"],
                      ] as const
                    ).map(([status, label]) => (
                      <button
                        key={status}
                        type="button"
                        onClick={() =>
                          updateItem(item.swms_id, {
                            status: status as SwmsReviewItemStatus,
                            notes: status === "accepted" ? "" : item.notes,
                          })
                        }
                        className={cn(
                          "rounded-lg border px-3 py-1.5 text-sm",
                          item.status === status
                            ? status === "accepted"
                              ? "border-emerald-500 bg-emerald-50 text-emerald-800"
                              : "border-amber-500 bg-amber-50 text-amber-800"
                            : "border-slate-200 text-slate-600"
                        )}
                      >
                        {label}
                      </button>
                    ))}
                  </div>
                  {item.status === "requires_update" ? (
                    <label className="mt-3 block text-sm font-medium text-slate-700">
                      Required modifications
                      <textarea
                        className={cn(inputClass, "mt-1 min-h-20")}
                        value={item.notes}
                        onChange={(event) => updateItem(item.swms_id, { notes: event.target.value })}
                        required
                      />
                    </label>
                  ) : null}
                </article>
              ))
            )}
          </div>

          <div className="grid gap-4 md:grid-cols-2">
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Reviewing manager signature</p>
              <SignatureCanvas onChange={setManagerSignature} />
            </div>
            <div>
              <p className="mb-2 text-sm font-semibold text-slate-800">Consulted worker signature</p>
              <SignatureCanvas onChange={setConsultedSignature} />
            </div>
          </div>

          <div className="flex flex-wrap gap-3">
            <button
              type="button"
              onClick={() => void handleSubmitReview()}
              disabled={submitting}
              className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
            >
              {submitting ? "Saving…" : "Submit dual sign-off"}
            </button>
            <button
              type="button"
              onClick={() => setView("dashboard")}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-600"
            >
              Cancel
            </button>
          </div>
        </section>
      ) : view === "history" ? (
        <section className="space-y-4">
          {reviews.length === 0 ? (
            <div className={cn("p-8 text-center", cardClass)}>
              <FileText className="mx-auto h-10 w-10 text-slate-400" />
              <p className="mt-3 text-sm text-slate-600">No completed SWMS reviews yet.</p>
            </div>
          ) : (
            reviews.map((review) => {
              const tally = tallySwmsReviewItems(review.items);
              return (
                <article key={review.id} className={cn("p-5", cardClass)}>
                  <div className="flex flex-wrap items-start justify-between gap-3">
                    <div>
                      <p className="font-semibold text-slate-900">
                        {formatSwmsReviewDate(review.review_date)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Manager: {workerNameFromList(projectWorkers, review.reviewing_manager_id)}
                      </p>
                      <p className="text-sm text-slate-600">
                        Consulted: {workerNameFromList(projectWorkers, review.consulted_worker_id)}
                      </p>
                      <p className="mt-1 text-sm text-slate-500">
                        {tally.accepted} accepted · {tally.requiresUpdate} require update
                      </p>
                    </div>
                    <button
                      type="button"
                      onClick={() => setPrintReview(review)}
                      className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-3 py-1.5 text-sm text-slate-700 hover:border-orange-300"
                    >
                      <Printer className="h-4 w-4" />
                      View / Print PDF
                    </button>
                  </div>
                </article>
              );
            })
          )}
        </section>
      ) : (
        <div className="space-y-6">
          <section className={cn("p-5", cardClass)}>
            <div className="flex flex-wrap items-start justify-between gap-4">
              <div>
                <h2 className="text-xl font-bold text-slate-900">Review schedule</h2>
                <p className="mt-1 text-sm text-slate-500">
                  One responsible worker reviews this project&apos;s SWMS on a recurring cycle.
                </p>
              </div>
              <span
                className={cn(
                  "inline-flex items-center gap-1 rounded-full border px-3 py-1 text-xs font-semibold",
                  dueBadge.className
                )}
              >
                {dueKind === "overdue" ? (
                  <TriangleAlert className="h-3.5 w-3.5" />
                ) : dueKind === "good" ? (
                  <CheckCircle2 className="h-3.5 w-3.5" />
                ) : (
                  <Clock className="h-3.5 w-3.5" />
                )}
                {dueBadge.label}
              </span>
            </div>

            <div className="mt-5 grid gap-4 sm:grid-cols-2">
              <label className="text-sm font-medium text-slate-700">
                Responsible worker
                <select
                  className={cn(inputClass, "mt-1")}
                  value={responsibleWorkerId}
                  onChange={(event) => setResponsibleWorkerId(event.target.value)}
                >
                  <option value="">Select a project worker</option>
                  {projectWorkers.map((worker) => (
                    <option key={worker.id} value={worker.id}>
                      {getWorkerDisplayName(worker)}
                    </option>
                  ))}
                </select>
              </label>
              <label className="text-sm font-medium text-slate-700">
                Review frequency (days)
                <input
                  type="number"
                  min={1}
                  className={cn(inputClass, "mt-1")}
                  value={frequencyDays}
                  onChange={(event) =>
                    setFrequencyDays(Math.max(1, Number(event.target.value) || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS))
                  }
                />
              </label>
            </div>

            <p className="mt-4 text-sm text-slate-600">
              {schedule ? (
                <>
                  Every {frequencyDays || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS} days · Next due{" "}
                  <strong>{formatSwmsReviewDate(schedule.next_review_due)}</strong>
                  {schedule.last_reviewed_at
                    ? ` · Last reviewed ${formatSwmsReviewDate(schedule.last_reviewed_at)}`
                    : ""}
                </>
              ) : (
                <>
                  No schedule yet. Choose a responsible worker and save to start the{" "}
                  {frequencyDays || DEFAULT_SWMS_REVIEW_FREQUENCY_DAYS}-day review cycle.
                </>
              )}
            </p>

            <div className="mt-5 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => void handleSaveSchedule()}
                disabled={savingSchedule}
                className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-medium text-slate-700 hover:border-orange-300 disabled:opacity-60"
              >
                {savingSchedule ? "Saving…" : "Save schedule"}
              </button>
              <button
                type="button"
                onClick={startReview}
                className="rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600"
              >
                Start SWMS Review
              </button>
              <button
                type="button"
                onClick={() => void handleReminder()}
                disabled={sendingReminder || !schedule?.responsible_worker_id}
                className="inline-flex items-center gap-2 rounded-lg border border-slate-200 px-4 py-2 text-sm text-slate-700 disabled:opacity-60"
              >
                <Bell className="h-4 w-4" />
                {sendingReminder ? "Sending…" : "Email reminder"}
              </button>
            </div>
          </section>
        </div>
      )}

      {printReview ? (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
          <div className="max-h-[92vh] w-full max-w-3xl overflow-y-auto rounded-2xl bg-white p-6 shadow-xl">
            <div className="mb-4 flex items-center justify-between">
              <h3 className="text-lg font-bold text-slate-900">SWMS review document</h3>
              <div className="flex gap-2">
                <button
                  type="button"
                  onClick={() => void handleDownloadReviewPdf(printReview)}
                  disabled={exportingPdf}
                  className="rounded-lg bg-orange-500 px-3 py-1.5 text-sm font-semibold text-white disabled:opacity-60"
                >
                  {exportingPdf ? "Generating PDF…" : "Download PDF"}
                </button>
                <button
                  type="button"
                  onClick={() => setPrintReview(null)}
                  className="rounded-lg border border-slate-200 px-3 py-1.5 text-sm"
                >
                  Close
                </button>
              </div>
            </div>

            <div className="space-y-5 border border-slate-200 p-5">
              <div>
                <p className="text-xl font-bold text-slate-900">
                  SWMS Periodic Review - {projectName}
                </p>
                <p className="mt-3 grid gap-2 rounded-lg border border-slate-200 bg-slate-50 p-3 text-sm text-slate-700 sm:grid-cols-2">
                  <span>
                    <strong>Project:</strong> {projectName}
                  </span>
                  <span>
                    <strong>Date of Review:</strong> {formatSwmsReviewDate(printReview.review_date)}
                  </span>
                  <span>
                    <strong>Reviewing Manager:</strong>{" "}
                    {workerNameFromList(projectWorkers, printReview.reviewing_manager_id)}
                  </span>
                  <span>
                    <strong>Consulted Worker:</strong>{" "}
                    {workerNameFromList(projectWorkers, printReview.consulted_worker_id)}
                  </span>
                </p>
              </div>

              <table className="w-full border-collapse text-left text-sm">
                <thead>
                  <tr className="bg-slate-800 text-white">
                    <th className="px-2 py-2">#</th>
                    <th className="px-2 py-2">SWMS Document / Activity Title</th>
                    <th className="px-2 py-2">Outcome / Status</th>
                    <th className="px-2 py-2">Comments / Action Required</th>
                  </tr>
                </thead>
                <tbody>
                  {printReview.items.map((item, index) => (
                    <tr key={item.swms_id} className="border-b border-slate-200">
                      <td className="px-2 py-2">{index + 1}</td>
                      <td className="px-2 py-2">{item.title}</td>
                      <td className="px-2 py-2">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            item.status === "accepted"
                              ? "bg-emerald-50 text-emerald-800"
                              : "bg-amber-50 text-amber-800"
                          )}
                        >
                          {item.status === "accepted"
                            ? "Reviewed and Accepted"
                            : "Requires Update"}
                        </span>
                      </td>
                      <td className="px-2 py-2 text-slate-600">
                        {item.notes.trim() ||
                          (item.status === "requires_update"
                            ? "Action required"
                            : "None - Compliant")}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>

              <div className="break-inside-avoid space-y-3">
                <p className="text-sm text-slate-700">
                  We confirm that the Safe Work Method Statements listed above have been
                  systematically reviewed in consultation with site workers, are suitable for
                  current site conditions, and all identified controls remain effective.
                </p>
                <div className="grid gap-4 md:grid-cols-2">
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Reviewing Manager
                    </p>
                    <p className="mt-1 text-sm text-slate-800">
                      {workerNameFromList(projectWorkers, printReview.reviewing_manager_id)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatSwmsReviewDate(printReview.review_date)}
                    </p>
                    {printReview.reviewing_manager_signature ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={printReview.reviewing_manager_signature}
                        alt="Reviewing manager signature"
                        className="mt-2 h-16 object-contain"
                      />
                    ) : null}
                  </div>
                  <div className="rounded-lg border border-slate-200 p-3">
                    <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                      Consulted Worker
                    </p>
                    <p className="mt-1 text-sm text-slate-800">
                      {workerNameFromList(projectWorkers, printReview.consulted_worker_id)}
                    </p>
                    <p className="text-xs text-slate-500">
                      {formatSwmsReviewDate(printReview.review_date)}
                    </p>
                    {printReview.consulted_worker_signature ? (
                      // eslint-disable-next-line @next/next/no-img-element
                      <img
                        src={printReview.consulted_worker_signature}
                        alt="Consulted worker signature"
                        className="mt-2 h-16 object-contain"
                      />
                    ) : null}
                  </div>
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : null}
    </div>
  );
}
