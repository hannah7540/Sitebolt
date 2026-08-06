"use client";

import { useRef, useState } from "react";
import { X, Loader2, Truck } from "lucide-react";
import { insertSubcontractorPlantFromForm } from "@/lib/subcontractor-plant-service";
import { uploadSubcontractorPlantDocumentSafe } from "@/lib/subcontractor-plant-upload";
import { cn } from "@/lib/utils";
import {
  inputClass,
  sectionClass,
  modalOverlayClass,
  modalClass,
  labelClass,
} from "@/lib/ui-classes";
import DocumentCapture from "@/components/ui/DocumentCapture";

const EQUIPMENT_CATEGORIES = [
  "Excavator",
  "Dozer",
  "Dump Truck",
  "Roller",
  "Skid Steer",
  "Other",
] as const;

interface DocFiles {
  service_history: File | null;
  plant_risk_assessment: File | null;
}

interface DocUrls {
  service_history: string | null;
  plant_risk_assessment: string | null;
}

interface AddSubcontractorPlantModalProps {
  subcontractorId: string;
  onClose: () => void;
  onSaved: () => void | Promise<void>;
}

function Field({
  label,
  children,
}: {
  label: string;
  children: React.ReactNode;
}) {
  return (
    <label className="block space-y-1">
      <span className={labelClass}>{label}</span>
      {children}
    </label>
  );
}

export default function AddSubcontractorPlantModal({
  subcontractorId,
  onClose,
  onSaved,
}: AddSubcontractorPlantModalProps) {
  const [unitNumber, setUnitNumber] = useState("");
  const [equipmentCategory, setEquipmentCategory] = useState<string>(
    EQUIPMENT_CATEGORIES[0]
  );
  const [make, setMake] = useState("");
  const [model, setModel] = useState("");
  const [serialNumber, setSerialNumber] = useState("");
  const [currentHours, setCurrentHours] = useState("");
  const [nextServiceHours, setNextServiceHours] = useState("");
  const [lastServiceDate, setLastServiceDate] = useState("");
  const [notes, setNotes] = useState("");
  const [comments, setComments] = useState("");
  const [description, setDescription] = useState("");
  const [docs, setDocs] = useState<DocFiles>({
    service_history: null,
    plant_risk_assessment: null,
  });
  const [docUrls, setDocUrls] = useState<DocUrls>({
    service_history: null,
    plant_risk_assessment: null,
  });
  const uploadPrefixRef = useRef(
    `subcontractors/${subcontractorId}/plant/${Date.now()}-${Math.random().toString(36).slice(2, 8)}`
  );
  const uploadPrefix = uploadPrefixRef.current;
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const setDoc = (key: keyof DocFiles, file: File | null) => {
    setDocs((prev) => ({ ...prev, [key]: file }));
  };

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    if (!unitNumber.trim()) {
      setError("Unit number is required.");
      return;
    }

    setSubmitting(true);
    setError(null);

    try {
      const [serviceHistoryDocUrl, plantRiskAssessmentDocUrl] =
        await Promise.all([
          docUrls.service_history ??
            uploadSubcontractorPlantDocumentSafe(
              docs.service_history,
              `${uploadPrefix}/service-history`
            ),
          docUrls.plant_risk_assessment ??
            uploadSubcontractorPlantDocumentSafe(
              docs.plant_risk_assessment,
              `${uploadPrefix}/plant-risk-assessment`
            ),
        ]);

      const { error: insertError } = await insertSubcontractorPlantFromForm({
        subcontractorId,
        unitNumber,
        equipmentCategory,
        make,
        model,
        serialNumber,
        currentHours,
        nextServiceHours,
        lastServiceDate,
        serviceHistoryDocUrl,
        plantRiskAssessmentDocUrl,
        notes: notes ?? "",
        comments: comments ?? "",
        description: description ?? "",
      });

      if (insertError) {
        setError(insertError);
        return;
      }

      await onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save plant.");
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <div className={cn(modalClass, "max-w-xl")}>
        <button
          type="button"
          onClick={onClose}
          className="absolute right-4 top-4 text-slate-500 hover:text-slate-900"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-xl font-bold text-slate-900">Add Subbie Plant</h2>
        <p className="mt-1 text-sm text-slate-500">
          Machinery details, service records, and compliance documents
        </p>

        <div className="mt-4 flex items-center gap-2 rounded-xl border border-orange-200 bg-orange-50/50 p-3">
          <Truck className="h-5 w-5 shrink-0 text-orange-600" />
          <p className="text-xs text-slate-600">
            Linked to this subcontractor via{" "}
            <span className="font-medium">plant_equipment</span> with{" "}
            <span className="font-medium">is_subcontractor_plant = true</span>.
          </p>
        </div>

        {error && (
          <p className="mt-3 rounded-lg bg-red-100 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        )}

        <form
          onSubmit={handleSubmit}
          className="mt-4 max-h-[min(65vh,560px)] space-y-4 overflow-y-auto pr-1"
        >
          <div className={sectionClass}>
            <h4 className="text-sm font-semibold text-orange-600">
              Equipment Details
            </h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Unit Number / Reference *">
                <input
                  className={inputClass}
                  value={unitNumber}
                  onChange={(e) => setUnitNumber(e.target.value)}
                  required
                />
              </Field>
              <Field label="Equipment Category">
                <select
                  className={inputClass}
                  value={equipmentCategory}
                  onChange={(e) => setEquipmentCategory(e.target.value)}
                >
                  {EQUIPMENT_CATEGORIES.map((category) => (
                    <option key={category} value={category}>
                      {category}
                    </option>
                  ))}
                </select>
              </Field>
              <Field label="Make">
                <input
                  className={inputClass}
                  value={make}
                  onChange={(e) => setMake(e.target.value)}
                />
              </Field>
              <Field label="Model">
                <input
                  className={inputClass}
                  value={model}
                  onChange={(e) => setModel(e.target.value)}
                />
              </Field>
              <Field label="Serial Number / VIN">
                <input
                  className={inputClass}
                  value={serialNumber}
                  onChange={(e) => setSerialNumber(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className={sectionClass}>
            <h4 className="text-sm font-semibold text-orange-600">
              Service Details
            </h4>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              <Field label="Current Hours">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputClass}
                  value={currentHours}
                  onChange={(e) => setCurrentHours(e.target.value)}
                  placeholder="0"
                />
              </Field>
              <Field label="Next Service Hours">
                <input
                  type="number"
                  min="0"
                  step="0.1"
                  className={inputClass}
                  value={nextServiceHours}
                  onChange={(e) => setNextServiceHours(e.target.value)}
                  placeholder="250"
                />
              </Field>
              <Field label="Date of Last Service">
                <input
                  type="date"
                  className={inputClass}
                  value={lastServiceDate}
                  onChange={(e) => setLastServiceDate(e.target.value)}
                />
              </Field>
            </div>
          </div>

          <div className={sectionClass}>
            <h4 className="text-sm font-semibold text-orange-600">
              Documents
            </h4>
            <div className="mt-3 space-y-4">
              <DocumentCapture
                label="Service History Document"
                file={docs.service_history}
                onFileChange={(file) => setDoc("service_history", file)}
                uploadedUrl={docUrls.service_history}
                uploadPath={`${uploadPrefix}/service-history`}
                onUploaded={(url) =>
                  setDocUrls((prev) => ({ ...prev, service_history: url }))
                }
              />
              <DocumentCapture
                label="Plant Risk Assessment"
                file={docs.plant_risk_assessment}
                onFileChange={(file) => setDoc("plant_risk_assessment", file)}
                uploadedUrl={docUrls.plant_risk_assessment}
                uploadPath={`${uploadPrefix}/plant-risk-assessment`}
                onUploaded={(url) =>
                  setDocUrls((prev) => ({
                    ...prev,
                    plant_risk_assessment: url,
                  }))
                }
              />
            </div>
          </div>

          <div className={sectionClass}>
            <h4 className="text-sm font-semibold text-orange-600">
              Notes &amp; Description
            </h4>
            <div className="mt-3 space-y-3">
              <Field label="Notes">
                <textarea
                  className={cn(inputClass, "min-h-[80px] resize-y")}
                  value={notes}
                  onChange={(e) => setNotes(e.target.value)}
                  placeholder="General notes about this plant item"
                />
              </Field>
              <Field label="Comments">
                <textarea
                  className={cn(inputClass, "min-h-[72px] resize-y")}
                  value={comments}
                  onChange={(e) => setComments(e.target.value)}
                  placeholder="Optional — defaults to notes if left blank"
                />
              </Field>
              <Field label="Description">
                <textarea
                  className={cn(inputClass, "min-h-[72px] resize-y")}
                  value={description}
                  onChange={(e) => setDescription(e.target.value)}
                  placeholder="Optional — defaults to notes if left blank"
                />
              </Field>
            </div>
          </div>

          <div className="sticky bottom-0 flex justify-end gap-3 border-t border-slate-200 bg-white pt-4">
            <button
              type="button"
              onClick={onClose}
              disabled={submitting}
              className="rounded-lg px-4 py-2 text-sm font-medium text-slate-600 hover:bg-slate-100"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {submitting ? (
                <>
                  <Loader2 className="h-4 w-4 animate-spin" />
                  Saving…
                </>
              ) : (
                "Save Plant"
              )}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
