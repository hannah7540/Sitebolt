export type PrestartTemplate =
  | "excavator"
  | "loader"
  | "roller"
  | "truck"
  | "hydrovac"
  | "site_dumper";

export type FieldType = "select" | "number" | "text" | "section";

export interface PrestartField {
  key: string;
  label: string;
  type: FieldType;
  options?: string[];
  required?: boolean;
  placeholder?: string;
  unit?: string;
  step?: string;
}

export const PRESTART_TEMPLATE_LABELS: Record<PrestartTemplate, string> = {
  excavator: "Excavator",
  loader: "Loader",
  roller: "Roller",
  truck: "Truck",
  hydrovac: "Hydrovac",
  site_dumper: "Site Dumper",
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
    {
      key: "attachment_hours",
      label: "Attachment Hours",
      type: "number",
      unit: "hrs",
      step: "any",
    },
    {
      key: "attachment_service_due_hours",
      label: "Attachment Service Due Hours",
      type: "number",
      unit: "hrs",
      step: "any",
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
  site_dumper: [
    { key: "hours", label: "Hours", type: "number", required: true, unit: "hrs" },
    {
      key: "next_service",
      label: "Next Service",
      type: "number",
      required: true,
      unit: "hrs",
    },
    {
      key: "_daily_section",
      label: "Daily Inspections",
      type: "section",
    },
    { key: "engine_oil", label: "Engine Oil", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "engine_coolant",
      label: "Engine Coolant",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "hydraulic_oil",
      label: "Hydraulic oil",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    {
      key: "break_fluid",
      label: "Break Fluid",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
    { key: "fuel", label: "Fuel", type: "select", options: CHECK_OK_DEFECT },
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
    { key: "rops_fops", label: "ROPS & FOPS", type: "select", options: CHECK_OK_DEFECT },
    {
      key: "fire_extinguisher",
      label: "Fire Extinguisher",
      type: "select",
      options: CHECK_OK_DEFECT,
    },
  ],
};

export const HYDROVAC_ATTACHMENT_HOURS_KEY = "attachment_hours";
export const HYDROVAC_ATTACHMENT_SERVICE_DUE_KEY = "attachment_service_due_hours";

export function isHydrovacPrestartTemplate(
  template: PrestartTemplate | string | null | undefined
): boolean {
  return template === "hydrovac";
}

export function readOptionalCheckNumber(
  checkData: Record<string, unknown> | null | undefined,
  ...keys: string[]
): number | null {
  if (!checkData) return null;
  for (const key of keys) {
    const raw = checkData[key];
    if (raw === undefined || raw === null || raw === "") continue;
    const numeric = Number(raw);
    if (Number.isFinite(numeric)) return numeric;
  }
  return null;
}

export function readHydrovacAttachmentHours(
  checkData: Record<string, unknown> | null | undefined
): { hours: number | null; serviceDueHours: number | null } {
  return {
    hours: readOptionalCheckNumber(checkData, HYDROVAC_ATTACHMENT_HOURS_KEY),
    serviceDueHours: readOptionalCheckNumber(
      checkData,
      HYDROVAC_ATTACHMENT_SERVICE_DUE_KEY,
      "attachment_next_due_hours"
    ),
  };
}

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
