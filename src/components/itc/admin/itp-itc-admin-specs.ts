import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import { DEFAULT_SPEC_RULES } from "@/lib/itc-batch-templates";
import { fetchServiceSpecRules } from "@/lib/itc-batch-service";
import {
  ELECTRICAL_CONDUIT_SPEC_TABLE,
  inferElectricalServiceTypeFromMaterial,
  lookupElectricalConduitSpec,
  lookupHardcodedHvLvConduitSpec,
  normalizeElectricalServiceType,
} from "@/lib/itc-electrical-conduit-specs";
import { resolveSpecAutoFill } from "@/lib/itc-master-spec-service";
import type { AdminItcSpecValues, AdminItpTemplateKey } from "@/components/itc/admin/itp-itc-admin-types";

const SPEC_TABLES = [
  "drainage_dimension_specs",
  "electrical_conduit_specs",
  "hydraulic_pipe_specs",
] as const;

interface LocalSpecRow {
  sizeMm: number;
  materials: string[];
  source: string;
  min_bedding_mm: number;
  min_overlay_mm: number;
  min_side_clearance_mm: number;
  trench_width_mm?: number;
  joint_gap_min_mm?: number | null;
  joint_gap_max_mm?: number | null;
  joint_gap_range?: string | null;
}

const LOCAL_SPEC_ROWS: LocalSpecRow[] = [
  {
    sizeMm: 225,
    materials: ["blackmax", "stormpro"],
    source: "drainage_dimension_specs",
    min_bedding_mm: 150,
    min_overlay_mm: 150,
    min_side_clearance_mm: 150,
    trench_width_mm: 525,
    joint_gap_min_mm: 10,
    joint_gap_max_mm: 22,
  },
  {
    sizeMm: 100,
    materials: ["pvc"],
    source: "drainage_dimension_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 100,
    min_side_clearance_mm: 150,
    trench_width_mm: 400,
    joint_gap_min_mm: 6,
    joint_gap_max_mm: 15,
  },
  {
    sizeMm: 150,
    materials: ["pvc"],
    source: "drainage_dimension_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 100,
    min_side_clearance_mm: 150,
    trench_width_mm: 450,
    joint_gap_min_mm: 8,
    joint_gap_max_mm: 18,
  },
  {
    sizeMm: 225,
    materials: ["pvc"],
    source: "drainage_dimension_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 100,
    min_side_clearance_mm: 150,
    trench_width_mm: 525,
    joint_gap_min_mm: 10,
    joint_gap_max_mm: 22,
  },
  {
    sizeMm: 300,
    materials: ["pvc"],
    source: "drainage_dimension_specs",
    min_bedding_mm: 150,
    min_overlay_mm: 150,
    min_side_clearance_mm: 150,
    trench_width_mm: 600,
    joint_gap_min_mm: 12,
    joint_gap_max_mm: 25,
  },
  {
    sizeMm: 150,
    materials: ["hv", "hdpe", "conduit"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 105,
    min_overlay_mm: 150,
    min_side_clearance_mm: 70,
    trench_width_mm: 290,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 200,
    materials: ["hv", "hdpe", "conduit"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 105,
    min_overlay_mm: 150,
    min_side_clearance_mm: 70,
    trench_width_mm: 340,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 50,
    materials: ["lv", "conduit", "hdpe"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 100,
    min_side_clearance_mm: 50,
    trench_width_mm: 150,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 65,
    materials: ["lv", "conduit", "hdpe"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 100,
    min_side_clearance_mm: 50,
    trench_width_mm: 165,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 80,
    materials: ["lv", "conduit", "hdpe"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 150,
    min_side_clearance_mm: 50,
    trench_width_mm: 180,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 100,
    materials: ["lv", "conduit"],
    source: "electrical_conduit_specs",
    min_bedding_mm: 100,
    min_overlay_mm: 150,
    min_side_clearance_mm: 50,
    trench_width_mm: 200,
    joint_gap_range: "N/A (conduit)",
  },
  {
    sizeMm: 150,
    materials: ["pe100", "pe", "dicl"],
    source: "hydraulic_pipe_specs",
    min_bedding_mm: 75,
    min_overlay_mm: 75,
    min_side_clearance_mm: 150,
    trench_width_mm: 450,
    joint_gap_range: "Fusion / restrained (no gap)",
  },
  {
    sizeMm: 100,
    materials: ["pe", "pe100", "hdpe"],
    source: "hydraulic_pipe_specs",
    min_bedding_mm: 75,
    min_overlay_mm: 75,
    min_side_clearance_mm: 150,
    trench_width_mm: 400,
    joint_gap_range: "Fusion / restrained (no gap)",
  },
];

const PRESSURISED_TEMPLATE_KEYS: AdminItpTemplateKey[] = [
  "fire_inground",
  "fire_aboveground_booster",
  "potable_water_mains",
  "commissioning_pressure",
];

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function num(row: Record<string, unknown>, ...keys: string[]): number | null {
  for (const key of keys) {
    const value = row[key];
    if (value == null || value === "") continue;
    const parsed = Number(value);
    if (Number.isFinite(parsed)) return parsed;
  }
  return null;
}

function text(row: Record<string, unknown>, ...keys: string[]): string | null {
  for (const key of keys) {
    const value = row[key];
    if (value == null) continue;
    const next = String(value).trim();
    if (next) return next;
  }
  return null;
}

export function parsePipeDiameterMm(size: string | null | undefined): number | null {
  if (!size) return null;
  const match = size.match(/(\d+(?:\.\d+)?)/);
  if (!match) return null;
  const value = Number(match[1]);
  return Number.isFinite(value) ? value : null;
}

export function formatJointGapRange(
  minMm: number | null | undefined,
  maxMm: number | null | undefined,
  fallback?: string | null
): string | null {
  if (minMm != null && maxMm != null) return `${minMm}–${maxMm} mm`;
  if (minMm != null) return `${minMm} mm min`;
  if (maxMm != null) return `${maxMm} mm max`;
  return fallback ?? null;
}

function finishSpec(values: AdminItcSpecValues): AdminItcSpecValues {
  const diameter = parsePipeDiameterMm(values.pipe_size);
  const side = values.min_side_clearance_mm;
  const trench =
    values.trench_width_mm ??
    (diameter != null && side != null ? Math.round(diameter + side * 2) : null);
  return {
    ...values,
    trench_width_mm: trench,
    min_horizontal_sep_mm: values.min_horizontal_sep_mm ?? null,
    min_vertical_sep_mm: values.min_vertical_sep_mm ?? null,
    min_cover_mm: values.min_cover_mm ?? null,
    bedding_and_overlay_material: values.bedding_and_overlay_material ?? null,
    cover_material: values.cover_material ?? null,
    joint_gap_range: formatJointGapRange(
      values.joint_gap_min_mm,
      values.joint_gap_max_mm,
      values.joint_gap_range
    ),
  };
}

function specFromElectricalAutoFill(
  electrical: NonNullable<ReturnType<typeof lookupHardcodedHvLvConduitSpec>>,
  size: string,
  material: string
): AdminItcSpecValues {
  return finishSpec({
    source_table: "hardcoded_hv_lv_site_specs",
    pipe_size: size || null,
    pipe_material: material || null,
    min_bedding_mm: electrical.min_bedding_mm,
    min_overlay_mm: electrical.min_overlay_mm,
    min_side_clearance_mm: electrical.min_side_mm,
    trench_width_mm: null,
    joint_gap_min_mm: null,
    joint_gap_max_mm: null,
    joint_gap_range: "N/A (conduit)",
    min_horizontal_sep_mm: electrical.min_horizontal_sep_mm,
    min_vertical_sep_mm: electrical.min_vertical_sep_mm,
    min_cover_mm: electrical.min_cover_mm,
    bedding_and_overlay_material: electrical.bedding_and_overlay_material,
    cover_material: electrical.cover_material,
  });
}

function rowMatchesSelection(
  row: Record<string, unknown>,
  size: string,
  material: string,
  sizeMm: number | null
): boolean {
  const blob = [
    text(row, "material_and_size", "pipe_size", "size", "dn", "diameter_label", "label", "name"),
    text(row, "material", "pipe_material", "service", "service_type", "category"),
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();
  const sizeToken = size.replace(/\s+/g, "").toLowerCase();
  const materialToken = material.toLowerCase();
  const sizeOk =
    blob.includes(sizeToken) ||
    (sizeMm != null &&
      (blob.includes(`${sizeMm}mm`) ||
        blob.includes(`dn${sizeMm}`) ||
        num(row, "diameter_mm", "size_mm", "dn", "nominal_mm") === sizeMm));
  const materialOk =
    !materialToken ||
    blob.includes(materialToken) ||
    blob.includes(materialToken.replace("pe100", "pe"));
  return sizeOk && materialOk;
}

function specFromRow(
  row: Record<string, unknown>,
  table: string,
  size: string,
  material: string
): AdminItcSpecValues {
  const side =
    num(row, "min_side_clearance_mm", "min_side_mm", "side_clearance_mm", "min_side") ?? null;
  const gapMin = num(row, "joint_gap_min_mm", "min_joint_gap_mm", "joint_gap_min");
  const gapMax = num(row, "joint_gap_max_mm", "max_joint_gap_mm", "joint_gap_max");
  return finishSpec({
    source_table: table,
    pipe_size: size,
    pipe_material: material,
    min_bedding_mm: num(row, "min_bedding_mm", "bedding_mm", "min_bedding"),
    min_overlay_mm: num(row, "min_overlay_mm", "overlay_mm", "min_overlay"),
    min_side_clearance_mm: side,
    trench_width_mm: num(row, "trench_width_mm", "min_trench_width_mm", "trench_width"),
    joint_gap_min_mm: gapMin,
    joint_gap_max_mm: gapMax,
    joint_gap_range: text(row, "joint_gap_range", "joint_gap"),
    min_horizontal_sep_mm: num(row, "min_horizontal_sep_mm", "horizontal_sep_mm"),
    min_vertical_sep_mm: num(row, "min_vertical_sep_mm", "vertical_sep_mm"),
    min_cover_mm: num(row, "min_cover_mm", "cover_mm"),
    bedding_and_overlay_material: text(
      row,
      "bedding_and_overlay_material",
      "bedding_material"
    ),
    cover_material: text(row, "cover_material"),
  });
}

async function queryNamedSpecTable(
  table: string,
  size: string,
  material: string,
  sizeMm: number | null
): Promise<AdminItcSpecValues | null> {
  if (!isSupabaseConfigured()) return null;
  const { data, error } = await supabase.from(table).select("*").limit(250);
  if (error || !data?.length) return null;
  const match = data
    .map((row) => asRecord(row))
    .find((row) => rowMatchesSelection(row, size, material, sizeMm));
  return match ? specFromRow(match, table, size, material) : null;
}

function specFromLocal(size: string, material: string): AdminItcSpecValues | null {
  const sizeMm = parsePipeDiameterMm(size);
  if (sizeMm == null) return null;
  const materialKey = material.toLowerCase();
  const row =
    LOCAL_SPEC_ROWS.find(
      (item) => item.sizeMm === sizeMm && item.materials.includes(materialKey)
    ) ?? LOCAL_SPEC_ROWS.find((item) => item.sizeMm === sizeMm);
  if (!row) return null;
  return finishSpec({
    source_table: row.source,
    pipe_size: size,
    pipe_material: material,
    min_bedding_mm: row.min_bedding_mm,
    min_overlay_mm: row.min_overlay_mm,
    min_side_clearance_mm: row.min_side_clearance_mm,
    trench_width_mm: row.trench_width_mm ?? null,
    joint_gap_min_mm: row.joint_gap_min_mm ?? null,
    joint_gap_max_mm: row.joint_gap_max_mm ?? null,
    joint_gap_range: row.joint_gap_range ?? null,
    min_horizontal_sep_mm: null,
    min_vertical_sep_mm: null,
    min_cover_mm: null,
    bedding_and_overlay_material: null,
    cover_material: null,
  });
}

function disciplineForTemplate(templateKey: string | null | undefined): string {
  const key = String(templateKey ?? "").toLowerCase();
  if (key.includes("electrical") || key.includes("comms")) return "HV";
  if (key.includes("fire") || key.includes("potable") || key.includes("hydraulic")) {
    return "Potable Water";
  }
  if (key.includes("sewer")) return "Sewer";
  return "Stormwater";
}

export function isPressurisedAdminItc(input: {
  template_key?: string | null;
  pipe_material?: string | null;
  pipe_size?: string | null;
}): boolean {
  const key = String(input.template_key ?? "");
  if (PRESSURISED_TEMPLATE_KEYS.includes(key as AdminItpTemplateKey)) return true;
  const blob = `${key} ${input.pipe_material ?? ""} ${input.pipe_size ?? ""}`.toLowerCase();
  return (
    blob.includes("fire") ||
    blob.includes("potable") ||
    blob.includes("pe100") ||
    blob.includes("dicl") ||
    blob.includes("water mains")
  );
}

export function requiredPressureKpaForItc(input: {
  template_key?: string | null;
}): number {
  const key = String(input.template_key ?? "").toLowerCase();
  if (key.includes("fire") || key.includes("commissioning")) return 1700;
  return 1500;
}

export async function lookupAdminItcSpecs(input: {
  pipeSize: string;
  pipeMaterial: string;
  templateKey?: string | null;
  service?: string | null;
}): Promise<AdminItcSpecValues | null> {
  const size = input.pipeSize.trim();
  const material = input.pipeMaterial.trim();
  const service = (input.service ?? "").trim();
  if (!size && !material && !service) return null;
  const sizeMm = parsePipeDiameterMm(size);
  const serviceLabel = [size, material].filter(Boolean).join(" ");
  const discipline = disciplineForTemplate(input.templateKey);

  // Prefer hardcoded HV/LV site rules so conduit selection always shows fixed minimums.
  const hardcoded = lookupHardcodedHvLvConduitSpec({
    service: service || material,
    pipeSize: size,
    pipeMaterial: material,
  });
  if (hardcoded) {
    return specFromElectricalAutoFill(hardcoded, size, material || service);
  }

  for (const table of SPEC_TABLES) {
    const fromTable = await queryNamedSpecTable(table, size, material, sizeMm);
    if (fromTable) return fromTable;
  }

  const electricalType =
    normalizeElectricalServiceType(service) ??
    normalizeElectricalServiceType(material) ??
    inferElectricalServiceTypeFromMaterial(serviceLabel) ??
    (material.toLowerCase() === "hv" ? "HV" : null);
  if (electricalType) {
    const electrical = lookupElectricalConduitSpec(
      electricalType,
      serviceLabel || `${size} ${material}`.trim()
    );
    if (electrical) {
      return specFromElectricalAutoFill(electrical, size, material);
    }
    const byDiameter = ELECTRICAL_CONDUIT_SPEC_TABLE.find(
      (row) => row.category === electricalType && sizeMm != null && row.diameter_mm === sizeMm
    );
    if (byDiameter) {
      return specFromElectricalAutoFill(
        {
          min_horizontal_sep_mm: byDiameter.min_horizontal_sep_mm,
          min_vertical_sep_mm: byDiameter.min_vertical_sep_mm,
          min_bedding_mm: byDiameter.min_bedding_mm,
          min_side_mm: byDiameter.min_side_mm,
          min_overlay_mm: byDiameter.min_overlay_mm,
          min_cover_mm: byDiameter.min_cover_mm,
          bedding_and_overlay_material: byDiameter.bedding_and_overlay_material,
          cover_material: byDiameter.cover_material,
        },
        size,
        material
      );
    }
  }

  const auto = await resolveSpecAutoFill(discipline, serviceLabel);
  if (auto.min_bedding_mm != null || auto.min_side_mm != null) {
    return finishSpec({
      source_table: "itc_service_spec_rules",
      pipe_size: size,
      pipe_material: material,
      min_bedding_mm: auto.min_bedding_mm,
      min_overlay_mm: auto.min_overlay_mm,
      min_side_clearance_mm: auto.min_side_mm,
      trench_width_mm: null,
      joint_gap_min_mm: null,
      joint_gap_max_mm: null,
      joint_gap_range: null,
      min_horizontal_sep_mm: auto.min_horizontal_sep_mm ?? null,
      min_vertical_sep_mm: auto.min_vertical_sep_mm ?? null,
      min_cover_mm: auto.min_cover_mm ?? null,
      bedding_and_overlay_material: auto.bedding_and_overlay_material ?? null,
      cover_material: auto.cover_material ?? null,
    });
  }

  const rules = await fetchServiceSpecRules();
  const matchedRule =
    [...rules, ...DEFAULT_SPEC_RULES].find((row) => {
      const label = String(row.material_and_size ?? "").toLowerCase();
      return (
        (sizeMm != null && label.includes(String(sizeMm))) &&
        (label.includes(material.toLowerCase()) ||
          String(row.service_type).toLowerCase().includes(material.toLowerCase()) ||
          String(row.service_type).toLowerCase() === service.toLowerCase())
      );
    }) ?? null;
  if (matchedRule) {
    return finishSpec({
      source_table: "itc_service_spec_rules",
      pipe_size: size,
      pipe_material: material,
      min_bedding_mm: matchedRule.min_bedding_mm,
      min_overlay_mm: matchedRule.min_overlay_mm,
      min_side_clearance_mm: matchedRule.min_side_mm,
      trench_width_mm: null,
      joint_gap_min_mm: null,
      joint_gap_max_mm: null,
      joint_gap_range: null,
      min_horizontal_sep_mm: matchedRule.min_horizontal_sep_mm ?? null,
      min_vertical_sep_mm: matchedRule.min_vertical_sep_mm ?? null,
      min_cover_mm: matchedRule.min_cover_mm ?? null,
      bedding_and_overlay_material: matchedRule.bedding_and_overlay_material ?? null,
      cover_material: matchedRule.cover_material ?? null,
    });
  }

  return specFromLocal(size, material);
}

export function emptyAdminItcSpecValues(): AdminItcSpecValues {
  return {
    source_table: null,
    pipe_size: null,
    pipe_material: null,
    min_bedding_mm: null,
    min_overlay_mm: null,
    min_side_clearance_mm: null,
    trench_width_mm: null,
    joint_gap_min_mm: null,
    joint_gap_max_mm: null,
    joint_gap_range: null,
    min_horizontal_sep_mm: null,
    min_vertical_sep_mm: null,
    min_cover_mm: null,
    bedding_and_overlay_material: null,
    cover_material: null,
  };
}
