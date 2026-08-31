"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, FileDown } from "lucide-react";
import { isNativeMobileApp } from "@/lib/native-app";
import { cn } from "@/lib/utils";

function isLikelyPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return true;
  try {
    const pathname = new URL(url).pathname.toLowerCase();
    return pathname.endsWith(".pdf");
  } catch {
    return false;
  }
}

/** Mobile browsers, in-app browsers, and Capacitor webviews — where PDF iframes often blank out. */
export function isMobilePdfHost(): boolean {
  if (typeof window === "undefined" || typeof navigator === "undefined") {
    return false;
  }
  if (isNativeMobileApp()) return true;

  const ua = navigator.userAgent || "";
  if (
    /Android|webOS|iPhone|iPad|iPod|BlackBerry|IEMobile|Opera Mini|Mobile|CriOS|FxiOS|EdgiOS|GSA|; wv\)/i.test(
      ua
    )
  ) {
    return true;
  }

  // iPadOS often reports as Macintosh with touch.
  if (navigator.maxTouchPoints > 1 && /Macintosh/i.test(ua)) {
    return true;
  }

  return false;
}

export function buildEmbeddedDocumentViewerUrl(documentUrl: string): string {
  if (!isLikelyPdfUrl(documentUrl)) return documentUrl;
  if (!isMobilePdfHost()) return documentUrl;
  return `https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`;
}

interface MobileFriendlyPdfViewerProps {
  documentUrl: string;
  title?: string;
  className?: string;
}

export default function MobileFriendlyPdfViewer({
  documentUrl,
  title = "Document Preview",
  className,
}: MobileFriendlyPdfViewerProps) {
  const [viewerUrl, setViewerUrl] = useState(documentUrl);
  const [usingFallbackViewer, setUsingFallbackViewer] = useState(false);

  useEffect(() => {
    const next = buildEmbeddedDocumentViewerUrl(documentUrl);
    setViewerUrl(next);
    setUsingFallbackViewer(next !== documentUrl);
  }, [documentUrl]);

  const isPdf = useMemo(() => isLikelyPdfUrl(documentUrl), [documentUrl]);

  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <p className="mr-auto text-xs text-slate-600">
          {usingFallbackViewer
            ? "Mobile viewer active. If the preview is blank, open the document below."
            : isPdf
              ? "Document preview"
              : "Preview"}
        </p>
        <a
          href={documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open in New Tab
        </a>
        <a
          href={documentUrl}
          target="_blank"
          rel="noopener noreferrer"
          download={isPdf ? "document.pdf" : undefined}
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <FileDown className="h-3.5 w-3.5" />
          Download
        </a>
      </div>

      <iframe
        src={viewerUrl}
        title={title}
        className="h-[55vh] w-full rounded-md border border-slate-200 bg-white sm:h-[65vh]"
        style={{ width: "100%", minHeight: "380px" }}
        // Google Docs Viewer needs a less restricted frame; direct PDFs stay sandboxed.
        {...(usingFallbackViewer
          ? {}
          : {
              sandbox:
                "allow-scripts allow-same-origin allow-popups allow-forms allow-downloads",
            })}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    </div>
  );
}
