import type { SupabaseClient } from "@supabase/supabase-js";
import {
  isSchemaCacheColumnError,
  parseMissingColumnFromError,
  sanitizeWritePayload,
  stripMissingColumn,
} from "./form-payload-utils";
import {
  ITC_ATTACHMENTS_BUCKET,
  buildUniqueStorageFileName,
} from "./itp-itc-storage";
import { WORKER_ITC_CHECKLIST_TEMPLATE } from "./worker-itc-checklist-templates";

function stripPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeWritePayload(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  );
}

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

async function updateWithMissingColumnFallback(
  admin: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  matchColumn: string,
  matchValue: string
): Promise<{ error: string | null }> {
  let nextPayload = stripPayload({ ...payload });
  let attempts = 0;

  while (attempts < 8) {
    const { error } = await admin.from(table).update(nextPayload).eq(matchColumn, matchValue);
    if (!error) return { error: null };

    const missingColumn = parseMissingColumnFromError(error.message);
    if (!missingColumn || !(missingColumn in nextPayload)) {
      return { error: error.message };
    }

    nextPayload = stripMissingColumn(nextPayload, missingColumn);
    attempts += 1;
  }

  return { error: "Failed to update ITC record after removing unsupported columns." };
}

async function upsertWithMissingColumnFallback(
  admin: SupabaseClient,
  table: string,
  payload: Record<string, unknown>,
  onConflict: string
): Promise<{ error: string | null }> {
  let nextPayload = stripPayload({ ...payload });
  let attempts = 0;

  while (attempts < 8) {
    const { error } = await admin.from(table).upsert(nextPayload, { onConflict });
    if (!error) return { error: null };

    const missingColumn = parseMissingColumnFromError(error.message);
    if (!missingColumn || !(missingColumn in nextPayload)) {
      return { error: error.message };
    }

    nextPayload = stripMissingColumn(nextPayload, missingColumn);
    attempts += 1;
  }

  return { error: "Failed to save checklist entry after removing unsupported columns." };
}

export interface WorkerItcPlanRow {
  id: string;
  project_id: string;
  plan_name: string;
  image_url: string;
  is_active: boolean;
}

export interface WorkerItcRegisterRow {
  id: string;
  project_id: string;
  itc_number: string;
  title: string | null;
  description: string | null;
  status: string;
  pin_x: number | null;
  pin_y: number | null;
  map_x: number | null;
  map_y: number | null;
  redline_markup_url: string | null;
  start_location: string | null;
  end_location: string | null;
  service_discipline: string | null;
  progress_percent: number | null;
  completed_by: string | null;
  completed_at: string | null;
}

export interface WorkerItcChecklistEntryRow {
  id: string;
  itc_id: string;
  item_key: string;
  item_label: string;
  is_mandatory: boolean;
  is_checked: boolean;
  notes: string | null;
  photo_url: string | null;
  worker_id: string | null;
  worker_name: string | null;
  sort_order: number;
  updated_at: string;
}

function resolvePinX(row: Record<string, unknown>): number | null {
  const pin = row.pin_x ?? row.map_x;
  return pin == null ? null : Number(pin);
}

function resolvePinY(row: Record<string, unknown>): number | null {
  const pin = row.pin_y ?? row.map_y;
  return pin == null ? null : Number(pin);
}

export async function fetchWorkerItcPlanAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{ plan: WorkerItcPlanRow | null; error: string | null }> {
  try {
    const activeQuery = await admin
      .from("project_itc_plans")
      .select("*")
      .eq("project_id", projectId)
      .eq("is_active", true)
      .order("updated_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    let planRow = activeQuery.data;
    let planError = activeQuery.error;

    if (planError) {
      if (isSchemaCacheColumnError(planError.message, "is_active")) {
        const fallbackQuery = await admin
          .from("project_itc_plans")
          .select("*")
          .eq("project_id", projectId)
          .order("updated_at", { ascending: false })
          .limit(1)
          .maybeSingle();

        planRow = fallbackQuery.data;
        planError = fallbackQuery.error;

        if (
          planRow &&
          "is_active" in planRow &&
          (planRow as { is_active?: boolean }).is_active === false
        ) {
          planRow = null;
        }
      } else if (isMissingTableError(planError.message, "project_itc_plans")) {
        planRow = null;
        planError = null;
      } else {
        return { plan: null, error: planError.message };
      }
    }

    if (planError) {
      return { plan: null, error: planError.message };
    }

    if (planRow) {
      const record = planRow as Record<string, unknown>;
      return {
        plan: {
          id: String(record.id),
          project_id: String(record.project_id),
          plan_name: String(record.plan_name ?? "Floorplan"),
          image_url: String(record.image_url),
          is_active: record.is_active !== false,
        },
        error: null,
      };
    }

    const { data: drawingRow, error: drawingError } = await admin
      .from("itc_project_drawings")
      .select("*")
      .eq("project_id", projectId)
      .order("created_at", { ascending: false })
      .limit(1)
      .maybeSingle();

    if (drawingError) {
      if (isMissingTableError(drawingError.message, "itc_project_drawings")) {
        return { plan: null, error: null };
      }
      return { plan: null, error: drawingError.message };
    }
    if (!drawingRow?.file_url) return { plan: null, error: null };

    return {
      plan: {
        id: String(drawingRow.id),
        project_id: projectId,
        plan_name: String(drawingRow.file_name ?? "Floorplan"),
        image_url: String(drawingRow.file_url),
        is_active: true,
      },
      error: null,
    };
  } catch (error) {
    return {
      plan: null,
      error: error instanceof Error ? error.message : "Failed to load ITC floorplan.",
    };
  }
}

export async function fetchWorkerItcRegisterAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{ itcs: WorkerItcRegisterRow[]; error: string | null }> {
  try {
    const { data, error } = await admin
      .from("project_itcs")
      .select("*")
      .eq("project_id", projectId)
      .order("itc_number", { ascending: true });

    if (error) {
      if (isMissingTableError(error.message, "project_itcs")) {
        return { itcs: [], error: null };
      }
      return { itcs: [], error: error.message };
    }

    const itcs = (data ?? []).map((row) => {
    const record = row as Record<string, unknown>;
    const start = record.start_location ? String(record.start_location) : "";
    const end = record.end_location ? String(record.end_location) : "";
    const scope =
      start && end ? `${start} → ${end}` : start || end || null;

    return {
      id: String(record.id),
      project_id: String(record.project_id),
      itc_number: String(record.itc_number),
      title: record.title ? String(record.title) : String(record.itc_number),
      description: record.description
        ? String(record.description)
        : scope,
      status: String(record.status ?? "not_started"),
      pin_x: resolvePinX(record),
      pin_y: resolvePinY(record),
      map_x: record.map_x == null ? null : Number(record.map_x),
      map_y: record.map_y == null ? null : Number(record.map_y),
      redline_markup_url: record.redline_markup_url
        ? String(record.redline_markup_url)
        : null,
      start_location: start || null,
      end_location: end || null,
      service_discipline: record.service_discipline
        ? String(record.service_discipline)
        : null,
      progress_percent: record.progress_percent == null
        ? null
        : Number(record.progress_percent),
      completed_by: record.completed_by ? String(record.completed_by) : null,
      completed_at: record.completed_at ? String(record.completed_at) : null,
    } satisfies WorkerItcRegisterRow;
  });

    return { itcs, error: null };
  } catch (error) {
    return {
      itcs: [],
      error: error instanceof Error ? error.message : "Failed to load ITC register.",
    };
  }
}

export async function fetchWorkerItcDetailAdmin(
  admin: SupabaseClient,
  itcId: string
): Promise<{
  itc: WorkerItcRegisterRow | null;
  entries: WorkerItcChecklistEntryRow[];
  error: string | null;
}> {
  try {
    const { data: itcRow, error: itcError } = await admin
      .from("project_itcs")
      .select("*")
      .eq("id", itcId)
      .maybeSingle();

    if (itcError) {
      if (isMissingTableError(itcError.message, "project_itcs")) {
        return { itc: null, entries: [], error: "ITC register is not available." };
      }
      return { itc: null, entries: [], error: itcError.message };
    }
    if (!itcRow) return { itc: null, entries: [], error: "ITC not found." };

    const { data: entryRows, error: entryError } = await admin
      .from("itc_checklist_entries")
      .select("*")
      .eq("itc_id", itcId)
      .order("sort_order");

    const stored = new Map<string, Record<string, unknown>>();
    if (entryError) {
      if (!isMissingTableError(entryError.message, "itc_checklist_entries")) {
        return { itc: null, entries: [], error: entryError.message };
      }
    } else {
      for (const row of entryRows ?? []) {
        stored.set(String(row.item_key), row as Record<string, unknown>);
      }
    }

    const record = itcRow as Record<string, unknown>;
  const start = record.start_location ? String(record.start_location) : "";
  const end = record.end_location ? String(record.end_location) : "";
  const scope = start && end ? `${start} → ${end}` : start || end || null;

  const itc: WorkerItcRegisterRow = {
    id: String(record.id),
    project_id: String(record.project_id),
    itc_number: String(record.itc_number),
    title: record.title ? String(record.title) : String(record.itc_number),
    description: record.description ? String(record.description) : scope,
    status: String(record.status ?? "not_started"),
    pin_x: resolvePinX(record),
    pin_y: resolvePinY(record),
    map_x: record.map_x == null ? null : Number(record.map_x),
    map_y: record.map_y == null ? null : Number(record.map_y),
    redline_markup_url: record.redline_markup_url
      ? String(record.redline_markup_url)
      : null,
    start_location: start || null,
    end_location: end || null,
    service_discipline: record.service_discipline
      ? String(record.service_discipline)
      : null,
    progress_percent: record.progress_percent == null
      ? null
      : Number(record.progress_percent),
    completed_by: record.completed_by ? String(record.completed_by) : null,
    completed_at: record.completed_at ? String(record.completed_at) : null,
  };

  const entries: WorkerItcChecklistEntryRow[] = WORKER_ITC_CHECKLIST_TEMPLATE.map(
    (template) => {
      const existing = stored.get(template.item_key);
      if (existing) {
        return {
          id: String(existing.id),
          itc_id: itcId,
          item_key: template.item_key,
          item_label: String(existing.item_label ?? template.item_label),
          is_mandatory: existing.is_mandatory !== false,
          is_checked: existing.is_checked === true,
          notes: existing.notes ? String(existing.notes) : null,
          photo_url: existing.photo_url ? String(existing.photo_url) : null,
          worker_id: existing.worker_id ? String(existing.worker_id) : null,
          worker_name: existing.worker_name ? String(existing.worker_name) : null,
          sort_order: Number(existing.sort_order ?? template.sort_order),
          updated_at: String(existing.updated_at ?? new Date().toISOString()),
        };
      }

      return {
        id: `template-${template.item_key}`,
        itc_id: itcId,
        item_key: template.item_key,
        item_label: template.item_label,
        is_mandatory: template.is_mandatory,
        is_checked: false,
        notes: null,
        photo_url: null,
        worker_id: null,
        worker_name: null,
        sort_order: template.sort_order,
        updated_at: new Date().toISOString(),
      };
    }
  );

    return { itc, entries, error: null };
  } catch (error) {
    return {
      itc: null,
      entries: [],
      error: error instanceof Error ? error.message : "Failed to load ITC detail.",
    };
  }
}

export interface SaveChecklistItemInput {
  item_key: string;
  item_label: string;
  is_mandatory?: boolean;
  is_checked?: boolean;
  notes?: string | null;
  photo_url?: string | null;
  sort_order?: number;
}

export async function saveWorkerItcChecklistAdmin(
  admin: SupabaseClient,
  input: {
    itcId: string;
    workerId: string;
    workerName: string;
    items: SaveChecklistItemInput[];
  }
): Promise<{ error: string | null }> {
  try {
    const now = new Date().toISOString();

    for (const item of input.items) {
      const payload = {
        itc_id: input.itcId,
        item_key: item.item_key,
        item_label: item.item_label,
        is_mandatory: item.is_mandatory ?? true,
        is_checked: item.is_checked ?? false,
        notes: item.notes ?? null,
        photo_url: item.photo_url ?? null,
        worker_id: input.workerId,
        worker_name: input.workerName.trim(),
        sort_order: item.sort_order ?? 0,
        updated_at: now,
      };

      const { error } = await upsertWithMissingColumnFallback(
        admin,
        "itc_checklist_entries",
        payload,
        "itc_id,item_key"
      );

      if (error) {
        if (isMissingTableError(error, "itc_checklist_entries")) {
          return { error: "ITC checklist storage is not available yet." };
        }
        return { error };
      }
    }

    const statusUpdate = await updateWithMissingColumnFallback(
      admin,
      "project_itcs",
      {
        status: "in_progress",
        updated_at: now,
      },
      "id",
      input.itcId
    );

    if (statusUpdate.error && !isMissingTableError(statusUpdate.error, "project_itcs")) {
      return statusUpdate;
    }

    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to save ITC checklist.",
    };
  }
}

export async function completeWorkerItcAdmin(
  admin: SupabaseClient,
  input: { itcId: string; workerId: string }
): Promise<{ error: string | null }> {
  try {
    const { entries, error: fetchError } = await fetchWorkerItcDetailAdmin(admin, input.itcId);
    if (fetchError) return { error: fetchError };

    const incompleteMandatory = entries.filter(
      (entry) => entry.is_mandatory && !entry.is_checked
    );

    if (incompleteMandatory.length > 0) {
      return {
        error: `Complete all mandatory checklist items before finishing (${incompleteMandatory.length} remaining).`,
      };
    }

    const now = new Date().toISOString();
    return await updateWithMissingColumnFallback(
      admin,
      "project_itcs",
      {
        status: "completed",
        progress_percent: 100,
        completed_by: input.workerId,
        completed_at: now,
        updated_at: now,
      },
      "id",
      input.itcId
    );
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to complete ITC.",
    };
  }
}

export async function uploadWorkerItcChecklistPhotoAdmin(
  admin: SupabaseClient,
  input: {
    projectId: string;
    itcId: string;
    itemKey: string;
    file: File | Blob;
    fileName: string;
    contentType?: string;
  }
): Promise<{ url: string | null; error: string | null }> {
  const path = `${input.projectId}/${input.itcId}/checklist/${input.itemKey}/${buildUniqueStorageFileName(input.fileName)}`;

  const { error: uploadError } = await admin.storage
    .from(ITC_ATTACHMENTS_BUCKET)
    .upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.contentType || "image/jpeg",
    });

  if (uploadError) {
    const fallback = await admin.storage.from("itp-uploads").upload(path, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.contentType || "image/jpeg",
    });
    if (fallback.error) return { url: null, error: fallback.error.message };
    const { data } = admin.storage.from("itp-uploads").getPublicUrl(path);
    return { url: data.publicUrl, error: null };
  }

  const { data } = admin.storage.from(ITC_ATTACHMENTS_BUCKET).getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}
