export type PrestartTemplate =
  | "excavator"
  | "loader"
  | "roller"
  | "truck"
  | "hydrovac";

export type FieldType = "select" | "number" | "text" | "section";

export interface PrestartField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  unit?: string;
}

export const PRESTART_TEMPLATE_LABELS: Record<PrestartTemplate, string> = {
  excavator: "Excavator",
  loader: "Loader",
  roller: "Roller",
  truck: "Truck",
  hydrovac: "Hydrovac",
};

const CHECK_OK_DEFECT = ["OK", "Defect", "N/A"];
const YES_NO = ["Yes", "No"];
const YES_NO_NA = ["Yes", "No", "N/A"];

export const PRESTART_TEMPLATES: Record<PrestartTemplate, PrestartField[]> = {
  excavator: [
    {
      key: "ownership",
      label: "Ownership",
      type: "select",
      options: ["A Plus", "Hired"],
      required: true,
    },
    {
      key: "hours",
      label: "Hours",
      type: "number",
      required: true,
      unit: "hrs",
    },
    {
      key: "next_service",
      label: "Next Service",
      type: "number",
      required: true,
      unit: "hrs",
    },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    { key: "coolant", label: "Coolant", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "hydraulic_oil",
      label: "Hydraulic Oil",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "fuel_pct", label: "Fuel %", type: "number", unit: "%" },
    {
      key: "tracks_tension",
      label: "Tracks / Tension",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "seat_belt", label: "Seat Belt", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "motion_beacon",
      label: "Motion Beacon",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "hazard_light",
      label: "Hazard Light",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "machine_greased",
      label: "Machine Greased",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "rops_fops", label: "ROPS / FOPS", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "laser_usage",
      label: "Laser Usage",
      type: "select",
      options: YES_NO,
    },
    {
      key: "chains",
      label: "Chains",
      type: "select",
      options: ["In Date", "No Chains"],
    },
    {
      key: "slings",
      label: "Slings",
      type: "select",
      options: ["Good", "No Slings"],
    },
  ],
  loader: [
    { key: "hours", label: "Hours", type: "number", required: true, unit: "hrs" },
    {
      key: "next_service",
      label: "Next Service",
      type: "number",
      required: true,
      unit: "hrs",
    },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    { key: "coolant", label: "Coolant", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "hydraulic_oil",
      label: "Hydraulic Oil",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "fuel_pct", label: "Fuel %", type: "number", unit: "%" },
    { key: "tyres", label: "Tyres", type: "select", options: CHECK_OK_DEFECT },
    { key: "seat_belt", label: "Seat Belt", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "motion_beacon",
      label: "Motion Beacon",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "hazard_light",
      label: "Hazard Light",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "machine_greased",
      label: "Machine Greased",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "rops_fops", label: "ROPS / FOPS", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
  ],
  roller: [
    { key: "hours", label: "Hours", type: "number", required: true, unit: "hrs" },
    {
      key: "next_service",
      label: "Next Service",
      type: "number",
      required: true,
      unit: "hrs",
    },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    { key: "coolant", label: "Coolant", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "hydraulic_oil",
      label: "Hydraulic Oil",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "fuel_pct", label: "Fuel %", type: "number", unit: "%" },
    {
      key: "tyres_rollers",
      label: "Tyres / Roller(s)",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "seat_belt", label: "Seat Belt", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "motion_beacon",
      label: "Motion Beacon",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "hazard_light",
      label: "Hazard Light",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "machine_greased",
      label: "Machine Greased",
      type: "select",
      options: YES_NO_NA,
    },
    { key: "rops_fops", label: "ROPS / FOPS", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
  ],
  truck: [
    {
      key: "current_kms",
      label: "Current Kms",
      type: "number",
      required: true,
      unit: "km",
    },
    {
      key: "next_service_kms",
      label: "Next Service (Kms)",
      type: "number",
      required: true,
      unit: "km",
    },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    { key: "coolant", label: "Coolant", type: "select", options: CHECK_OK_DEFECT },
    { key: "fuel_pct", label: "Fuel %", type: "number", unit: "%" },
    { key: "tyres", label: "Tyres", type: "select", options: CHECK_OK_DEFECT },
    { key: "seat_belt", label: "Seat Belt", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "motion_beacon",
      label: "Motion Beacon",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "hazard_light",
      label: "Hazard Light",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
  ],
  hydrovac: [
    { key: "hours", label: "Hours", type: "number", required: true, unit: "hrs" },
    {
      key: "next_service",
      label: "Next Service",
      type: "number",
      required: true,
      unit: "hrs",
    },
    { key: "_daily_section", label: "Daily Checks", type: "section" },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    { key: "coolant", label: "Coolant", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "hydraulic_oil",
      label: "Hydraulic Oil",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "fuel_pct", label: "Fuel %", type: "number", unit: "%" },
    { key: "beacons", label: "Beacons", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "hazard_light",
      label: "Hazard Light",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "_weekly_section", label: "Weekly Checks", type: "section" },
    {
      key: "machine_greased",
      label: "Machine Greased",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "air_filter", label: "Air Filter", type: "select", options: CHECK_OK_DEFECT },
    { key: "tyres", label: "Tyres", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "safety_shutdowns",
      label: "Safety Shutdowns",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "water_tank_shutdown_switch",
      label: "Water Tank Shutdown Switch",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "water_tank_debris",
      label: "Water Tank Debris",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "gate_valves",
      label: "Gate Valves",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
  ],
};

export function usesKilometres(template: PrestartTemplate): boolean {
  return template === "truck";
}

export function getReadingFieldKey(template: PrestartTemplate): string {
  return usesKilometres(template) ? "current_kms" : "hours";
}

export function getServiceFieldKey(template: PrestartTemplate): string {
  return usesKilometres(template) ? "next_service_kms" : "next_service";
}

export function detectDefectsInCheckData(
  checkData: Record<string, string | number | boolean | null>
): boolean {
  return Object.entries(checkData).some(([key, value]) => {
    if (key.startsWith("_")) return false;
    if (typeof value === "string" && value.toLowerCase() === "defect") return true;
    return false;
  });
}
