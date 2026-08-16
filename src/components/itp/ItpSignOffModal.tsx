"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import { uploadItpSignature } from "@/lib/itp-upload";
import { signOffItpItem } from "@/lib/itp-service";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface ItpSignOffModalProps {
  itpId: string;
  itemId: string;
  itemDescription: string;
  defaultInspectorName?: string;
  onClose: () => void;
  onSigned: () => void;
}

export default function ItpSignOffModal({
  itpId,
  itemId,
  itemDescription,
  defaultInspectorName = "",
  onClose,
  onSigned,
}: ItpSignOffModalProps) {
  const [inspectorName, setInspectorName] = useState(defaultInspectorName);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!inspectorName.trim()) {
      setError("Inspector / engineer name is required");
      return;
    }
    if (!signature) {
      setError("Please capture a signature");
      return;
    }

    setSaving(true);
    setError(null);
    const upload = await uploadItpSignature(signature, itpId, itemId);
    if (!upload.url) {
      setSaving(false);
      setError(upload.error ?? "Signature upload failed");
      return;
    }

    const { error: signError } = await signOffItpItem({
      itemId,
      inspectorName,
      signatureUrl: upload.url,
    });
    setSaving(false);
    if (signError) {
      setError(signError);
      return;
    }
    onSigned();
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="relative w-full max-w-lg rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900">Digital Sign-Off</h2>
        <p className="mt-1 text-sm text-slate-500">{itemDescription}</p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-4 space-y-4">
          <div>
            <label className={labelClass}>Inspector / Engineer Name *</label>
            <input
              value={inspectorName}
              onChange={(e) => setInspectorName(e.target.value)}
              className={inputClass}
              required
            />
          </div>

          <div>
            <label className={labelClass}>Signature *</label>
            <SignatureCanvas onChange={setSignature} />
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              Sign Off
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
