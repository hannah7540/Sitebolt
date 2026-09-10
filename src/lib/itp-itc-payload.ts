import {
  isSchemaCacheColumnError,
  parseMissingColumnFromError,
  sanitizeWritePayload,
} from "@/lib/form-payload-utils";
import {
  isSupabaseMissingColumnError,
  isSupabaseSchemaOrConstraintError,
} from "@/lib/supabase-errors";

const UI_ONLY_KEYS = new Set([
  "isEditing",
  "tempId",
  "isSubmitting",
  "reactKey",
  "key",
  "__tempId",
  "loading",
  "saving",
  "error",
  "dirty",
  "touched",
  "selected",
  "expanded",
]);

const PHOTO_KEYS = new Set(["photos", "photo_urls", "attachments", "evidence_urls"]);
const CHECKLIST_KEYS = new Set(["checklist", "items"]);
const SIGNATURE_KEYS = new Set(["signatures", "signoffs"]);

export const PROJECT_ITPS_TABLE = "project_itps";
export const PROJECT_ITCS_TABLE = "project_itcs";
export const PROJECT_ITP_ITEMS_TABLE = "project_itp_items";
export const ITC_SIGNOFFS_TABLE = "itc_signoffs";
export const ITC_CHECKLIST_ENTRIES_TABLE = "itc_checklist_entries";

export function asRecord(value: unknown): Record<string, unknown> {
  if (value && typeof value === "object" && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

export function asUnknownArray(value: unknown): unknown[] {
  return Array.isArray(value) ? value : [];
}

/** Merge catch-all JSON onto a fetched row and drop transient UI keys. */
export function hydrateItpItcRow(row: Record<string, unknown>): Record<string, unknown> {
  const formData = asRecord(row.form_data);
  const next: Record<string, unknown> = { ...row };

  for (const key of UI_ONLY_KEYS) {
    delete next[key];
  }

  for (const [key, value] of Object.entries(formData)) {
    if (UI_ONLY_KEYS.has(key)) continue;
    if (next[key] == null) next[key] = value;
  }

  next.form_data = formData;
  if (!Array.isArray(next.checklist) && Array.isArray(formData.checklist)) {
    next.checklist = formData.checklist;
  }
  if (!Array.isArray(next.items) && Array.isArray(formData.items)) {
    next.items = formData.items;
  }
  if (!Array.isArray(next.photos) && (Array.isArray(formData.photos) || Array.isArray(formData.photo_urls))) {
    next.photos = formData.photos ?? formData.photo_urls;
  }
  if (!Array.isArray(next.signatures) && Array.isArray(formData.signatures)) {
    next.signatures = formData.signatures;
  }
  if (!Array.isArray(next.signoffs) && Array.isArray(formData.signoffs)) {
    next.signoffs = formData.signoffs;
  }

  return next;
}

export const PROJECT_ITP_COLUMNS = [
  "id",
  "project_id",
  "itp_number",
  "title",
  "revision",
  "trade_category",
  "subcontractor_name",
  "location_area",
  "status",
  "template_key",
  "form_data",
  "completed_at",
  "created_at",
  "updated_at",
] as const;

export const PROJECT_ITP_ITEM_COLUMNS = [
  "id",
  "itp_id",
  "item_number",
  "description",
  "acceptance_criteria",
  "point_type",
  "status",
  "photo_urls",
  "evidence_urls",
  "photos",
  "attachments",
  "checklist",
  "items",
  "signatures",
  "signoffs",
  "inspector_name",
  "signed_off_at",
  "signature_url",
  "form_data",
  "sort_order",
  "created_at",
  "updated_at",
] as const;

export const PROJECT_ITC_COLUMNS = [
  "id",
  "project_id",
  "itc_number",
  "zone_id",
  "zone_code",
  "building",
  "service_discipline",
  "trade_discipline",
  "service_type",
  "material_colour",
  "start_location",
  "end_location",
  "conduits",
  "length_m",
  "length_of_run_m",
  "number_of_tees",
  "redline_markup_url",
  "gps_lat",
  "gps_lng",
  "form_data",
  "checklist",
  "items",
  "photos",
  "attachments",
  "signatures",
  "signoffs",
  "status",
  "progress_percent",
  "map_x",
  "map_y",
  "pin_x",
  "pin_y",
  "trench_group",
  "drawing_rev",
  "assigned_to",
  "assigned_name",
  "has_open_cr",
  "package_name",
  "client_name",
  "subcontractor_name",
  "material_and_size",
  "upstream_pit_number",
  "downstream_pit_number",
  "number_of_conduits",
  "min_horizontal_sep_mm",
  "min_vertical_sep_mm",
  "min_bedding_mm",
  "min_side_mm",
  "min_overlay_mm",
  "min_cover_mm",
  "bedding_and_overlay_material",
  "cover_material",
  "batch_item_id",
  "title",
  "description",
  "completed_by",
  "completed_at",
  "created_at",
  "updated_at",
] as const;

export const ITC_SIGNOFF_COLUMNS = [
  "id",
  "itc_id",
  "step_key",
  "step_index",
  "author_id",
  "author_name",
  "comments",
  "field_data",
  "form_data",
  "signature_url",
  "signatures",
  "signoffs",
  "status",
  "submitted_at",
  "signed_at",
  "signed_by_worker_id",
  "verified_by",
  "verified_by_name",
  "verified_at",
  "created_at",
  "updated_at",
] as const;

export const ITC_CHECKLIST_ENTRY_COLUMNS = [
  "id",
  "itc_id",
  "item_key",
  "item_label",
  "is_mandatory",
  "is_checked",
  "notes",
  "photo_url",
  "photos",
  "attachments",
  "worker_id",
  "worker_name",
  "sort_order",
  "form_data",
  "created_at",
  "updated_at",
] as const;

export const ITC_PHOTO_COLUMNS = [
  "id",
  "itc_id",
  "slot_key",
  "photo_url",
  "photos",
  "not_required",
  "not_required_reason",
  "gps_lat",
  "gps_lng",
  "captured_at",
  "uploaded_by",
  "form_data",
  "created_at",
  "updated_at",
] as const;

export const ITC_STEP_PHOTO_COLUMNS = [
  "id",
  "itc_id",
  "step_key",
  "activity_number",
  "photo_url",
  "gps_lat",
  "gps_lng",
  "captured_at",
  "uploaded_by",
  "uploaded_by_name",
  "is_approved_for_export",
  "approved_by",
  "approved_by_name",
  "approved_at",
  "form_data",
  "created_at",
  "updated_at",
] as const;

export type ItpItcWriteError = {
  message: string;
  code?: string;
} | null;

function asStringArray(value: unknown): string[] | null {
  if (value == null) return [];
  if (Array.isArray(value)) {
    return value
      .map((item) => {
        if (typeof item === "string") return item.trim();
        if (item && typeof item === "object") {
          const record = item as Record<string, unknown>;
          const url = record.url ?? record.src ?? record.photo_url ?? record.signature_url;
          return typeof url === "string" ? url.trim() : "";
        }
        return "";
      })
      .filter(Boolean);
  }
  if (typeof value === "string" && value.trim()) return [value.trim()];
  return null;
}

function mergeFormData(
  existing: unknown,
  extra: Record<string, unknown>
): Record<string, unknown> {
  const base =
    existing && typeof existing === "object" && !Array.isArray(existing)
      ? { ...(existing as Record<string, unknown>) }
      : {};
  return { ...base, ...extra };
}

export function isItpItcSchemaError(error: ItpItcWriteError | { message?: string; code?: string } | null): boolean {
  if (!error?.message) return false;
  const message = error.message.toLowerCase();
  if (
    isSupabaseSchemaOrConstraintError({
      code: error.code ?? "",
      message: error.message,
      details: "",
      hint: "",
    })
  ) {
    return true;
  }
  return (
    isSupabaseMissingColumnError({
      code: error.code ?? "",
      message: error.message,
      details: "",
      hint: "",
    }) ||
    isSchemaCacheColumnError(error.message) ||
    message.includes("schema cache") ||
    message.includes("column")
  );
}

export function sanitizeItpItcWritePayload(
  raw: Record<string, unknown>,
  allowedColumns: readonly string[],
  options?: { complete?: boolean }
): Record<string, unknown> {
  const allowed = new Set(allowedColumns);
  const overflow: Record<string, unknown> = {};
  const next: Record<string, unknown> = {};

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (UI_ONLY_KEYS.has(key)) continue;

    let mappedKey = key;
    let mappedValue: unknown = value;

    if (PHOTO_KEYS.has(key)) {
      mappedValue = asStringArray(value) ?? value;
      if (key === "photos" && allowed.has("photo_urls") && !("photo_urls" in raw)) {
        mappedKey = allowed.has("photos") ? "photos" : "photo_urls";
      }
    } else if (CHECKLIST_KEYS.has(key)) {
      mappedValue = Array.isArray(value) ? value : value;
    } else if (SIGNATURE_KEYS.has(key)) {
      mappedValue = Array.isArray(value) ? value : asStringArray(value) ?? value;
    } else if (key === "signature_url" && typeof value === "string") {
      mappedValue = value.trim() || null;
    }

    if (allowed.has(mappedKey)) {
      next[mappedKey] = mappedValue;
      continue;
    }

    if (key === "photo_urls" && allowed.has("photos")) {
      next.photos = asStringArray(value) ?? value;
      continue;
    }
    if (key === "photos" && allowed.has("photo_urls")) {
      next.photo_urls = asStringArray(value) ?? value;
      continue;
    }
    if (key === "signature_url" && allowed.has("signatures")) {
      const urls = asStringArray(value);
      if (urls) next.signatures = urls;
      continue;
    }

    overflow[key] = mappedValue;
  }

  if (allowed.has("form_data")) {
    next.form_data = mergeFormData(next.form_data ?? raw.form_data, overflow);
  }

  if (options?.complete) {
    if (allowed.has("status")) {
      next.status = "completed";
    }
    if (allowed.has("completed_at")) {
      next.completed_at =
        typeof next.completed_at === "string" && next.completed_at
          ? next.completed_at
          : new Date().toISOString();
    } else if (allowed.has("form_data")) {
      next.form_data = mergeFormData(next.form_data, {
        completed_at: new Date().toISOString(),
        status: "completed",
      });
    }
  }

  return sanitizeWritePayload(
    Object.fromEntries(Object.entries(next).filter(([, value]) => value !== undefined))
  );
}

export function packColumnIntoFormData(
  payload: Record<string, unknown>,
  column: string
): Record<string, unknown> {
  if (!(column in payload) || column === "form_data") return payload;
  const { [column]: removed, ...rest } = payload;
  return {
    ...rest,
    form_data: mergeFormData(rest.form_data, { [column]: removed }),
  };
}

function fallbackStatusForConstraint(
  payload: Record<string, unknown>,
  errorMessage: string
): Record<string, unknown> | null {
  const lower = errorMessage.toLowerCase();
  if (!lower.includes("status") && !lower.includes("check constraint")) {
    return null;
  }
  const status = payload.status;
  if (status === "completed") {
    return { ...payload, status: "complete" };
  }
  if (status === "complete") {
    return { ...payload, status: "submitted" };
  }
  return null;
}

export async function retryItpItcWrite<T>(
  logLabel: string,
  initialPayload: Record<string, unknown>,
  write: (payload: Record<string, unknown>) => Promise<{
    data?: T;
    error: ItpItcWriteError;
  }>
): Promise<{ data?: T; error: string | null }> {
  let payload = { ...initialPayload };
  let lastError: ItpItcWriteError = null;

  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await write(payload);
      if (!result.error) {
        return { data: result.data, error: null };
      }

      lastError = result.error;
      const message = result.error.message;

      if (!isItpItcSchemaError(result.error)) {
        return { error: message };
      }

      console.error("ITP/ITC Submission Payload Error:", logLabel, result.error, payload);

      const constraintFallback = fallbackStatusForConstraint(payload, message);
      if (
        constraintFallback &&
        constraintFallback.status !== payload.status
      ) {
        payload = constraintFallback;
        continue;
      }

      const missingColumn = parseMissingColumnFromError(message);
      if (missingColumn && missingColumn in payload && missingColumn !== "form_data") {
        payload = packColumnIntoFormData(payload, missingColumn);
        continue;
      }

      if ("form_data" in payload) {
        const core = new Set(["id", "project_id", "itp_id", "itc_id", "status", "updated_at", "form_data"]);
        const extras: Record<string, unknown> = {};
        const slim: Record<string, unknown> = {};
        for (const [key, value] of Object.entries(payload)) {
          if (core.has(key)) {
            slim[key] = value;
          } else {
            extras[key] = value;
          }
        }
        if (Object.keys(extras).length === 0) {
          return { error: message };
        }
        payload = {
          ...slim,
          form_data: mergeFormData(slim.form_data, extras),
        };
        continue;
      }

      return { error: message };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Network error while saving. Please try again.",
    };
  }

  return {
    error: lastError?.message ?? "Failed to save ITP/ITC after schema fallback.",
  };
}

export async function retryItpItcWriteMany(
  logLabel: string,
  rows: Record<string, unknown>[],
  write: (rows: Record<string, unknown>[]) => Promise<{ error: ItpItcWriteError }>
): Promise<{ error: string | null }> {
  let current = rows.map((row) => ({ ...row }));
  try {
    for (let attempt = 0; attempt < 12; attempt += 1) {
      const result = await write(current);
      if (!result.error) return { error: null };

      if (!isItpItcSchemaError(result.error)) {
        return { error: result.error.message };
      }

      console.error("ITP/ITC Submission Payload Error:", logLabel, result.error, current);

      const missingColumn = parseMissingColumnFromError(result.error.message);
      if (missingColumn) {
        current = current.map((row) => packColumnIntoFormData(row, missingColumn));
        continue;
      }

      return { error: result.error.message };
    }
  } catch (error) {
    return {
      error:
        error instanceof Error
          ? error.message
          : "Network error while saving. Please try again.",
    };
  }

  return { error: "Failed to save ITP/ITC rows after schema fallback." };
}

export const ITC_NETWORK_ERROR = "Network error while saving. Please try again.";
export const ITP_ITC_COMPLETED_TOAST = "ITP/ITC completed and saved successfully.";
