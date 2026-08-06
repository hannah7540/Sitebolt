"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  ASSET_TYPE_LABELS,
  validateAssetInput,
  type Asset,
  type AssetInput,
  type AssetType,
} from "@/lib/assets";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface AssetFormModalProps {
  asset?: Asset | null;
  onClose: () => void;
  onSave: (input: AssetInput) => Promise<{ error: string | null }>;
}

export default function AssetFormModal({ asset, onClose, onSave }: AssetFormModalProps) {
  const isEdit = Boolean(asset);
  const [assetNumber, setAssetNumber] = useState(asset?.asset_number ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(asset?.asset_type ?? "site_laser");
  const [make, setMake] = useState(asset?.make ?? "");
  const [model, setModel] = useState(asset?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(asset?.serial_number ?? "");
  const [nextServiceDue, setNextServiceDue] = useState(asset?.next_service_due_date ?? "");
  const [nextCalibrationDue, setNextCalibrationDue] = useState(
    asset?.next_calibration_due_date ?? ""
  );
  const [serviceContactName, setServiceContactName] = useState(
    asset?.service_contact_name ?? ""
  );
  const [serviceContactCompany, setServiceContactCompany] = useState(
    asset?.service_contact_company ?? ""
  );
  const [serviceContactPhone, setServiceContactPhone] = useState(
    asset?.service_contact_phone ?? ""
  );
  const [serviceContactEmail, setServiceContactEmail] = useState(
    asset?.service_contact_email ?? ""
  );
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    const input: AssetInput = {
      asset_number: assetNumber,
      name,
      asset_type: assetType,
      make: make || undefined,
      model: model || undefined,
      serial_number: serialNumber || undefined,
      next_service_due_date: assetType === "site_laser" ? nextServiceDue || null : null,
      next_calibration_due_date: nextCalibrationDue || null,
      service_contact_name: serviceContactName || undefined,
      service_contact_company: serviceContactCompany || undefined,
      service_contact_phone: serviceContactPhone || undefined,
      service_contact_email: serviceContactEmail || undefined,
    };

    const validationError = validateAssetInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError } = await onSave(input);
    setSaving(false);
    if (saveError) {
      setError(saveError);
      return;
    }
    onClose();
  };

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-slate-900/40 p-4">
      <div className="relative max-h-[92vh] w-full max-w-lg overflow-y-auto rounded-2xl border border-slate-200 bg-white p-6 shadow-xl">
        <button
          type="button"
          onClick={onClose}
          disabled={saving}
          className="absolute right-4 top-4 rounded p-1 text-slate-400 hover:text-slate-600"
          aria-label="Close"
        >
          <X className="h-5 w-5" />
        </button>

        <h2 className="text-lg font-bold text-slate-900">
          {isEdit ? "Edit Asset" : "Add Asset"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          Register a Site Laser or Pressure Gauge with service and calibration dates.
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4">
          <div>
            <label className={labelClass}>Asset Type *</label>
            <select
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className={inputClass}
              disabled={saving}
            >
              {(Object.keys(ASSET_TYPE_LABELS) as AssetType[]).map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          <div className="grid gap-4 sm:grid-cols-2">
            <div>
              <label className={labelClass}>Asset # *</label>
              <input
                value={assetNumber}
                onChange={(e) => setAssetNumber(e.target.value)}
                className={inputClass}
                required
                disabled={saving}
              />
            </div>
            <div>
              <label className={labelClass}>Name *</label>
              <input
                value={name}
                onChange={(e) => setName(e.target.value)}
                className={inputClass}
                required
                disabled={saving}
              />
            </div>
          </div>

          <div className="grid gap-4 sm:grid-cols-3">
            <div>
              <label className={labelClass}>Make</label>
              <input
                value={make}
                onChange={(e) => setMake(e.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </div>
            <div>
              <label className={labelClass}>Model</label>
              <input
                value={model}
                onChange={(e) => setModel(e.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </div>
            <div>
              <label className={labelClass}>Serial #</label>
              <input
                value={serialNumber}
                onChange={(e) => setSerialNumber(e.target.value)}
                className={inputClass}
                disabled={saving}
              />
            </div>
          </div>

          {assetType === "site_laser" ? (
            <div>
              <label className={labelClass}>Next Service Due Date *</label>
              <input
                type="date"
                value={nextServiceDue}
                onChange={(e) => setNextServiceDue(e.target.value)}
                className={inputClass}
                required
                disabled={saving}
              />
            </div>
          ) : null}

          <div>
            <label className={labelClass}>Next Calibration Due Date *</label>
            <input
              type="date"
              value={nextCalibrationDue}
              onChange={(e) => setNextCalibrationDue(e.target.value)}
              className={inputClass}
              required
              disabled={saving}
            />
          </div>

          <div className="rounded-xl border border-slate-200 bg-slate-50 p-4">
            <p className="text-sm font-semibold text-slate-800">
              Service & Calibration Contact Details
            </p>
            <p className="mt-1 text-xs text-slate-500">
              Saved directly on this asset for quick reference on site.
            </p>
            <div className="mt-4 space-y-3">
              <div>
                <label className={labelClass}>Company Name</label>
                <input
                  value={serviceContactCompany}
                  onChange={(e) => setServiceContactCompany(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div>
                <label className={labelClass}>Contact Person</label>
                <input
                  value={serviceContactName}
                  onChange={(e) => setServiceContactName(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div className="grid gap-3 sm:grid-cols-2">
                <div>
                  <label className={labelClass}>Phone</label>
                  <input
                    type="tel"
                    value={serviceContactPhone}
                    onChange={(e) => setServiceContactPhone(e.target.value)}
                    className={inputClass}
                    disabled={saving}
                  />
                </div>
                <div>
                  <label className={labelClass}>Email</label>
                  <input
                    type="email"
                    value={serviceContactEmail}
                    onChange={(e) => setServiceContactEmail(e.target.value)}
                    className={inputClass}
                    disabled={saving}
                  />
                </div>
              </div>
            </div>
          </div>

          {error ? (
            <p className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}

          <div className="flex justify-end gap-2 pt-2">
            <button
              type="button"
              onClick={onClose}
              disabled={saving}
              className="rounded-lg border border-slate-200 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-600 disabled:opacity-50"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
              {isEdit ? "Save Changes" : "Add Asset"}
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
