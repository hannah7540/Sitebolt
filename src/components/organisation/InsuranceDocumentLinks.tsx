"use client";

import { Download, ExternalLink } from "lucide-react";
import type { InsuranceDocumentAttachment } from "@/lib/insurance-utils";
import { cn } from "@/lib/utils";

interface InsuranceDocumentLinksProps {
  documents: InsuranceDocumentAttachment[];
  className?: string;
  compact?: boolean;
}

export default function InsuranceDocumentLinks({
  documents,
  className,
  compact = false,
}: InsuranceDocumentLinksProps) {
  if (documents.length === 0) {
    return <span className="text-slate-400">—</span>;
  }

  return (
    <div className={cn("flex flex-wrap gap-1.5", className)}>
      {documents.map((doc) => (
        <div
          key={`${doc.url}-${doc.name}`}
          className={cn(
            "inline-flex max-w-full items-center gap-1 rounded-full border border-slate-200 bg-slate-50",
            compact ? "px-2 py-0.5 text-[11px]" : "px-2.5 py-1 text-xs"
          )}
        >
          <span className="truncate font-medium text-slate-700" title={doc.name}>
            {doc.name}
          </span>
          <a
            href={doc.url}
            target="_blank"
            rel="noopener noreferrer"
            className="inline-flex shrink-0 items-center text-orange-600 hover:text-orange-700"
            aria-label={`Preview ${doc.name}`}
            title="Preview"
          >
            <ExternalLink className="h-3 w-3" />
          </a>
          <a
            href={doc.url}
            download={doc.name}
            className="inline-flex shrink-0 items-center text-slate-500 hover:text-slate-700"
            aria-label={`Download ${doc.name}`}
            title="Download"
          >
            <Download className="h-3 w-3" />
          </a>
        </div>
      ))}
    </div>
  );
}
