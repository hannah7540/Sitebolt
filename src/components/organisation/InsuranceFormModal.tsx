"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, FileText, ExternalLink } from "lucide-react";
import InsuranceRegionSelector from "@/components/organisation/InsuranceRegionSelector";
import {
  uploadInsuranceDocument,
  validateInsuranceDocumentFile,
} from "@/lib/insurance-document-upload";
import type { CompanyInsuranceFormRecord } from "@/lib/organisation-insurances-api-client";
import {
  ALL_INSURANCE_REGIONS,
  INSURANCE_TYPES,
  OTHER_INSURANCE_TYPE,
  buildInsuranceRegionSavePayload,
  normalizeInsuranceRegions,
  type InsuranceRegion,
} from "@/lib/insurance-utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";

interface InsuranceFormModalProps {
  insurance?: CompanyInsuranceFormRecord | null;
  onClose: () => void;
  onSaved: (input: {
    id?: string;
    insurance_type: string;
    custom_type_name: string | null;
    policy_number: string;
    provider: string;
    date_obtained: string | null;
    start_date: string | null;
    expiry_date: string | null;
    file_url: string | null;
    file_name: string | null;
    all_states: boolean;
    states: InsuranceRegion[];
  }) => Promise<{ error: string | null }>;
}

export default function InsuranceFormModal({
  insurance,
  onClose,
  onSaved,
}: InsuranceFormModalProps) {
  const fileInputRef = useRef<HTMLInputElement>(null);
  const isEditing = Boolean(insurance?.id);

  const [insuranceType, setInsuranceType] = useState<string>(INSURANCE_TYPES[0]);
  const [customTypeName, setCustomTypeName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [fileUrl, setFileUrl] = useState<string | null>(null);
  const [fileName, setFileName] = useState<string | null>(null);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [allRegions, setAllRegions] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<InsuranceRegion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!insurance) return;
    setInsuranceType(insurance.insurance_type || INSURANCE_TYPES[0]);
    setCustomTypeName(insurance.custom_type_name ?? "");
    setPolicyNumber(insurance.policy_number ?? "");
    setProvider(insurance.provider ?? "");
    setStartDate(insurance.start_date ?? insurance.date_obtained ?? "");
    setExpiryDate(insurance.expiry_date ?? "");
    setFileUrl(insurance.file_url ?? insurance.document_url ?? null);
    setFileName(insurance.file_name ?? null);
    setAllRegions(Boolean(insurance.all_states));
    setSelectedRegions(
      insurance.all_states
        ? [...ALL_INSURANCE_REGIONS]
        : normalizeInsuranceRegions(insurance.states)
    );
  }, [insurance]);

  const handleAllRegionsChange = (checked: boolean) => {
    setAllRegions(checked);
    setSelectedRegions(checked ? [...ALL_INSURANCE_REGIONS] : []);
  };

  const handleToggleRegion = (region: InsuranceRegion) => {
    setSelectedRegions((current) =>
      current.includes(region)
        ? current.filter((value) => value !== region)
        : [...current, region]
    );
  };

  const handleFileSelected = async (event: React.ChangeEvent<HTMLInputElement>) => {
    const file = event.target.files?.[0];
    event.target.value = "";
    if (!file) return;

    const validationError = validateInsuranceDocumentFile(file);
    if (validationError) {
      setError(validationError);
      return;
    }

    setUploadingDoc(true);
    setError(null);
    try {
      const upload = await uploadInsuranceDocument(file);
      if (upload.error || !upload.url) {
        throw new Error(upload.error ?? "Failed to upload insurance document.");
      }
      setFileUrl(upload.url);
      setFileName(upload.fileName);
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Failed to upload insurance document.";
      console.error(err);
      setError(message);
    } finally {
      setUploadingDoc(false);
    }
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    const normalizedStart = startDate.trim() || null;
    const normalizedExpiry = expiryDate.trim() || null;

    if (!normalizedStart) {
      setSaving(false);
      setError("Start date is required.");
      return;
    }

    if (!normalizedExpiry) {
      setSaving(false);
      setError("Expiry date is required.");
      return;
    }

    if (normalizedStart > normalizedExpiry) {
      setSaving(false);
      setError("Start date must be on or before the expiry date.");
      return;
    }

    if (insuranceType === OTHER_INSURANCE_TYPE && !customTypeName.trim()) {
      setSaving(false);
      setError("Please specify a custom insurance name.");
      return;
    }

    const regionPayload = buildInsuranceRegionSavePayload({
      allStates: allRegions,
      selectedStates: selectedRegions,
    });

    if (!regionPayload.all_states && regionPayload.states.length === 0) {
      setSaving(false);
      setError("Select at least one region or choose Applies to All Regions.");
      return;
    }

    try {
      const result = await onSaved({
        id: insurance?.id,
        insurance_type: insuranceType,
        custom_type_name:
          insuranceType === OTHER_INSURANCE_TYPE ? customTypeName.trim() : null,
        policy_number: policyNumber,
        provider,
        date_obtained: normalizedStart,
        start_date: normalizedStart,
        expiry_date: normalizedExpiry,
        file_url: fileUrl,
        file_name: fileName,
        all_states: regionPayload.all_states,
        states: normalizeInsuranceRegions(regionPayload.states),
      });

      if (result.error) {
        throw new Error(result.error);
      }
      onClose();
    } catch (err) {
      const message =
        err instanceof Error ? err.message : "Server error saving insurance";
      console.error(err);
      setError(`Save error: ${message}`);
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div className={`${modalClass} max-w-lg`} onClick={(e) => e.stopPropagation()}>
        <div className="mb-4 flex items-start justify-between">
          <h2 className="text-lg font-bold text-slate-900">
            {isEditing ? "Edit Insurance" : "Add Insurance"}
          </h2>
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

          {insuranceType === OTHER_INSURANCE_TYPE ? (
            <label className="block space-y-1">
              <span className={labelClass}>Specify Custom Insurance Name</span>
              <input
                className={inputClass}
                value={customTypeName}
                onChange={(e) => setCustomTypeName(e.target.value)}
                placeholder="Enter custom insurance type"
                required
              />
            </label>
          ) : null}

          <label className="block space-y-1">
            <span className={labelClass}>Policy number</span>
            <input
              className={inputClass}
              value={policyNumber}
              onChange={(e) => setPolicyNumber(e.target.value)}
            />
          </label>

          <label className="block space-y-1">
            <span className={labelClass}>Insurer / provider</span>
            <input
              className={inputClass}
              value={provider}
              onChange={(e) => setProvider(e.target.value)}
              placeholder="Insurance provider name"
            />
          </label>

          <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
            <label className="block space-y-1">
              <span className={labelClass}>Start Date / Date Obtained</span>
              <input
                type="date"
                name="start_date"
                className={inputClass}
                value={startDate}
                onChange={(e) => setStartDate(e.target.value)}
                required
              />
            </label>
            <label className="block space-y-1">
              <span className={labelClass}>Expiry Date</span>
              <input
                type="date"
                name="expiry_date"
                className={inputClass}
                value={expiryDate}
                onChange={(e) => setExpiryDate(e.target.value)}
                required
              />
            </label>
          </div>

          <InsuranceRegionSelector
            allRegions={allRegions}
            selectedRegions={selectedRegions}
            onAllRegionsChange={handleAllRegionsChange}
            onToggleRegion={handleToggleRegion}
            disabled={saving || uploadingDoc}
          />

          <div className="space-y-2">
            <span className={labelClass}>Document attachment</span>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={handleFileSelected}
              />
              <button
                type="button"
                disabled={saving || uploadingDoc}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 disabled:opacity-50"
              >
                {uploadingDoc ? (
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                ) : (
                  <FileText className="h-4 w-4 text-orange-500" />
                )}
                {uploadingDoc ? "Uploading…" : "Upload document"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                PDF, PNG, JPG, JPEG, or DOCX up to 20MB.
              </p>
              {fileName ? (
                <div className="mt-3 flex flex-wrap items-center gap-2 text-sm text-slate-700">
                  <span className="font-medium">{fileName}</span>
                  {fileUrl ? (
                    <a
                      href={fileUrl}
                      target="_blank"
                      rel="noopener noreferrer"
                      className="inline-flex items-center gap-1 text-orange-600 hover:underline"
                    >
                      <ExternalLink className="h-3.5 w-3.5" />
                      Preview / download
                    </a>
                  ) : null}
                </div>
              ) : null}
            </div>
          </div>

          {error && (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          )}

          <button
            type="submit"
            disabled={saving || uploadingDoc}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {saving && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Save Insurance"}
          </button>
        </form>
      </div>
    </div>
  );
}
