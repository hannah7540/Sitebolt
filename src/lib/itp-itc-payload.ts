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
const PHOTO_SLOT_CONTAINER_KEYS = new Set(["photo_slot", "photo_slots"]);
const PHOTO_SLOT_KEY_RE = /^(photo_slots?|photo_slot[_-].+)$/i;
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

function isUuidValue(value: unknown): boolean {
  return (
    typeof value === "string" &&
    /^[0-9a-f]{8}-[0-9a-f]{4}-[1-8][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      value.trim()
    )
  );
}

function parseItcSequence(value: unknown): number | null {
  if (typeof value === "number" && Number.isFinite(value) && value > 0) {
    return Math.floor(value);
  }
  const raw = String(value ?? "").trim();
  if (!raw) return null;
  if (/^\d+$/.test(raw)) {
    const parsed = Number.parseInt(raw, 10);
    return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
  }
  const match = raw.match(/ITC(\d+)\s*$/i) ?? raw.match(/[/ -](\d+)\s*$/);
  if (!match) return null;
  const parsed = Number.parseInt(match[1] ?? "", 10);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

function firstNonEmpty(...values: unknown[]): string | null {
  for (const value of values) {
    if (typeof value === "string" && value.trim()) return value.trim();
    if (typeof value === "number" && Number.isFinite(value)) return String(value);
  }
  return null;
}

/** Map live-schema aliases onto the names the UI already reads. */
export function applyItpItcReadAliases(row: Record<string, unknown>): Record<string, unknown> {
  const next = { ...row };
  const displayNumber = firstNonEmpty(
    next.activity_number,
    next.itc_id,
    next.itc_code,
    typeof next.itc_number === "string" ? next.itc_number : null,
    next.title,
    next.itc_number
  );
  if (displayNumber) next.itc_number = displayNumber;

  if (next.redline_markup_url == null && next.redline_image_url != null) {
    next.redline_markup_url = next.redline_image_url;
  }
  if (next.service_discipline == null) {
    next.service_discipline = next.service ?? next.service_type ?? next.trade_discipline;
  }
  if (next.zone_code == null && next.zone != null) next.zone_code = next.zone;
  if (next.map_x == null && next.pin_x != null) next.map_x = next.pin_x;
  if (next.map_y == null && next.pin_y != null) next.map_y = next.pin_y;
  if (next.image_url == null && next.plan_image_url != null) next.image_url = next.plan_image_url;
  if (next.plan_name == null && next.plan_image_url != null) {
    next.plan_name = firstNonEmpty(next.plan_name, next.title, "Floorplan");
  }
  if (next.is_checked == null && next.passed != null) next.is_checked = next.passed === true;
  if (next.attachments == null && next.attachment_urls != null) {
    next.attachments = next.attachment_urls;
  }
  if (next.captured_at == null && next.taken_at != null) next.captured_at = next.taken_at;
  if (next.not_required == null && next.is_not_required != null) {
    next.not_required = next.is_not_required === true;
  }
  if (next.requested_by_name == null && next.requester_name != null) {
    next.requested_by_name = next.requester_name;
  }
  return next;
}

/** Coerce writes onto verified live columns so integer/uuid fields do not 400. */
export function alignItpItcWriteAliases(raw: Record<string, unknown>): Record<string, unknown> {
  const next = { ...raw };

  if (typeof next.itc_number === "string" && next.itc_number.trim() && !/^\d+$/.test(next.itc_number.trim())) {
    const label = next.itc_number.trim();
    if (next.activity_number == null) next.activity_number = label;
    if (next.itc_id == null) next.itc_id = label;
    if (!firstNonEmpty(next.title)) next.title = label;
    next.itc_number = parseItcSequence(label) ?? 1;
  } else if (next.itc_number != null && next.itc_number !== "") {
    const sequence = parseItcSequence(next.itc_number);
    if (sequence != null) next.itc_number = sequence;
  }

  if (!firstNonEmpty(next.title)) {
    next.title = firstNonEmpty(next.activity_number, next.itc_id, next.itp_number) ?? next.title;
  }

  if (next.pin_x == null) next.pin_x = next.map_x ?? 0;
  if (next.pin_y == null) next.pin_y = next.map_y ?? 0;
  if (next.map_x == null && next.pin_x != null) next.map_x = next.pin_x;
  if (next.map_y == null && next.pin_y != null) next.map_y = next.pin_y;

  if (next.redline_markup_url != null && next.redline_image_url == null) {
    next.redline_image_url = next.redline_markup_url;
  }
  if (next.redline_image_url != null && next.redline_markup_url == null) {
    next.redline_markup_url = next.redline_image_url;
  }

  if (next.service_discipline != null && next.service == null) next.service = next.service_discipline;
  if (next.service != null && next.service_discipline == null) next.service_discipline = next.service;
  if (next.service_discipline != null && next.service_type == null) {
    next.service_type = next.service_discipline;
  }
  if (next.zone_code != null && next.zone == null) next.zone = next.zone_code;

  if (typeof next.completed_by === "string" && next.completed_by.trim() && !isUuidValue(next.completed_by)) {
    if (next.completed_by_name == null) next.completed_by_name = next.completed_by.trim();
    if (next.uploaded_by_name == null) next.uploaded_by_name = next.completed_by.trim();
    delete next.completed_by;
  }

  if (next.plan_name != null && !firstNonEmpty(next.title)) next.title = next.plan_name;
  if (next.image_url != null && next.plan_image_url == null) next.plan_image_url = next.image_url;
  if (next.plan_image_url != null && next.image_url == null) next.image_url = next.plan_image_url;

  if (next.is_checked != null && next.passed == null) next.passed = next.is_checked === true;
  if (next.attachments != null && next.attachment_urls == null) next.attachment_urls = next.attachments;
  if (next.captured_at != null && next.taken_at == null) next.taken_at = next.captured_at;
  if (next.slot_key != null && next.slot_title == null) next.slot_title = next.slot_key;
  if (next.not_required != null && next.is_not_required == null) {
    next.is_not_required = next.not_required === true;
  }
  if (next.requested_by_name != null && next.requester_name == null) {
    next.requester_name = next.requested_by_name;
  }

  return next;
}

/** Merge catch-all JSON onto a fetched row and drop transient UI keys. */
export function hydrateItpItcRow(row: Record<string, unknown>): Record<string, unknown> {
  const formData = asRecord(row.form_data);
  const next: Record<string, unknown> = applyItpItcReadAliases({ ...row });

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
  if (next.photo_slots == null && formData.photo_slots != null) {
    next.photo_slots = formData.photo_slots;
  }
  if (next.photo_slot == null && formData.photo_slot != null) {
    next.photo_slot = formData.photo_slot;
  }

  return applyItpItcReadAliases(next);
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
  "template_id",
  "drawing_name",
  "drawing_url",
  "service",
  "service_type",
  "service_run_coordinates",
  "form_data",
  "checklist",
  "checklist_answers",
  "items",
  "photos",
  "attachments",
  "signatures",
  "signoffs",
  "notes",
  "inspector_id",
  "inspector_name",
  "spec_reference",
  "completed_at",
  "created_at",
  "updated_at",
] as const;

export const PROJECT_ITP_ITEM_COLUMNS = [
  "id",
  "itp_id",
  "project_id",
  "item_number",
  "description",
  "acceptance_criteria",
  "spec_reference",
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
  "inspector_id",
  "inspector_name",
  "signed_off_at",
  "signoff_date",
  "signature_url",
  "notes",
  "form_data",
  "sort_order",
  "created_at",
  "updated_at",
] as const;

export const PROJECT_ITC_COLUMNS = [
  "id",
  "project_id",
  "itc_number",
  "activity_number",
  "itc_id",
  "itp_id",
  "zone_id",
  "zone_code",
  "zone",
  "building",
  "service_discipline",
  "trade_discipline",
  "service_type",
  "service",
  "pipe_size",
  "pipe_material",
  "lines_count",
  "drawing_name",
  "drawing_markup",
  "service_run_coordinates",
  "run_number",
  "material_colour",
  "start_location",
  "end_location",
  "conduits",
  "length_m",
  "length_of_run_m",
  "number_of_tees",
  "redline_markup_url",
  "redline_image_url",
  "gps_lat",
  "gps_lng",
  "form_data",
  "checklist",
  "checklist_answers",
  "items",
  "photos",
  "photo_url",
  "photo_slot",
  "photo_slots",
  "photos_data",
  "attachments",
  "signatures",
  "signoffs",
  "spec_values",
  "spec_reference",
  "notes",
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
  "plan_id",
  "form_version_id",
  "service_id",
  "title",
  "description",
  "inspector_id",
  "inspector_name",
  "signoff_date",
  "is_active",
  "step_key",
  "uploaded_by",
  "uploaded_by_name",
  "completed_by",
  "completed_by_name",
  "completed_at",
  "created_at",
  "updated_at",
] as const;

export const ITC_SIGNOFF_COLUMNS = [
  "id",
  "itc_id",
  "project_id",
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
  "signoff_date",
  "notes",
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
  "passed",
  "notes",
  "photo_url",
  "photos",
  "attachments",
  "attachment_urls",
  "value",
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
  "slot_title",
  "photo_url",
  "photos",
  "not_required",
  "is_not_required",
  "not_required_reason",
  "gps_lat",
  "gps_lng",
  "captured_at",
  "taken_at",
  "uploaded_by",
  "uploaded_by_name",
  "form_data",
  "created_at",
  "updated_at",
] as const;

export const ITC_CHANGE_REQUEST_COLUMNS = [
  "id",
  "itc_id",
  "signoff_id",
  "requested_by",
  "requested_by_name",
  "requester_name",
  "requester_worker_id",
  "reason",
  "status",
  "reviewed_by",
  "reviewed_by_name",
  "reviewed_at",
  "resolution_notes",
  "created_at",
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

export function isItcPhotoSlotKey(key: string): boolean {
  return PHOTO_SLOT_KEY_RE.test(key);
}

function photoSlotIdFromKey(key: string): string | null {
  if (PHOTO_SLOT_CONTAINER_KEYS.has(key)) return null;
  const match = key.match(/^photo_slot[_-](.+)$/i);
  return match?.[1] ?? null;
}

function serializePhotoSlotEntry(value: unknown): unknown {
  if (value === undefined || value === "") return null;
  if (value == null) return null;
  if (typeof value === "string") {
    const url = value.trim();
    return url ? { url, path: url } : null;
  }
  if (Array.isArray(value)) {
    const items = value.map(serializePhotoSlotEntry).filter((item) => item != null);
    return items.length ? items : null;
  }
  if (typeof value === "object") {
    const next: Record<string, unknown> = {};
    for (const [key, entry] of Object.entries(value as Record<string, unknown>)) {
      if (entry === undefined) continue;
      next[key] = entry;
    }
    return Object.keys(next).length ? next : null;
  }
  return null;
}

export function collectItcPhotoSlots(
  raw: Record<string, unknown>
): Record<string, unknown> | null {
  const slots: Record<string, unknown> = {};

  const mergeSlots = (source: unknown) => {
    if (source == null || source === "") return;
    if (Array.isArray(source)) {
      source.forEach((item, index) => {
        const cleaned = serializePhotoSlotEntry(item);
        if (cleaned == null) return;
        const record =
          cleaned && typeof cleaned === "object" && !Array.isArray(cleaned)
            ? (cleaned as Record<string, unknown>)
            : { url: cleaned };
        const id = typeof record.id === "string" && record.id.trim() ? record.id : String(index);
        slots[id] = record;
      });
      return;
    }
    if (typeof source === "object") {
      for (const [id, item] of Object.entries(source as Record<string, unknown>)) {
        const cleaned = serializePhotoSlotEntry(item);
        if (cleaned != null) slots[id] = cleaned;
      }
    }
  };

  mergeSlots(raw.photo_slots);
  mergeSlots(raw.photo_slot);
  for (const [key, value] of Object.entries(raw)) {
    const slotId = photoSlotIdFromKey(key);
    if (!slotId) continue;
    const cleaned = serializePhotoSlotEntry(value);
    if (cleaned != null) slots[slotId] = cleaned;
  }

  const form = asRecord(raw.form_data);
  if (!Object.keys(slots).length) {
    mergeSlots(form.photo_slots);
    mergeSlots(form.photo_slot);
  }

  return Object.keys(slots).length ? slots : null;
}

function photoUrlsFromSlots(slots: Record<string, unknown> | null): string[] {
  if (!slots) return [];
  const urls: string[] = [];
  for (const value of Object.values(slots)) {
    if (typeof value === "string" && value.trim()) {
      urls.push(value.trim());
      continue;
    }
    if (value && typeof value === "object" && !Array.isArray(value)) {
      const record = value as Record<string, unknown>;
      if (record.not_required === true) continue;
      const url = record.url ?? record.photo_url ?? record.path ?? record.src;
      if (typeof url === "string" && url.trim()) urls.push(url.trim());
    }
  }
  return urls;
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
  raw = alignItpItcWriteAliases(raw);
  const photoSlots = collectItcPhotoSlots(raw);
  const slotUrls = photoUrlsFromSlots(photoSlots);

  for (const [key, value] of Object.entries(raw)) {
    if (value === undefined) continue;
    if (UI_ONLY_KEYS.has(key)) continue;
    if (isItcPhotoSlotKey(key)) continue;

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

  if (photoSlots) {
    if (allowed.has("photo_slots")) {
      next.photo_slots = photoSlots;
    } else {
      overflow.photo_slots = photoSlots;
    }
    if (slotUrls.length) {
      if (allowed.has("photos")) {
        const existing = asStringArray(next.photos) ?? [];
        next.photos = Array.from(new Set([...existing, ...slotUrls]));
      } else if (allowed.has("photo_urls")) {
        const existing = asStringArray(next.photo_urls) ?? [];
        next.photo_urls = Array.from(new Set([...existing, ...slotUrls]));
      } else {
        overflow.photos = slotUrls;
      }
    }
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
      const typeMismatch =
        /invalid input syntax|violates .* constraint|could not parse/i.test(message);

      if (!isItpItcSchemaError(result.error) && !typeMismatch) {
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
