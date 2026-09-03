"use client";

import { useRef, useState } from "react";
import { Loader2 } from "lucide-react";
import WorkerSearchSelect from "@/components/assets/WorkerSearchSelect";
import {
  PRESTART_TEMPLATE_LABELS,
  type PrestartTemplate,
} from "@/lib/prestart-templates";
import {
  PLANT_EQUIPMENT_CATEGORIES,
  parsePlantCategories,
  serializePlantCategories,
  togglePlantCategory,
} from "@/lib/plant-categories";
import { resolvePlantWorkerOptionLabel } from "@/lib/plant-worker-assignment";
import {
  type HeavyVehicleFormErrors,
} from "@/lib/plant-register-payload";
import { uploadPlantRegistrationDocument } from "@/lib/plant-doc-upload";
import {
  resolvePlantAssignedProjectId,
  type PlantAsset,
  type Worker,
} from "@/lib/supabase";
import {
  filterActiveProjects,
  type DbProject,
} from "@/lib/project-resolver";
import { cn } from "@/lib/utils";
import { inputClass, labelClass } from "@/lib/ui-classes";

const TEMPLATES = Object.keys(PRESTART_TEMPLATE_LABELS) as PrestartTemplate[];

export interface PlantFormValues {
  unitNumber: string;
  category: string;
  categories: string[];
  projectId: string;
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
  registrationExpiryDate: string;
  registrationDocumentUrl: string | null;
}

interface PlantEquipmentFieldsProps {
  values: PlantFormValues;
  onChange: <K extends keyof PlantFormValues>(
    key: K,
    value: PlantFormValues[K]
  ) => void;
  workers: Worker[];
  projects?: DbProject[];
  loadingWorkers?: boolean;
  disabled?: boolean;
  showTemplate?: boolean;
  fieldErrors?: HeavyVehicleFormErrors;
  onFieldErrorChange?: (errors: HeavyVehicleFormErrors) => void;
  onUploadingChange?: (uploading: boolean) => void;
}

export function createEmptyPlantFormValues(
  template: PrestartTemplate = "excavator"
): PlantFormValues {
  return {
    unitNumber: "",
    category: "",
    categories: [],
    projectId: "",
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
    registrationExpiryDate: "",
    registrationDocumentUrl: null,
  };
}

export function plantFormValuesFromAsset(
  plant: Pick<
    PlantAsset,
    | "unit_number"
    | "category"
    | "make"
    | "model"
    | "serial_number"
    | "current_hours"
    | "next_service_hours"
    | "service_contact_company"
    | "service_contact_name"
    | "service_contact_email"
    | "service_contact_phone"
    | "prestart_template"
    | "assigned_worker_id"
    | "heavy_vehicle_check_required"
    | "last_heavy_vehicle_check_date"
    | "next_heavy_vehicle_check_due_date"
    | "heavy_vehicle_last_completed_date"
    | "heavy_vehicle_next_due_date"
    | "registration_expiry_date"
    | "registration_document_url"
    | "assigned_project_id"
    | "project_id"
    | "current_project_id"
  >,
  assignedWorkerIdOverride?: string | null,
  assignedProjectIdOverride?: string | null
): PlantFormValues {
  const categories = parsePlantCategories(plant.category);
  return {
    unitNumber: plant.unit_number ?? "",
    category: serializePlantCategories(categories) || (plant.category ?? ""),
    categories,
    projectId:
      assignedProjectIdOverride ?? resolvePlantAssignedProjectId(plant),
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
    lastHeavyVehicleCheckDate:
      plant.heavy_vehicle_last_completed_date ??
      plant.last_heavy_vehicle_check_date ??
      "",
    nextHeavyVehicleCheckDueDate:
      plant.heavy_vehicle_next_due_date ??
      plant.next_heavy_vehicle_check_due_date ??
      "",
    registrationExpiryDate: plant.registration_expiry_date ?? "",
    registrationDocumentUrl: plant.registration_document_url ?? null,
  };
}

export function resolveHeavyVehicleFormPayload(values: PlantFormValues): {
  heavy_vehicle_check_required: boolean;
  heavy_vehicle_last_completed_date: string | null;
  heavy_vehicle_next_due_date: string | null;
  last_heavy_vehicle_check_date: string | null;
  next_heavy_vehicle_check_due_date: string | null;
  registration_expiry_date: string | null;
  registration_document_url: string | null;
} {
  const lastCompleted = values.heavyVehicleCheckRequired
    ? values.lastHeavyVehicleCheckDate.trim() || null
    : null;
  const nextDue = values.heavyVehicleCheckRequired
    ? values.nextHeavyVehicleCheckDueDate.trim() || null
    : null;
  return {
    heavy_vehicle_check_required: Boolean(values.heavyVehicleCheckRequired),
    heavy_vehicle_last_completed_date: lastCompleted,
    heavy_vehicle_next_due_date: nextDue,
    last_heavy_vehicle_check_date: lastCompleted,
    next_heavy_vehicle_check_due_date: nextDue,
    registration_expiry_date: values.heavyVehicleCheckRequired
      ? values.registrationExpiryDate.trim() || null
      : null,
    registration_document_url: values.heavyVehicleCheckRequired
      ? values.registrationDocumentUrl?.trim() || null
      : null,
  };
}

export function parsePlantFormNumbers(values: PlantFormValues): {
  currentHours: number;
  nextServiceDueHours: number | null;
  error: string | null;
} {
  const currentHours = values.currentHours.trim()
    ? Number(values.currentHours)
    : 0;
  if (values.currentHours.trim() && Number.isNaN(currentHours)) {
    return {
      currentHours: 0,
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

function FieldHint({ message }: { message?: string }) {
  if (!message) return null;
  return <p className="mt-1 text-sm text-red-600">{message}</p>;
}

export default function PlantEquipmentFields({
  values,
  onChange,
  workers,
  projects = [],
  loadingWorkers = false,
  disabled = false,
  showTemplate = true,
  fieldErrors,
  onFieldErrorChange,
  onUploadingChange,
}: PlantEquipmentFieldsProps) {
  const workerOptions = [...workers];
  const fileInputRef = useRef<HTMLInputElement>(null);
  const [uploadingRegistration, setUploadingRegistration] = useState(false);
  const [uploadError, setUploadError] = useState<string | null>(null);

  const clearFieldError = (key: keyof HeavyVehicleFormErrors) => {
    if (!fieldErrors?.[key] || !onFieldErrorChange) return;
    const next = { ...fieldErrors };
    delete next[key];
    onFieldErrorChange(next);
  };

  const resetHeavyVehicleFields = () => {
    onChange("lastHeavyVehicleCheckDate", "");
    onChange("nextHeavyVehicleCheckDueDate", "");
    onChange("registrationExpiryDate", "");
    onChange("registrationDocumentUrl", null);
    setUploadError(null);
    onFieldErrorChange?.({});
    if (fileInputRef.current) fileInputRef.current.value = "";
  };

  const handleRegistrationFile = async (file: File | null) => {
    if (!file) return;
    setUploadError(null);
    setUploadingRegistration(true);
    onUploadingChange?.(true);
    const result = await uploadPlantRegistrationDocument(file);
    setUploadingRegistration(false);
    onUploadingChange?.(false);
    if (result.error || !result.url) {
      onChange("registrationDocumentUrl", null);
      setUploadError(result.error ?? "Failed to upload registration document.");
      return;
    }
    onChange("registrationDocumentUrl", result.url);
    clearFieldError("registrationDocument");
  };
  const selectedCategories = parsePlantCategories(values.categories);
  const projectOptions = (() => {
    const active = filterActiveProjects(projects);
    if (
      values.projectId &&
      !active.some((project) => project.id === values.projectId)
    ) {
      const current = projects.find((project) => project.id === values.projectId);
      if (current) return [current, ...active];
    }
    return active;
  })();

  const handleCategoryToggle = (category: (typeof PLANT_EQUIPMENT_CATEGORIES)[number]) => {
    const next = togglePlantCategory(values.categories, category);
    onChange("categories", next);
    onChange("category", serializePlantCategories(next));
  };

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
        <span className={labelClass}>Project</span>
        <select
          className={inputClass}
          value={values.projectId ?? ""}
          onChange={(event) => onChange("projectId", event.target.value)}
          disabled={disabled}
        >
          <option value="">Unassigned</option>
          {projectOptions.map((project) => (
            <option key={project.id} value={project.id}>
              {project.name}
            </option>
          ))}
        </select>
      </label>
      <fieldset className="sm:col-span-2 space-y-2">
        <legend className={labelClass}>Category *</legend>
        <div className="grid gap-2 sm:grid-cols-2">
          {PLANT_EQUIPMENT_CATEGORIES.map((category) => (
            <label
              key={category}
              className="flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-3 py-2 text-sm font-medium text-slate-800"
            >
              <input
                type="checkbox"
                checked={selectedCategories.includes(category)}
                onChange={() => handleCategoryToggle(category)}
                disabled={disabled}
                className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
              />
              {category}
            </label>
          ))}
        </div>
      </fieldset>
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
              if (!checked) resetHeavyVehicleFields();
            }}
            disabled={disabled || uploadingRegistration}
            className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
          />
          <span className={labelClass}>Heavy Vehicle Checks Required?</span>
        </label>
        {values.heavyVehicleCheckRequired ? (
          <div className="grid gap-4 sm:grid-cols-2">
            <label className="block">
              <span className={labelClass}>Last Completed Date *</span>
              <input
                type="date"
                className={cn(
                  inputClass,
                  fieldErrors?.lastCompletedDate && "border-red-500"
                )}
                value={values.lastHeavyVehicleCheckDate ?? ""}
                onChange={(event) => {
                  onChange("lastHeavyVehicleCheckDate", event.target.value);
                  clearFieldError("lastCompletedDate");
                }}
                disabled={disabled || uploadingRegistration}
              />
              <FieldHint message={fieldErrors?.lastCompletedDate} />
            </label>
            <label className="block">
              <span className={labelClass}>Next Due Date *</span>
              <input
                type="date"
                className={cn(
                  inputClass,
                  fieldErrors?.nextDueDate && "border-red-500"
                )}
                value={values.nextHeavyVehicleCheckDueDate ?? ""}
                onChange={(event) => {
                  onChange("nextHeavyVehicleCheckDueDate", event.target.value);
                  clearFieldError("nextDueDate");
                }}
                disabled={disabled || uploadingRegistration}
              />
              <FieldHint message={fieldErrors?.nextDueDate} />
            </label>
            <label className="block">
              <span className={labelClass}>Registration Expiry Date *</span>
              <input
                type="date"
                className={cn(
                  inputClass,
                  fieldErrors?.registrationExpiryDate && "border-red-500"
                )}
                value={values.registrationExpiryDate ?? ""}
                onChange={(event) => {
                  onChange("registrationExpiryDate", event.target.value);
                  clearFieldError("registrationExpiryDate");
                }}
                disabled={disabled || uploadingRegistration}
              />
              <FieldHint message={fieldErrors?.registrationExpiryDate} />
            </label>
            <div className="block">
              <span className={labelClass}>Registration Document *</span>
              <input
                ref={fileInputRef}
                type="file"
                accept=".pdf,.png,.jpg,.jpeg,application/pdf,image/png,image/jpeg"
                className={cn(
                  inputClass,
                  fieldErrors?.registrationDocument && "border-red-500"
                )}
                onChange={(event) => {
                  const file = event.target.files?.[0] ?? null;
                  void handleRegistrationFile(file);
                }}
                disabled={disabled || uploadingRegistration}
              />
              {uploadingRegistration ? (
                <p className="mt-1 inline-flex items-center gap-1 text-sm text-slate-600">
                  <Loader2 className="h-3.5 w-3.5 animate-spin" />
                  Uploading registration document…
                </p>
              ) : null}
              {values.registrationDocumentUrl && !uploadingRegistration ? (
                <a
                  href={values.registrationDocumentUrl}
                  target="_blank"
                  rel="noreferrer"
                  className="mt-1 inline-block text-sm font-medium text-orange-700 hover:underline"
                >
                  View uploaded document
                </a>
              ) : null}
              <FieldHint
                message={uploadError ?? fieldErrors?.registrationDocument}
              />
            </div>
          </div>
        ) : null}
      </div>
    </div>
  );
}
