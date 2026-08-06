"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  FLEET_STATUSES,
  insertOrganizationFleetVehicle,
  updateOrganizationFleetVehicle,
  type FleetStatus,
  type OrganizationFleetVehicle,
} from "@/lib/organization-fleet";
import { uploadFleetDocument } from "@/lib/fleet-upload";
import { cn } from "@/lib/utils";
import { inputClass, labelClass, modalClass, modalOverlayClass } from "@/lib/ui-classes";

type FleetFormTab = "basic" | "documents";

interface AddFleetModalProps {
  vehicle?: OrganizationFleetVehicle | null;
  onClose: () => void;
  onSaved: () => void;
}

export default function AddFleetModal({
  vehicle,
  onClose,
  onSaved,
}: AddFleetModalProps) {
  const isEdit = Boolean(vehicle);
  const [activeTab, setActiveTab] = useState<FleetFormTab>("basic");
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  const [unitNumber, setUnitNumber] = useState(vehicle?.unit_number ?? "");
  const [make, setMake] = useState(vehicle?.make ?? "");
  const [model, setModel] = useState(vehicle?.model ?? "");
  const [registration, setRegistration] = useState(vehicle?.registration ?? "");
  const [currentHours, setCurrentHours] = useState(
    vehicle?.current_hours != null ? String(vehicle.current_hours) : ""
  );
  const [status, setStatus] = useState<FleetStatus>(vehicle?.status ?? "Active");
  const [regoExpiryDate, setRegoExpiryDate] = useState(vehicle?.rego_expiry_date ?? "");
  const [insuranceExpiryDate, setInsuranceExpiryDate] = useState(
    vehicle?.insurance_expiry_date ?? ""
  );
  const [regoDocumentUrl, setRegoDocumentUrl] = useState(vehicle?.rego_document_url ?? "");
  const [insuranceDocumentUrl, setInsuranceDocumentUrl] = useState(
    vehicle?.insurance_document_url ?? ""
  );
  const [regoFile, setRegoFile] = useState<File | null>(null);
  const [insuranceFile, setInsuranceFile] = useState<File | null>(null);

  useEffect(() => {
    if (!vehicle) return;
    setUnitNumber(vehicle.unit_number);
    setMake(vehicle.make ?? "");
    setModel(vehicle.model ?? "");
    setRegistration(vehicle.registration ?? "");
    setCurrentHours(String(vehicle.current_hours ?? ""));
    setStatus(vehicle.status);
    setRegoExpiryDate(vehicle.rego_expiry_date ?? "");
    setInsuranceExpiryDate(vehicle.insurance_expiry_date ?? "");
    setRegoDocumentUrl(vehicle.rego_document_url ?? "");
    setInsuranceDocumentUrl(vehicle.insurance_document_url ?? "");
  }, [vehicle]);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setSaving(true);
    setError(null);

    try {
      const payload = {
        unitNumber,
        make,
        model,
        registration,
        currentHours: Number(currentHours) || 0,
        status,
        regoExpiryDate: regoExpiryDate || null,
        insuranceExpiryDate: insuranceExpiryDate || null,
        regoDocumentUrl: regoDocumentUrl || null,
        insuranceDocumentUrl: insuranceDocumentUrl || null,
      };

      let vehicleId = vehicle?.id ?? null;

      if (isEdit && vehicle) {
        const result = await updateOrganizationFleetVehicle(vehicle.id, payload);
        if (result.error) {
          setError(result.error);
          return;
        }
        vehicleId = vehicle.id;
      } else {
        const result = await insertOrganizationFleetVehicle(payload);
        if (result.error || !result.data) {
          setError(result.error ?? "Failed to create vehicle.");
          return;
        }
        vehicleId = result.data.id;
      }

      let nextRegoUrl = payload.regoDocumentUrl;
      let nextInsuranceUrl = payload.insuranceDocumentUrl;

      if (regoFile && vehicleId) {
        const upload = await uploadFleetDocument(regoFile, vehicleId, "rego");
        if (upload.error) {
          setError(upload.error);
          return;
        }
        nextRegoUrl = upload.url;
      }

      if (insuranceFile && vehicleId) {
        const upload = await uploadFleetDocument(insuranceFile, vehicleId, "insurance");
        if (upload.error) {
          setError(upload.error);
          return;
        }
        nextInsuranceUrl = upload.url;
      }

      if ((regoFile || insuranceFile) && vehicleId) {
        const updateResult = await updateOrganizationFleetVehicle(vehicleId, {
          ...payload,
          regoDocumentUrl: nextRegoUrl,
          insuranceDocumentUrl: nextInsuranceUrl,
        });
        if (updateResult.error) {
          setError(updateResult.error);
          return;
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to save fleet vehicle.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <form onSubmit={handleSubmit} className={cn(modalClass, "max-w-2xl")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">
              {isEdit ? "Edit Fleet Vehicle" : "Add Fleet Vehicle"}
            </h2>
            <p className="mt-1 text-sm text-slate-500">
              Register organisation vehicles with rego and insurance compliance.
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

        <div className="mb-4 flex gap-2 border-b border-slate-200">
          {(
            [
              { id: "basic" as const, label: "Basic Information" },
              { id: "documents" as const, label: "Documents & Compliance" },
            ] as const
          ).map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setActiveTab(tab.id)}
              className={cn(
                "border-b-2 px-3 py-2 text-sm font-medium transition",
                activeTab === tab.id
                  ? "border-orange-500 text-orange-600"
                  : "border-transparent text-slate-500 hover:text-orange-600"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        {activeTab === "basic" ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block sm:col-span-2">
              <span className={labelClass}>Unit Number</span>
              <input
                className={inputClass}
                value={unitNumber}
                onChange={(e) => setUnitNumber(e.target.value)}
                placeholder="Ute 04"
                required
              />
            </label>
            <label className="block">
              <span className={labelClass}>Make</span>
              <input
                className={inputClass}
                value={make}
                onChange={(e) => setMake(e.target.value)}
                placeholder="Toyota"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Model</span>
              <input
                className={inputClass}
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="Hilux 4x4"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Registration</span>
              <input
                className={inputClass}
                value={registration}
                onChange={(e) => setRegistration(e.target.value)}
                placeholder="YLH60R"
              />
            </label>
            <label className="block">
              <span className={labelClass}>Current Hours Reading</span>
              <input
                type="number"
                min="0"
                step="0.1"
                className={inputClass}
                value={currentHours}
                onChange={(e) => setCurrentHours(e.target.value)}
                placeholder="12450"
              />
            </label>
            <label className="block sm:col-span-2">
              <span className={labelClass}>Initial Status</span>
              <select
                className={inputClass}
                value={status}
                onChange={(e) => setStatus(e.target.value as FleetStatus)}
              >
                {FLEET_STATUSES.map((option) => (
                  <option key={option} value={option}>
                    {option}
                  </option>
                ))}
              </select>
            </label>
          </div>
        ) : (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Registration Expiry Date</span>
              <input
                type="date"
                className={inputClass}
                value={regoExpiryDate}
                onChange={(e) => setRegoExpiryDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Rego Document Upload</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className={inputClass}
                onChange={(e) => setRegoFile(e.target.files?.[0] ?? null)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Insurance Expiry Date</span>
              <input
                type="date"
                className={inputClass}
                value={insuranceExpiryDate}
                onChange={(e) => setInsuranceExpiryDate(e.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Insurance Document Upload</span>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp"
                className={inputClass}
                onChange={(e) => setInsuranceFile(e.target.files?.[0] ?? null)}
              />
            </label>
          </div>
        )}

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
            {isEdit ? "Save Changes" : "Add Vehicle"}
          </button>
        </div>
      </form>
    </div>
  );
}
