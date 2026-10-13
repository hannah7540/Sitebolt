"use client";

import { useEffect } from "react";
import { X } from "lucide-react";
import { modalClass, modalOverlayClass, labelClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface SwmsAssignmentResultModalProps {
  workerName: string;
  documentTitle: string;
  signedAt: string | null;
  signatureUrl: string | null;
  documentUrl: string | null;
  acknowledgedRisks?: boolean | null;
  onClose: () => void;
}

function formatDateTime(value: string | null): string {
  if (!value) return "Not signed";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return value;
  return date.toLocaleString();
}

export default function SwmsAssignmentResultModal({
  workerName,
  documentTitle,
  signedAt,
  signatureUrl,
  documentUrl,
  acknowledgedRisks,
  onClose,
}: SwmsAssignmentResultModalProps) {
  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-2xl")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Submitted SWMS</h2>
            <p className="text-sm text-slate-500">
              {workerName} · {documentTitle}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <dl className="space-y-3">
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className={labelClass}>Signed at</dt>
            <dd className="mt-1 text-sm text-slate-800">{formatDateTime(signedAt)}</dd>
          </div>
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className={labelClass}>Risks acknowledged</dt>
            <dd className="mt-1 text-sm text-slate-800">
              {acknowledgedRisks ? "Yes" : "Not recorded"}
            </dd>
          </div>
          {documentUrl ? (
            <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
              <dt className={labelClass}>Document</dt>
              <dd className="mt-1">
                <a
                  href={documentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="text-sm font-medium text-orange-600 hover:underline"
                >
                  Open SWMS PDF
                </a>
              </dd>
            </div>
          ) : null}
          <div className="rounded-xl border border-slate-200 bg-slate-50 px-4 py-3">
            <dt className={labelClass}>Signature</dt>
            <dd className="mt-2">
              {signatureUrl ? (
                // eslint-disable-next-line @next/next/no-img-element
                <img
                  src={signatureUrl}
                  alt="SWMS signature"
                  className="max-h-40 rounded-md border border-slate-200 bg-white"
                />
              ) : (
                <p className="text-sm text-slate-500">No signature image stored.</p>
              )}
            </dd>
          </div>
        </dl>
      </div>
    </div>
  );
}
