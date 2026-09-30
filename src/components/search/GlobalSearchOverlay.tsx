"use client";

import Link from "next/link";
import { FolderKanban, Loader2, Truck, Users, ClipboardList, X } from "lucide-react";
import type { LucideIcon } from "lucide-react";
import {
  countGlobalSearchHits,
  type GlobalSearchHit,
  type GlobalSearchResults,
} from "@/lib/global-search";
import { cn } from "@/lib/utils";

const SECTIONS: Array<{
  key: keyof GlobalSearchResults;
  label: string;
  icon: LucideIcon;
}> = [
  { key: "projects", label: "Projects", icon: FolderKanban },
  { key: "workers", label: "Workers", icon: Users },
  { key: "plantFleet", label: "Plant & Fleet", icon: Truck },
  { key: "itpItc", label: "ITPs & ITCs", icon: ClipboardList },
];

interface GlobalSearchOverlayProps {
  query: string;
  results: GlobalSearchResults;
  loading: boolean;
  onClose: () => void;
}

export default function GlobalSearchOverlay({
  query,
  results,
  loading,
  onClose,
}: GlobalSearchOverlayProps) {
  const total = countGlobalSearchHits(results);

  return (
    <div
      className="pointer-events-none fixed inset-y-0 left-0 right-0 z-40 hidden md:block lg:left-80"
      role="presentation"
    >
      <button
        type="button"
        aria-label="Close search results"
        className="pointer-events-auto absolute inset-0 bg-black/30 backdrop-blur-sm"
        onClick={onClose}
      />
      <div className="pointer-events-none absolute inset-0 flex items-start justify-center overflow-y-auto p-6 pt-10 lg:p-10">
        <section
          role="dialog"
          aria-modal="true"
          aria-label="Search results"
          className="pointer-events-auto w-full max-w-3xl rounded-2xl border border-slate-200 bg-white shadow-2xl"
        >
          <div className="flex items-start justify-between gap-4 border-b border-slate-200 px-5 py-4">
            <div>
              <p className="text-xs font-semibold uppercase tracking-wider text-slate-400">
                Global search
              </p>
              <h2 className="mt-1 text-lg font-bold text-slate-900">
                Results for &quot;{query}&quot;
                <span className="ml-2 text-sm font-semibold text-slate-500">
                  ({total} {total === 1 ? "item" : "items"} found)
                </span>
              </h2>
            </div>
            <button
              type="button"
              onClick={onClose}
              className="inline-flex items-center gap-1 rounded-lg border border-slate-200 px-2.5 py-1.5 text-sm font-semibold text-slate-600 transition hover:border-orange-200 hover:bg-orange-50 hover:text-orange-700"
              aria-label="Close"
            >
              <X className="h-4 w-4" />
              Close
            </button>
          </div>

          <div className="max-h-[min(70vh,640px)] overflow-y-auto px-5 py-4">
            {loading ? (
              <div className="flex items-center gap-2 py-12 text-sm text-slate-500">
                <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                Searching records…
              </div>
            ) : total === 0 ? (
              <p className="py-12 text-center text-sm text-slate-500">
                No matching records found for &apos;{query}&apos;.
              </p>
            ) : (
              <div className="space-y-5">
                {SECTIONS.map((section) => {
                  const hits = results[section.key];
                  if (hits.length === 0) return null;
                  const Icon = section.icon;
                  return (
                    <div key={section.key}>
                      <p className="mb-2 flex items-center gap-1.5 text-[11px] font-bold uppercase tracking-wider text-slate-400">
                        <Icon className="h-3.5 w-3.5" />
                        {section.label}
                      </p>
                      <ul className="space-y-1.5">
                        {hits.map((hit) => (
                          <ResultRow key={hit.id} hit={hit} onNavigate={onClose} />
                        ))}
                      </ul>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </section>
      </div>
    </div>
  );
}

function ResultRow({
  hit,
  onNavigate,
}: {
  hit: GlobalSearchHit;
  onNavigate: () => void;
}) {
  return (
    <li>
      <Link
        href={hit.href}
        onClick={onNavigate}
        className="flex items-center gap-3 rounded-xl border border-transparent px-3 py-2.5 transition hover:border-orange-200 hover:bg-orange-50"
      >
        <span className="min-w-0 flex-1">
          <span className="block truncate text-sm font-semibold text-slate-900">
            {hit.title}
          </span>
          {hit.subtitle ? (
            <span className="block truncate text-xs text-slate-500">{hit.subtitle}</span>
          ) : null}
        </span>
        <span
          className={cn(
            "shrink-0 rounded-full px-2 py-0.5 text-[11px] font-bold uppercase tracking-wide",
            badgeClass(hit.badge)
          )}
        >
          {hit.badge}
        </span>
      </Link>
    </li>
  );
}

function badgeClass(badge: string): string {
  const value = badge.toLowerCase();
  if (value.includes("active") || value === "plant" || value === "worker") {
    return "bg-emerald-50 text-emerald-700";
  }
  if (value.includes("itc") || value.includes("itp")) {
    return "bg-orange-50 text-orange-800";
  }
  if (value.includes("fleet")) {
    return "bg-sky-50 text-sky-800";
  }
  if (value.includes("archiv") || value.includes("inactive")) {
    return "bg-slate-100 text-slate-600";
  }
  return "bg-slate-100 text-slate-700";
}
