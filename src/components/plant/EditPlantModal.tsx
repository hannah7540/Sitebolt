"use client";

import { useEffect, useMemo, useState } from "react";
import { ExternalLink, Loader2, Save, Upload, X } from "lucide-react";
import type { PlantAsset, Worker } from "@/lib/supabase";
import { updatePlant } from "@/lib/supabase";
import {
  fetchActiveWorkersForPlantAssignment,
  resolvePlantWorkerOptionLabel,
  syncPlantWorkerAssignment,
} from "@/lib/plant-worker-assignment";
import { setPlantProjectAssignments } from "@/lib/project-assignments";
import {
  fetchProjects,
  filterActiveProjects,
  getCachedProjects,
  type DbProject,
} from "@/lib/project-resolver";
import {
  buildRegisterPlantAssetPayload,
  hasHeavyVehicleFormErrors,
  validateHeavyVehicleFormFields,
  type HeavyVehicleFormErrors,
} from "@/lib/plant-register-payload";
import { serializePlantCategories } from "@/lib/plant-categories";
import {
  normalizePlantStatus,
  PLANT_OWNERSHIP_OPTIONS,
  PLANT_STATUS_OPTIONS,
} from "@/lib/plant-documents";
import PlantEquipmentFields, {
  parsePlantFormNumbers,
  plantFormValuesFromAsset,
  type PlantFormValues,
} from "@/components/plant/PlantEquipmentFields";
import {
  listPlantDocumentFiles,
  uploadPlantDocumentFile,
  type PlantDocumentFile,
} from "@/lib/plant-document-files";
import {
  fetchPlantMaintenance,
  type PlantMaintenanceRecord,
} from "@/lib/plant-maintenance";
import { cn } from "@/lib/utils";
import {
  inputClass,
  labelClass,
  modalBodyClass,
  modalCloseIconButtonClass,
  modalOverlayClass,
  modalShellClass,
  modalStickyFooterClass,
} from "@/lib/ui-classes";

interface EditPlantModalProps {
  plant: PlantAsset;
  onClose: () => void;
  onSaved: (plant: PlantAsset) => void;
}

export default function EditPlantModal({ plant, onClose, onSaved }: EditPlantModalProps) {
  const initialAssignedWorkerId = plant.assigned_worker_id ?? null;
  const [values, setValues] = useState<PlantFormValues>(() =>
    plantFormValuesFromAsset(plant)
  );
  const [name, setName] = useState(plant.name ?? "");
  const [status, setStatus] = useState(normalizePlantStatus(plant.status));
  const [ownershipType, setOwnershipType] = useState(plant.ownership_type ?? "company");
  const [hourlyCostRate, setHourlyCostRate] = useState(
    plant.hourly_cost_rate != null ? String(plant.hourly_cost_rate) : ""
  );
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>(() =>
    filterActiveProjects(getCachedProjects())
  );
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingRegistration, setUploadingRegistration] = useState(false);
  const [heavyVehicleErrors, setHeavyVehicleErrors] = useState<HeavyVehicleFormErrors>({});
  const [error, setError] = useState<string | null>(null);
  const [documents, setDocuments] = useState<PlantDocumentFile[]>([]);
  const [docsLoading, setDocsLoading] = useState(true);
  const [docsUploading, setDocsUploading] = useState(false);
  const [docsError, setDocsError] = useState<string | null>(null);
  const [maintenanceHistory, setMaintenanceHistory] = useState<
    PlantMaintenanceRecord[]
  >([]);

  useEffect(() => {
    let cancelled = false;
    void (async () => {
      setLoadingWorkers(true);
      const [rows, projectRows] = await Promise.all([
        fetchActiveWorkersForPlantAssignment(),
        fetchProjects(),
      ]);
      if (!cancelled) {
        setWorkers(rows);
        setProjects(filterActiveProjects(projectRows));
        setLoadingWorkers(false);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  useEffect(() => {
    let cancelled = false;
    setDocsLoading(true);
    void Promise.all([
      listPlantDocumentFiles(plant.id),
      fetchPlantMaintenance([plant.id]),
    ]).then(([rows, maintenance]) => {
      if (!cancelled) {
        setDocuments(rows);
        setMaintenanceHistory(maintenance);
        setDocsLoading(false);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [plant.id]);

  const setField = <K extends keyof PlantFormValues>(
    key: K,
    value: PlantFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const workerOptions = useMemo(() => {
    const active = [...workers];
    if (
      values.assignedWorkerId &&
      !active.some((worker) => worker.id === values.assignedWorkerId)
    ) {
      active.unshift({
        id: values.assignedWorkerId,
        first_name: plant.assigned_worker_name?.split(" ")[0] ?? "",
        last_name: plant.assigned_worker_name?.split(" ").slice(1).join(" ") ?? "",
        full_name: plant.assigned_worker_name ?? "",
        email: "",
        is_revoked: false,
        is_archived: false,
      } as Worker);
    }
    return active;
  }, [plant.assigned_worker_name, values.assignedWorkerId, workers]);

  const handleSave = async () => {
    const category = serializePlantCategories(values.categories);
    if (!values.unitNumber.trim() || !category) {
      setError("Unit number and at least one category are required.");
      return;
    }
    const parsedNumbers = parsePlantFormNumbers(values);
    if (parsedNumbers.error) {
      setError(parsedNumbers.error);
      return;
    }
    const hvErrors = validateHeavyVehicleFormFields(values);
    setHeavyVehicleErrors(hvErrors);
    if (hasHeavyVehicleFormErrors(hvErrors)) {
      setError("Please complete all required heavy vehicle fields.");
      return;
    }
    if (uploadingRegistration) {
      setError("Please wait for the registration document to finish uploading.");
      return;
    }
    const parsedRate = hourlyCostRate.trim() ? Number(hourlyCostRate) : null;
    if (hourlyCostRate.trim() && Number.isNaN(parsedRate)) {
      setError("Hourly cost rate must be a valid number.");
      return;
    }

    setSaving(true);
    setError(null);
    const mapped = buildRegisterPlantAssetPayload(values);
    const { error: updateError } = await updatePlant(plant.id, {
      ...mapped,
      name: name.trim() || null,
      hourly_cost_rate: parsedRate,
      ownership_type: ownershipType,
      status,
    });
    if (updateError) {
      setSaving(false);
      setError(updateError);
      return;
    }

    const selectedWorker = workerOptions.find((worker) => worker.id === mapped.assigned_worker_id);
    const syncResult = await syncPlantWorkerAssignment({
      plantId: plant.id,
      previousWorkerId: initialAssignedWorkerId,
      nextWorkerId: mapped.assigned_worker_id,
      nextWorkerName: selectedWorker
        ? resolvePlantWorkerOptionLabel(selectedWorker)
        : null,
    });
    if (syncResult.error) {
      setSaving(false);
      setError(syncResult.error);
      return;
    }

    const nextProjectIds = mapped.project_id ? [mapped.project_id] : [];
    const { error: assignError } = await setPlantProjectAssignments(plant, nextProjectIds);
    setSaving(false);
    if (assignError) {
      setError(assignError);
      return;
    }

    onSaved({
      ...plant,
      ...mapped,
      name: name.trim() || null,
      hourly_cost_rate: parsedRate,
      ownership_type: ownershipType,
      status,
      assigned_worker_id: mapped.assigned_worker_id,
      assigned_worker_name: selectedWorker
        ? resolvePlantWorkerOptionLabel(selectedWorker)
        : null,
    });
    onClose();
  };

  const handleUploadDocument = async (file: File | null) => {
    if (!file) return;
    setDocsUploading(true);
    setDocsError(null);
    const result = await uploadPlantDocumentFile({ plantId: plant.id, file });
    setDocsUploading(false);
    if (result.error || !result.document) {
      setDocsError(result.error ?? "Upload failed.");
      return;
    }
    setDocuments((current) => [result.document!, ...current]);
  };

  return (
    <div className={modalOverlayClass} role="presentation" onClick={onClose}>
      <div
        className={cn(modalShellClass, "h-[92dvh] w-[90vw] max-w-5xl")}
        role="dialog"
        aria-modal="true"
        aria-labelledby="edit-plant-title"
        onClick={(event) => event.stopPropagation()}
      >
        <div className="flex items-center justify-between gap-3 border-b border-slate-200 px-6 py-4">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-orange-500">
              Plant profile
            </p>
            <h2 id="edit-plant-title" className="text-xl font-bold text-slate-900">
              Edit {plant.unit_number}
            </h2>
          </div>
          <button type="button" className={modalCloseIconButtonClass} onClick={onClose} aria-label="Close">
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className={modalBodyClass}>
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Plant name</span>
              <input
                className={inputClass}
                value={name}
                onChange={(event) => setName(event.target.value)}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Status</span>
              <select
                className={inputClass}
                value={status}
                onChange={(event) =>
                  setStatus(normalizePlantStatus(event.target.value))
                }
              >
                {PLANT_STATUS_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Ownership</span>
              <select
                className={inputClass}
                value={ownershipType}
                onChange={(event) => setOwnershipType(event.target.value)}
              >
                {PLANT_OWNERSHIP_OPTIONS.map((option) => (
                  <option key={option.value} value={option.value}>
                    {option.label}
                  </option>
                ))}
              </select>
            </label>
            <label className="block">
              <span className={labelClass}>Hourly cost rate</span>
              <input
                className={inputClass}
                value={hourlyCostRate}
                onChange={(event) => setHourlyCostRate(event.target.value)}
              />
            </label>
          </div>

          <div className="mt-6">
            <PlantEquipmentFields
              values={values}
              onChange={setField}
              workers={workerOptions}
              projects={projects}
              loadingWorkers={loadingWorkers}
              fieldErrors={heavyVehicleErrors}
              onFieldErrorChange={setHeavyVehicleErrors}
              onUploadingChange={setUploadingRegistration}
            />
          </div>

          <section className="mt-8 rounded-xl border border-slate-200 bg-slate-50 p-4">
            <div className="mb-3 flex flex-wrap items-center justify-between gap-3">
              <div>
                <h3 className="text-base font-semibold text-slate-900">
                  Service History &amp; Documents
                </h3>
                <p className="text-sm text-slate-500">
                  Upload service records and supporting files to the plant-documents library.
                </p>
              </div>
              <label className="inline-flex cursor-pointer items-center gap-2 rounded-lg bg-orange-600 px-3 py-2 text-sm font-semibold text-white hover:bg-orange-500">
                {docsUploading ? (
                  <Loader2 className="h-4 w-4 animate-spin" />
                ) : (
                  <Upload className="h-4 w-4" />
                )}
                Upload file
                <input
                  type="file"
                  className="hidden"
                  disabled={docsUploading}
                  onChange={(event) => {
                    const file = event.target.files?.[0] ?? null;
                    event.target.value = "";
                    void handleUploadDocument(file);
                  }}
                />
              </label>
            </div>
            {maintenanceHistory.length > 0 ? (
              <ul className="mb-4 divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {maintenanceHistory.map((row) => (
                  <li
                    key={row.id}
                    className="flex items-center justify-between gap-3 px-3 py-2 text-sm"
                  >
                    <span className="font-medium capitalize text-slate-800">
                      {row.maintenance_type}
                    </span>
                    <span className="text-slate-500">
                      {row.scheduled_date}
                      {row.completed_at ? " · completed" : ""}
                    </span>
                  </li>
                ))}
              </ul>
            ) : null}
            {docsError ? (
              <p className="mb-3 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
                {docsError}
              </p>
            ) : null}
            {docsLoading ? (
              <p className="text-sm text-slate-500">Loading documents…</p>
            ) : documents.length === 0 ? (
              <p className="text-sm text-slate-500">No documents uploaded for this plant yet.</p>
            ) : (
              <ul className="divide-y divide-slate-200 rounded-lg border border-slate-200 bg-white">
                {documents.map((doc) => (
                  <li key={doc.id} className="flex items-center justify-between gap-3 px-3 py-2 text-sm">
                    <span className="truncate font-medium text-slate-800">{doc.file_name}</span>
                    {doc.file_url ? (
                      <a
                        href={doc.file_url}
                        target="_blank"
                        rel="noopener noreferrer"
                        className="inline-flex shrink-0 items-center gap-1 font-semibold text-orange-600 hover:text-orange-700"
                      >
                        Open <ExternalLink className="h-3.5 w-3.5" />
                      </a>
                    ) : (
                      <span className="text-xs text-slate-400">Stored</span>
                    )}
                  </li>
                ))}
              </ul>
            )}
          </section>

          {error ? (
            <p className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-800">
              {error}
            </p>
          ) : null}
        </div>

        <div className={modalStickyFooterClass}>
          <div className="flex justify-end gap-2 pb-3">
            <button
              type="button"
              onClick={onClose}
              className="rounded-lg border border-slate-300 px-4 py-2 text-sm font-semibold text-slate-700 hover:bg-slate-50"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={() => void handleSave()}
              disabled={saving}
              className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
            >
              {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : <Save className="h-4 w-4" />}
              Save plant
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
