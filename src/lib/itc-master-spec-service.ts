import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";
import {
  applySpecRuleToBatchItem,
  DEFAULT_SPEC_RULES,
  type ItcServiceSpecRule,
} from "./itc-batch-templates";
import { fetchServiceSpecRules } from "./itc-batch-service";
import {
  inferElectricalServiceTypeFromMaterial,
  listElectricalConduitMaterials,
  lookupElectricalConduitSpec,
  normalizeElectricalServiceType,
} from "./itc-electrical-conduit-specs";

export type ItcTradeDiscipline = "Electrical" | "Drainage" | "Hydraulics";

export interface ItcMasterSpec {
  id: string;
  project_id: string;
  discipline: ItcTradeDiscipline;
  sub_services: string[];
  zones: string[];
  pit_numbers: string[];
  materials: string[];
  bedding_cover_specs: Array<Record<string, unknown>>;
  rover_serial_numbers: string[];
  rover_operators: string[];
  service_types: string[];
  redline_markup_url: string | null;
}

export interface ItcMasterSpecInput {
  projectId: string;
  discipline: ItcTradeDiscipline;
  sub_services?: string[];
  zones?: string[];
  pit_numbers?: string[];
  materials?: string[];
  bedding_cover_specs?: Array<Record<string, unknown>>;
  rover_serial_numbers?: string[];
  rover_operators?: string[];
  service_types?: string[];
  redline_markup_url?: string | null;
}

const DEFAULT_DISCIPLINE_OPTIONS: Record<
  ItcTradeDiscipline,
  Omit<ItcMasterSpec, "id" | "project_id">
> = {
  Electrical: {
    discipline: "Electrical",
    sub_services: ["HV", "LV", "Comms Other", "Comms Mains"],
    zones: ["MP0", "MP1", "HRN"],
    pit_numbers: ["P-001", "P-002", "P-003"],
    materials: listElectricalConduitMaterials(),
    bedding_cover_specs: [],
    rover_serial_numbers: ["Rover-01", "Rover-02"],
    rover_operators: [],
    service_types: ["HV", "LV", "Comms Other", "Comms Mains"],
    redline_markup_url: null,
  },
  Drainage: {
    discipline: "Drainage",
    sub_services: ["Sewer", "Stormwater"],
    zones: ["MP0", "MP1", "HRN"],
    pit_numbers: ["MH-001", "MH-002", "CB-001"],
    materials: ["225mm PVC SN8", "300mm PVC SN8", "450mm RCP Class 4", "375mm RCP Class 4"],
    bedding_cover_specs: [],
    rover_serial_numbers: ["Rover-01", "Rover-02"],
    rover_operators: [],
    service_types: ["Sewer", "Stormwater"],
    redline_markup_url: null,
  },
  Hydraulics: {
    discipline: "Hydraulics",
    sub_services: ["Potable Water", "Recycled Water"],
    zones: ["MP0", "MP1", "HRN"],
    pit_numbers: ["HY-001", "HY-002"],
    materials: ["125mm PN16 PE100", "180mm PN16 PE100"],
    bedding_cover_specs: [],
    rover_serial_numbers: ["Rover-01", "Rover-02"],
    rover_operators: [],
    service_types: ["Potable Water"],
    redline_markup_url: null,
  },
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function parseStringArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value.map((item) => String(item).trim()).filter(Boolean);
}

function normalizeMasterSpec(row: Record<string, unknown>): ItcMasterSpec {
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    discipline: String(row.discipline ?? "Electrical") as ItcTradeDiscipline,
    sub_services: parseStringArray(row.sub_services),
    zones: parseStringArray(row.zones),
    pit_numbers: parseStringArray(row.pit_numbers),
    materials: parseStringArray(row.materials),
    bedding_cover_specs: Array.isArray(row.bedding_cover_specs)
      ? (row.bedding_cover_specs as Array<Record<string, unknown>>)
      : [],
    rover_serial_numbers: parseStringArray(row.rover_serial_numbers),
    rover_operators: parseStringArray(row.rover_operators),
    service_types: parseStringArray(row.service_types),
    redline_markup_url: row.redline_markup_url ? String(row.redline_markup_url) : null,
  };
}

export async function fetchItcMasterSpecs(projectId: string): Promise<ItcMasterSpec[]> {
  if (!isSupabaseConfigured()) return [];

  const resolved = (await resolveProjectId(projectId)).id ?? projectId;
  const { data, error } = await supabase
    .from("itc_master_specs")
    .select("*")
    .eq("project_id", resolved);

  if (error) {
    if (!isMissingTableError(error.message, "itc_master_specs")) {
      console.warn("fetchItcMasterSpecs failed:", error.message);
    }
    return (["Electrical", "Drainage", "Hydraulics"] as ItcTradeDiscipline[]).map(
      (discipline) => ({
        id: `${projectId}-${discipline}`,
        project_id: projectId,
        ...DEFAULT_DISCIPLINE_OPTIONS[discipline],
      })
    );
  }

  const rows = (data ?? []).map((row) => normalizeMasterSpec(row as Record<string, unknown>));
  const byDiscipline = new Map(rows.map((row) => [row.discipline, row]));

  return (["Electrical", "Drainage", "Hydraulics"] as ItcTradeDiscipline[]).map(
    (discipline) =>
      byDiscipline.get(discipline) ?? {
        id: `${projectId}-${discipline}`,
        project_id: projectId,
        ...DEFAULT_DISCIPLINE_OPTIONS[discipline],
      }
  );
}

export async function saveItcMasterSpec(
  input: ItcMasterSpecInput
): Promise<{ error: string | null; spec?: ItcMasterSpec }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured" };
  }

  const resolved = (await resolveProjectId(input.projectId)).id ?? input.projectId;
  const payload = {
    project_id: resolved,
    discipline: input.discipline,
    sub_services: input.sub_services ?? [],
    zones: input.zones ?? [],
    pit_numbers: input.pit_numbers ?? [],
    materials: input.materials ?? [],
    bedding_cover_specs: input.bedding_cover_specs ?? [],
    rover_serial_numbers: input.rover_serial_numbers ?? [],
    rover_operators: input.rover_operators ?? [],
    service_types: input.service_types ?? [],
    redline_markup_url: input.redline_markup_url ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("itc_master_specs")
    .upsert(payload, { onConflict: "project_id,discipline" })
    .select("*")
    .single();

  if (error) return { error: error.message };
  return { error: null, spec: normalizeMasterSpec(data as Record<string, unknown>) };
}

export interface ItcSpecAutoFillResult {
  min_horizontal_sep_mm: number | null;
  min_vertical_sep_mm: number | null;
  min_bedding_mm: number | null;
  min_side_mm: number | null;
  min_overlay_mm: number | null;
  min_cover_mm: number | null;
  bedding_and_overlay_material: string | null;
  cover_material: string | null;
}

function resolveElectricalAutoFill(
  serviceType: string,
  materialAndSize: string
): ItcSpecAutoFillResult | null {
  const normalizedType =
    normalizeElectricalServiceType(serviceType) ??
    inferElectricalServiceTypeFromMaterial(materialAndSize);
  if (!normalizedType) return null;
  const match = lookupElectricalConduitSpec(normalizedType, materialAndSize);
  return match ? { ...match } : null;
}

/** Auto-populate bedding, cover, and separation from material/size selection. */
export async function resolveSpecAutoFill(
  serviceType: string,
  materialAndSize: string
): Promise<ItcSpecAutoFillResult> {
  const empty: ItcSpecAutoFillResult = {
    min_horizontal_sep_mm: null,
    min_vertical_sep_mm: null,
    min_bedding_mm: null,
    min_side_mm: null,
    min_overlay_mm: null,
    min_cover_mm: null,
    bedding_and_overlay_material: null,
    cover_material: null,
  };

  if (!materialAndSize.trim()) return empty;

  const electricalFill = resolveElectricalAutoFill(serviceType, materialAndSize);
  if (electricalFill) return electricalFill;

  const rules = await fetchServiceSpecRules();
  const normalizedType = normalizeElectricalServiceType(serviceType) ?? serviceType;
  const rule =
    rules.find(
      (row) =>
        row.service_type === normalizedType && row.material_and_size === materialAndSize
    ) ??
    rules.find(
      (row) =>
        row.service_type === serviceType && row.material_and_size === materialAndSize
    ) ??
    DEFAULT_SPEC_RULES.find(
      (row) =>
        row.service_type === normalizedType && row.material_and_size === materialAndSize
    ) ??
    DEFAULT_SPEC_RULES.find(
      (row) =>
        row.service_type === serviceType && row.material_and_size === materialAndSize
    );

  if (!rule) return empty;

  const draft = applySpecRuleToBatchItem(
    {
      id: "temp",
      service_type: serviceType,
      zone: "",
      plan_rev: "",
      material_and_size: materialAndSize,
      length_between_structures_m: null,
      upstream_pit_number: "",
      downstream_pit_number: "",
      number_of_conduits: null,
      min_horizontal_sep_mm: null,
      min_vertical_sep_mm: null,
      min_bedding_mm: null,
      min_side_mm: null,
      min_overlay_mm: null,
      min_cover_mm: null,
      bedding_and_overlay_material: null,
      cover_material: null,
      map_x: 0.5,
      map_y: 0.5,
    },
    rule as ItcServiceSpecRule
  );

  return {
    min_horizontal_sep_mm: draft.min_horizontal_sep_mm,
    min_vertical_sep_mm: draft.min_vertical_sep_mm,
    min_bedding_mm: draft.min_bedding_mm,
    min_side_mm: draft.min_side_mm,
    min_overlay_mm: draft.min_overlay_mm,
    min_cover_mm: draft.min_cover_mm,
    bedding_and_overlay_material: draft.bedding_and_overlay_material,
    cover_material: draft.cover_material,
  };
}
