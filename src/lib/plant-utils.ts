import type { PlantAsset } from "./supabase";
import { usesKilometres, type PrestartTemplate } from "./prestart-templates";

export type ServiceWarning = "none" | "due_soon" | "overdue";

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

export function isTaggedOut(plant: PlantAsset): boolean {
  const status = String(plant.status ?? "").toLowerCase();
  return status === "out_of_service" || status === "out of service";
}

export function formatReading(value: number | null, unit: "hrs" | "km"): string {
  if (value == null) return "—";
  return `${value} ${unit}`;
}
