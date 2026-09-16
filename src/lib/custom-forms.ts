import { supabase, isSupabaseConfigured, MASTER_PLANT_TABLE } from "./supabase";
import {
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  isSupabaseTableUnavailableError,
  toSupabaseRequestError,
} from "./supabase-errors";

export const CUSTOM_FORM_TEMPLATES_TABLE = "custom_form_templates";
export const CUSTOM_FORM_SUBMISSIONS_TABLE = "custom_form_submissions";

const MISSING_TABLE_MESSAGE =
  "Custom forms tables are missing. Run migration 164_custom_form_builder.sql in Supabase.";

export type CustomFormEntityType = "project" | "plant" | "worker" | "fleet" | "asset";

export type CustomFormFieldType =
  | "text"
  | "textarea"
  | "select"
  | "multiselect"
  | "image"
  | "document"
  | "signature";

export type CustomFormAssigneeRole =
  | "all"
  | "site_managers"
  | "operators"
  | "technicians";

export interface CustomFormField {
  id: string;
  type: CustomFormFieldType;
  label: string;
  helpText: string;
  required: boolean;
  options: string[];
}

export interface CustomFormTemplate {
  id: string;
  title: string;
  description: string | null;
  applies_to_projects: boolean;
  applies_to_workers: boolean;
  applies_to_plant: boolean;
  applies_to_fleet: boolean;
  applies_to_assets: boolean;
  assignee_role: CustomFormAssigneeRole;
  is_active: boolean;
  fields: CustomFormField[];
  created_at: string;
  updated_at: string;
}

export interface CustomFormAnswerValue {
  label: string;
  type: CustomFormFieldType;
  value: unknown;
}

export type CustomFormAnswers = Record<string, CustomFormAnswerValue>;

export interface CustomFormSubmission {
  id: string;
  template_id: string | null;
  template_title: string;
  project_id: string | null;
  plant_id: string | null;
  worker_id: string | null;
  fleet_id: string | null;
  asset_id: string | null;
  answers: CustomFormAnswers;
  submitted_by_name: string | null;
  submitted_by_id: string | null;
  signature_url: string | null;
  submitted_at: string;
}

export interface CustomFormTemplateInput {
  title: string;
  description?: string | null;
  applies_to_projects: boolean;
  applies_to_workers: boolean;
  applies_to_plant: boolean;
  applies_to_fleet: boolean;
  applies_to_assets: boolean;
  assignee_role: CustomFormAssigneeRole;
  is_active?: boolean;
  fields: CustomFormField[];
}

export interface CustomFormSubmissionInput {
  template_id: string;
  template_title: string;
  project_id?: string | null;
  plant_id?: string | null;
  worker_id?: string | null;
  fleet_id?: string | null;
  asset_id?: string | null;
  answers: CustomFormAnswers;
  submitted_by_name?: string | null;
  submitted_by_id?: string | null;
  signature_url?: string | null;
}

export const CUSTOM_FORM_FIELD_TYPES: Array<{
  type: CustomFormFieldType;
  label: string;
}> = [
  { type: "text", label: "Text Box" },
  { type: "textarea", label: "Text Area" },
  { type: "select", label: "Multiple Choice / Dropdown" },
  { type: "multiselect", label: "Multi-Select Checkboxes" },
  { type: "image", label: "Image Upload" },
  { type: "document", label: "Document Upload" },
  { type: "signature", label: "Signature Canvas" },
];

export const CUSTOM_FORM_ASSIGNEE_ROLES: Array<{
  value: CustomFormAssigneeRole;
  label: string;
}> = [
  { value: "all", label: "All" },
  { value: "site_managers", label: "Site Managers" },
  { value: "operators", label: "Operators" },
  { value: "technicians", label: "Technicians" },
];

export const CUSTOM_FORM_TARGET_KEYS = [
  { key: "applies_to_projects" as const, label: "Project", entity: "project" as const },
  { key: "applies_to_workers" as const, label: "Worker", entity: "worker" as const },
  { key: "applies_to_plant" as const, label: "Plant", entity: "plant" as const },
  { key: "applies_to_fleet" as const, label: "Fleet", entity: "fleet" as const },
  { key: "applies_to_assets" as const, label: "Asset", entity: "asset" as const },
];

function formatFormsError(error: { message?: string; code?: string }): string {
  const normalized = toSupabaseRequestError({
    message: error.message ?? "",
    code: error.code ?? "",
    details: "",
    hint: "",
  });
  if (
    isSupabaseRelationMissingError(normalized) ||
    isSupabaseTableUnavailableError(normalized) ||
    isSupabaseSchemaCacheError(normalized)
  ) {
    return MISSING_TABLE_MESSAGE;
  }
  return error.message || "Custom forms request failed.";
}

function asRecord(value: unknown): Record<string, unknown> {
  return value && typeof value === "object" && !Array.isArray(value)
    ? (value as Record<string, unknown>)
    : {};
}

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function bool(row: Record<string, unknown>, key: string): boolean {
  return row[key] === true;
}

export function createEmptyFormField(type: CustomFormFieldType = "text"): CustomFormField {
  return {
    id: crypto.randomUUID(),
    type,
    label: "",
    helpText: "",
    required: false,
    options: type === "select" || type === "multiselect" ? ["Option 1"] : [],
  };
}

export function normalizeFormFields(raw: unknown): CustomFormField[] {
  if (!Array.isArray(raw)) return [];
  return raw.map((item, index) => {
    const row = asRecord(item);
    const type = String(row.type ?? "text") as CustomFormFieldType;
    const options = Array.isArray(row.options)
      ? row.options.map((option) => String(option)).filter(Boolean)
      : [];
    return {
      id: str(row, "id") ?? `field_${index + 1}`,
      type: CUSTOM_FORM_FIELD_TYPES.some((itemType) => itemType.type === type)
        ? type
        : "text",
      label: str(row, "label") ?? `Field ${index + 1}`,
      helpText: str(row, "helpText") ?? str(row, "placeholder") ?? "",
      required: bool(row, "required"),
      options,
    };
  });
}

function normalizeAssigneeRole(value: unknown): CustomFormAssigneeRole {
  const role = String(value ?? "all");
  return CUSTOM_FORM_ASSIGNEE_ROLES.some((item) => item.value === role)
    ? (role as CustomFormAssigneeRole)
    : "all";
}

function normalizeTemplate(row: Record<string, unknown>): CustomFormTemplate {
  return {
    id: String(row.id),
    title: str(row, "title") ?? "Untitled form",
    description: str(row, "description"),
    applies_to_projects: bool(row, "applies_to_projects"),
    applies_to_workers: bool(row, "applies_to_workers"),
    applies_to_plant: bool(row, "applies_to_plant"),
    applies_to_fleet: bool(row, "applies_to_fleet"),
    applies_to_assets: bool(row, "applies_to_assets"),
    assignee_role: normalizeAssigneeRole(row.assignee_role),
    is_active: row.is_active !== false,
    fields: normalizeFormFields(row.fields),
    created_at: String(row.created_at ?? ""),
    updated_at: String(row.updated_at ?? row.created_at ?? ""),
  };
}

function normalizeAnswers(raw: unknown): CustomFormAnswers {
  const source = asRecord(raw);
  const next: CustomFormAnswers = {};
  for (const [key, value] of Object.entries(source)) {
    const row = asRecord(value);
    next[key] = {
      label: str(row, "label") ?? key,
      type: (str(row, "type") as CustomFormFieldType) ?? "text",
      value: row.value ?? value,
    };
  }
  return next;
}

function normalizeSubmission(row: Record<string, unknown>): CustomFormSubmission {
  return {
    id: String(row.id),
    template_id: str(row, "template_id"),
    template_title: str(row, "template_title") ?? "Form",
    project_id: str(row, "project_id"),
    plant_id: str(row, "plant_id"),
    worker_id: str(row, "worker_id"),
    fleet_id: str(row, "fleet_id"),
    asset_id: str(row, "asset_id"),
    answers: normalizeAnswers(row.answers),
    submitted_by_name: str(row, "submitted_by_name"),
    submitted_by_id: str(row, "submitted_by_id"),
    signature_url: str(row, "signature_url"),
    submitted_at: String(row.submitted_at ?? ""),
  };
}

export function templateAppliesTo(
  template: CustomFormTemplate,
  entityType: CustomFormEntityType
): boolean {
  if (entityType === "project") return template.applies_to_projects;
  if (entityType === "worker") return template.applies_to_workers;
  if (entityType === "plant") return template.applies_to_plant;
  if (entityType === "fleet") return template.applies_to_fleet;
  return template.applies_to_assets;
}

export function templateTargetLabels(template: CustomFormTemplate): string[] {
  return CUSTOM_FORM_TARGET_KEYS.filter((item) => template[item.key]).map(
    (item) => item.label
  );
}

export async function fetchCustomFormTemplates(): Promise<{
  data: CustomFormTemplate[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }
  const { data, error } = await supabase
    .from(CUSTOM_FORM_TEMPLATES_TABLE)
    .select("*")
    .order("created_at", { ascending: false });
  if (error) return { data: [], error: formatFormsError(error) };
  return {
    data: (data ?? []).map((row) => normalizeTemplate(row as Record<string, unknown>)),
    error: null,
  };
}

export async function saveCustomFormTemplate(
  input: CustomFormTemplateInput,
  id?: string | null
): Promise<{ data: CustomFormTemplate | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }
  const payload = {
    title: input.title.trim(),
    description: input.description?.trim() || null,
    applies_to_projects: input.applies_to_projects,
    applies_to_workers: input.applies_to_workers,
    applies_to_plant: input.applies_to_plant,
    applies_to_fleet: input.applies_to_fleet,
    applies_to_assets: input.applies_to_assets,
    assignee_role: input.assignee_role,
    is_active: input.is_active ?? true,
    fields: input.fields,
    updated_at: new Date().toISOString(),
  };
  const query = id
    ? supabase.from(CUSTOM_FORM_TEMPLATES_TABLE).update(payload).eq("id", id)
    : supabase.from(CUSTOM_FORM_TEMPLATES_TABLE).insert(payload);
  const { data, error } = await query.select("*").maybeSingle();
  if (error) return { data: null, error: formatFormsError(error) };
  return {
    data: data ? normalizeTemplate(data as Record<string, unknown>) : null,
    error: null,
  };
}

export async function duplicateCustomFormTemplate(
  template: CustomFormTemplate
): Promise<{ data: CustomFormTemplate | null; error: string | null }> {
  return saveCustomFormTemplate({
    title: `${template.title} (Copy)`,
    description: template.description,
    applies_to_projects: template.applies_to_projects,
    applies_to_workers: template.applies_to_workers,
    applies_to_plant: template.applies_to_plant,
    applies_to_fleet: template.applies_to_fleet,
    applies_to_assets: template.applies_to_assets,
    assignee_role: template.assignee_role,
    is_active: template.is_active,
    fields: template.fields.map((field) => ({ ...field, id: crypto.randomUUID() })),
  });
}

export async function deleteCustomFormTemplate(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured." };
  const { error } = await supabase.from(CUSTOM_FORM_TEMPLATES_TABLE).delete().eq("id", id);
  if (error) return { error: formatFormsError(error) };
  return { error: null };
}

async function fetchPlantIdsForProject(projectId: string): Promise<string[]> {
  const { data, error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .select("id, assigned_project_id, project_id, current_project_id");
  if (error || !data?.length) return [];
  return data
    .filter((row) => {
      const record = row as Record<string, unknown>;
      return (
        String(record.assigned_project_id ?? "") === projectId ||
        String(record.project_id ?? "") === projectId ||
        String(record.current_project_id ?? "") === projectId
      );
    })
    .map((row) => String((row as { id: string }).id))
    .filter(Boolean);
}

function sortSubmissions(rows: CustomFormSubmission[]): CustomFormSubmission[] {
  return [...rows].sort((a, b) => {
    const aTime = new Date(a.submitted_at).getTime();
    const bTime = new Date(b.submitted_at).getTime();
    return bTime - aTime;
  });
}

export async function fetchCustomFormSubmissions(filter: {
  projectId?: string | null;
  plantId?: string | null;
  workerId?: string | null;
  fleetId?: string | null;
  assetId?: string | null;
  includeAssignedPlant?: boolean;
}): Promise<{ data: CustomFormSubmission[]; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: [], error: "Supabase is not configured." };
  }

  const mapById = new Map<string, CustomFormSubmission>();

  const mergeRows = (rows: unknown[] | null) => {
    for (const row of rows ?? []) {
      const submission = normalizeSubmission(row as Record<string, unknown>);
      mapById.set(submission.id, submission);
    }
  };

  if (filter.projectId && filter.includeAssignedPlant) {
    const plantIds = await fetchPlantIdsForProject(filter.projectId);
    const projectQuery = supabase
      .from(CUSTOM_FORM_SUBMISSIONS_TABLE)
      .select("*")
      .eq("project_id", filter.projectId)
      .order("submitted_at", { ascending: false });
    const plantQuery = plantIds.length
      ? supabase
          .from(CUSTOM_FORM_SUBMISSIONS_TABLE)
          .select("*")
          .in("plant_id", plantIds)
          .order("submitted_at", { ascending: false })
      : null;
    const [projectResult, plantResult] = await Promise.all([
      projectQuery,
      plantQuery ?? Promise.resolve({ data: [], error: null }),
    ]);
    if (projectResult.error) return { data: [], error: formatFormsError(projectResult.error) };
    if (plantResult.error) return { data: [], error: formatFormsError(plantResult.error) };
    mergeRows(projectResult.data);
    mergeRows(plantResult.data);
    return { data: sortSubmissions([...mapById.values()]), error: null };
  }

  let query = supabase
    .from(CUSTOM_FORM_SUBMISSIONS_TABLE)
    .select("*")
    .order("submitted_at", { ascending: false });

  if (filter.plantId) query = query.eq("plant_id", filter.plantId);
  if (filter.workerId) query = query.eq("worker_id", filter.workerId);
  if (filter.fleetId) query = query.eq("fleet_id", filter.fleetId);
  if (filter.assetId) query = query.eq("asset_id", filter.assetId);
  if (filter.projectId) query = query.eq("project_id", filter.projectId);

  const { data, error } = await query;
  if (error) return { data: [], error: formatFormsError(error) };
  mergeRows(data);
  return { data: sortSubmissions([...mapById.values()]), error: null };
}

export async function insertCustomFormSubmission(
  input: CustomFormSubmissionInput
): Promise<{ data: CustomFormSubmission | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { data: null, error: "Supabase is not configured." };
  }
  const { data, error } = await supabase
    .from(CUSTOM_FORM_SUBMISSIONS_TABLE)
    .insert({
      template_id: input.template_id,
      template_title: input.template_title,
      project_id: input.project_id ?? null,
      plant_id: input.plant_id ?? null,
      worker_id: input.worker_id ?? null,
      fleet_id: input.fleet_id ?? null,
      asset_id: input.asset_id ?? null,
      answers: input.answers,
      submitted_by_name: input.submitted_by_name ?? null,
      submitted_by_id: input.submitted_by_id ?? null,
      signature_url: input.signature_url ?? null,
      submitted_at: new Date().toISOString(),
    })
    .select("*")
    .maybeSingle();
  if (error) return { data: null, error: formatFormsError(error) };
  return {
    data: data ? normalizeSubmission(data as Record<string, unknown>) : null,
    error: null,
  };
}

export function formatFormDate(iso: string | null | undefined): string {
  if (!iso) return "—";
  const date = new Date(iso);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
    hour: "2-digit",
    minute: "2-digit",
  });
}

export function emptyTemplateDraft(): CustomFormTemplateInput {
  return {
    title: "",
    description: "",
    applies_to_projects: false,
    applies_to_workers: false,
    applies_to_plant: false,
    applies_to_fleet: false,
    applies_to_assets: false,
    assignee_role: "all",
    is_active: true,
    fields: [createEmptyFormField("text")],
  };
}

export function asStringList(value: unknown): string[] {
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        const row = asRecord(item);
        return str(row, "url") ?? str(row, "name") ?? "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return [];
}

export function asNamedFileList(
  value: unknown
): Array<{ name: string; url: string }> {
  if (!Array.isArray(value)) {
    if (typeof value === "string" && value.trim()) {
      return [{ name: "Attachment", url: value.trim() }];
    }
    return [];
  }
  return value
    .map((item) => {
      if (typeof item === "string" && item.trim()) {
        return { name: "Attachment", url: item.trim() };
      }
      const row = asRecord(item);
      const url = str(row, "url") ?? "";
      if (!url) return null;
      return { name: str(row, "name") ?? "Attachment", url };
    })
    .filter((item): item is { name: string; url: string } => Boolean(item));
}

export function isAnswerFilled(field: CustomFormField, value: unknown): boolean {
  if (field.type === "multiselect") return asStringList(value).length > 0;
  if (field.type === "image") return asStringList(value).length > 0;
  if (field.type === "document") return asNamedFileList(value).length > 0;
  if (field.type === "signature") return typeof value === "string" && value.trim().length > 0;
  if (typeof value === "string") return value.trim().length > 0;
  return value != null && String(value).trim().length > 0;
}

export function formatAnswerForDisplay(value: unknown, type: CustomFormFieldType): string {
  if (type === "multiselect") return asStringList(value).join(", ") || "—";
  if (type === "image") {
    const count = asStringList(value).length;
    return count ? `${count} image${count === 1 ? "" : "s"}` : "—";
  }
  if (type === "document") {
    const files = asNamedFileList(value);
    return files.length ? files.map((file) => file.name).join(", ") : "—";
  }
  if (type === "signature") return typeof value === "string" && value.trim() ? "Signed" : "—";
  if (typeof value === "string" && value.trim()) return value.trim();
  return "—";
}
