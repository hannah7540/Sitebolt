"use client";

import { useEffect, useMemo, useState } from "react";
import { Loader2, X } from "lucide-react";
import { addPlant } from "@/lib/supabase";
import {
  fetchActiveWorkersForPlantAssignment,
  resolvePlantWorkerOptionLabel,
  syncPlantWorkerAssignment,
} from "@/lib/plant-worker-assignment";
import type { Worker } from "@/lib/supabase";
import PlantEquipmentFields, {
  createEmptyPlantFormValues,
  parsePlantFormNumbers,
  resolveHeavyVehicleFormPayload,
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
  const [loadingWorkers, setLoadingWorkers] = useState(true);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingWorkers(true);
      const rows = await fetchActiveWorkersForPlantAssignment();
      if (!cancelled) {
        setWorkers(rows);
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

    if (!values.unitNumber.trim() || !values.category.trim()) {
      setError("Unit number and category are required.");
      return;
    }

    const parsed = parsePlantFormNumbers(values);
    if (parsed.error) {
      setError(parsed.error);
      return;
    }

    setSaving(true);
    setError(null);

    try {
      const result = await addPlant({
        unit_number: values.unitNumber.trim(),
        category: values.category.trim(),
        make: values.make.trim() || undefined,
        model: values.model.trim() || undefined,
        serial_number: values.serialNumber.trim() || undefined,
        current_hours: parsed.currentHours,
        next_service_hours: parsed.nextServiceDueHours,
        prestart_template: values.prestartTemplate,
        service_contact_name: values.serviceContactName.trim() || undefined,
        service_contact_phone: values.serviceContactPhone.trim() || undefined,
        service_contact_company: values.serviceContactCompany.trim() || undefined,
        service_contact_email: values.serviceContactEmail.trim() || undefined,
        ...resolveHeavyVehicleFormPayload(values),
      });

      if (result.error || !result.data) {
        setError(result.error ?? "Failed to register plant asset.");
        return;
      }

      if (values.assignedWorkerId) {
        const selectedWorker = workerOptions.find(
          (worker) => worker.id === values.assignedWorkerId
        );
        const syncResult = await syncPlantWorkerAssignment({
          plantId: result.data.id,
          previousWorkerId: null,
          nextWorkerId: values.assignedWorkerId,
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
          loadingWorkers={loadingWorkers}
          disabled={saving}
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
            disabled={saving}
            className="inline-flex items-center gap-2 rounded-lg bg-orange-600 px-4 py-2 text-sm font-semibold text-white hover:bg-orange-500 disabled:opacity-60"
          >
            {saving ? <Loader2 className="h-4 w-4 animate-spin" /> : null}
            Save Asset
          </button>
        </div>
      </form>
    </div>
  );
}
