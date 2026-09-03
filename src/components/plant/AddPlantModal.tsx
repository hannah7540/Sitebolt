"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { addPlant } from "@/lib/supabase";
import { serializePlantCategories } from "@/lib/plant-categories";
import {
  buildRegisterPlantAssetPayload,
  hasHeavyVehicleFormErrors,
  validateHeavyVehicleFormFields,
  type HeavyVehicleFormErrors,
} from "@/lib/plant-register-payload";
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
import type { Worker } from "@/lib/supabase";
import PlantEquipmentFields, {
  createEmptyPlantFormValues,
  parsePlantFormNumbers,
  type PlantFormValues,
} from "@/components/plant/PlantEquipmentFields";
import { cn } from "@/lib/utils";
import { modalClass, modalOverlayClass } from "@/lib/ui-classes";

interface AddPlantModalProps {
  onClose: () => void;
  onSaved: () => void;
}

export default function AddPlantModal({ onClose, onSaved }: AddPlantModalProps) {
  const [values, setValues] = useState<PlantFormValues>(createEmptyPlantFormValues());
  const [workers, setWorkers] = useState<Worker[]>([]);
  const [projects, setProjects] = useState<DbProject[]>(() =>
    filterActiveProjects(getCachedProjects())
  );
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [uploadingRegistration, setUploadingRegistration] = useState(false);
  const [heavyVehicleErrors, setHeavyVehicleErrors] =
    useState<HeavyVehicleFormErrors>({});
  const [error, setError] = useState<string | null>(null);

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

  const workerOptions = useMemo(() => [...workers], [workers]);

  const setField = <K extends keyof PlantFormValues>(
    key: K,
    value: PlantFormValues[K]
  ) => {
    setValues((prev) => ({ ...prev, [key]: value }));
  };

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();

    const category = serializePlantCategories(values.categories);
    if (!values.unitNumber.trim() || !category) {
      setError("Unit number and at least one category are required.");
      return;
    }

    const parsed = parsePlantFormNumbers(values);
    if (parsed.error) {
      setError(parsed.error);
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

    setSaving(true);
    setError(null);

    try {
      const payload = buildRegisterPlantAssetPayload(values);
      const result = await addPlant(payload);

      if (result.error || !result.data) {
        setError(result.error ?? "Failed to register plant asset.");
        return;
      }

      const assignResult = await setPlantProjectAssignments(
        result.data,
        payload.project_id ? [payload.project_id] : []
      );
      if (assignResult.error) {
        setError(assignResult.error);
        return;
      }

      if (payload.assigned_worker_id) {
        const selectedWorker = workerOptions.find(
          (worker) => worker.id === payload.assigned_worker_id
        );
        const syncResult = await syncPlantWorkerAssignment({
          plantId: result.data.id,
          previousWorkerId: null,
          nextWorkerId: payload.assigned_worker_id,
          nextWorkerName: selectedWorker
            ? resolvePlantWorkerOptionLabel(selectedWorker)
            : null,
        });
        if (syncResult.error) {
          setError(syncResult.error);
          return;
        }
      }

      onSaved();
      onClose();
    } catch (err) {
      setError(err instanceof Error ? err.message : "Failed to register plant asset.");
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className={modalOverlayClass}>
      <form onSubmit={handleSubmit} className={cn(modalClass, "max-w-2xl")}>
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-xl font-bold text-slate-900">Register Plant Asset</h2>
            <p className="mt-1 text-sm text-slate-500">
              Capture equipment details, service contacts, and optional worker assignment.
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

        <PlantEquipmentFields
          values={values}
          onChange={setField}
          workers={workerOptions}
          projects={projects}
          loadingWorkers={loadingWorkers}
          disabled={saving}
          fieldErrors={heavyVehicleErrors}
          onFieldErrorChange={setHeavyVehicleErrors}
          onUploadingChange={setUploadingRegistration}
        />

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
            disabled={saving || uploadingRegistration}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {saving || uploadingRegistration ? (
              <Loader2 className="h-4 w-4 animate-spin" />
            ) : null}
            Save Asset
          </button>
        </div>
      </form>
    </div>
  );
}
