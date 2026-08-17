import type { SupabaseClient } from "@supabase/supabase-js";
import { sanitizeWritePayload } from "./form-payload-utils";
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
  const { data: planRow, error: planError } = await admin
    .from("project_itc_plans")
    .select("*")
    .eq("project_id", projectId)
    .eq("is_active", true)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (planError) return { plan: null, error: planError.message };

  if (planRow) {
    return {
      plan: {
        id: String(planRow.id),
        project_id: String(planRow.project_id),
        plan_name: String(planRow.plan_name ?? "Floorplan"),
        image_url: String(planRow.image_url),
        is_active: planRow.is_active === true,
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

  if (drawingError) return { plan: null, error: drawingError.message };
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
}

export async function fetchWorkerItcRegisterAdmin(
  admin: SupabaseClient,
  projectId: string
): Promise<{ itcs: WorkerItcRegisterRow[]; error: string | null }> {
  const { data, error } = await admin
    .from("project_itcs")
    .select("*")
    .eq("project_id", projectId)
    .order("itc_number", { ascending: true });

  if (error) return { itcs: [], error: error.message };

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
}

export async function fetchWorkerItcDetailAdmin(
  admin: SupabaseClient,
  itcId: string
): Promise<{
  itc: WorkerItcRegisterRow | null;
  entries: WorkerItcChecklistEntryRow[];
  error: string | null;
}> {
  const { data: itcRow, error: itcError } = await admin
    .from("project_itcs")
    .select("*")
    .eq("id", itcId)
    .maybeSingle();

  if (itcError) return { itc: null, entries: [], error: itcError.message };
  if (!itcRow) return { itc: null, entries: [], error: "ITC not found." };

  const { data: entryRows, error: entryError } = await admin
    .from("itc_checklist_entries")
    .select("*")
    .eq("itc_id", itcId)
    .order("sort_order");

  if (entryError) return { itc: null, entries: [], error: entryError.message };

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

  const stored = new Map(
    (entryRows ?? []).map((row) => [String(row.item_key), row as Record<string, unknown>])
  );

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
  const now = new Date().toISOString();

  for (const item of input.items) {
    const payload = stripPayload({
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
    });

    const { error } = await admin
      .from("itc_checklist_entries")
      .upsert(payload, { onConflict: "itc_id,item_key" });

    if (error) return { error: error.message };
  }

  const { error: statusError } = await admin
    .from("project_itcs")
    .update(
      stripPayload({
        status: "in_progress",
        updated_at: now,
      })
    )
    .eq("id", input.itcId)
    .in("status", ["not_started", "ongoing", "issue", "in_progress"]);

  if (statusError) return { error: statusError.message };
  return { error: null };
}

export async function completeWorkerItcAdmin(
  admin: SupabaseClient,
  input: { itcId: string; workerId: string }
): Promise<{ error: string | null }> {
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
  const { error } = await admin
    .from("project_itcs")
    .update(
      stripPayload({
        status: "completed",
        progress_percent: 100,
        completed_by: input.workerId,
        completed_at: now,
        updated_at: now,
      })
    )
    .eq("id", input.itcId);

  return { error: error?.message ?? null };
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
