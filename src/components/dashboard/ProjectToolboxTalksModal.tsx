"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import type { Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { formatSiteFormDate } from "@/lib/site-forms";
import {
  formatSiteFormTime,
  getSiteFormSubmitterName,
  getToolboxTalkAttendeeCount,
  getToolboxTalkNotes,
  getToolboxTalkSignedOffLabel,
  getToolboxTalkTopic,
  isSiteFormViewed,
} from "@/lib/dashboard-form-utils";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

type ViewedFilter = "all" | "unviewed" | "viewed";

interface ProjectToolboxTalksModalProps {
  forms: SiteFormSubmission[];
  workers: Worker[];
  projectName: string;
  onClose: () => void;
  onSelectForm: (form: SiteFormSubmission) => void;
}

const VIEWED_TABS: { id: ViewedFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "unviewed", label: "Unviewed Only" },
  { id: "viewed", label: "Viewed Only" },
];

function matchesViewedFilter(form: SiteFormSubmission, filter: ViewedFilter): boolean {
  if (filter === "all") return true;
  if (filter === "unviewed") return !isSiteFormViewed(form);
  return isSiteFormViewed(form);
}

function matchesDateRange(
  form: SiteFormSubmission,
  rangeStart: string,
  rangeEnd: string
): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const start = rangeStart || "0000-01-01";
  const end = rangeEnd || "9999-12-31";
  return form.form_date >= start && form.form_date <= end;
}

export default function ProjectToolboxTalksModal({
  forms,
  workers,
  projectName,
  onClose,
  onSelectForm,
}: ProjectToolboxTalksModalProps) {
  const [viewedFilter, setViewedFilter] = useState<ViewedFilter>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const toolboxForms = useMemo(
    () => forms.filter((form) => form.form_type === "toolbox_talk"),
    [forms]
  );

  const filteredForms = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return toolboxForms
      .filter((form) => matchesViewedFilter(form, viewedFilter))
      .filter((form) => matchesDateRange(form, rangeStart, rangeEnd))
      .filter((form) => {
        if (!query) return true;
        const topic = getToolboxTalkTopic(form).toLowerCase();
        const presenter = getSiteFormSubmitterName(form, workers).toLowerCase();
        const notes = getToolboxTalkNotes(form).toLowerCase();
        return topic.includes(query) || presenter.includes(query) || notes.includes(query);
      })
      .sort((left, right) => right.form_date.localeCompare(left.form_date));
  }, [toolboxForms, viewedFilter, rangeStart, rangeEnd, searchQuery, workers]);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-6xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Toolbox Talks</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {VIEWED_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setViewedFilter(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                viewedFilter === tab.id
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className={labelClass}>Search topic, presenter, or notes</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Topic, presenter name, or discussion notes…"
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </label>
          <label className="block">
            <span className={labelClass}>From date</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <label className="block">
            <span className={labelClass}>To date</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
        </div>

        {filteredForms.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No toolbox talks match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date &amp; time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Topic / title
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Conducted by
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Attendees
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Signed off
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Viewed
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredForms.map((form) => {
                  const viewed = isSiteFormViewed(form);
                  return (
                    <tr key={form.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatSiteFormDate(form.form_date)}
                        {form.form_time ? (
                          <span className="block text-xs text-slate-500">
                            {formatSiteFormTime(form.form_time)}
                          </span>
                        ) : null}
                      </td>
                      <td className="max-w-xs px-4 py-3 font-medium text-slate-900">
                        <span className="line-clamp-2">{getToolboxTalkTopic(form)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {getSiteFormSubmitterName(form, workers)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {getToolboxTalkAttendeeCount(form)}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-700">
                        <span className="line-clamp-2">
                          {getToolboxTalkSignedOffLabel(form)}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            viewed
                              ? "bg-slate-100 text-slate-700"
                              : "bg-orange-100 text-orange-800"
                          )}
                        >
                          {viewed ? "Viewed" : "Unviewed"}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectForm(form)}
                          className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Showing {filteredForms.length} of {toolboxForms.length} talk
          {toolboxForms.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
