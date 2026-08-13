"use client";

import { useMemo, useState } from "react";
import { Sun, ChevronRight, Loader2, Eye } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  formatSiteFormTime,
  getDailyPrestartCompletionCount,
  getSiteFormSubmitterName,
  isSiteFormViewed,
} from "@/lib/dashboard-form-utils";
import { markSiteFormViewed } from "@/lib/site-form-mutations";
import { localIsoDate } from "@/lib/timesheet-utils";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ProjectDailyPrestartsWidgetProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
  onViewed: () => void;
}

export default function ProjectDailyPrestartsWidget({
  forms,
  workers,
  loading = false,
  onOpenList,
  onSelectForm,
  onViewed,
}: ProjectDailyPrestartsWidgetProps) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [locallyViewedIds, setLocallyViewedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [error, setError] = useState<string | null>(null);
  const todayIso = localIsoDate();

  const allDailyForms = useMemo(
    () => forms.filter((form) => form.form_type === "daily_prestart"),
    [forms]
  );

  const unviewedDailyForms = useMemo(() => {
    return allDailyForms
      .filter((form) => {
        if (locallyViewedIds.has(form.id)) return false;
        return !isSiteFormViewed(form);
      })
      .sort((left, right) => right.form_date.localeCompare(left.form_date))
      .slice(0, 5);
  }, [allDailyForms, locallyViewedIds]);

  const todayUnviewedCount = useMemo(
    () =>
      allDailyForms.filter(
        (form) =>
          form.form_date === todayIso &&
          !locallyViewedIds.has(form.id) &&
          !isSiteFormViewed(form)
      ).length,
    [allDailyForms, locallyViewedIds, todayIso]
  );

  const handleMarkViewed = async (formId: string) => {
    setError(null);
    setMarkingId(formId);

    try {
      const result = await markSiteFormViewed(formId);
      if (result.error) {
        setError(result.error);
        return;
      }

      setLocallyViewedIds((current) => new Set(current).add(formId));
      onViewed();
    } catch (err) {
      console.error("Mark viewed failed:", err);
      setError(err instanceof Error ? err.message : "Failed to mark as viewed.");
    } finally {
      setMarkingId(null);
    }
  };

  return (
    <div className={cn(cardClass, "flex h-full flex-col p-6")}>
      <div className="mb-4 flex items-start gap-4">
        <Sun className="h-10 w-10 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Daily Pre-Starts</h2>
            <button
              type="button"
              onClick={onOpenList}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
              aria-label="View all daily pre-starts"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading
              ? "Loading daily pre-starts…"
              : unviewedDailyForms.length > 0
                ? `${unviewedDailyForms.length} unviewed meeting${unviewedDailyForms.length === 1 ? "" : "s"}`
                : "No unviewed daily pre-starts"}
          </p>
          {allDailyForms.length > 0 ? (
            <button
              type="button"
              onClick={onOpenList}
              className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              View all meetings ({allDailyForms.length})
              {todayUnviewedCount > 0 ? ` · ${todayUnviewedCount} today` : ""}
            </button>
          ) : null}
        </div>
      </div>

      {error ? (
        <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
          {error}
        </p>
      ) : null}

      {loading ? (
        <div className="flex flex-1 items-center gap-2 py-8 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading daily pre-starts…
        </div>
      ) : unviewedDailyForms.length === 0 ? (
        <button
          type="button"
          onClick={onOpenList}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500",
            allDailyForms.length > 0 &&
              "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700"
          )}
        >
          {allDailyForms.length > 0
            ? "All meetings viewed. View full history →"
            : "No daily pre-start meetings submitted yet."}
        </button>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {unviewedDailyForms.map((form) => {
            const isMarking = markingId === form.id;
            const attendeeCount = getDailyPrestartCompletionCount(form);

            return (
              <li
                key={form.id}
                className="rounded-xl border border-slate-200 bg-slate-50 p-4"
              >
                <button
                  type="button"
                  onClick={() => onSelectForm(form)}
                  className="mb-3 w-full text-left"
                >
                  <p className="font-semibold text-slate-900">
                    {getSiteFormSubmitterName(form, workers)}
                  </p>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatSiteFormDate(form.form_date)}
                    {form.form_time ? ` · ${formatSiteFormTime(form.form_time)}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {attendeeCount} attendee{attendeeCount === 1 ? "" : "s"} completed
                  </p>
                </button>

                <div className="flex gap-2">
                  <button
                    type="button"
                    disabled={isMarking}
                    onClick={(event) => {
                      event.stopPropagation();
                      void handleMarkViewed(form.id);
                    }}
                    className="flex flex-1 items-center justify-center gap-1.5 rounded-lg border border-slate-300 bg-white py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
                  >
                    {isMarking ? (
                      <Loader2 className="h-4 w-4 animate-spin" />
                    ) : (
                      <Eye className="h-4 w-4" />
                    )}
                    Mark as Viewed
                  </button>
                  <button
                    type="button"
                    onClick={() => onSelectForm(form)}
                    className="rounded-lg border border-orange-200 bg-orange-50 px-3 py-2 text-sm font-semibold text-orange-700 hover:bg-orange-100"
                  >
                    Open
                  </button>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
