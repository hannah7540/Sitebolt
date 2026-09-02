"use client";

import PdfViewer from "@/components/documents/PdfViewer";

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
  return <PdfViewer fileUrl={documentUrl} title={title} className={className} />;
}
