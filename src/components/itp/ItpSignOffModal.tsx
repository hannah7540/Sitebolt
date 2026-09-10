"use client";

import { useState } from "react";
import { useRouter } from "next/navigation";
import { Loader2, X } from "lucide-react";
import SignatureCanvas from "@/components/prestart/SignatureCanvas";
import { uploadItpSignature } from "@/lib/itp-upload";
import { signOffItpItem } from "@/lib/itp-service";
import { ITP_ITC_COMPLETED_TOAST } from "@/lib/itp-itc-payload";
import Toast from "@/components/ui/Toast";
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
  const router = useRouter();
  const [inspectorName, setInspectorName] = useState(defaultInspectorName);
  const [signature, setSignature] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [toast, setToast] = useState<{ message: string; variant: "success" | "error" } | null>(
    null
  );

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
    try {
      const upload = await uploadItpSignature(signature, itpId, itemId);
      if (!upload.url) {
        setError(upload.error ?? "Signature upload failed");
        setToast({ message: upload.error ?? "Signature upload failed", variant: "error" });
        return;
      }

      const { error: signError } = await signOffItpItem({
        itemId,
        inspectorName,
        signatureUrl: upload.url,
      });
      if (signError) {
        setError(signError);
        setToast({ message: signError, variant: "error" });
        return;
      }
      setToast({ message: ITP_ITC_COMPLETED_TOAST, variant: "success" });
      router.refresh();
      onSigned();
      window.setTimeout(() => onClose(), 900);
    } catch (cause) {
      const message =
        cause instanceof Error ? cause.message : "Network error while saving. Please try again.";
      setError(message);
      setToast({ message, variant: "error" });
    } finally {
      setSaving(false);
    }
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
        {toast ? (
          <Toast
            message={toast.message}
            variant={toast.variant}
            onDismiss={() => setToast(null)}
          />
        ) : null}
      </div>
    </div>
  );
}
