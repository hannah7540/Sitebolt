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
  return status === "out_of_service" || status === "out of service";
}

export function formatReading(value: number | null, unit: "hrs" | "km"): string {
  if (value == null) return "—";
  return `${value} ${unit}`;
}
