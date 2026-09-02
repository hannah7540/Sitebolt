"use client";

import dynamic from "next/dynamic";
import { ExternalLink, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

const PdfViewerCanvas = dynamic(() => import("./PdfViewerCanvas"), {
  ssr: false,
  loading: () => (
    <p className="flex items-center justify-center gap-2 py-16 text-sm text-slate-500">
      <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
      Loading document viewer…
    </p>
  ),
});

type PdfViewerProps = {
  fileUrl: string;
  title?: string;
  className?: string;
};

export default function PdfViewer({
  fileUrl,
  title = "Document Preview",
  className,
}: PdfViewerProps) {
  return (
    <div className={cn("space-y-2", className)}>
      <div className="flex flex-wrap items-center gap-2 rounded-lg border border-slate-200 bg-slate-50 px-2.5 py-2">
        <p className="mr-auto text-xs text-slate-600">Document preview</p>
        <a
          href={fileUrl}
          target="_blank"
          rel="noopener noreferrer"
          className="inline-flex min-h-9 items-center gap-1.5 rounded-md border border-slate-200 bg-white px-2.5 py-1.5 text-xs font-semibold text-slate-700 hover:bg-slate-50"
        >
          <ExternalLink className="h-3.5 w-3.5" />
          Open PDF in New Tab
        </a>
      </div>
      <PdfViewerCanvas fileUrl={fileUrl} title={title} />
    </div>
  );
}
