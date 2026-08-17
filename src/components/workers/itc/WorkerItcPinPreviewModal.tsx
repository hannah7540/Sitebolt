"use client";

import { useState } from "react";
import { ArrowLeft, ArrowRight, X, ZoomIn } from "lucide-react";
import {
  getWorkerItcStatusLabel,
  type WorkerItcRegisterRow,
} from "@/lib/worker-itc-service";
import { cn } from "@/lib/utils";

interface WorkerItcPinPreviewModalProps {
  itc: WorkerItcRegisterRow;
  sequence: number;
  canGoPrevious: boolean;
  canGoNext: boolean;
  onPrevious: () => void;
  onNext: () => void;
  onClose: () => void;
  onAddToItc: () => void;
}

function statusBadgeClass(status: string): string {
  if (status === "complete" || status === "completed") {
    return "bg-emerald-100 text-emerald-800";
  }
  if (status === "in_progress" || status === "ongoing") {
    return "bg-amber-100 text-amber-800";
  }
  if (status === "issue") return "bg-red-100 text-red-800";
  return "bg-slate-100 text-slate-700";
}

export default function WorkerItcPinPreviewModal({
  itc,
  sequence,
  canGoPrevious,
  canGoNext,
  onPrevious,
  onNext,
  onClose,
  onAddToItc,
}: WorkerItcPinPreviewModalProps) {
  const [lightboxUrl, setLightboxUrl] = useState<string | null>(null);

  return (
    <>
      <div className="fixed inset-0 z-50 flex items-end justify-center bg-slate-900/40 p-4 sm:items-center">
        <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white shadow-xl">
          <div className="flex items-center justify-between border-b border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              aria-label="Previous ITC"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <div className="text-center">
              <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
                ITC #{sequence}
              </p>
              <p className="text-sm font-bold text-slate-900">{itc.itc_number}</p>
            </div>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="rounded-lg p-2 text-slate-600 hover:bg-slate-100 disabled:opacity-40"
              aria-label="Next ITC"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="absolute right-3 top-3 rounded p-1 text-slate-400 hover:text-slate-600"
            aria-label="Close preview"
          >
            <X className="h-5 w-5" />
          </button>

          <div className="space-y-4 p-4 pt-8">
            <div className="flex flex-wrap items-center gap-2">
              <span
                className={cn(
                  "rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                  statusBadgeClass(itc.status)
                )}
              >
                {getWorkerItcStatusLabel(itc.status)}
              </span>
              {itc.service_discipline ? (
                <span className="rounded bg-slate-100 px-2 py-0.5 text-[10px] font-semibold text-slate-700">
                  {itc.service_discipline}
                </span>
              ) : null}
            </div>

            <div>
              <h2 className="text-lg font-bold text-slate-900">{itc.title ?? itc.itc_number}</h2>
              {itc.description ? (
                <p className="mt-1 text-sm text-slate-600">{itc.description}</p>
              ) : null}
            </div>

            {itc.redline_markup_url ? (
              <button
                type="button"
                onClick={() => setLightboxUrl(itc.redline_markup_url)}
                className="group relative block w-full overflow-hidden rounded-lg border border-slate-200"
              >
                {/* eslint-disable-next-line @next/next/no-img-element */}
                <img
                  src={itc.redline_markup_url}
                  alt="Redline drawing"
                  className="max-h-48 w-full object-contain bg-slate-50"
                />
                <span className="absolute bottom-2 right-2 inline-flex items-center gap-1 rounded bg-black/60 px-2 py-1 text-xs text-white opacity-0 transition group-hover:opacity-100">
                  <ZoomIn className="h-3 w-3" />
                  View full size
                </span>
              </button>
            ) : (
              <p className="rounded-lg border border-dashed border-slate-200 bg-slate-50 px-3 py-4 text-center text-xs text-slate-500">
                No redline drawing attached for this ITC.
              </p>
            )}
          </div>

          <div className="flex items-center justify-between border-t border-slate-200 px-4 py-3">
            <button
              type="button"
              onClick={onPrevious}
              disabled={!canGoPrevious}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 sm:hidden"
              aria-label="Previous ITC"
            >
              <ArrowLeft className="h-4 w-4" />
            </button>
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Close
            </button>
            <button
              type="button"
              onClick={onAddToItc}
              className="rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500"
            >
              Add to ITC
            </button>
            <button
              type="button"
              onClick={onNext}
              disabled={!canGoNext}
              className="rounded-lg p-2 text-slate-500 hover:bg-slate-100 disabled:opacity-40 sm:hidden"
              aria-label="Next ITC"
            >
              <ArrowRight className="h-4 w-4" />
            </button>
          </div>
        </div>
      </div>

      {lightboxUrl ? (
        <div
          className="fixed inset-0 z-[60] flex items-center justify-center bg-black/80 p-4"
          onClick={() => setLightboxUrl(null)}
          onKeyDown={() => undefined}
          role="presentation"
        >
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img
            src={lightboxUrl}
            alt="Redline full size"
            className="max-h-[90vh] max-w-full object-contain"
          />
        </div>
      ) : null}
    </>
  );
}
