import {
  parseMissingColumnFromError,
  stripMissingColumn,
} from "./form-payload-utils";

/** Top-level columns that exist (or are expected) per table. Unknown keys go to form_metadata. */
export const TABLE_KNOWN_COLUMNS: Record<string, ReadonlySet<string>> = {
  site_forms: new Set([
    "id",
    "form_type",
    "project_id",
    "site_id",
    "worker_id",
    "submitted_by_worker_id",
    "submitted_at",
    "form_date",
    "form_time",
    "location_scope",
    "weather_conditions",
    "title",
    "status",
    "project_name",
    "notes",
    "form_data",
    "checklist_data",
    "photo_urls",
    "attendees",
    "additional_workers",
    "submitter_signature_url",
    "created_at",
    "form_metadata",
    "is_viewed",
    "viewed_at",
  ]),
  worker_requests: new Set([
    "id",
    "request_number",
    "worker_id",
    "worker_name",
    "project_id",
    "project_name",
    "request_type",
    "uniform_item",
    "uniform_size",
    "uniform_items",
    "quantity",
    "description",
    "status",
    "admin_comments",
    "fulfilled_at",
    "fulfilled_by",
    "created_at",
    "updated_at",
    "form_metadata",
  ]),
  plant_prestarts: new Set([
    "id",
    "plant_id",
    "operator_name",
    "operator_worker_id",
    "project_id",
    "site_id",
    "current_reading",
    "next_service_due",
    "check_data",
    "has_defect",
    "defect_comments",
    "defect_photo_url",
    "signature_url",
    "submitted_at",
    "created_at",
    "form_metadata",
  ]),
  rfis: new Set([
    "id",
    "rfi_number",
    "rfi_code",
    "title",
    "subject",
    "description",
    "request_details",
    "project_id",
    "project_name",
    "zone_area",
    "category",
    "discipline",
    "priority",
    "due_date",
    "requested_by_id",
    "requested_by_name",
    "raised_by",
    "request_signature_url",
    "status",
    "date_raised",
    "attachments",
    "comments",
    "created_at",
    "updated_at",
    "form_metadata",
  ]),
  leave_requests: new Set([
    "id",
    "worker_id",
    "project_id",
    "first_date",
    "last_date",
    "number_of_days",
    "total_days",
    "reason",
    "signature_url",
    "status",
    "leave_type",
    "created_at",
    "updated_at",
    "form_metadata",
  ]),
  worker_timesheets: new Set([
    "id",
    "worker_id",
    "project_id",
    "project_name",
    "task_name",
    "date",
    "start_time",
    "finish_time",
    "break_minutes",
    "hours",
    "status",
    "notes",
    "signature_url",
    "created_at",
    "updated_at",
    "form_metadata",
  ]),
};

function readMetadataObject(value: unknown): Record<string, unknown> {
  if (typeof value === "object" && value !== null && !Array.isArray(value)) {
    return { ...(value as Record<string, unknown>) };
  }
  return {};
}

/** Moves unknown top-level keys into `form_metadata` before posting to Supabase. */
export function consolidatePayloadForTable(
  table: string,
  payload: Record<string, unknown>
): Record<string, unknown> {
  const known = TABLE_KNOWN_COLUMNS[table];
  if (!known) {
    return { ...payload };
  }

  const result: Record<string, unknown> = {};
  const metadata = readMetadataObject(payload.form_metadata);

  for (const [key, value] of Object.entries(payload)) {
    if (value === undefined) continue;
    if (key === "form_metadata") continue;

    if (known.has(key)) {
      result[key] = value;
    } else {
      metadata[key] = value;
    }
  }

  if (Object.keys(metadata).length > 0) {
    result.form_metadata = metadata;
  }

  return result;
}

/** Moves a rejected column value into form_metadata and removes the top-level key. */
export function moveColumnToFormMetadata(
  payload: Record<string, unknown>,
  column: string
): Record<string, unknown> {
  if (!(column in payload)) return payload;

  const { [column]: value, ...rest } = payload;
  const metadata = readMetadataObject(rest.form_metadata);
  metadata[column] = value;

  return {
    ...rest,
    form_metadata: metadata,
  };
}

export interface ResilientInsertResult<T = { id?: string }> {
  data: T | null;
  error: string | null;
  movedColumns: string[];
}

type SupabaseInsertClient = {
  from: (table: string) => {
    insert: (values: Record<string, unknown>[]) => {
      select: (columns: string) => {
        single: () => PromiseLike<{
          data: { id?: string } | null;
          error: { message: string } | null;
        }>;
      };
    };
  };
};

export async function insertWithFormMetadataFallback<T extends { id?: string } = {
  id?: string;
}>(
  supabase: SupabaseInsertClient,
  table: string,
  payload: Record<string, unknown>,
  select = "id"
): Promise<ResilientInsertResult<T>> {
  let current = consolidatePayloadForTable(table, payload);
  const movedColumns: string[] = [];

  for (let attempt = 0; attempt < 16; attempt += 1) {
    const { data, error } = await supabase
      .from(table)
      .insert([current])
      .select(select)
      .single();

    if (!error) {
      return { data: (data as T | null) ?? null, error: null, movedColumns };
    }

    const missingColumn = parseMissingColumnFromError(error.message);
    if (!missingColumn || !(missingColumn in current)) {
      return { data: null, error: error.message, movedColumns };
    }

    movedColumns.push(missingColumn);
    current = moveColumnToFormMetadata(current, missingColumn);
    current = consolidatePayloadForTable(table, current);

    if (missingColumn !== "form_metadata") {
      continue;
    }

    current = stripMissingColumn(current, "form_metadata");
  }

  return {
    data: null,
    error: `Failed to insert into ${table} after form_metadata fallbacks.`,
    movedColumns,
  };
}
