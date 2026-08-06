"use client";

import { ChevronRight, LucideIcon } from "lucide-react";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

export interface FormFeedRow {
  id: string;
  title: string;
  subtitle: string;
  meta?: string;
  badge?: {
    label: string;
    tone: "success" | "danger" | "neutral" | "warning";
  };
}

interface ProjectFormFeedWidgetProps {
  icon: LucideIcon;
  title: string;
  description: string;
  countLabel: string;
  rows: FormFeedRow[];
  loading?: boolean;
  emptyMessage?: string;
  onOpenList?: () => void;
  onSelectRow: (id: string) => void;
}

const badgeClasses = {
  success: "border-emerald-200 bg-emerald-50 text-emerald-800",
  danger: "border-red-200 bg-red-50 text-red-800",
  neutral: "border-slate-200 bg-slate-50 text-slate-700",
  warning: "border-amber-200 bg-amber-50 text-amber-800",
};

export default function ProjectFormFeedWidget({
  icon: Icon,
  title,
  description,
  countLabel,
  rows,
  loading = false,
  emptyMessage = "No submissions yet.",
  onOpenList,
  onSelectRow,
}: ProjectFormFeedWidgetProps) {
  return (
    <div className={cn(cardClass, "flex h-full flex-col p-5")}>
      <div className="mb-3 flex items-start justify-between gap-3">
        <div className="flex items-start gap-3">
          <div className="flex h-11 w-11 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
            <Icon className="h-5 w-5" />
          </div>
          <div>
            <h3 className="font-semibold text-slate-900">{title}</h3>
            <p className="mt-0.5 text-xs text-slate-500">{description}</p>
          </div>
        </div>
        {onOpenList ? (
          <button
            type="button"
            onClick={onOpenList}
            className="rounded-lg p-1 text-slate-400 hover:bg-orange-50 hover:text-orange-600"
            aria-label={`View all ${title}`}
          >
            <ChevronRight className="h-5 w-5" />
          </button>
        ) : null}
      </div>

      <span className="mb-3 inline-flex w-fit rounded-full border border-orange-200 bg-orange-50 px-2.5 py-0.5 text-[11px] font-medium text-orange-800">
        {countLabel}
      </span>

      {loading ? (
        <p className="text-sm text-slate-500">Loading submissions…</p>
      ) : rows.length === 0 ? (
        <p className="text-sm text-slate-500">{emptyMessage}</p>
      ) : (
        <ul className="space-y-2">
          {rows.map((row) => (
            <li key={row.id}>
              <button
                type="button"
                onClick={() => onSelectRow(row.id)}
                className="w-full rounded-lg border border-slate-200 px-3 py-2.5 text-left transition hover:border-orange-300 hover:bg-orange-50/40"
              >
                <div className="flex items-start justify-between gap-2">
                  <div className="min-w-0">
                    <p className="truncate text-sm font-medium text-slate-900">
                      {row.title}
                    </p>
                    <p className="mt-0.5 text-xs text-slate-500">{row.subtitle}</p>
                    {row.meta ? (
                      <p className="mt-1 text-xs text-slate-600">{row.meta}</p>
                    ) : null}
                  </div>
                  {row.badge ? (
                    <span
                      className={cn(
                        "shrink-0 rounded-full border px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                        badgeClasses[row.badge.tone]
                      )}
                    >
                      {row.badge.label}
                    </span>
                  ) : null}
                </div>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
