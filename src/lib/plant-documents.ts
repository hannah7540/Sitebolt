export type PlantDocumentCategory =
  | "service_maintenance"
  | "risk_safety"
  | "registration_insurance";

export interface PlantDocumentRecord {
  id: string;
  category: PlantDocumentCategory;
  name: string;
  file_url: string | null;
  uploaded_at: string;
  expiry_date: string | null;
}

export const PLANT_DOCUMENT_CATEGORIES: PlantDocumentCategory[] = [
  "service_maintenance",
  "risk_safety",
  "registration_insurance",
];

export const PLANT_DOCUMENT_CATEGORY_LABELS: Record<PlantDocumentCategory, string> = {
  service_maintenance: "Service & Maintenance History",
  risk_safety: "Risk Assessments & Safety Reviews",
  registration_insurance: "Registration & Insurance",
};

function normalizeText(value: unknown): string {
  if (value == null) return "";
  return String(value).trim();
}

function optionalText(value: unknown): string | null {
  const text = normalizeText(value);
  return text || null;
}

function isValidCategory(value: unknown): value is PlantDocumentCategory {
  return (
    typeof value === "string" &&
    PLANT_DOCUMENT_CATEGORIES.includes(value as PlantDocumentCategory)
  );
}

export function createEmptyPlantDocument(
  category: PlantDocumentCategory
): PlantDocumentRecord {
  return {
    id: crypto.randomUUID(),
    category,
    name: "",
    file_url: null,
    uploaded_at: new Date().toISOString(),
    expiry_date: null,
  };
}

export function parsePlantDocuments(raw: unknown): PlantDocumentRecord[] {
  if (!Array.isArray(raw)) return [];

  return raw
    .map((item) => {
      if (!item || typeof item !== "object") return null;
      const row = item as Record<string, unknown>;
      const category = row.category;
      if (!isValidCategory(category)) return null;

      return {
        id: normalizeText(row.id) || crypto.randomUUID(),
        category,
        name: normalizeText(row.name),
        file_url: optionalText(row.file_url),
        uploaded_at: normalizeText(row.uploaded_at) || new Date().toISOString(),
        expiry_date: optionalText(row.expiry_date),
      } satisfies PlantDocumentRecord;
    })
    .filter((entry): entry is PlantDocumentRecord => entry !== null);
}

export function serializePlantDocuments(
  entries: PlantDocumentRecord[]
): PlantDocumentRecord[] {
  return entries.map((entry) => ({
    id: entry.id,
    category: entry.category,
    name: entry.name.trim(),
    file_url: optionalText(entry.file_url),
    uploaded_at: entry.uploaded_at || new Date().toISOString(),
    expiry_date: optionalText(entry.expiry_date),
  }));
}

/** Hydrate plant_documents from legacy URL columns when JSONB is empty. */
export function hydratePlantDocumentsFromLegacy(row: {
  plant_documents?: unknown;
  service_history_doc_url?: string | null;
  plant_risk_assessment_doc_url?: string | null;
}): PlantDocumentRecord[] {
  const parsed = parsePlantDocuments(row.plant_documents);
  if (parsed.length > 0) return parsed;

  const entries: PlantDocumentRecord[] = [];
  const now = new Date().toISOString();

  if (row.service_history_doc_url?.trim()) {
    entries.push({
      id: crypto.randomUUID(),
      category: "service_maintenance",
      name: "Service history",
      file_url: row.service_history_doc_url.trim(),
      uploaded_at: now,
      expiry_date: null,
    });
  }

  if (row.plant_risk_assessment_doc_url?.trim()) {
    entries.push({
      id: crypto.randomUUID(),
      category: "risk_safety",
      name: "Plant risk assessment",
      file_url: row.plant_risk_assessment_doc_url.trim(),
      uploaded_at: now,
      expiry_date: null,
    });
  }

  return entries;
}

export type PlantOperationalStatus =
  | "available"
  | "allocated"
  | "maintenance"
  | "out_of_service";

export const PLANT_STATUS_OPTIONS: Array<{
  value: PlantOperationalStatus;
  label: string;
}> = [
  { value: "available", label: "Available" },
  { value: "allocated", label: "Allocated" },
  { value: "maintenance", label: "Maintenance" },
  { value: "out_of_service", label: "Out of Service" },
];

export const PLANT_OWNERSHIP_OPTIONS = [
  { value: "company", label: "Company" },
  { value: "subcontractor", label: "Subcontractor" },
] as const;

export function normalizePlantStatus(status: string | null | undefined): PlantOperationalStatus {
  const value = normalizeText(status).toLowerCase();
  if (value === "allocated") return "allocated";
  if (value === "maintenance") return "maintenance";
  if (value === "out_of_service" || value === "out of service") return "out_of_service";
  return "available";
}

export function getPlantStatusLabel(status: string | null | undefined): string {
  return (
    PLANT_STATUS_OPTIONS.find((option) => option.value === normalizePlantStatus(status))
      ?.label ?? "Available"
  );
}

export function getPlantPrestartStatusLabel(prestart: {
  has_defect: boolean;
  defect_comments?: string | null;
}): "Passed" | "Defect Identified" | "Out of Service" {
  if (!prestart.has_defect) return "Passed";
  const comments = prestart.defect_comments?.toLowerCase() ?? "";
  if (comments.includes("out of service") || comments.includes("tagged out")) {
    return "Out of Service";
  }
  return "Defect Identified";
}
