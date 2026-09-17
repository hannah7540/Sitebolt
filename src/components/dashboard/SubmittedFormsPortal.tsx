"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ClipboardList, Loader2, Search, X } from "lucide-react";
import WorkerMobileBackButton from "@/components/layout/WorkerMobileBackButton";
import {
  formatFormDate,
  type CustomFormSubmission,
} from "@/lib/custom-forms";
import { cn } from "@/lib/utils";
import { inputClass, modalCloseIconButtonClass } from "@/lib/ui-classes";

export interface SubmittedFormRowMeta {
  entityTag: string;
  projectName: string | null;
  relativeTime: string;
}

interface SubmittedFormsPortalProps {
  open: boolean;
  submissions: CustomFormSubmission[];
  rowMeta: Record<string, SubmittedFormRowMeta>;
  loading: boolean;
  error: string | null;
  showProjectName?: boolean;
  onClose: () => void;
  onSelect: (submission: CustomFormSubmission) => void;
}

const EDGE_SWIPE_IGNORE_PX = 24;
const DISMISS_DISTANCE_PX = 72;
const HEADER_SWIPE_ZONE_PX = 96;

export default function SubmittedFormsPortal({
  open,
  submissions,
  rowMeta,
  loading,
  error,
  showProjectName = false,
  onClose,
  onSelect,
}: SubmittedFormsPortalProps) {
  const [query, setQuery] = useState("");
  const [offset, setOffset] = useState({ x: 0, y: 0 });
  const [dragging, setDragging] = useState(false);
  const startRef = useRef<{ x: number; y: number; edge: boolean } | null>(null);

  useEffect(() => {
    if (!open) {
      setQuery("");
      setOffset({ x: 0, y: 0 });
      setDragging(false);
      startRef.current = null;
      return;
    }
    const previousOverflow = document.body.style.overflow;
    document.body.style.overflow = "hidden";
    const onKey = (event: KeyboardEvent) => {
      if (event.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      document.body.style.overflow = previousOverflow;
      window.removeEventListener("keydown", onKey);
    };
  }, [open, onClose]);

  const filtered = useMemo(() => {
    const needle = query.trim().toLowerCase();
    if (!needle) return submissions;
    return submissions.filter((submission) => {
      const meta = rowMeta[submission.id];
      const dateLabel = formatFormDate(submission.submitted_at);
      const haystack = [
        submission.template_title,
        submission.submitted_by_name,
        meta?.entityTag,
        meta?.projectName,
        meta?.relativeTime,
        dateLabel,
        submission.submitted_at?.slice(0, 10),
      ]
        .filter(Boolean)
        .join(" ")
        .toLowerCase();
      return haystack.includes(needle);
    });
  }, [query, rowMeta, submissions]);

  const dismissIfSwiped = (dx: number, dy: number) => {
    const start = startRef.current;
    if (!start || start.edge) return false;
    const swipedRight = dx > DISMISS_DISTANCE_PX && dx > Math.abs(dy);
    const swipedDown =
      start.y < HEADER_SWIPE_ZONE_PX && dy > DISMISS_DISTANCE_PX && dy > Math.abs(dx);
    return swipedRight || swipedDown;
  };

  const onTouchStart = (event: React.TouchEvent<HTMLDivElement>) => {
    const touch = event.touches[0];
    if (!touch) return;
    startRef.current = {
      x: touch.clientX,
      y: touch.clientY,
      edge: touch.clientX <= EDGE_SWIPE_IGNORE_PX,
    };
    setDragging(true);
  };

  const onTouchMove = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const touch = event.touches[0];
    if (!start || start.edge || !touch) return;
    const dx = Math.max(0, touch.clientX - start.x);
    const dy = Math.max(0, touch.clientY - start.y);
    const horizontal = dx > dy;
    if (horizontal || start.y < HEADER_SWIPE_ZONE_PX) {
      setOffset({ x: horizontal ? dx : 0, y: horizontal ? 0 : dy });
    }
  };

  const onTouchEnd = (event: React.TouchEvent<HTMLDivElement>) => {
    const start = startRef.current;
    const touch = event.changedTouches[0];
    setDragging(false);
    startRef.current = null;
    if (!start || start.edge || !touch) {
      setOffset({ x: 0, y: 0 });
      return;
    }
    const dx = touch.clientX - start.x;
    const dy = touch.clientY - start.y;
    if (dismissIfSwiped(dx, dy)) {
      onClose();
      return;
    }
    setOffset({ x: 0, y: 0 });
  };

  if (!open || typeof document === "undefined") return null;

  const translate = `translate3d(${offset.x}px, ${offset.y}px, 0)`;

  return createPortal(
    <div
      className="fixed inset-0 z-[70] flex items-end justify-center bg-black/50 p-0 sm:items-center sm:p-4 lg:p-6"
      onClick={onClose}
    >
      <div
        role="dialog"
        aria-modal="true"
        aria-labelledby="submitted-forms-title"
        className="flex h-full w-full max-w-2xl flex-col overflow-hidden rounded-t-2xl bg-white shadow-2xl sm:h-auto sm:max-h-[90vh] sm:rounded-2xl lg:max-h-[85vh] lg:max-w-3xl"
        style={{
          transform: translate,
          transition: dragging ? "none" : "transform 180ms ease-out",
        }}
        onClick={(event) => event.stopPropagation()}
        onTouchStart={onTouchStart}
        onTouchMove={onTouchMove}
        onTouchEnd={onTouchEnd}
        onTouchCancel={() => {
          startRef.current = null;
          setDragging(false);
          setOffset({ x: 0, y: 0 });
        }}
      >
        <div className="mobile-safe-area-top flex shrink-0 items-start justify-between gap-3 border-b border-slate-200 px-4 py-4">
          <div>
            <h2 id="submitted-forms-title" className="text-lg font-bold text-slate-900">
              Submitted Forms
            </h2>
            <p className="mt-0.5 text-sm text-slate-500">
              {submissions.length} form{submissions.length === 1 ? "" : "s"} filed
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className={modalCloseIconButtonClass}
            aria-label="Close submitted forms"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="shrink-0 border-b border-slate-100 px-4 py-3">
          <div className="relative">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={query}
              onChange={(event) => setQuery(event.target.value)}
              placeholder="Search by title, worker, or date…"
              className={cn(inputClass, "pl-9")}
              aria-label="Search submitted forms"
            />
          </div>
        </div>

        <div className="worker-mobile-content-pad min-h-0 flex-1 overflow-y-auto p-4 lg:pb-4">
          {loading ? (
            <div className="flex items-center gap-2 text-sm text-slate-500">
              <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
              Loading submitted forms…
            </div>
          ) : error ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              Submitted forms are unavailable right now.
            </p>
          ) : filtered.length === 0 ? (
            <p className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 text-sm text-slate-600">
              {query.trim()
                ? "No submissions match that search."
                : "No forms have been submitted yet."}
            </p>
          ) : (
            <ul className="space-y-3">
              {filtered.map((submission) => {
                const meta = rowMeta[submission.id];
                return (
                  <li key={submission.id}>
                    <button
                      type="button"
                      onClick={() => onSelect(submission)}
                      className="flex w-full items-start gap-3 rounded-xl border border-slate-200 bg-white p-3 text-left shadow-sm transition hover:border-orange-300 hover:bg-orange-50/40"
                    >
                      <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg border border-orange-200 bg-orange-50 text-orange-600">
                        <ClipboardList className="h-5 w-5" />
                      </div>
                      <div className="min-w-0 flex-1">
                        <p className="font-semibold text-slate-900">
                          {submission.template_title || "Untitled form"}
                        </p>
                        <p className="mt-0.5 text-xs text-slate-500">
                          {submission.submitted_by_name || "Unknown submitter"}
                          {showProjectName && meta?.projectName
                            ? ` · ${meta.projectName}`
                            : ""}
                        </p>
                        <p className="mt-1 text-xs text-slate-600">
                          {[meta?.entityTag, formatFormDate(submission.submitted_at)]
                            .filter(Boolean)
                            .join(" · ")}
                        </p>
                      </div>
                      <span className="shrink-0 rounded-lg border border-orange-200 bg-orange-50 px-2.5 py-1 text-xs font-semibold text-orange-700">
                        View
                      </span>
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        <WorkerMobileBackButton
          label="Back"
          onClick={onClose}
          alwaysVisible
          className="z-[80]"
        />
      </div>
    </div>,
    document.body
  );
}
