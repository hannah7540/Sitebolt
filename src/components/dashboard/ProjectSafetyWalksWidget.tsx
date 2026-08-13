"use client";

import { useMemo, useState } from "react";
import { ShieldCheck, ChevronRight, Loader2, Eye } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  countSafetyWalkOpenHazards,
  getSiteFormSubmitterName,
  hasSafetyWalkOpenHazards,
  isSafetyWalkViewed,
} from "@/lib/dashboard-form-utils";
import { markSiteFormViewed } from "@/lib/site-form-mutations";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ProjectSafetyWalksWidgetProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  loading?: boolean;
  onOpenList: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
  onViewed: () => void;
}

export default function ProjectSafetyWalksWidget({
  forms,
  workers,
  loading = false,
  onOpenList,
  onSelectForm,
  onViewed,
}: ProjectSafetyWalksWidgetProps) {
  const [markingId, setMarkingId] = useState<string | null>(null);
  const [locallyViewedIds, setLocallyViewedIds] = useState<Set<string>>(
    () => new Set()
  );
  const [error, setError] = useState<string | null>(null);

  const allWalkForms = useMemo(
    () => forms.filter((form) => form.form_type === "safety_walk"),
    [forms]
  );

  const unviewedWalks = useMemo(() => {
    return allWalkForms
      .filter((form) => {
        if (locallyViewedIds.has(form.id)) return false;
        return !isSafetyWalkViewed(form);
      })
      .sort((left, right) => right.form_date.localeCompare(left.form_date))
      .slice(0, 5);
  }, [allWalkForms, locallyViewedIds]);

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
        <ShieldCheck className="h-10 w-10 shrink-0 text-orange-500" />
        <div className="min-w-0 flex-1">
          <div className="flex items-start justify-between gap-2">
            <h2 className="text-2xl font-bold text-slate-900">Safety Walks</h2>
            <button
              type="button"
              onClick={onOpenList}
              className="shrink-0 rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
              aria-label="View all safety walks"
            >
              <ChevronRight className="h-5 w-5" />
            </button>
          </div>
          <p className="mt-0.5 text-sm text-slate-500">
            {loading
              ? "Loading safety walks…"
              : unviewedWalks.length > 0
                ? `${unviewedWalks.length} unviewed walk${unviewedWalks.length === 1 ? "" : "s"}`
                : "No unviewed safety walks"}
          </p>
          {allWalkForms.length > 0 ? (
            <button
              type="button"
              onClick={onOpenList}
              className="mt-1 text-xs font-semibold text-orange-600 hover:text-orange-700"
            >
              View all safety walks ({allWalkForms.length})
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
          Loading safety walks…
        </div>
      ) : unviewedWalks.length === 0 ? (
        <button
          type="button"
          onClick={onOpenList}
          className={cn(
            "flex flex-1 items-center justify-center rounded-xl border border-dashed border-slate-200 bg-slate-50 px-4 py-10 text-center text-sm text-slate-500",
            allWalkForms.length > 0 &&
              "cursor-pointer hover:border-orange-300 hover:bg-orange-50/40 hover:text-orange-700"
          )}
        >
          {allWalkForms.length > 0
            ? "All walks viewed. View full history →"
            : "No safety walks submitted yet."}
        </button>
      ) : (
        <ul className="min-h-0 flex-1 space-y-3 overflow-y-auto">
          {unviewedWalks.map((form) => {
            const openHazards = countSafetyWalkOpenHazards(form);
            const isMarking = markingId === form.id;

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
                  <div className="flex flex-wrap items-center gap-2">
                    <p className="font-semibold text-slate-900">
                      {getSiteFormSubmitterName(form, workers)}
                    </p>
                    <span
                      className={cn(
                        "rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        hasSafetyWalkOpenHazards(form)
                          ? "border-amber-200 bg-amber-50 text-amber-800"
                          : "border-emerald-200 bg-emerald-50 text-emerald-800"
                      )}
                    >
                      {hasSafetyWalkOpenHazards(form) ? "Follow-up" : "Clear"}
                    </span>
                  </div>
                  <p className="mt-1 text-sm text-slate-600">
                    {formatSiteFormDate(form.form_date)}
                    {form.location_scope ? ` · ${form.location_scope}` : ""}
                  </p>
                  <p className="mt-0.5 text-xs text-slate-500">
                    {openHazards} open hazard{openHazards === 1 ? "" : "s"}
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
