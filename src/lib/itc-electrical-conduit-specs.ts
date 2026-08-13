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

/** Standard trench / bedding values per electrical specification sheet sizes. */
export const ELECTRICAL_CONDUIT_SPEC_TABLE: ElectricalConduitSpecEntry[] = [
  // HV — 150mm, 200mm
  {
    category: "HV",
    diameter_mm: 150,
    material_and_size: "150mm HD Orange Conduit",
    min_horizontal_sep_mm: 350,
    min_vertical_sep_mm: 175,
    min_bedding_mm: 100,
    min_side_mm: 175,
    min_overlay_mm: 100,
    min_cover_mm: 650,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    category: "HV",
    diameter_mm: 200,
    material_and_size: "200mm HD Orange Conduit",
    min_horizontal_sep_mm: 400,
    min_vertical_sep_mm: 200,
    min_bedding_mm: 125,
    min_side_mm: 200,
    min_overlay_mm: 125,
    min_cover_mm: 700,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  // LV — 50mm, 65mm, 80mm, 100mm, 150mm
  {
    category: "LV",
    diameter_mm: 50,
    material_and_size: "50mm HD Orange Conduit",
    min_horizontal_sep_mm: 200,
    min_vertical_sep_mm: 100,
    min_bedding_mm: 50,
    min_side_mm: 100,
    min_overlay_mm: 50,
    min_cover_mm: 450,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    category: "LV",
    diameter_mm: 65,
    material_and_size: "65mm HD Orange Conduit",
    min_horizontal_sep_mm: 220,
    min_vertical_sep_mm: 110,
    min_bedding_mm: 55,
    min_side_mm: 110,
    min_overlay_mm: 55,
    min_cover_mm: 475,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    category: "LV",
    diameter_mm: 80,
    material_and_size: "80mm HD Orange Conduit",
    min_horizontal_sep_mm: 240,
    min_vertical_sep_mm: 120,
    min_bedding_mm: 60,
    min_side_mm: 120,
    min_overlay_mm: 60,
    min_cover_mm: 500,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    category: "LV",
    diameter_mm: 100,
    material_and_size: "100mm HD Orange Conduit",
    min_horizontal_sep_mm: 260,
    min_vertical_sep_mm: 130,
    min_bedding_mm: 65,
    min_side_mm: 130,
    min_overlay_mm: 65,
    min_cover_mm: 525,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    category: "LV",
    diameter_mm: 150,
    material_and_size: "150mm HD Orange Conduit",
    min_horizontal_sep_mm: 300,
    min_vertical_sep_mm: 150,
    min_bedding_mm: 75,
    min_side_mm: 150,
    min_overlay_mm: 75,
    min_cover_mm: 575,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  // Comms Other — 32mm, 50mm, 80mm, 100mm
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
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
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
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
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
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
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
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  // Comms Mains — 100mm
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
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
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

export function inferElectricalServiceTypeFromMaterial(
  materialAndSize: string
): ElectricalConduitCategory | null {
  const lower = materialAndSize.toLowerCase();
  if (lower.includes("mains")) return "Comms Mains";
  if (lower.includes("white")) return "Comms Other";
  const diameter = extractConduitDiameterMm(materialAndSize);
  if (diameter == null) return null;
  if (diameter >= 150 && lower.includes("orange")) return "HV";
  if (lower.includes("orange")) return "LV";
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
