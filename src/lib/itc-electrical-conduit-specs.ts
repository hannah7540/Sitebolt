export interface ElectricalConduitAutoFill {
  min_horizontal_sep_mm: number;
  min_vertical_sep_mm: number;
  min_bedding_mm: number;
  min_side_mm: number;
  min_overlay_mm: number;
  min_cover_mm: number;
  bedding_and_overlay_material: string;
  cover_material: string;
}
export type ElectricalConduitCategory = "HV" | "LV" | "Comms Other" | "Comms Mains";

export interface ElectricalConduitSpecEntry {
  category: ElectricalConduitCategory;
  diameter_mm: number;
  material_and_size: string;
  min_horizontal_sep_mm: number;
  min_vertical_sep_mm: number;
  min_bedding_mm: number;
  min_side_mm: number;
  min_overlay_mm: number;
  min_cover_mm: number;
  bedding_and_overlay_material: string;
  cover_material: string;
}

export const ELECTRICAL_BEDDING_MATERIALS = ["Sand", "10mm Aggregate"] as const;
export const ELECTRICAL_COVER_MATERIALS = ["Sand", "10mm Aggregate"] as const;

/**
 * Hardcoded site specs for HV / LV conduits.
 * HV (150 / 200): H 300, V 100, bedding 105, side 70, overlay 150, cover 750.
 * LV (50 / 65): H 50, V 50, bedding 100, side 50, overlay 100, cover 600.
 * LV (80 / 100): H 50, V 50, bedding 100, side 50, overlay 150, cover 750.
 */
export const ELECTRICAL_CONDUIT_SPEC_TABLE: ElectricalConduitSpecEntry[] = [
  // HV — 150mm, 200mm
  {
    category: "HV",
    diameter_mm: 150,
    material_and_size: "150mm HD Orange Conduit",
    min_horizontal_sep_mm: 300,
    min_vertical_sep_mm: 100,
    min_bedding_mm: 105,
    min_side_mm: 70,
    min_overlay_mm: 150,
    min_cover_mm: 750,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "HV",
    diameter_mm: 200,
    material_and_size: "200mm HD Orange Conduit",
    min_horizontal_sep_mm: 300,
    min_vertical_sep_mm: 100,
    min_bedding_mm: 105,
    min_side_mm: 70,
    min_overlay_mm: 150,
    min_cover_mm: 750,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  // LV — 50mm, 65mm
  {
    category: "LV",
    diameter_mm: 50,
    material_and_size: "50mm HD Orange Conduit",
    min_horizontal_sep_mm: 50,
    min_vertical_sep_mm: 50,
    min_bedding_mm: 100,
    min_side_mm: 50,
    min_overlay_mm: 100,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "LV",
    diameter_mm: 65,
    material_and_size: "65mm HD Orange Conduit",
    min_horizontal_sep_mm: 50,
    min_vertical_sep_mm: 50,
    min_bedding_mm: 100,
    min_side_mm: 50,
    min_overlay_mm: 100,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  // LV — 80mm, 100mm
  {
    category: "LV",
    diameter_mm: 80,
    material_and_size: "80mm HD Orange Conduit",
    min_horizontal_sep_mm: 50,
    min_vertical_sep_mm: 50,
    min_bedding_mm: 100,
    min_side_mm: 50,
    min_overlay_mm: 150,
    min_cover_mm: 750,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "LV",
    diameter_mm: 100,
    material_and_size: "100mm HD Orange Conduit",
    min_horizontal_sep_mm: 50,
    min_vertical_sep_mm: 50,
    min_bedding_mm: 100,
    min_side_mm: 50,
    min_overlay_mm: 150,
    min_cover_mm: 750,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  // Comms Other — retained for non-HV/LV electrical services
  {
    category: "Comms Other",
    diameter_mm: 32,
    material_and_size: "32mm White Conduit",
    min_horizontal_sep_mm: 150,
    min_vertical_sep_mm: 75,
    min_bedding_mm: 50,
    min_side_mm: 75,
    min_overlay_mm: 50,
    min_cover_mm: 450,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "Comms Other",
    diameter_mm: 50,
    material_and_size: "50mm White Conduit",
    min_horizontal_sep_mm: 150,
    min_vertical_sep_mm: 75,
    min_bedding_mm: 50,
    min_side_mm: 75,
    min_overlay_mm: 50,
    min_cover_mm: 450,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "Comms Other",
    diameter_mm: 80,
    material_and_size: "80mm White Conduit",
    min_horizontal_sep_mm: 175,
    min_vertical_sep_mm: 85,
    min_bedding_mm: 55,
    min_side_mm: 85,
    min_overlay_mm: 55,
    min_cover_mm: 475,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "Comms Other",
    diameter_mm: 100,
    material_and_size: "100mm White Conduit",
    min_horizontal_sep_mm: 200,
    min_vertical_sep_mm: 100,
    min_bedding_mm: 60,
    min_side_mm: 100,
    min_overlay_mm: 60,
    min_cover_mm: 500,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
  {
    category: "Comms Mains",
    diameter_mm: 100,
    material_and_size: "100mm Comms Mains Conduit",
    min_horizontal_sep_mm: 250,
    min_vertical_sep_mm: 125,
    min_bedding_mm: 75,
    min_side_mm: 125,
    min_overlay_mm: 75,
    min_cover_mm: 550,
    bedding_and_overlay_material: "Sand",
    cover_material: "Sand",
  },
];

export const ELECTRICAL_CONDUIT_CATEGORIES: ElectricalConduitCategory[] = [
  "HV",
  "LV",
  "Comms Other",
  "Comms Mains",
];

/** Legacy batch pin label → lookup category. */
const LEGACY_SERVICE_TYPE_MAP: Record<string, ElectricalConduitCategory> = {
  HV: "HV",
  LV: "LV",
  Comms: "Comms Other",
  "Comms Other": "Comms Other",
  "Comms Mains": "Comms Mains",
};

export function normalizeElectricalServiceType(
  serviceType: string
): ElectricalConduitCategory | null {
  const trimmed = serviceType.trim();
  if (!trimmed) return null;
  if (trimmed in LEGACY_SERVICE_TYPE_MAP) {
    return LEGACY_SERVICE_TYPE_MAP[trimmed];
  }
  const upper = trimmed.toUpperCase();
  if (upper === "HV" || upper.includes("HIGH VOLTAGE")) return "HV";
  if (upper === "LV" || upper.includes("LOW VOLTAGE")) return "LV";
  if (ELECTRICAL_CONDUIT_CATEGORIES.includes(trimmed as ElectricalConduitCategory)) {
    return trimmed as ElectricalConduitCategory;
  }
  return null;
}

/** Extract the primary conduit diameter from a material label, e.g. "4 x 100mm HD Orange". */
export function extractConduitDiameterMm(materialAndSize: string): number | null {
  const match = materialAndSize.match(/(\d+)\s*mm/i);
  if (!match) return null;
  const value = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(value) ? value : null;
}

export function listElectricalConduitMaterials(
  category?: ElectricalConduitCategory
): string[] {
  const rows = category
    ? ELECTRICAL_CONDUIT_SPEC_TABLE.filter((row) => row.category === category)
    : ELECTRICAL_CONDUIT_SPEC_TABLE;
  return rows.map((row) => row.material_and_size);
}

export function lookupElectricalConduitSpec(
  serviceType: string,
  materialAndSize: string
): ElectricalConduitAutoFill | null {
  const category = normalizeElectricalServiceType(serviceType);
  if (!category) return null;

  const exact = ELECTRICAL_CONDUIT_SPEC_TABLE.find(
    (row) => row.category === category && row.material_and_size === materialAndSize
  );
  if (exact) return toAutoFillResult(exact);

  const diameter = extractConduitDiameterMm(materialAndSize);
  if (diameter == null) return null;

  const byDiameter = ELECTRICAL_CONDUIT_SPEC_TABLE.find(
    (row) => row.category === category && row.diameter_mm === diameter
  );
  return byDiameter ? toAutoFillResult(byDiameter) : null;
}

/**
 * Hardcoded HV/LV site rules by service + diameter (preferred path for ITC forms).
 */
export function lookupHardcodedHvLvConduitSpec(input: {
  service?: string | null;
  pipeSize?: string | null;
  pipeMaterial?: string | null;
}): ElectricalConduitAutoFill | null {
  const blob = [input.service, input.pipeMaterial, input.pipeSize]
    .filter(Boolean)
    .join(" ");
  const category =
    normalizeElectricalServiceType(input.service ?? "") ??
    normalizeElectricalServiceType(input.pipeMaterial ?? "") ??
    inferElectricalServiceTypeFromMaterial(blob);
  if (category !== "HV" && category !== "LV") return null;

  const diameter =
    extractConduitDiameterMm(input.pipeSize ?? "") ??
    extractConduitDiameterMm(blob);
  if (diameter == null) return null;

  const row = ELECTRICAL_CONDUIT_SPEC_TABLE.find(
    (entry) => entry.category === category && entry.diameter_mm === diameter
  );
  return row ? toAutoFillResult(row) : null;
}

export function inferElectricalServiceTypeFromMaterial(
  materialAndSize: string
): ElectricalConduitCategory | null {
  const lower = materialAndSize.toLowerCase();
  if (lower.includes("mains")) return "Comms Mains";
  if (lower.includes("white") || lower.includes("comms")) return "Comms Other";
  if (/\bhv\b/.test(lower) || lower.includes("high voltage")) return "HV";
  if (/\blv\b/.test(lower) || lower.includes("low voltage")) return "LV";
  const diameter = extractConduitDiameterMm(materialAndSize);
  if (diameter == null) return null;
  if ((diameter === 150 || diameter === 200) && (lower.includes("orange") || lower.includes("conduit"))) {
    return "HV";
  }
  if (lower.includes("orange") || lower.includes("conduit")) return "LV";
  return null;
}

function toAutoFillResult(entry: ElectricalConduitSpecEntry): ElectricalConduitAutoFill {
  return {
    min_horizontal_sep_mm: entry.min_horizontal_sep_mm,
    min_vertical_sep_mm: entry.min_vertical_sep_mm,
    min_bedding_mm: entry.min_bedding_mm,
    min_side_mm: entry.min_side_mm,
    min_overlay_mm: entry.min_overlay_mm,
    min_cover_mm: entry.min_cover_mm,
    bedding_and_overlay_material: entry.bedding_and_overlay_material,
    cover_material: entry.cover_material,
  };
}

/** Flat rules for itc_service_spec_rules seeding and DEFAULT_SPEC_RULES. */
export function electricalConduitSpecRulesForDb(): Array<{
  service_type: string;
  material_and_size: string;
  min_horizontal_sep_mm: number;
  min_vertical_sep_mm: number;
  min_bedding_mm: number;
  min_side_mm: number;
  min_overlay_mm: number;
  min_cover_mm: number;
  bedding_and_overlay_material: string;
  cover_material: string;
  sort_order: number;
}> {
  return ELECTRICAL_CONDUIT_SPEC_TABLE.map((row, index) => ({
    service_type: row.category,
    material_and_size: row.material_and_size,
    min_horizontal_sep_mm: row.min_horizontal_sep_mm,
    min_vertical_sep_mm: row.min_vertical_sep_mm,
    min_bedding_mm: row.min_bedding_mm,
    min_side_mm: row.min_side_mm,
    min_overlay_mm: row.min_overlay_mm,
    min_cover_mm: row.min_cover_mm,
    bedding_and_overlay_material: row.bedding_and_overlay_material,
    cover_material: row.cover_material,
    sort_order: index + 1,
  }));
}
