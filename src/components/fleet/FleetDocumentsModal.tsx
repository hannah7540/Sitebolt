"use client";

import { useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  updateFleetDocumentCompliance,
  type FleetDocumentType,
  type OrganizationFleetVehicle,
} from "@/lib/organization-fleet";
import { uploadFleetDocument } from "@/lib/fleet-upload";
import { fleetDocumentTypeLabel } from "@/lib/fleet-utils";
import { cn } from "@/lib/utils";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface FleetDocumentsModalProps {
  vehicle: OrganizationFleetVehicle;
  documentType?: FleetDocumentType;
  onClose: () => void;
  onSaved: () => void;
}

export default function FleetDocumentsModal({
  vehicle,
  documentType = "rego",
  onClose,
  onSaved,
}: FleetDocumentsModalProps) {
  const [activeType, setActiveType] = useState<FleetDocumentType>(documentType);
  const [expiryDate, setExpiryDate] = useState(
    documentType === "insurance"
      ? vehicle.insurance_expiry_date ?? ""
      : vehicle.rego_expiry_date ?? ""
  );
  const [file, setFile] = useState<File | null>(null);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const handleTypeChange = (type: FleetDocumentType) => {
    setActiveType(type);
    setExpiryDate(
      type === "insurance"
        ? vehicle.insurance_expiry_date ?? ""
        : vehicle.rego_expiry_date ?? ""
    );
    setFile(null);
    setError(null);
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      let documentUrl: string | null | undefined;
      if (file) {
        const upload = await uploadFleetDocument(file, vehicle.id, activeType);
        if (upload.error) {
          setError(upload.error);
          setSaving(false);
          return;
        }
        documentUrl = upload.url;
      }

      const result = await updateFleetDocumentCompliance({
        id: vehicle.id,
        documentType: activeType,
        expiryDate: expiryDate || null,
        documentUrl,
      });

      if (result.error) {
        setError(result.error);
        setSaving(false);
        return;
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to update documents.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <form onSubmit={handleSubmit} className={cn(modalClass, "max-w-lg")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Fleet Documents</h2>
            <p className="mt-1 text-sm text-slate-500">
              {vehicle.unit_number} · {vehicle.make} {vehicle.model}
            </p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-md p-2 text-slate-500 hover:bg-slate-100"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex gap-2">
          {(["rego", "insurance"] as const).map((type) => (
            <button
              key={type}
              type="button"
              onClick={() => handleTypeChange(type)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-medium",
                activeType === type
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-orange-50 hover:text-orange-600"
              )}
            >
              {fleetDocumentTypeLabel(type)}
            </button>
          ))}
        </div>

        <div className="space-y-4">
          <label className="block">
            <span className={labelClass}>{fleetDocumentTypeLabel(activeType)}</span>
            <input
              type="date"
              className={inputClass}
              value={expiryDate}
              onChange={(e) => setExpiryDate(e.target.value)}
            />
          </label>
          <label className="block">
            <span className={labelClass}>Document Upload</span>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.webp"
              className={inputClass}
              onChange={(e) => setFile(e.target.files?.[0] ?? null)}
            />
          </label>
        </div>

        {error ? (
          <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
            {error}
          </p>
        ) : null}

        <div className="mt-6 flex justify-end gap-2">
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-medium text-slate-700 hover:bg-slate-50"
          >
            Cancel
          </button>
          <button
            type="submit"
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Documents
          </button>
        </div>
      </form>
    </div>
  );
}
