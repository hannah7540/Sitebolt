"use client";

import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import {
  PRESTART_TEMPLATE_LABELS,
  type PrestartTemplate,
} from "@/lib/prestart-templates";
import { resolvePlantWorkerOptionLabel } from "@/lib/plant-worker-assignment";
import type { Worker } from "@/lib/supabase";
import { inputClass, labelClass } from "@/lib/ui-classes";

const TEMPLATES = Object.keys(PRESTART_TEMPLATE_LABELS) as PrestartTemplate[];

export interface PlantFormValues {
  unitNumber: string;
  category: string;
  make: string;
  model: string;
  serialNumber: string;
  currentHours: string;
  nextServiceDueHours: string;
  serviceContactCompany: string;
  serviceContactName: string;
  serviceContactEmail: string;
  serviceContactPhone: string;
  prestartTemplate: PrestartTemplate;
  assignedWorkerId: string | null;
  heavyVehicleCheckRequired: boolean;
  lastHeavyVehicleCheckDate: string;
  nextHeavyVehicleCheckDueDate: string;
}

interface PlantEquipmentFieldsProps {
  values: PlantFormValues;
  onChange: <K extends keyof PlantFormValues>(
    key: K,
    value: PlantFormValues[K]
  ) => void;
  workers: Worker[];
  loadingWorkers?: boolean;
  disabled?: boolean;
  showTemplate?: boolean;
}

export function createEmptyPlantFormValues(
  template: PrestartTemplate = "excavator"
): PlantFormValues {
  return {
    unitNumber: "",
    category: "",
    make: "",
    model: "",
    serialNumber: "",
    currentHours: "",
    nextServiceDueHours: "",
    serviceContactCompany: "",
    serviceContactName: "",
    serviceContactEmail: "",
    serviceContactPhone: "",
    prestartTemplate: template,
    assignedWorkerId: null,
    heavyVehicleCheckRequired: false,
    lastHeavyVehicleCheckDate: "",
    nextHeavyVehicleCheckDueDate: "",
  };
}

export function plantFormValuesFromAsset(
  plant: {
    unit_number: string;
    category: string;
    make?: string | null;
    model?: string | null;
    serial_number?: string | null;
    current_hours?: number | null;
    next_service_hours?: number | null;
    service_contact_company?: string | null;
    service_contact_name?: string | null;
    service_contact_email?: string | null;
    service_contact_phone?: string | null;
    prestart_template?: PrestartTemplate | null;
    assigned_worker_id?: string | null;
    heavy_vehicle_check_required?: boolean;
    last_heavy_vehicle_check_date?: string | null;
    next_heavy_vehicle_check_due_date?: string | null;
  },
  assignedWorkerIdOverride?: string | null
): PlantFormValues {
  return {
    unitNumber: plant.unit_number ?? "",
    category: plant.category ?? "",
    make: plant.make ?? "",
    model: plant.model ?? "",
    serialNumber: plant.serial_number ?? "",
    currentHours:
      plant.current_hours != null ? String(plant.current_hours) : "",
    nextServiceDueHours:
      plant.next_service_hours != null ? String(plant.next_service_hours) : "",
    serviceContactCompany: plant.service_contact_company ?? "",
    serviceContactName: plant.service_contact_name ?? "",
    serviceContactEmail: plant.service_contact_email ?? "",
    serviceContactPhone: plant.service_contact_phone ?? "",
    prestartTemplate: plant.prestart_template ?? "excavator",
    assignedWorkerId:
      assignedWorkerIdOverride !== undefined
        ? assignedWorkerIdOverride
        : plant.assigned_worker_id ?? null,
    heavyVehicleCheckRequired: plant.heavy_vehicle_check_required ?? false,
    lastHeavyVehicleCheckDate: plant.last_heavy_vehicle_check_date ?? "",
    nextHeavyVehicleCheckDueDate: plant.next_heavy_vehicle_check_due_date ?? "",
  };
}

export function resolveHeavyVehicleFormPayload(values: PlantFormValues): {
  heavy_vehicle_check_required: boolean;
  last_heavy_vehicle_check_date: string | null;
  next_heavy_vehicle_check_due_date: string | null;
} {
  return {
    heavy_vehicle_check_required: values.heavyVehicleCheckRequired,
    last_heavy_vehicle_check_date: values.heavyVehicleCheckRequired
      ? values.lastHeavyVehicleCheckDate.trim() || null
      : null,
    next_heavy_vehicle_check_due_date: values.heavyVehicleCheckRequired
      ? values.nextHeavyVehicleCheckDueDate.trim() || null
      : null,
  };
}

export function parsePlantFormNumbers(values: PlantFormValues): {
  currentHours: number | null;
  nextServiceDueHours: number | null;
  error: string | null;
} {
  const currentHours = values.currentHours.trim()
    ? Number(values.currentHours)
    : null;
  if (values.currentHours.trim() && Number.isNaN(currentHours)) {
    return {
      currentHours: null,
      nextServiceDueHours: null,
      error: "Current hours must be a valid number.",
    };
  }

  const nextServiceDueHours = values.nextServiceDueHours.trim()
    ? Number(values.nextServiceDueHours)
    : null;
  if (values.nextServiceDueHours.trim() && Number.isNaN(nextServiceDueHours)) {
    return {
      currentHours,
      nextServiceDueHours: null,
      error: "Next service due hours must be a valid number.",
    };
  }

  return { currentHours, nextServiceDueHours, error: null };
}

export default function PlantEquipmentFields({
  values,
  onChange,
  workers,
  loadingWorkers = false,
  disabled = false,
  showTemplate = true,
}: PlantEquipmentFieldsProps) {
  const workerOptions = [...workers];

  return (
    <div className="grid gap-4 sm:grid-cols-2">
      <label className="block sm:col-span-2">
        <span className={labelClass}>Unit number *</span>
        <input
          className={inputClass}
          value={values.unitNumber ?? ""}
          onChange={(event) => onChange("unitNumber", event.target.value)}
          placeholder="EX-01"
          required
          disabled={disabled}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Category *</span>
        <input
          className={inputClass}
          value={values.category ?? ""}
          onChange={(event) => onChange("category", event.target.value)}
          placeholder="8t Excavator"
          required
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Make</span>
        <input
          className={inputClass}
          value={values.make ?? ""}
          onChange={(event) => onChange("make", event.target.value)}
          placeholder="Volvo"
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Model</span>
        <input
          className={inputClass}
          value={values.model ?? ""}
          onChange={(event) => onChange("model", event.target.value)}
          placeholder="EC220E"
          disabled={disabled}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Serial number</span>
        <input
          className={inputClass}
          value={values.serialNumber ?? ""}
          onChange={(event) => onChange("serialNumber", event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Current hours</span>
        <input
          type="number"
          min="0"
          step="0.1"
          className={inputClass}
          value={values.currentHours ?? ""}
          onChange={(event) => onChange("currentHours", event.target.value)}
          placeholder="0"
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Next service due (hours)</span>
        <input
          type="number"
          min="0"
          step="0.1"
          className={inputClass}
          value={values.nextServiceDueHours ?? ""}
          onChange={(event) => onChange("nextServiceDueHours", event.target.value)}
          placeholder="500"
          disabled={disabled}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Service contact company</span>
        <input
          className={inputClass}
          value={values.serviceContactCompany ?? ""}
          onChange={(event) => onChange("serviceContactCompany", event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Service contact name</span>
        <input
          className={inputClass}
          value={values.serviceContactName ?? ""}
          onChange={(event) => onChange("serviceContactName", event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="block">
        <span className={labelClass}>Service contact phone</span>
        <input
          type="tel"
          className={inputClass}
          value={values.serviceContactPhone ?? ""}
          onChange={(event) => onChange("serviceContactPhone", event.target.value)}
          disabled={disabled}
        />
      </label>
      <label className="block sm:col-span-2">
        <span className={labelClass}>Service contact email</span>
        <input
          type="email"
          className={inputClass}
          value={values.serviceContactEmail ?? ""}
          onChange={(event) => onChange("serviceContactEmail", event.target.value)}
          disabled={disabled}
        />
      </label>
      <div className="sm:col-span-2">
        <WorkerSearchSelect
          mode="single"
          id="plant-assign-worker"
          label="Assigned Worker"
          workers={workerOptions}
          selected={values.assignedWorkerId}
          onChange={(workerId) => onChange("assignedWorkerId", workerId)}
          disabled={disabled || loadingWorkers}
          placeholder={
            loadingWorkers ? "Loading workers…" : "Unassigned / Company Pool"
          }
          unassignedOptionLabel="Unassigned / Company Pool"
          getWorkerLabel={resolvePlantWorkerOptionLabel}
          searchPlaceholder="Search by first or last name…"
        />
      </div>
      {showTemplate ? (
        <label className="block sm:col-span-2">
          <span className={labelClass}>Pre-start template</span>
          <select
            className={inputClass}
            value={values.prestartTemplate ?? "excavator"}
            onChange={(event) =>
              onChange("prestartTemplate", event.target.value as PrestartTemplate)
            }
            disabled={disabled}
          >
            {TEMPLATES.map((template) => (
              <option key={template} value={template}>
                {PRESTART_TEMPLATE_LABELS[template]}
              </option>
            ))}
          </select>
        </label>
      ) : null}
      <div className="sm:col-span-2 space-y-3 rounded-xl border border-slate-200 bg-slate-50 p-4">
        <label className="flex items-center gap-2">
          <input
            type="checkbox"
            checked={values.heavyVehicleCheckRequired}
            onChange={(event) => {
              const checked = event.target.checked;
              onChange("heavyVehicleCheckRequired", checked);
              if (!checked) {
                onChange("lastHeavyVehicleCheckDate", "");
                onChange("nextHeavyVehicleCheckDueDate", "");
              }
            }}
            disabled={disabled}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          <span className={labelClass}>Heavy Vehicle Checks Required?</span>
        </label>
        {values.heavyVehicleCheckRequired ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Last Heavy Vehicle Check Date</span>
              <input
                type="date"
                className={inputClass}
                value={values.lastHeavyVehicleCheckDate ?? ""}
                onChange={(event) =>
                  onChange("lastHeavyVehicleCheckDate", event.target.value)
                }
                disabled={disabled}
              />
            </label>
            <label className="block">
              <span className={labelClass}>Next Heavy Vehicle Check Due Date</span>
              <input
                type="date"
                className={inputClass}
                value={values.nextHeavyVehicleCheckDueDate ?? ""}
                onChange={(event) =>
                  onChange("nextHeavyVehicleCheckDueDate", event.target.value)
                }
                disabled={disabled}
              />
            </label>
          </div>
        ) : null}
      </div>
    </div>
  );
}
