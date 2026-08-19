"use client";

import { useEffect, useRef, useState } from "react";
import { X, Loader2, FileText, Trash2 } from "lucide-react";
import InsuranceRegionSelector from "@/components/organisation/InsuranceRegionSelector";
import {
  uploadInsuranceDocuments,
  validateInsuranceDocumentFile,
} from "@/lib/insurance-document-upload";
import type { CompanyInsuranceFormRecord } from "@/lib/organisation-insurances-api-client";
import {
  ALL_INSURANCE_REGIONS,
  INSURANCE_TYPES,
  OTHER_INSURANCE_TYPE,
  buildInsuranceRegionSavePayload,
  formatInsuranceFileSize,
  normalizeInsuranceRegions,
  type InsuranceDocumentAttachment,
  type InsuranceRegion,
} from "@/lib/insurance-utils";
import {
  modalOverlayClass,
  modalClass,
  inputClass,
  labelClass,
} from "@/lib/ui-classes";
import InsuranceDocumentLinks from "./InsuranceDocumentLinks";

interface StagedInsuranceFile {
  id: string;
  file: File;
}

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
    documents: InsuranceDocumentAttachment[];
    all_states: boolean;
    states: InsuranceRegion[];
  }) => Promise<{ error: string | null }>;
}

function createStagedId(): string {
  return `staged-${Date.now()}-${Math.random().toString(36).slice(2, 8)}`;
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
  const [savedDocuments, setSavedDocuments] = useState<InsuranceDocumentAttachment[]>([]);
  const [stagedFiles, setStagedFiles] = useState<StagedInsuranceFile[]>([]);
  const [uploadingDoc, setUploadingDoc] = useState(false);
  const [allRegions, setAllRegions] = useState(false);
  const [selectedRegions, setSelectedRegions] = useState<InsuranceRegion[]>([]);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    if (!insurance) {
      setInsuranceType(INSURANCE_TYPES[0]);
      setCustomTypeName("");
      setPolicyNumber("");
      setProvider("");
      setStartDate("");
      setExpiryDate("");
      setSavedDocuments([]);
      setStagedFiles([]);
      setAllRegions(false);
      setSelectedRegions([]);
      setError(null);
      return;
    }

    setInsuranceType(insurance.insurance_type || INSURANCE_TYPES[0]);
    setCustomTypeName(insurance.custom_type_name ?? "");
    setPolicyNumber(insurance.policy_number ?? "");
    setProvider(insurance.provider ?? "");
    setStartDate(insurance.start_date ?? insurance.date_obtained ?? "");
    setExpiryDate(insurance.expiry_date ?? "");
    setSavedDocuments(
      insurance.documents?.length
        ? insurance.documents
        : insurance.file_url ?? insurance.document_url
          ? [
              {
                name: insurance.file_name ?? "Policy document",
                url: (insurance.file_url ?? insurance.document_url) as string,
                uploaded_at: insurance.updated_at ?? new Date().toISOString(),
              },
            ]
          : []
    );
    setStagedFiles([]);
    setAllRegions(Boolean(insurance.all_states));
    setSelectedRegions(
      insurance.all_states
        ? [...ALL_INSURANCE_REGIONS]
        : normalizeInsuranceRegions(insurance.states)
    );
    setError(null);
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

  const handleFilesSelected = (event: React.ChangeEvent<HTMLInputElement>) => {
    const files = Array.from(event.target.files ?? []);
    event.target.value = "";
    if (files.length === 0) return;

    const validFiles: StagedInsuranceFile[] = [];
    const validationErrors: string[] = [];

    for (const file of files) {
      const validationError = validateInsuranceDocumentFile(file);
      if (validationError) {
        validationErrors.push(`${file.name}: ${validationError}`);
        continue;
      }
      validFiles.push({ id: createStagedId(), file });
    }

    if (validationErrors.length > 0) {
      setError(validationErrors.join(" "));
    } else {
      setError(null);
    }

    if (validFiles.length > 0) {
      setStagedFiles((current) => [...current, ...validFiles]);
    }
  };

  const removeSavedDocument = (url: string) => {
    setSavedDocuments((current) => current.filter((doc) => doc.url !== url));
  };

  const removeStagedFile = (id: string) => {
    setStagedFiles((current) => current.filter((entry) => entry.id !== id));
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

    let documents = [...savedDocuments];
    let uploadWarning: string | null = null;

    if (stagedFiles.length > 0) {
      setUploadingDoc(true);
      try {
        const upload = await uploadInsuranceDocuments(stagedFiles.map((entry) => entry.file));
        if (upload.errors.length > 0) {
          console.error("Insurance document upload errors:", upload.errors);
          uploadWarning = `Some files failed to upload: ${upload.errors.join(" ")}`;
        }
        if (upload.documents.length > 0) {
          documents = [...documents, ...upload.documents];
          setStagedFiles([]);
        }
      } catch (err) {
        const message =
          err instanceof Error ? err.message : "Failed to upload insurance documents.";
        console.error("Insurance document upload failed:", err);
        uploadWarning = message;
      } finally {
        setUploadingDoc(false);
      }
    }

    const primary = documents[0] ?? null;
    const policyId = insurance?.id?.trim();

    try {
      const result = await onSaved({
        id: policyId || undefined,
        insurance_type: insuranceType,
        custom_type_name:
          insuranceType === OTHER_INSURANCE_TYPE ? customTypeName.trim() : null,
        policy_number: policyNumber,
        provider,
        date_obtained: normalizedStart,
        start_date: normalizedStart,
        expiry_date: normalizedExpiry,
        file_url: primary?.url ?? null,
        file_name: primary?.name ?? null,
        documents,
        all_states: regionPayload.all_states,
        states: normalizeInsuranceRegions(regionPayload.states),
      });

      if (result.error) {
        throw new Error(result.error);
      }
      if (uploadWarning) {
        console.warn("Insurance saved with document upload warnings:", uploadWarning);
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

  const busy = saving || uploadingDoc;

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
            disabled={busy}
          />

          <div className="space-y-2">
            <span className={labelClass}>Policy documents</span>
            <div className="rounded-lg border border-dashed border-slate-300 bg-slate-50 p-4">
              <input
                ref={fileInputRef}
                type="file"
                multiple
                accept=".pdf,.png,.jpg,.jpeg,.docx,application/pdf,image/png,image/jpeg"
                className="hidden"
                onChange={handleFilesSelected}
              />
              <button
                type="button"
                disabled={busy}
                onClick={() => fileInputRef.current?.click()}
                className="inline-flex min-h-11 cursor-pointer items-center gap-2 rounded-lg bg-white px-3 py-2 text-sm font-semibold text-slate-700 ring-1 ring-slate-200 hover:bg-slate-100 active:scale-95 disabled:opacity-50"
              >
                {uploadingDoc ? (
                  <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
                ) : (
                  <FileText className="h-4 w-4 text-orange-500" />
                )}
                {uploadingDoc ? "Uploading…" : "Add documents"}
              </button>
              <p className="mt-2 text-xs text-slate-500">
                Select one or more PDF, PNG, JPG, JPEG, or DOCX files up to 20MB each.
                New files upload when you save the policy.
              </p>

              {savedDocuments.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Attached documents
                  </p>
                  <ul className="space-y-2">
                    {savedDocuments.map((doc) => (
                      <li
                        key={doc.url}
                        className="flex items-start justify-between gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2"
                      >
                        <div className="min-w-0 flex-1">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {doc.name}
                          </p>
                          <InsuranceDocumentLinks documents={[doc]} compact />
                        </div>
                        <button
                          type="button"
                          onClick={() => removeSavedDocument(doc.url)}
                          disabled={busy}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Remove ${doc.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
                </div>
              ) : null}

              {stagedFiles.length > 0 ? (
                <div className="mt-4 space-y-2">
                  <p className="text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Ready to upload on save
                  </p>
                  <ul className="space-y-2">
                    {stagedFiles.map((entry) => (
                      <li
                        key={entry.id}
                        className="flex items-center justify-between gap-2 rounded-lg border border-amber-200 bg-amber-50 px-3 py-2"
                      >
                        <div className="min-w-0">
                          <p className="truncate text-sm font-medium text-slate-800">
                            {entry.file.name}
                          </p>
                          <p className="text-xs text-slate-500">
                            {formatInsuranceFileSize(entry.file.size)}
                          </p>
                        </div>
                        <button
                          type="button"
                          onClick={() => removeStagedFile(entry.id)}
                          disabled={busy}
                          className="rounded p-1.5 text-slate-400 hover:bg-red-50 hover:text-red-600 disabled:opacity-50"
                          aria-label={`Remove ${entry.file.name}`}
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </li>
                    ))}
                  </ul>
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
            disabled={busy}
            className="flex w-full items-center justify-center gap-2 rounded-lg bg-orange-500 py-2.5 text-sm font-semibold text-white disabled:opacity-50"
          >
            {busy && <Loader2 className="h-4 w-4 animate-spin" />}
            {isEditing ? "Save Changes" : "Save Insurance"}
          </button>
        </form>
      </div>
    </div>
  );
}
