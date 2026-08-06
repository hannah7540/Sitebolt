"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import {
  getSwmsAssigneeName,
  getSwmsDocumentUrl,
  getSwmsSigningToken,
  signSwmsAssignment,
  type SwmsAssignment,
  type SwmsDocument,
} from "@/lib/swms";
import { uploadSiteFormSignature } from "@/lib/site-form-upload";
import { modalOverlayClass, modalClass, sectionClass } from "@/lib/ui-classes";

interface WorkerSwmsSignModalProps {
  assignment: SwmsAssignment & { swms?: SwmsDocument };
  onClose: () => void;
  onSigned: () => void;
}

export default function WorkerSwmsSignModal({
  assignment,
  onClose,
  onSigned,
}: WorkerSwmsSignModalProps) {
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSign = async () => {
    if (assignment.status === "Signed") {
      onClose();
      return;
    }
    if (!signatureDataUrl) {
      setError("Please sign before submitting.");
      return;
    }

    setSaving(true);
    setError(null);

    const signingToken = getSwmsSigningToken(assignment);
    if (!signingToken) {
      setError("Signing token is missing for this assignment.");
      setSaving(false);
      return;
    }

    try {
      const signatureUrl = await uploadSiteFormSignature(
        signatureDataUrl,
        `swms/signatures/${signingToken}.png`
      );
      if (!signatureUrl) {
        setError("Signature upload failed.");
        setSaving(false);
        return;
      }

      const { error: signError } = await signSwmsAssignment({
        token: signingToken,
        signatureUrl,
      });

      if (signError) {
        setError(signError);
        setSaving(false);
        return;
      }

      onSigned();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to sign SWMS.");
      setSaving(false);
    }
  };

  const swms = assignment.swms;
  const swmsDocumentUrl = getSwmsDocumentUrl(swms);
  const assigneeName = getSwmsAssigneeName(assignment);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-3xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">
              {swms?.title ?? "SWMS Document"}
            </h2>
            <p className="text-sm text-slate-500">
              Assigned to {assigneeName} · {assignment.status}
            </p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        {swmsDocumentUrl ? (
          <div className={sectionClass}>
            <iframe
              title={swms?.title ?? "SWMS document"}
              src={swmsDocumentUrl}
              className="h-[420px] w-full rounded-lg border border-slate-200 bg-white"
            />
            <a
              href={swmsDocumentUrl}
              target="_blank"
              rel="noreferrer"
              className="mt-2 inline-block text-sm font-medium text-orange-600 hover:underline"
            >
              Open PDF in new tab
            </a>
          </div>
        ) : null}

        {assignment.status === "Signed" && assignment.signature_url ? (
          <div className={sectionClass}>
            <p className="mb-2 text-sm font-semibold text-slate-900">Signed</p>
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={assignment.signature_url}
              alt="SWMS signature"
              className="max-h-32 w-full rounded-lg border border-slate-200 bg-white object-contain p-2"
            />
          </div>
        ) : (
          <div className={sectionClass}>
            <p className="mb-2 text-sm font-semibold text-slate-900">
              Digital signature *
            </p>
            <SignatureCanvas onChange={setSignatureDataUrl} />
          </div>
        )}

        {error && (
          <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <div className="mt-4 flex gap-2">
          <button
            type="button"
            onClick={onClose}
            className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Close
          </button>
          {assignment.status === "Pending" ? (
            <button
              type="button"
              disabled={saving}
              onClick={handleSign}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving && <Loader2 className="h-4 w-4 animate-spin" />}
              Mark as Signed
            </button>
          ) : null}
        </div>
      </div>
    </div>
  );
}
