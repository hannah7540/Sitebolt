"use client";

import { useState } from "react";
import { X, Loader2 } from "lucide-react";
import DocumentCapture from "@/components/ui/DocumentCapture";
import { uploadWorkerDocumentSafe } from "@/lib/worker-doc-upload";
import { INSURANCE_TYPES } from "@/lib/insurance-utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";

interface InsuranceFormModalProps {
  onClose: () => void;
  onSaved: (input: {
    insurance_type: string;
    policy_number: string;
    expiry_date: string;
    document_url: string | null;
  }) => Promise<{ error: string | null }>;
}

export default function InsuranceFormModal({
  onClose,
  onSaved,
}: InsuranceFormModalProps) {
  const [insuranceType, setInsuranceType] = useState<string>(INSURANCE_TYPES[0]);
  const [policyNumber, setPolicyNumber] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    let documentUrl: string | null = null;
    if (docFile) {
      documentUrl = await uploadWorkerDocumentSafe(
        docFile,
        `company-insurance/${Date.now()}-${insuranceType.replace(/\s+/g, "-")}`
      );
      if (!documentUrl) {
        setSaving(false);
        setError("Failed to upload insurance document.");
        return;
      }
    }

    const result = await onSaved({
      insurance_type: insuranceType,
      policy_number: policyNumber,
      expiry_date: expiryDate,
      document_url: documentUrl,
    });

    setSaving(false);
    if (result.error) {
      setError(result.error);
      return;
    }
    onClose();
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div className={`${modalClass} max-w-md`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">Add Insurance</h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Policy type</span>
            <select
              className={inputClass}
              value={insuranceType}
              onChange={(e) => setInsuranceType(e.target.value)}
            >
              {INSURANCE_TYPES.map((type) => (
                <option key={type} value={type}>
                  {type}
                </option>
              ))}
            </select>
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Policy number</span>
            <input
              className={inputClass}
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
            />
          </label>
          <label className="block space-y-1">
            <span className={labelClass}>Expiry date</span>
            <input
              type="date"
              className={inputClass}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <DocumentCapture
            label="Policy document"
            file={docFile}
            onFileChange={setDocFile}
          />

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            Save Insurance
          </button>
        </form>
      </div>
    </div>
  );
}
