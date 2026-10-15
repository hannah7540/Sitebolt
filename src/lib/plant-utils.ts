import type { PlantAsset } from "./supabase";
import { usesKilometres, type PrestartTemplate } from "./prestart-templates";
import { daysUntil } from "./worker-utils";

export type ServiceWarning = "none" | "due_soon" | "overdue";
export type HeavyVehicleInspectionWarning = "none" | "due_soon" | "overdue";

export const HEAVY_VEHICLE_INSPECTION_DUE_SOON_DAYS = 30;

export function getServiceMetrics(plant: PlantAsset): {
  current: number | null;
  next: number | null;
  unit: "hrs" | "km";
} {
  const template = (plant.prestart_template ?? "excavator") as PrestartTemplate;
  const isKm = usesKilometres(template);

  return {
    current: isKm ? plant.current_kms : plant.current_hours,
    next: isKm ? plant.next_service_kms : plant.next_service_hours,
    unit: isKm ? "km" : "hrs",
  };
}

export function getServiceWarning(plant: PlantAsset): ServiceWarning {
  const { current, next } = getServiceMetrics(plant);
  if (current == null || next == null) return "none";
  if (current >= next) return "overdue";
  if (next - current <= 100) return "due_soon";
  return "none";
}

/** User-facing label for service warning badges on plant lists. */
export function getServiceWarningLabel(warning: ServiceWarning): string | null {
  if (warning === "overdue") return "Service Due";
  if (warning === "due_soon") return "Service Due Soon";
  return null;
}

/** Calendar meter copy: `1,250 hrs` or `12,500 km`. */
export function formatMeterReading(
  value: number | null | undefined,
  unit: "hrs" | "km" = "hrs"
): string {
  if (value == null || Number.isNaN(Number(value))) return "—";
  const rounded = Math.round(Number(value) * 10) / 10;
  return `${rounded.toLocaleString()} ${unit}`;
}

/** Calendar unit-box copy: "Service due (X days)" in red. */
export function getServiceDueDaysLabel(plant: PlantAsset): string | null {
  const warning = getServiceWarning(plant);
  if (warning === "none") return null;
  const { current, next, unit } = getServiceMetrics(plant);
  if (current == null || next == null) return "Service due";
  const remaining = next - current;
  if (remaining <= 0) return "Service due (overdue)";
  const days =
    unit === "hrs" ? Math.max(1, Math.ceil(remaining / 8)) : Math.max(1, Math.ceil(remaining / 80));
  return `Service due (${days} days)`;
}

export function getHeavyVehicleInspectionWarning(
  plant: PlantAsset
): HeavyVehicleInspectionWarning {
  if (!plant.heavy_vehicle_check_required) return "none";

  const dueDate = plant.next_heavy_vehicle_check_due_date;
  if (!dueDate) return "none";

  const days = daysUntil(dueDate);
  if (days === null) return "none";
  if (days < 0) return "overdue";
  if (days <= HEAVY_VEHICLE_INSPECTION_DUE_SOON_DAYS) return "due_soon";
  return "none";
}

export function getHeavyVehicleInspectionWarningLabel(
  warning: HeavyVehicleInspectionWarning
): string | null {
  if (warning === "overdue" || warning === "due_soon") return "Inspection Due";
  return null;
}

export function isHeavyVehicleChecksRequired(plant: PlantAsset): boolean {
  return plant.heavy_vehicle_check_required === true;
}

export function isTaggedOut(plant: PlantAsset): boolean {
  const status = String(plant.status ?? "").toLowerCase();
  if (status === "archived" || Boolean(plant.archived_at)) return false;
  return status === "out_of_service" || status === "out of service";
}

export function formatReading(value: number | null, unit: "hrs" | "km"): string {
  if (value == null) return "—";
  return `${value} ${unit}`;
}
