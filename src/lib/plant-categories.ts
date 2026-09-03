export const PLANT_EQUIPMENT_CATEGORIES = [
  "Excavator",
  "Loader",
  "Roller",
  "Truck",
  "Hydrovac",
] as const;

export type PlantEquipmentCategory = (typeof PLANT_EQUIPMENT_CATEGORIES)[number];

const CATEGORY_LOOKUP = new Map(
  PLANT_EQUIPMENT_CATEGORIES.map((category) => [category.toLowerCase(), category])
);

export function isPlantEquipmentCategory(
  value: string | null | undefined
): value is PlantEquipmentCategory {
  return Boolean(value && CATEGORY_LOOKUP.has(value.trim().toLowerCase()));
}

/** Parse stored category text or arrays into the predefined checkbox values. */
export function parsePlantCategories(
  value: string | string[] | null | undefined
): PlantEquipmentCategory[] {
  const selected = new Set<PlantEquipmentCategory>();

  const tokens = Array.isArray(value)
    ? value
    : String(value ?? "")
        .split(/[,/|]+/)
        .map((part) => part.trim())
        .filter(Boolean);

  for (const token of tokens) {
    const exact = CATEGORY_LOOKUP.get(token.toLowerCase());
    if (exact) selected.add(exact);
  }

  if (selected.size === 0 && typeof value === "string") {
    const haystack = value.toLowerCase();
    for (const category of PLANT_EQUIPMENT_CATEGORIES) {
      if (haystack.includes(category.toLowerCase())) {
        selected.add(category);
      }
    }
  }

  return PLANT_EQUIPMENT_CATEGORIES.filter((category) => selected.has(category));
}

export function serializePlantCategories(
  categories: readonly string[]
): string {
  return parsePlantCategories([...categories]).join(", ");
}

export function togglePlantCategory(
  current: readonly string[],
  category: PlantEquipmentCategory
): PlantEquipmentCategory[] {
  const selected = new Set(parsePlantCategories([...current]));
  if (selected.has(category)) {
    selected.delete(category);
  } else {
    selected.add(category);
  }
  return PLANT_EQUIPMENT_CATEGORIES.filter((item) => selected.has(item));
}
