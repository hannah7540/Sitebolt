"use client";

import { useEffect, useState } from "react";
import { ChevronRight, FileText, FolderOpen, Loader2 } from "lucide-react";
import WorkerUsefulDocumentsPortal from "@/components/workers/WorkerUsefulDocumentsPortal";
import {
  fetchOrganizationDocuments,
  type OrganizationDocument,
} from "@/lib/organization-documents";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

export default function WorkerUsefulDocumentsWidget() {
  const [documents, setDocuments] = useState<OrganizationDocument[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [open, setOpen] = useState(false);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoading(true);
      const { data, error: loadError } = await fetchOrganizationDocuments();
      if (cancelled) return;
      if (loadError) {
        setError(loadError);
        setDocuments([]);
      } else {
        setError(null);
        setDocuments(data);
      }
      setLoading(false);
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const count = documents.length;
  const subtitle = loading
    ? "Safety guides, policies, SWMS"
    : error
      ? "Documents unavailable"
      : count > 0
        ? `${count} document${count === 1 ? "" : "s"} available`
        : "Safety guides, policies, SWMS";

  return (
    <>
      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          cardClass,
          "flex w-full min-h-11 items-center gap-3 p-4 text-left transition",
          "hover:border-orange-300 hover:bg-orange-50/40 active:scale-[0.99]"
        )}
        aria-label="Open useful documents"
      >
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          {loading ? (
            <Loader2 className="h-6 w-6 animate-spin" />
          ) : (
            <FolderOpen className="h-6 w-6" />
          )}
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Useful Documents</p>
          <p className="mt-0.5 text-xs text-slate-500">{subtitle}</p>
          <p className="mt-1 inline-flex items-center gap-1 text-xs font-semibold text-orange-600">
            <FileText className="h-3 w-3" />
            Tap to open
          </p>
        </div>
        <ChevronRight className="h-5 w-5 shrink-0 text-slate-400" aria-hidden />
      </button>

      <WorkerUsefulDocumentsPortal
        open={open}
        documents={documents}
        loading={loading}
        error={error}
        onClose={() => setOpen(false)}
      />
    </>
  );
}
