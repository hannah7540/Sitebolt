"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import { bulkSignOffItcStep } from "@/lib/itc-service";
import { DEFAULT_ITC_FORM_STEPS } from "@/lib/itc-templates";
import { uploadItcSignature } from "@/lib/itc-upload";
import { inputClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface ItcBulkSignOffModalProps {
  projectId: string;
  itcIds: string[];
  authorId: string;
  authorName: string;
  onClose: () => void;
  onSigned: () => void;
}

export default function ItcBulkSignOffModal({
  projectId,
  itcIds,
  authorId,
  authorName,
  onClose,
  onSigned,
}: ItcBulkSignOffModalProps) {
  const [stepIndex, setStepIndex] = useState(1);
  const [comments, setComments] = useState("");
  const [signatureDataUrl, setSignatureDataUrl] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [message, setMessage] = useState<string | null>(null);

  const selectedStep = DEFAULT_ITC_FORM_STEPS.find((step) => step.step_index === stepIndex);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!selectedStep) return;
    if (!signatureDataUrl) {
      setMessage("Signature is required for bulk sign-off.");
      return;
    }

    setLoading(true);
    setMessage(null);

    const blob = await fetch(signatureDataUrl).then((response) => response.blob());
    const upload = await uploadItcSignature({
      projectId,
      itcId: itcIds[0] ?? "bulk",
      stepKey: selectedStep.step_key,
      blob,
    });

    if (upload.error || !upload.url) {
      setLoading(false);
      setMessage(upload.error ?? "Signature upload failed.");
      return;
    }

    const result = await bulkSignOffItcStep({
      itcIds,
      stepKey: selectedStep.step_key,
      stepIndex: selectedStep.step_index,
      authorId,
      authorName,
      comments,
      signatureUrl: upload.url,
    });

    setLoading(false);
    if (result.error) {
      setMessage(result.error);
      return;
    }

    setMessage(`Signed step across ${result.signed} ITC(s).`);
    onSigned();
    onClose();
  };

  return (
    <div className={modalOverlayClass}>
      <div className={modalClass}>
        <div className="mb-4 flex items-start justify-between gap-4">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Bulk Sign-Off</h2>
            <p className="text-sm text-slate-500">
              Apply one trench step signature across {itcIds.length} selected ITC(s).
            </p>
          </div>
          <button type="button" onClick={onClose} className="text-slate-400 hover:text-slate-600">
            <X className="h-5 w-5" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Step</span>
            <select
              value={stepIndex}
              onChange={(e) => setStepIndex(Number(e.target.value))}
              className={inputClass}
            >
              {DEFAULT_ITC_FORM_STEPS.map((step) => (
                <option key={step.step_key} value={step.step_index}>
                  {step.step_index + 1}. {step.title}
                </option>
              ))}
            </select>
          </label>

          <label className="block">
            <span className="mb-1 block text-xs font-semibold uppercase text-slate-500">Comments</span>
            <textarea
              value={comments}
              onChange={(e) => setComments(e.target.value)}
              rows={3}
              className={inputClass}
              placeholder="Shared trench comments for all selected ITCs"
            />
          </label>

          <div>
            <p className="mb-2 text-xs font-semibold uppercase text-slate-500">Signature</p>
            <SignatureCanvas onChange={setSignatureDataUrl} />
          </div>

          {message ? (
            <p className="rounded-lg bg-slate-50 px-3 py-2 text-sm text-slate-700">{message}</p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={loading}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-50"
            >
              {loading ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign Selected ITCs
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
