"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import { completeRfi, type RfiRecord } from "@/lib/rfi-service";
import { StableSignaturePad } from "@/components/workers/StableSignaturePad";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface WorkerActionRFIModalProps {
  rfi: RfiRecord;
  onClose: () => void;
  onCompleted: () => void;
}

export default function WorkerActionRFIModal({
  rfi,
  onClose,
  onCompleted,
}: WorkerActionRFIModalProps) {
  const [actionResponse, setActionResponse] = useState("");
  const [signature, setSignature] = useState("");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);

    if (!actionResponse.trim()) {
      setError("Please enter your response.");
      return;
    }
    if (!signature.trim()) {
      setError("Please sign your response.");
      return;
    }

    setSaving(true);
    try {
      const result = await completeRfi({
        rfiId: rfi.id,
        actionResponse,
        signatureDataUrl: signature,
      });

      if (result.error || !result.rfi) {
        setError(result.error ?? "Failed to complete RFI.");
        return;
      }

      onCompleted();
      onClose();
    } catch (cause) {
      setError(cause instanceof Error ? cause.message : "Failed to complete RFI.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={cn(modalOverlayClass, "z-[60]")} onClick={onClose}>
      <div
        className={cn(modalClass, "max-w-lg")}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <p className="text-xs font-semibold uppercase tracking-wide text-orange-600">
              {rfi.rfi_number}
            </p>
            <h2 className="text-lg font-bold text-slate-900">Action RFI</h2>
            <p className="text-sm text-slate-500">{rfi.title}</p>
          </div>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <div className="mb-4 rounded-xl border border-slate-200 bg-slate-50 p-3">
          <p className={labelClass}>Original request</p>
          <p className="mt-1 whitespace-pre-wrap text-sm text-slate-800">{rfi.description}</p>
          <p className="mt-2 text-xs text-slate-500">
            Requested by {rfi.requested_by_name}
            {rfi.project_name ? ` · ${rfi.project_name}` : ""}
          </p>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Your response / information</span>
            <textarea
              className={cn(inputClass, "min-h-[120px] resize-y")}
              value={actionResponse}
              onChange={(event) => setActionResponse(event.target.value)}
              placeholder="Provide the requested information…"
              disabled={saving}
            />
          </label>

          <div>
            <p className={labelClass}>Your signature</p>
            <div className="mt-1">
              <StableSignaturePad onChange={setSignature} />
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex gap-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="flex-1 rounded-lg border border-slate-200 py-2.5 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="flex flex-1 items-center justify-center gap-2 rounded-lg bg-orange-600 py-2.5 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Submit Response
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
