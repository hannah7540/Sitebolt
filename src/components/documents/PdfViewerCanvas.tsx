"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { ChevronLeft, ChevronRight, Loader2 } from "lucide-react";
import { Document, Page, pdfjs } from "react-pdf";
import "react-pdf/dist/Page/AnnotationLayer.css";
import "react-pdf/dist/Page/TextLayer.css";

pdfjs.GlobalWorkerOptions.workerSrc = "/pdf.worker.min.mjs";

function isLikelyPdfUrl(url: string): boolean {
  const lower = url.toLowerCase();
  if (lower.includes(".pdf")) return true;
  try {
    return new URL(url).pathname.toLowerCase().endsWith(".pdf");
  } catch {
    return false;
  }
}

function buildGoogleViewerUrl(documentUrl: string): string {
  return `https://docs.google.com/viewer?url=${encodeURIComponent(documentUrl)}&embedded=true`;
}

function buildSameOriginPdfUrl(documentUrl: string): string {
  if (documentUrl.startsWith("/")) return documentUrl;
  return `/api/documents/pdf?url=${encodeURIComponent(documentUrl)}`;
}

type PdfViewerCanvasProps = {
  fileUrl: string;
  title?: string;
};

export default function PdfViewerCanvas({
  fileUrl,
  title = "PDF document",
}: PdfViewerCanvasProps) {
  const containerRef = useRef<HTMLDivElement>(null);
  const pageRefs = useRef<Array<HTMLDivElement | null>>([]);
  const [numPages, setNumPages] = useState(0);
  const [pageNumber, setPageNumber] = useState(1);
  const [width, setWidth] = useState(640);
  const [failed, setFailed] = useState(false);
  const [loading, setLoading] = useState(true);
  const isPdf = isLikelyPdfUrl(fileUrl);
  const sourceUrl = isPdf ? buildSameOriginPdfUrl(fileUrl) : fileUrl;

  useEffect(() => {
    const el = containerRef.current;
    if (!el) return;
    const update = () => setWidth(Math.max(280, el.clientWidth - 8));
    update();
    const observer = new ResizeObserver(update);
    observer.observe(el);
    return () => observer.disconnect();
  }, []);

  useEffect(() => {
    setNumPages(0);
    setPageNumber(1);
    setFailed(false);
    setLoading(true);
  }, [fileUrl]);

  const onLoadSuccess = useCallback(({ numPages: next }: { numPages: number }) => {
    setNumPages(next);
    setPageNumber(1);
    setLoading(false);
    setFailed(false);
  }, []);

  const goToPage = useCallback(
    (next: number) => {
      if (!numPages) return;
      const clamped = Math.min(numPages, Math.max(1, next));
      setPageNumber(clamped);
      pageRefs.current[clamped - 1]?.scrollIntoView({
        behavior: "smooth",
        block: "start",
      });
    },
    [numPages]
  );

  if (failed || !isPdf) {
    return (
      <iframe
        src={isPdf ? buildGoogleViewerUrl(fileUrl) : fileUrl}
        title={title}
        className="h-[70vh] w-full rounded-md border border-slate-200 bg-white"
        style={{ width: "100%", minHeight: "480px" }}
        loading="lazy"
        referrerPolicy="no-referrer-when-downgrade"
      />
    );
  }

  return (
    <div className="space-y-2">
      {numPages > 1 ? (
        <div className="flex items-center justify-center gap-3">
          <button
            type="button"
            onClick={() => goToPage(pageNumber - 1)}
            disabled={pageNumber <= 1}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            <ChevronLeft className="h-3.5 w-3.5" />
            Previous
          </button>
          <p className="text-xs font-medium text-slate-600">
            Page {pageNumber} of {numPages}
          </p>
          <button
            type="button"
            onClick={() => goToPage(pageNumber + 1)}
            disabled={pageNumber >= numPages}
            className="inline-flex min-h-9 items-center gap-1 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50 disabled:opacity-50"
          >
            Next
            <ChevronRight className="h-3.5 w-3.5" />
          </button>
        </div>
      ) : null}

      <div
        ref={containerRef}
        className="max-h-[75vh] overflow-y-auto rounded-md border border-slate-200 bg-slate-100 p-2"
      >
        {loading ? (
          <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
            <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
            Loading document…
          </p>
        ) : null}
        <Document
          file={sourceUrl}
          onLoadSuccess={onLoadSuccess}
          onLoadError={() => {
            setFailed(true);
            setLoading(false);
          }}
          loading=""
        >
          {Array.from(new Array(numPages), (_, index) => (
            <div
              key={`page_${index + 1}`}
              ref={(node) => {
                pageRefs.current[index] = node;
              }}
              className="mb-3 flex justify-center last:mb-0"
            >
              <Page
                pageNumber={index + 1}
                width={width}
                renderAnnotationLayer={false}
                renderTextLayer={false}
              />
            </div>
          ))}
        </Document>
      </div>
    </div>
  );
}
