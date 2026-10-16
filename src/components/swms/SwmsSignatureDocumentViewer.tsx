"use client";

import { useEffect, useState } from "react";
import { Loader2 } from "lucide-react";
import { getExternalSwmsDocumentUrl } from "@/app/actions/swms-external";
import MobileFriendlyPdfViewer from "@/components/ui/MobileFriendlyPdfViewer";
import { isExternalSwms } from "@/lib/swms-external";

interface SwmsSignatureDocumentViewerProps {
  title: string;
  documentUrl?: string | null;
  isExternal?: boolean | null;
  storagePath?: string | null;
  className?: string;
}

export default function SwmsSignatureDocumentViewer({
  title,
  documentUrl,
  isExternal,
  storagePath,
  className,
}: SwmsSignatureDocumentViewerProps) {
  const external = isExternalSwms({ is_external: isExternal }) || Boolean(storagePath);
  const [url, setUrl] = useState(documentUrl ?? "");
  const [loading, setLoading] = useState(false);

  useEffect(() => {
    let cancelled = false;

    async function resolveUrl() {
      if (documentUrl) {
        setUrl(documentUrl);
        return;
      }
      if (external && storagePath) {
        setLoading(true);
        const result = await getExternalSwmsDocumentUrl(storagePath);
        if (!cancelled) {
          setUrl(result.url || "");
          setLoading(false);
        }
        return;
      }
      if (!cancelled) setUrl("");
    }

    void resolveUrl();
    return () => {
      cancelled = true;
    };
  }, [documentUrl, external, storagePath]);

  if (loading) {
    return (
      <p className="flex min-h-[50vh] w-full items-center justify-center gap-2 rounded-xl border border-slate-200 bg-white text-sm text-slate-500">
        <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
        Loading document…
      </p>
    );
  }

  if (!url) return null;

  if (external) {
    return (
      <div
        className={
          className ??
          "flex min-h-[50vh] w-full flex-1 overflow-hidden rounded-xl border border-slate-200 bg-white"
        }
      >
        <iframe
          src={url}
          title={title}
          className="h-full min-h-[50vh] w-full"
        />
      </div>
    );
  }

  return (
    <div className={className ?? "overflow-hidden rounded-xl border border-slate-200"}>
      <MobileFriendlyPdfViewer documentUrl={url} title={title} />
    </div>
  );
}
