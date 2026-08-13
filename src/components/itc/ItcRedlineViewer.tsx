"use client";

import { ExternalLink, Loader2, MapPin } from "lucide-react";
import { cardClass } from "@/lib/ui-classes";

interface ItcRedlineViewerProps {
  markupUrl: string | null | undefined;
  title?: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  onCaptureGps?: () => void;
  gpsLoading?: boolean;
  gpsMessage?: string | null;
}

function isPdfUrl(url: string): boolean {
  return /\.pdf($|\?)/i.test(url);
}

export default function ItcRedlineViewer({
  markupUrl,
  title = "Redline Drawing",
  gpsLat,
  gpsLng,
  onCaptureGps,
  gpsLoading = false,
  gpsMessage,
}: ItcRedlineViewerProps) {
  const hasGps = gpsLat != null && gpsLng != null;

  return (
    <div className={cardClass}>
      <div className="flex flex-wrap items-start justify-between gap-3 border-b border-slate-200 px-4 py-3">
        <div>
          <h3 className="font-semibold text-slate-900">{title}</h3>
          <p className="text-xs text-slate-500">Approved redline markup for this inspection run.</p>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
            <span className="inline-flex items-center gap-1 rounded-full bg-slate-100 px-2.5 py-1 font-medium text-slate-700">
              <MapPin className="h-3.5 w-3.5 text-orange-600" />
              {hasGps
                ? `GPS ${gpsLat.toFixed(5)}, ${gpsLng.toFixed(5)}`
                : "GPS not tagged yet"}
            </span>
            {onCaptureGps ? (
              <button
                type="button"
                disabled={gpsLoading}
                onClick={onCaptureGps}
                className="inline-flex items-center gap-1 rounded-lg border border-slate-300 px-2.5 py-1 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
              >
                {gpsLoading ? (
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                ) : (
                  <MapPin className="h-3.5 w-3.5" />
                )}
                {hasGps ? "Update GPS" : "Capture GPS"}
              </button>
            ) : null}
          </div>
          {gpsMessage ? <p className="mt-1 text-xs text-slate-600">{gpsMessage}</p> : null}
        </div>
        {markupUrl?.trim() ? (
          <a
            href={markupUrl.trim()}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex items-center gap-1 text-sm font-semibold text-orange-600 hover:text-orange-700"
          >
            Open full size
            <ExternalLink className="h-4 w-4" />
          </a>
        ) : null}
      </div>

      {!markupUrl?.trim() ? (
        <div className="p-4 text-sm text-slate-500">
          No redline markup uploaded for this ITC yet. Upload markup from{" "}
          <strong>Add ITC</strong> or the Master Spec workbook to display it here.
        </div>
      ) : (
        <div className="max-h-[480px] overflow-auto bg-slate-50 p-3">
          {isPdfUrl(markupUrl) ? (
            <iframe
              src={markupUrl}
              title={title}
              className="h-[420px] w-full rounded-lg border border-slate-200 bg-white"
            />
          ) : (
            // eslint-disable-next-line @next/next/no-img-element
            <img
              src={markupUrl}
              alt={title}
              className="mx-auto max-h-[420px] w-full rounded-lg border border-slate-200 object-contain"
            />
          )}
        </div>
      )}
    </div>
  );
}
