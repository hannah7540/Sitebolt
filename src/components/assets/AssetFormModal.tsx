"use client";

import { useEffect, useState } from "react";
import { Loader2, X } from "lucide-react";
import {
  ASSET_TYPES,
  ASSET_TYPE_LABELS,
  LASER_TYPE_LABELS,
  LASER_TYPE_OPTIONS,
  attachAssetCertificates,
  buildAssetInputFromForm,
  getAssetReferenceLabel,
  isAssignedAccountsAssetType,
  isManagedAssetType,
  isMobileDeviceAssetType,
  toDateInputValue,
  updateAssetCertificateUrl,
  updateAssetDueDates,
  validateAssetInput,
  type Asset,
  type AssetInput,
  type AssetStatus,
  type AssetType,
  type LaserType,
} from "@/lib/assets";
import { uploadAssetCertificate } from "@/lib/asset-document-upload";
import { fetchWorkers, type Worker } from "@/lib/supabase";
import ProjectSelect from "@/components/ui/ProjectSelect";
import WorkerSearchSelect from "./WorkerSearchSelect";
import AssetCertificateField from "./AssetCertificateField";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

interface AssetFormModalProps {
  asset?: Asset | null;
  defaultAssetType?: AssetType;
  lockAssetType?: boolean;
  onClose: () => void;
  onSave: (input: AssetInput) => Promise<{ error: string | null; asset?: Asset }>;
}

export default function AssetFormModal({
  asset,
  defaultAssetType,
  lockAssetType = false,
  onClose,
  onSave,
}: AssetFormModalProps) {
  const isEdit = Boolean(asset);
  const [assetNumber, setAssetNumber] = useState(asset?.asset_number ?? "");
  const [name, setName] = useState(asset?.name ?? "");
  const [assetType, setAssetType] = useState<AssetType>(
    asset?.asset_type && isManagedAssetType(asset.asset_type)
      ? asset.asset_type
      : defaultAssetType && isManagedAssetType(defaultAssetType)
        ? defaultAssetType
        : "laptop"
  );
  const [status, setStatus] = useState<AssetStatus>(asset?.status ?? "active");
  const [make, setMake] = useState(asset?.make ?? "");
  const [model, setModel] = useState(asset?.model ?? "");
  const [serialNumber, setSerialNumber] = useState(asset?.serial_number ?? "");
  const [assignedWorkerId, setAssignedWorkerId] = useState<string | null>(
    asset?.assigned_worker_id ?? null
  );
  const [assignedProjectId, setAssignedProjectId] = useState<string | null>(
    asset?.project_id ?? asset?.assigned_project_id ?? null
  );
  const [assignedWorkerIds, setAssignedWorkerIds] = useState<string[]>(
    asset?.assigned_worker_ids ?? []
  );
  const [laserType, setLaserType] = useState<LaserType | null>(asset?.laser_type ?? null);
  const [accountName, setAccountName] = useState(asset?.account_name ?? "");
  const [accountReference, setAccountReference] = useState(asset?.account_reference ?? "");
  const [nextServiceDue, setNextServiceDue] = useState(
    toDateInputValue(asset?.next_service_due_date)
  );
  const [nextCalibrationDue, setNextCalibrationDue] = useState(
    toDateInputValue(asset?.next_calibration_due_date)
  );
  const [serviceCertUrl, setServiceCertUrl] = useState(asset?.service_cert_url ?? "");
  const [calibrationCertUrl, setCalibrationCertUrl] = useState(
    asset?.calibration_cert_url ?? ""
  );
  const [pendingServiceFile, setPendingServiceFile] = useState<File | null>(null);
  const [pendingCalibrationFile, setPendingCalibrationFile] = useState<File | null>(
    null
  );
  const [uploadingCert, setUploadingCert] = useState<"service" | "calibration" | null>(
    null
  );
  const [dateSaveMessage, setDateSaveMessage] = useState<string | null>(null);
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
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [workersLoading, setWorkersLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    document.body.style.overflow = "hidden";
    return () => {
      document.body.style.overflow = "";
    };
  }, []);

  useEffect(() => {
    void fetchWorkers().then((rows) => {
      setWorkers(rows);
      setWorkersLoading(false);
    });
  }, []);

  const showMobileFields = isMobileDeviceAssetType(assetType);
  const showLaserFields = assetType === "laser";
  const showGaugeFields = assetType === "pressure_gauge";
  const showAccountFields = isAssignedAccountsAssetType(assetType);
  const showCalibratedFields = showLaserFields || showGaugeFields;
  const referenceLabel = getAssetReferenceLabel(assetType);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();

    const input = buildAssetInputFromForm({
      assetType,
      assetNumber,
      name,
      make,
      model,
      serialNumber,
      status,
      assignedWorkerId,
      assignedProjectId,
      assignedWorkerIds,
      laserType,
      accountName,
      accountReference,
      nextServiceDue,
      nextCalibrationDue,
      serviceContactName,
      serviceContactCompany,
      serviceContactPhone,
      serviceContactEmail,
    });
    if (serviceCertUrl) input.service_cert_url = serviceCertUrl;
    if (calibrationCertUrl) input.calibration_cert_url = calibrationCertUrl;

    const validationError = validateAssetInput(input);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSaving(true);
    setError(null);
    const { error: saveError, asset: saved } = await onSave(input);
    if (saveError) {
      setSaving(false);
      setError(saveError);
      return;
    }

    const savedId = saved?.id ?? asset?.id;
    if (savedId && (pendingServiceFile || pendingCalibrationFile)) {
      const attached = await attachAssetCertificates(savedId, {
        service: pendingServiceFile,
        calibration: pendingCalibrationFile,
      });
      if (attached.error) {
        setSaving(false);
        setError(attached.error);
        return;
      }
    }

    setSaving(false);
    onClose();
  };

  const persistDueDates = async (overrides?: {
    service?: string;
    calibration?: string;
  }) => {
    if (!asset?.id || (!showLaserFields && !showGaugeFields)) return;
    setDateSaveMessage(null);
    const { error: dateError } = await updateAssetDueDates(asset.id, {
      next_service_date: showLaserFields
        ? (overrides?.service ?? nextServiceDue)
        : undefined,
      next_calibration_date: overrides?.calibration ?? nextCalibrationDue,
    });
    setDateSaveMessage(dateError ? dateError : "Dates saved.");
  };

  const handleCertificateFile = async (
    kind: "service" | "calibration",
    file: File
  ) => {
    setError(null);
    if (!asset?.id) {
      if (kind === "service") {
        setPendingServiceFile(file);
        setServiceCertUrl("");
      } else {
        setPendingCalibrationFile(file);
        setCalibrationCertUrl("");
      }
      return;
    }

    setUploadingCert(kind);
    const uploaded = await uploadAssetCertificate(file, asset.id, kind);
    if (uploaded.error || !uploaded.url) {
      setUploadingCert(null);
      setError(uploaded.error ?? "Certificate upload failed.");
      return;
    }

    const saved = await updateAssetCertificateUrl(asset.id, kind, uploaded.url);
    setUploadingCert(null);
    if (saved.error) {
      setError(saved.error);
      return;
    }

    if (kind === "service") {
      setServiceCertUrl(uploaded.url);
      setPendingServiceFile(null);
    } else {
      setCalibrationCertUrl(uploaded.url);
      setPendingCalibrationFile(null);
    }
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
          {isEdit ? "Edit / View Details" : "Add Asset"}
        </h2>
        <p className="mt-1 text-sm text-slate-500">
          {isEdit
            ? "All current fields are pre-populated. Dates and certificates save as soon as you change them."
            : "Fields update automatically based on the selected asset type."}
        </p>

        <form onSubmit={(e) => void handleSubmit(e)} className="mt-5 space-y-4" noValidate>
          <div>
            <label className={labelClass} htmlFor="asset-type">
              Asset Type
            </label>
            <select
              id="asset-type"
              value={assetType}
              onChange={(e) => setAssetType(e.target.value as AssetType)}
              className={inputClass}
              disabled={saving || lockAssetType || isEdit}
            >
              {ASSET_TYPES.map((type) => (
                <option key={type} value={type}>
                  {ASSET_TYPE_LABELS[type]}
                </option>
              ))}
            </select>
          </div>

          {showMobileFields ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="device-ref">
                  {referenceLabel}
                </label>
                <input
                  id="device-ref"
                  value={assetNumber}
                  onChange={(e) => setAssetNumber(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                  placeholder={
                    assetType === "laptop" ? "e.g. LAP-001" : "e.g. IPAD-001"
                  }
                />
              </div>

              <WorkerSearchSelect
                mode="single"
                id="assigned-worker"
                label="Assigned Worker"
                workers={workers}
                selected={assignedWorkerId}
                onChange={setAssignedWorkerId}
                disabled={saving || workersLoading}
                allowClear
                unassignedOptionLabel="Unassigned"
              />

              <ProjectSelect
                label="Assigned Project"
                value={assignedProjectId}
                onChange={setAssignedProjectId}
              />
            </div>
          ) : null}

          {showAccountFields ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass}>Account Name</label>
                <input
                  value={accountName}
                  onChange={(e) => setAccountName(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <div>
                <label className={labelClass}>Account Reference</label>
                <input
                  value={accountReference}
                  onChange={(e) => setAccountReference(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                />
              </div>
              <WorkerSearchSelect
                mode="multiple"
                label="Assigned To"
                workers={workers}
                selected={assignedWorkerIds}
                onChange={setAssignedWorkerIds}
                disabled={saving || workersLoading}
              />
            </div>
          ) : null}

          {showCalibratedFields ? (
            <div className="space-y-4">
              <div>
                <label className={labelClass} htmlFor="calibrated-ref">
                  Ref #
                </label>
                <input
                  id="calibrated-ref"
                  value={assetNumber}
                  onChange={(e) => setAssetNumber(e.target.value)}
                  className={inputClass}
                  disabled={saving}
                  placeholder={showLaserFields ? "e.g. LAS-001" : "e.g. PG-001"}
                />
              </div>

              <WorkerSearchSelect
                mode="single"
                id="laser-gauge-assigned-worker"
                label="Assigned Worker"
                workers={workers}
                selected={assignedWorkerId}
                onChange={setAssignedWorkerId}
                disabled={saving || workersLoading}
                allowClear
                unassignedOptionLabel="Unassigned"
              />

              <ProjectSelect
                label="Assigned Project"
                value={assignedProjectId}
                onChange={setAssignedProjectId}
              />

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

              {showLaserFields ? (
                <fieldset>
                  <legend className={labelClass}>Pipe or Rotating</legend>
                  <div className="mt-2 flex flex-wrap gap-3">
                    {LASER_TYPE_OPTIONS.map((option) => (
                      <label
                        key={option}
                        className={cn(
                          "inline-flex cursor-pointer items-center gap-2 rounded-full border px-3 py-1.5 text-sm font-semibold",
                          laserType === option
                            ? "border-orange-500 bg-orange-500 text-white"
                            : "border-slate-200 bg-white text-slate-700"
                        )}
                      >
                        <input
                          type="radio"
                          name="laser-type"
                          value={option}
                          checked={laserType === option}
                          onChange={() => setLaserType(option)}
                          disabled={saving}
                          className="sr-only"
                        />
                        {LASER_TYPE_LABELS[option]}
                      </label>
                    ))}
                  </div>
                </fieldset>
              ) : null}

              {showLaserFields ? (
                <div>
                  <label className={labelClass}>Next Service Due Date</label>
                  <input
                    type="date"
                    value={nextServiceDue}
                    onChange={(e) => {
                      const value = e.target.value;
                      setNextServiceDue(value);
                      void persistDueDates({ service: value });
                    }}
                    className={inputClass}
                    disabled={saving}
                  />
                </div>
              ) : null}

              <div>
                <label className={labelClass}>Next Calibration Due Date</label>
                <input
                  type="date"
                  value={nextCalibrationDue}
                  onChange={(e) => {
                    const value = e.target.value;
                    setNextCalibrationDue(value);
                    void persistDueDates({ calibration: value });
                  }}
                  className={inputClass}
                  disabled={saving}
                />
              </div>

              {dateSaveMessage ? (
                <p
                  className={cn(
                    "text-xs font-medium",
                    dateSaveMessage === "Dates saved."
                      ? "text-emerald-700"
                      : "text-red-700"
                  )}
                >
                  {dateSaveMessage}
                </p>
              ) : null}

              {showLaserFields ? (
                <div className="space-y-1">
                  <AssetCertificateField
                    id="service-certificate"
                    label="Service Certificate"
                    currentUrl={serviceCertUrl || null}
                    uploading={uploadingCert === "service"}
                    disabled={saving}
                    onFile={(file) => void handleCertificateFile("service", file)}
                  />
                  {!asset?.id && pendingServiceFile ? (
                    <p className="text-xs text-slate-500">
                      Selected: {pendingServiceFile.name} (uploads after save)
                    </p>
                  ) : null}
                </div>
              ) : null}

              <div className="space-y-1">
                <AssetCertificateField
                  id="calibration-certificate"
                  label="Calibration Certificate"
                  currentUrl={calibrationCertUrl || null}
                  uploading={uploadingCert === "calibration"}
                  disabled={saving}
                  onFile={(file) => void handleCertificateFile("calibration", file)}
                />
                {!asset?.id && pendingCalibrationFile ? (
                  <p className="text-xs text-slate-500">
                    Selected: {pendingCalibrationFile.name} (uploads after save)
                  </p>
                ) : null}
              </div>
            </div>
          ) : null}

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
