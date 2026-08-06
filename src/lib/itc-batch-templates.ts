export const ITC_SERVICE_TYPES = [
  "HV",
  "LV",
  "Comms",
  "Sewer",
  "Stormwater",
  "Potable Water",
] as const;

export type ItcServiceType = (typeof ITC_SERVICE_TYPES)[number];

export const ITC_SERVICE_TYPE_COLORS: Record<string, string> = {
  HV: "#ea580c",
  LV: "#2563eb",
  Comms: "#9333ea",
  Sewer: "#78350f",
  Stormwater: "#0891b2",
  "Potable Water": "#0284c7",
};

export const ITC_SERVICE_TYPE_CODES: Record<string, string> = {
  HV: "HV",
  LV: "ELEC",
  Comms: "COMM",
  Sewer: "SEWR",
  Stormwater: "STM",
  "Potable Water": "POTW",
};

export interface ItcServiceSpecRule {
  id: string;
  service_type: string;
  material_and_size: string;
  min_horizontal_sep_mm: number | null;
  min_vertical_sep_mm: number | null;
  min_bedding_mm: number | null;
  min_side_mm: number | null;
  min_overlay_mm: number | null;
  min_cover_mm: number | null;
  bedding_and_overlay_material: string | null;
  cover_material: string | null;
}

export interface ItcBatchItemDraft {
  id: string;
  pin_id?: string | null;
  service_type: string;
  zone: string;
  plan_rev: string;
  material_and_size: string;
  length_between_structures_m: number | null;
  upstream_pit_number: string;
  downstream_pit_number: string;
  number_of_conduits: number | null;
  min_horizontal_sep_mm: number | null;
  min_vertical_sep_mm: number | null;
  min_bedding_mm: number | null;
  min_side_mm: number | null;
  min_overlay_mm: number | null;
  min_cover_mm: number | null;
  bedding_and_overlay_material: string | null;
  cover_material: string | null;
  map_x: number;
  map_y: number;
  itc_number?: string | null;
  generated_itc_id?: string | null;
  status?: "draft" | "generated" | "complete";
}

export interface ItcInspectionActivity {
  id: string;
  itc_id: string;
  activity_number: number;
  title: string;
  requires_photo: boolean;
  check_by: string | null;
  checked_date: string | null;
  comments: string | null;
  photo_url: string | null;
  sort_order: number;
}

export interface ItcCompletedDocument {
  itc_id: string;
  itc_number: string;
  project_no: string;
  package_name: string;
  zone: string;
  client_name: string;
  material_and_size: string;
  length_m: number | null;
  upstream_pit_number: string | null;
  downstream_pit_number: string | null;
  plan_rev: string | null;
  service_type: string;
  specs: {
    min_horizontal_sep_mm: number | null;
    min_vertical_sep_mm: number | null;
    min_bedding_mm: number | null;
    min_side_mm: number | null;
    min_overlay_mm: number | null;
    min_cover_mm: number | null;
    bedding_and_overlay_material: string | null;
    cover_material: string | null;
    number_of_conduits: number | null;
  };
  activities: ItcInspectionActivity[];
}

/** 14 standard inspection activities from itc complete.xlsx */
export const STANDARD_ITC_INSPECTION_ACTIVITIES = [
  { activity_number: 1, title: "Survey Setout", requires_photo: false },
  { activity_number: 2, title: "Grade & Depth", requires_photo: false },
  { activity_number: 3, title: "Trench Width", requires_photo: false },
  { activity_number: 4, title: "Foundation Inspect", requires_photo: true },
  { activity_number: 5, title: "Bedding + Haunch", requires_photo: false },
  { activity_number: 6, title: "Line & Grade", requires_photo: false },
  { activity_number: 7, title: "Joints & Fittings", requires_photo: false },
  { activity_number: 8, title: "Service Installation", requires_photo: false },
  { activity_number: 9, title: "Warning Tape / Cover", requires_photo: true },
  { activity_number: 10, title: "Backfill", requires_photo: false },
  { activity_number: 11, title: "Compaction Test", requires_photo: false },
  { activity_number: 12, title: "CCTV Inspection", requires_photo: false },
  { activity_number: 13, title: "Reinstatement", requires_photo: true },
  { activity_number: 14, title: "Final Sign-Off", requires_photo: false },
] as const;

export const DEFAULT_SPEC_RULES: Omit<ItcServiceSpecRule, "id">[] = [
  {
    service_type: "HV",
    material_and_size: "4 x 100mm HD Orange Conduit",
    min_horizontal_sep_mm: 300,
    min_vertical_sep_mm: 150,
    min_bedding_mm: 75,
    min_side_mm: 150,
    min_overlay_mm: 75,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "HV",
    material_and_size: "2 x 100mm HD Orange Conduit",
    min_horizontal_sep_mm: 300,
    min_vertical_sep_mm: 150,
    min_bedding_mm: 75,
    min_side_mm: 150,
    min_overlay_mm: 75,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "LV",
    material_and_size: "4 x 50mm HD Orange Conduit",
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
    service_type: "LV",
    material_and_size: "2 x 32mm HD Orange Conduit",
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
    service_type: "Comms",
    material_and_size: "2 x 50mm White Conduit",
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
    service_type: "Comms",
    material_and_size: "4 x 40mm White Conduit",
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
    service_type: "Sewer",
    material_and_size: "225mm PVC SN8",
    min_horizontal_sep_mm: 1000,
    min_vertical_sep_mm: 300,
    min_bedding_mm: 100,
    min_side_mm: 150,
    min_overlay_mm: 100,
    min_cover_mm: 900,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "Sewer",
    material_and_size: "300mm PVC SN8",
    min_horizontal_sep_mm: 1000,
    min_vertical_sep_mm: 300,
    min_bedding_mm: 100,
    min_side_mm: 150,
    min_overlay_mm: 100,
    min_cover_mm: 900,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "Stormwater",
    material_and_size: "450mm RCP Class 4",
    min_horizontal_sep_mm: 1000,
    min_vertical_sep_mm: 300,
    min_bedding_mm: 100,
    min_side_mm: 150,
    min_overlay_mm: 100,
    min_cover_mm: 900,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "Stormwater",
    material_and_size: "375mm RCP Class 4",
    min_horizontal_sep_mm: 1000,
    min_vertical_sep_mm: 300,
    min_bedding_mm: 100,
    min_side_mm: 150,
    min_overlay_mm: 100,
    min_cover_mm: 900,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "Potable Water",
    material_and_size: "125mm PN16 PE100",
    min_horizontal_sep_mm: 500,
    min_vertical_sep_mm: 200,
    min_bedding_mm: 75,
    min_side_mm: 150,
    min_overlay_mm: 75,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
  {
    service_type: "Potable Water",
    material_and_size: "180mm PN16 PE100",
    min_horizontal_sep_mm: 500,
    min_vertical_sep_mm: 200,
    min_bedding_mm: 75,
    min_side_mm: 150,
    min_overlay_mm: 75,
    min_cover_mm: 600,
    bedding_and_overlay_material: "Bed Sand",
    cover_material: "Roadbase",
  },
];

export function applySpecRuleToBatchItem(
  item: ItcBatchItemDraft,
  rule: ItcServiceSpecRule | Omit<ItcServiceSpecRule, "id">
): ItcBatchItemDraft {
  return {
    ...item,
    material_and_size: rule.material_and_size,
    min_horizontal_sep_mm: rule.min_horizontal_sep_mm,
    min_vertical_sep_mm: rule.min_vertical_sep_mm,
    min_bedding_mm: rule.min_bedding_mm,
    min_side_mm: rule.min_side_mm,
    min_overlay_mm: rule.min_overlay_mm,
    min_cover_mm: rule.min_cover_mm,
    bedding_and_overlay_material: rule.bedding_and_overlay_material,
    cover_material: rule.cover_material,
  };
}

export function buildItcNumber(
  zone: string,
  serviceType: string,
  sequence: number
): string {
  const zoneCode = zone.trim().toUpperCase().replace(/\s+/g, "") || "ZN";
  const serviceCode = ITC_SERVICE_TYPE_CODES[serviceType] ?? "SVC";
  return `${zoneCode}-${serviceCode}-${String(sequence).padStart(4, "0")}`;
}

export function groupBatchItemsByServiceType(
  items: ItcBatchItemDraft[]
): Array<{ serviceType: string; items: ItcBatchItemDraft[] }> {
  const order = [...ITC_SERVICE_TYPES];
  const map = new Map<string, ItcBatchItemDraft[]>();

  for (const item of items) {
    const list = map.get(item.service_type) ?? [];
    list.push(item);
    map.set(item.service_type, list);
  }

  const grouped = Array.from(map.entries()).map(([serviceType, rows]) => ({
    serviceType,
    items: rows,
  }));

  grouped.sort(
    (a, b) =>
      (order.indexOf(a.serviceType as ItcServiceType) === -1
        ? 99
        : order.indexOf(a.serviceType as ItcServiceType)) -
      (order.indexOf(b.serviceType as ItcServiceType) === -1
        ? 99
        : order.indexOf(b.serviceType as ItcServiceType))
  );

  return grouped;
}
