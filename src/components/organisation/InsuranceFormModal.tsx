"use client";

import { useEffect, useState } from "react";
import { X, Loader2 } from "lucide-react";
import DocumentCapture from "@/components/ui/DocumentCapture";
import InsuranceRegionSelector from "@/components/organisation/InsuranceRegionSelector";
import { uploadInsuranceDocument } from "@/lib/insurance-document-upload";
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
    date_obtained: string;
    start_date: string;
    expiry_date: string;
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
  const isEditing = Boolean(insurance?.id);

  const [insuranceType, setInsuranceType] = useState<string>(INSURANCE_TYPES[0]);
  const [customTypeName, setCustomTypeName] = useState("");
  const [policyNumber, setPolicyNumber] = useState("");
  const [provider, setProvider] = useState("");
  const [startDate, setStartDate] = useState("");
  const [expiryDate, setExpiryDate] = useState("");
  const [docFile, setDocFile] = useState<File | null>(null);
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
    setStartDate(insurance.date_obtained ?? insurance.start_date ?? "");
    setExpiryDate(insurance.expiry_date ?? "");
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

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setSaving(true);
    setError(null);

    if (!startDate.trim()) {
      setSaving(false);
      setError("Start date is required.");
      return;
    }

    if (!expiryDate.trim()) {
      setSaving(false);
      setError("Expiry date is required.");
      return;
    }

    if (startDate > expiryDate) {
      setSaving(false);
      setError("Start date must be on or before the expiry date.");
      return;
    }

    if (insuranceType === OTHER_INSURANCE_TYPE && !customTypeName.trim()) {
      setSaving(false);
      setError("Please enter a custom insurance type name.");
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

    let fileUrl: string | null = insurance?.file_url ?? insurance?.document_url ?? null;
    let fileName: string | null = insurance?.file_name ?? null;
    if (docFile) {
      const upload = await uploadInsuranceDocument(docFile);
      if (upload.error || !upload.url) {
        setSaving(false);
        setError(upload.error ?? "Failed to upload insurance document.");
        return;
      }
      fileUrl = upload.url;
      fileName = upload.fileName;
    }

    const result = await onSaved({
      id: insurance?.id,
      insurance_type: insuranceType,
      custom_type_name:
        insuranceType === OTHER_INSURANCE_TYPE ? customTypeName.trim() : null,
      policy_number: policyNumber,
      provider,
      date_obtained: startDate,
      start_date: startDate,
      expiry_date: expiryDate,
      file_url: fileUrl,
      file_name: fileName,
      all_states: regionPayload.all_states,
      states: normalizeInsuranceRegions(regionPayload.states),
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
          <h2 className="text-lg font-bold text-slate-900">
            {isEditing ? "Edit Insurance" : "Add Insurance"}
          </h2>
          <button type="button" onClick={onClose} aria-label="Close">
            <X className="h-5 w-5 text-slate-400" />
          </button>
        </div>

        <form onSubmit={handleSubmit} className="space-y-4">
          <label className="block space-y-1">
            <span className={labelClass}>Insurance type</span>
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
              <span className={labelClass}>Custom insurance type</span>
              <input
                className={inputClass}
                value={customTypeName}
                onChange={(e) => setCustomTypeName(e.target.value)}
                placeholder="Describe the insurance type"
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
            <span className={labelClass}>Provider / insurer</span>
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
            disabled={saving}
          />

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
            {isEditing ? "Save Changes" : "Save Insurance"}
          </button>
        </form>
      </div>
    </div>
  );
}
