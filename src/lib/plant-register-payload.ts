import { parsePlantCategories, serializePlantCategories } from "./plant-categories";
import { isProjectUuid } from "./project-resolver";
import { nullIfBlank } from "./form-payload-utils";
import {
  PRESTART_TEMPLATE_LABELS,
  type PrestartTemplate,
} from "./prestart-templates";

export interface RegisterPlantFormInput {
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
  prestartTemplate: PrestartTemplate | string;
  assignedWorkerId: string | null;
  heavyVehicleCheckRequired: boolean;
  lastHeavyVehicleCheckDate?: string;
  nextHeavyVehicleCheckDueDate?: string;
}

/** Empty or non-UUID values become null so Postgres uuid columns do not reject "". */
export function nullIfBlankUuid(value: string | null | undefined): string | null {
  const trimmed = nullIfBlank(value);
  if (!trimmed || !isProjectUuid(trimmed)) return null;
  return trimmed;
}

export function numberOrZero(value: string | number | null | undefined): number {
  if (value === null || value === undefined || value === "") return 0;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric || 0 : 0;
}

export function asPrestartTemplate(
  value: string | null | undefined
): PrestartTemplate | null {
  const trimmed = nullIfBlank(value);
  if (!trimmed) return null;
  return trimmed in PRESTART_TEMPLATE_LABELS
    ? (trimmed as PrestartTemplate)
    : null;
}

export function numberOrNull(value: string | number | null | undefined): number | null {
  if (value === null || value === undefined || value === "") return null;
  if (typeof value === "string" && !value.trim()) return null;
  const numeric = Number(value);
  return Number.isFinite(numeric) ? numeric : null;
}

/**
 * Map Register Plant Asset form fields to the exact plant table columns.
 * UUID and numeric empties are null (except current_hours, which defaults to 0).
 */
export function buildRegisterPlantAssetPayload(values: RegisterPlantFormInput) {
  const categories = parsePlantCategories(values.categories);
  const category =
    serializePlantCategories(categories) || nullIfBlank(values.category) || "";
  const nextServiceDueHours = numberOrNull(values.nextServiceDueHours);
  const preStartTemplate = asPrestartTemplate(values.prestartTemplate);
  const heavyVehicleCheckRequired = Boolean(values.heavyVehicleCheckRequired);

  return {
    unit_number: values.unitNumber.trim(),
    project_id: nullIfBlankUuid(values.projectId),
    category,
    categories,
    make: nullIfBlank(values.make),
    model: nullIfBlank(values.model),
    serial_number: nullIfBlank(values.serialNumber),
    current_hours: numberOrZero(values.currentHours),
    next_service_due_hours: nextServiceDueHours,
    next_service_hours: nextServiceDueHours,
    service_contact_company: nullIfBlank(values.serviceContactCompany),
    service_contact_name: nullIfBlank(values.serviceContactName),
    service_contact_phone: nullIfBlank(values.serviceContactPhone),
    service_contact_email: nullIfBlank(values.serviceContactEmail),
    assigned_worker_id: nullIfBlankUuid(values.assignedWorkerId),
    pre_start_template: preStartTemplate,
    prestart_template: preStartTemplate,
    heavy_vehicle_check_required: heavyVehicleCheckRequired,
    last_heavy_vehicle_check_date: heavyVehicleCheckRequired
      ? nullIfBlank(values.lastHeavyVehicleCheckDate)
      : null,
    next_heavy_vehicle_check_due_date: heavyVehicleCheckRequired
      ? nullIfBlank(values.nextHeavyVehicleCheckDueDate)
      : null,
  };
}

export type RegisterPlantAssetPayload = ReturnType<
  typeof buildRegisterPlantAssetPayload
>;
