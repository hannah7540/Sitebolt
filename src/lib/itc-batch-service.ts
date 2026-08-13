import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";
import {
  applySpecRuleToBatchItem,
  buildItcNumber,
  DEFAULT_SPEC_RULES,
  STANDARD_ITC_INSPECTION_ACTIVITIES,
  type ItcBatchItemDraft,
  type ItcCompletedDocument,
  type ItcInspectionActivity,
  type ItcServiceSpecRule,
} from "./itc-batch-templates";

export interface ItcProjectDrawing {
  id: string;
  project_id: string;
  file_name: string;
  file_url: string;
  file_type: string;
  uploaded_by: string | null;
  created_at?: string;
}

export interface ItcDrawingPin {
  id: string;
  drawing_id: string;
  project_id: string;
  map_x: number;
  map_y: number;
  service_type: string;
  upstream_pit_number: string | null;
  downstream_pit_number: string | null;
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

async function resolveProject(projectId: string): Promise<string> {
  const { id } = await resolveProjectId(projectId);
  return id ?? projectId;
}

function normalizeDrawing(row: Record<string, unknown>): ItcProjectDrawing {
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    file_name: String(row.file_name ?? ""),
    file_url: String(row.file_url ?? ""),
    file_type: String(row.file_type ?? "image/png"),
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
    created_at: row.created_at as string | undefined,
  };
}

function normalizePin(row: Record<string, unknown>): ItcDrawingPin {
  return {
    id: String(row.id),
    drawing_id: String(row.drawing_id ?? ""),
    project_id: String(row.project_id ?? ""),
    map_x: Number(row.map_x ?? 0),
    map_y: Number(row.map_y ?? 0),
    service_type: String(row.service_type ?? "LV"),
    upstream_pit_number: row.upstream_pit_number ? String(row.upstream_pit_number) : null,
    downstream_pit_number: row.downstream_pit_number
      ? String(row.downstream_pit_number)
      : null,
  };
}

function normalizeBatchItem(row: Record<string, unknown>): ItcBatchItemDraft {
  return {
    id: String(row.id),
    pin_id: row.pin_id ? String(row.pin_id) : null,
    service_type: String(row.service_type ?? "LV"),
    zone: String(row.zone ?? "MP0"),
    plan_rev: String(row.plan_rev ?? "Rev A"),
    material_and_size: String(row.material_and_size ?? ""),
    length_between_structures_m:
      row.length_between_structures_m == null
        ? null
        : Number(row.length_between_structures_m),
    upstream_pit_number: String(row.upstream_pit_number ?? ""),
    downstream_pit_number: String(row.downstream_pit_number ?? ""),
    number_of_conduits:
      row.number_of_conduits == null ? null : Number(row.number_of_conduits),
    min_horizontal_sep_mm:
      row.min_horizontal_sep_mm == null ? null : Number(row.min_horizontal_sep_mm),
    min_vertical_sep_mm:
      row.min_vertical_sep_mm == null ? null : Number(row.min_vertical_sep_mm),
    min_bedding_mm: row.min_bedding_mm == null ? null : Number(row.min_bedding_mm),
    min_side_mm: row.min_side_mm == null ? null : Number(row.min_side_mm),
    min_overlay_mm: row.min_overlay_mm == null ? null : Number(row.min_overlay_mm),
    min_cover_mm: row.min_cover_mm == null ? null : Number(row.min_cover_mm),
    bedding_and_overlay_material: row.bedding_and_overlay_material
      ? String(row.bedding_and_overlay_material)
      : null,
    cover_material: row.cover_material ? String(row.cover_material) : null,
    map_x: Number(row.map_x ?? 0),
    map_y: Number(row.map_y ?? 0),
    itc_number: row.itc_number ? String(row.itc_number) : null,
    generated_itc_id: row.generated_itc_id ? String(row.generated_itc_id) : null,
    status: (row.status as ItcBatchItemDraft["status"]) ?? "draft",
  };
}

function normalizeActivity(row: Record<string, unknown>): ItcInspectionActivity {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id ?? ""),
    activity_number: Number(row.activity_number ?? 0),
    title: String(row.title ?? ""),
    requires_photo: row.requires_photo === true,
    check_by: row.check_by ? String(row.check_by) : null,
    checked_date: row.checked_date ? String(row.checked_date) : null,
    comments: row.comments ? String(row.comments) : null,
    photo_url: row.photo_url ? String(row.photo_url) : null,
    sort_order: Number(row.sort_order ?? 0),
  };
}

export async function uploadProjectDrawing(input: {
  projectId: string;
  fileName: string;
  fileUrl: string;
  fileType: string;
  uploadedBy?: string;
}): Promise<{ error: string | null; drawing?: ItcProjectDrawing }> {
  if (!isSupabaseConfigured()) {
    return {
      error: null,
      drawing: {
        id: `local-drawing-${Date.now()}`,
        project_id: input.projectId,
        file_name: input.fileName,
        file_url: input.fileUrl,
        file_type: input.fileType,
        uploaded_by: input.uploadedBy ?? null,
      },
    };
  }

  const resolved = await resolveProject(input.projectId);
  const { data, error } = await supabase
    .from("itc_project_drawings")
    .insert({
      project_id: resolved,
      file_name: input.fileName,
      file_url: input.fileUrl,
      file_type: input.fileType,
      uploaded_by: input.uploadedBy ?? null,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Upload failed" };
  return { error: null, drawing: normalizeDrawing(data as Record<string, unknown>) };
}

export async function fetchServiceSpecRules(
  serviceType?: string
): Promise<ItcServiceSpecRule[]> {
  if (!isSupabaseConfigured()) {
    return DEFAULT_SPEC_RULES.map((rule, index) => ({
      id: `local-spec-${index}`,
      ...rule,
    })).filter((rule) => !serviceType || rule.service_type === serviceType);
  }

  let query = supabase.from("itc_service_spec_rules").select("*").order("sort_order");
  if (serviceType) query = query.eq("service_type", serviceType);

  const { data, error } = await query;
  if (error || !data?.length) {
    return DEFAULT_SPEC_RULES.map((rule, index) => ({
      id: `local-spec-${index}`,
      ...rule,
    })).filter((rule) => !serviceType || rule.service_type === serviceType);
  }

  return data.map((row) => ({
    id: String(row.id),
    service_type: String(row.service_type),
    material_and_size: String(row.material_and_size),
    min_horizontal_sep_mm: row.min_horizontal_sep_mm ?? null,
    min_vertical_sep_mm: row.min_vertical_sep_mm ?? null,
    min_bedding_mm: row.min_bedding_mm ?? null,
    min_side_mm: row.min_side_mm ?? null,
    min_overlay_mm: row.min_overlay_mm ?? null,
    min_cover_mm: row.min_cover_mm ?? null,
    bedding_and_overlay_material: row.bedding_and_overlay_material ?? null,
    cover_material: row.cover_material ?? null,
  }));
}

export async function saveDrawingPin(input: {
  drawingId: string;
  projectId: string;
  mapX: number;
  mapY: number;
  serviceType: string;
  upstreamPitNumber: string;
  downstreamPitNumber: string;
}): Promise<{ error: string | null; pin?: ItcDrawingPin }> {
  if (input.drawingId.startsWith("local-")) {
    return {
      error: null,
      pin: {
        id: `local-pin-${Date.now()}`,
        drawing_id: input.drawingId,
        project_id: input.projectId,
        map_x: input.mapX,
        map_y: input.mapY,
        service_type: input.serviceType,
        upstream_pit_number: input.upstreamPitNumber,
        downstream_pit_number: input.downstreamPitNumber,
      },
    };
  }

  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const resolved = await resolveProject(input.projectId);
  const { data, error } = await supabase
    .from("itc_drawing_pins")
    .insert({
      drawing_id: input.drawingId,
      project_id: resolved,
      map_x: input.mapX,
      map_y: input.mapY,
      service_type: input.serviceType,
      upstream_pit_number: input.upstreamPitNumber,
      downstream_pit_number: input.downstreamPitNumber,
    })
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to save pin" };
  return { error: null, pin: normalizePin(data as Record<string, unknown>) };
}

export function createBatchItemFromPin(
  pin: ItcDrawingPin,
  defaultZone = "MP0"
): ItcBatchItemDraft {
  const defaultRule =
    DEFAULT_SPEC_RULES.find((rule) => rule.service_type === pin.service_type) ??
    DEFAULT_SPEC_RULES[0];

  return applySpecRuleToBatchItem(
    {
      id: `batch-${pin.id}`,
      pin_id: pin.id,
      service_type: pin.service_type,
      zone: defaultZone,
      plan_rev: "Rev A",
      material_and_size: "",
      length_between_structures_m: null,
      upstream_pit_number: pin.upstream_pit_number ?? "",
      downstream_pit_number: pin.downstream_pit_number ?? "",
      number_of_conduits: null,
      min_horizontal_sep_mm: null,
      min_vertical_sep_mm: null,
      min_bedding_mm: null,
      min_side_mm: null,
      min_overlay_mm: null,
      min_cover_mm: null,
      bedding_and_overlay_material: null,
      cover_material: null,
      map_x: pin.map_x,
      map_y: pin.map_y,
      status: "draft",
    },
    { id: "default", ...defaultRule }
  );
}

function isUuid(value: string): boolean {
  return /^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
    value
  );
}

function isPersistedPinId(pinId: string | null | undefined): pinId is string {
  return Boolean(pinId && isUuid(pinId) && !pinId.startsWith("local-"));
}

/** Standard insert/update payload aligned to itc_batch_items schema. */
export function buildBatchItemPayload(input: {
  projectId: string;
  item: ItcBatchItemDraft;
  drawingId?: string | null;
  itcNumber?: string | null;
  sortOrder?: number;
  status?: ItcBatchItemDraft["status"];
}) {
  return {
    project_id: input.projectId,
    drawing_id: input.drawingId ?? null,
    pin_id: isPersistedPinId(input.item.pin_id) ? input.item.pin_id : null,
    service_type: input.item.service_type,
    zone: input.item.zone,
    plan_rev: input.item.plan_rev,
    material_and_size: input.item.material_and_size,
    length_between_structures_m: input.item.length_between_structures_m,
    upstream_pit_number: input.item.upstream_pit_number,
    downstream_pit_number: input.item.downstream_pit_number,
    number_of_conduits: input.item.number_of_conduits,
    min_horizontal_sep_mm: input.item.min_horizontal_sep_mm,
    min_vertical_sep_mm: input.item.min_vertical_sep_mm,
    min_bedding_mm: input.item.min_bedding_mm,
    min_side_mm: input.item.min_side_mm,
    min_overlay_mm: input.item.min_overlay_mm,
    min_cover_mm: input.item.min_cover_mm,
    bedding_and_overlay_material: input.item.bedding_and_overlay_material,
    cover_material: input.item.cover_material,
    map_x: input.item.map_x,
    map_y: input.item.map_y,
    itc_number: input.itcNumber ?? input.item.itc_number ?? null,
    status: input.status ?? input.item.status ?? "draft",
    sort_order: input.sortOrder ?? 0,
    updated_at: new Date().toISOString(),
  };
}

async function upsertBatchItemRow(input: {
  projectId: string;
  item: ItcBatchItemDraft;
  drawingId?: string | null;
  itcNumber: string;
  sortOrder: number;
  status: ItcBatchItemDraft["status"];
}): Promise<{ error: string | null; row?: Record<string, unknown> }> {
  const resolved = await resolveProject(input.projectId);
  const payload = buildBatchItemPayload({
    projectId: resolved,
    item: input.item,
    drawingId: input.drawingId,
    itcNumber: input.itcNumber,
    sortOrder: input.sortOrder,
    status: input.status,
  });

  if (isUuid(input.item.id)) {
    const { data, error } = await supabase
      .from("itc_batch_items")
      .update(payload)
      .eq("id", input.item.id)
      .select("*")
      .single();

    if (error || !data) {
      return { error: error?.message ?? "Failed to update batch item" };
    }
    return { error: null, row: data as Record<string, unknown> };
  }

  const { data, error } = await supabase
    .from("itc_batch_items")
    .insert(payload)
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to save batch item" };
  }
  return { error: null, row: data as Record<string, unknown> };
}

export async function saveBatchItems(input: {
  projectId: string;
  drawingId?: string | null;
  items: ItcBatchItemDraft[];
}): Promise<{ error: string | null; saved: ItcBatchItemDraft[] }> {
  if (input.items.length === 0) {
    return { error: null, saved: [] };
  }

  if (!isSupabaseConfigured()) {
    return { error: null, saved: input.items };
  }

  const saved: ItcBatchItemDraft[] = [];

  for (const [index, item] of input.items.entries()) {
    const result = await upsertBatchItemRow({
      projectId: input.projectId,
      item,
      drawingId: input.drawingId,
      itcNumber: item.itc_number ?? "",
      sortOrder: index,
      status: item.status ?? "draft",
    });

    if (result.error || !result.row) {
      return { error: result.error, saved };
    }

    saved.push(normalizeBatchItem(result.row));
  }

  return { error: null, saved };
}

export async function fetchBatchItems(projectId: string): Promise<ItcBatchItemDraft[]> {
  if (!isSupabaseConfigured()) return [];

  const resolved = await resolveProject(projectId);
  const { data, error } = await supabase
    .from("itc_batch_items")
    .select("*")
    .eq("project_id", resolved)
    .order("sort_order");

  if (error) {
    if (!isMissingTableError(error.message, "itc_batch_items")) {
      console.warn("fetchBatchItems failed:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) => normalizeBatchItem(row as Record<string, unknown>));
}

export async function massSaveAndGenerateItcs(input: {
  projectId: string;
  drawingId?: string | null;
  items: ItcBatchItemDraft[];
  projectNo?: string;
  packageName?: string;
  clientName?: string;
}): Promise<{
  error: string | null;
  generated: number;
  documents: ItcCompletedDocument[];
}> {
  if (input.items.length === 0) {
    return { error: "No batch rows to save.", generated: 0, documents: [] };
  }

  const resolved = await resolveProject(input.projectId);
  const counters = new Map<string, number>();
  const documents: ItcCompletedDocument[] = [];
  let generated = 0;

  const sorted = [...input.items].sort((a, b) => {
    if (a.service_type !== b.service_type) {
      return a.service_type.localeCompare(b.service_type);
    }
    return a.upstream_pit_number.localeCompare(b.upstream_pit_number);
  });

  if (!isSupabaseConfigured()) {
    for (const item of sorted) {
      const counterKey = `${item.zone}:${item.service_type}`;
      const nextSeq = (counters.get(counterKey) ?? 0) + 1;
      counters.set(counterKey, nextSeq);
      const itcNumber = buildItcNumber(item.zone, item.service_type, nextSeq);
      const itcId = `generated-${item.id}`;
      documents.push(buildCompletedDocument(itcId, itcNumber, item, input));
      generated += 1;
    }
    return { error: null, generated, documents };
  }

  for (const item of sorted) {
    const counterKey = `${item.zone}:${item.service_type}`;
    const nextSeq = (counters.get(counterKey) ?? 0) + 1;
    counters.set(counterKey, nextSeq);
    const itcNumber = buildItcNumber(item.zone, item.service_type, nextSeq);

    const upsertResult = await upsertBatchItemRow({
      projectId: input.projectId,
      item,
      drawingId: input.drawingId,
      itcNumber,
      sortOrder: generated,
      status: "generated",
    });

    if (upsertResult.error || !upsertResult.row) {
      return {
        error: upsertResult.error ?? "Failed to generate ITC batch item",
        generated,
        documents,
      };
    }

    const batchItemId = String(upsertResult.row.id);

    const activityPayload = STANDARD_ITC_INSPECTION_ACTIVITIES.map((activity, index) => ({
      itc_id: batchItemId,
      activity_number: activity.activity_number,
      title: activity.title,
      requires_photo: activity.requires_photo,
      sort_order: index,
    }));

    await supabase.from("itc_inspection_activities").insert(activityPayload);

    const { data: activityRows } = await supabase
      .from("itc_inspection_activities")
      .select("*")
      .eq("itc_id", batchItemId)
      .order("sort_order");

    documents.push({
      itc_id: batchItemId,
      itc_number: itcNumber,
      project_no: input.projectNo ?? resolved,
      package_name: input.packageName ?? "",
      zone: item.zone,
      client_name: input.clientName ?? "",
      material_and_size: item.material_and_size,
      length_m: item.length_between_structures_m,
      upstream_pit_number: item.upstream_pit_number,
      downstream_pit_number: item.downstream_pit_number,
      plan_rev: item.plan_rev,
      service_type: item.service_type,
      specs: {
        min_horizontal_sep_mm: item.min_horizontal_sep_mm,
        min_vertical_sep_mm: item.min_vertical_sep_mm,
        min_bedding_mm: item.min_bedding_mm,
        min_side_mm: item.min_side_mm,
        min_overlay_mm: item.min_overlay_mm,
        min_cover_mm: item.min_cover_mm,
        bedding_and_overlay_material: item.bedding_and_overlay_material,
        cover_material: item.cover_material,
        number_of_conduits: item.number_of_conduits,
      },
      activities: (activityRows ?? []).map((row) =>
        normalizeActivity(row as Record<string, unknown>)
      ),
    });

    generated += 1;
  }

  return { error: null, generated, documents };
}

function buildCompletedDocument(
  itcId: string,
  itcNumber: string,
  item: ItcBatchItemDraft,
  input: { projectId: string; projectNo?: string; packageName?: string; clientName?: string }
): ItcCompletedDocument {
  return {
    itc_id: itcId,
    itc_number: itcNumber,
    project_no: input.projectNo ?? input.projectId,
    package_name: input.packageName ?? "",
    zone: item.zone,
    client_name: input.clientName ?? "",
    material_and_size: item.material_and_size,
    length_m: item.length_between_structures_m,
    upstream_pit_number: item.upstream_pit_number,
    downstream_pit_number: item.downstream_pit_number,
    plan_rev: item.plan_rev,
    service_type: item.service_type,
    specs: {
      min_horizontal_sep_mm: item.min_horizontal_sep_mm,
      min_vertical_sep_mm: item.min_vertical_sep_mm,
      min_bedding_mm: item.min_bedding_mm,
      min_side_mm: item.min_side_mm,
      min_overlay_mm: item.min_overlay_mm,
      min_cover_mm: item.min_cover_mm,
      bedding_and_overlay_material: item.bedding_and_overlay_material,
      cover_material: item.cover_material,
      number_of_conduits: item.number_of_conduits,
    },
    activities: STANDARD_ITC_INSPECTION_ACTIVITIES.map((activity, index) => ({
      id: `${itcId}-act-${activity.activity_number}`,
      itc_id: itcId,
      activity_number: activity.activity_number,
      title: activity.title,
      inspection_criteria: activity.inspection_criteria,
      check_result: null,
      requires_photo: activity.requires_photo,
      check_by: null,
      checked_date: null,
      comments: null,
      photo_url: null,
      sort_order: index,
    })),
  };
}

export async function fetchCompletedItcDocument(
  itcId: string
): Promise<ItcCompletedDocument | null> {
  if (itcId.startsWith("generated-")) return null;
  if (!isSupabaseConfigured()) return null;

  const { data: batchRow } = await supabase
    .from("itc_batch_items")
    .select("*")
    .eq("id", itcId)
    .maybeSingle();

  if (!batchRow) return null;

  const { data: activityRows } = await supabase
    .from("itc_inspection_activities")
    .select("*")
    .eq("itc_id", itcId)
    .order("sort_order");

  return {
    itc_id: String(batchRow.id),
    itc_number: String(batchRow.itc_number ?? ""),
    project_no: String(batchRow.project_id ?? ""),
    package_name: "",
    zone: String(batchRow.zone ?? ""),
    client_name: "",
    material_and_size: String(batchRow.material_and_size ?? ""),
    length_m:
      batchRow.length_between_structures_m == null
        ? null
        : Number(batchRow.length_between_structures_m),
    upstream_pit_number: batchRow.upstream_pit_number
      ? String(batchRow.upstream_pit_number)
      : null,
    downstream_pit_number: batchRow.downstream_pit_number
      ? String(batchRow.downstream_pit_number)
      : null,
    plan_rev: batchRow.plan_rev ? String(batchRow.plan_rev) : null,
    service_type: String(batchRow.service_type ?? ""),
    specs: {
      min_horizontal_sep_mm: batchRow.min_horizontal_sep_mm ?? null,
      min_vertical_sep_mm: batchRow.min_vertical_sep_mm ?? null,
      min_bedding_mm: batchRow.min_bedding_mm ?? null,
      min_side_mm: batchRow.min_side_mm ?? null,
      min_overlay_mm: batchRow.min_overlay_mm ?? null,
      min_cover_mm: batchRow.min_cover_mm ?? null,
      bedding_and_overlay_material: batchRow.bedding_and_overlay_material ?? null,
      cover_material: batchRow.cover_material ?? null,
      number_of_conduits: batchRow.number_of_conduits ?? null,
    },
    activities: (activityRows ?? []).map((row) =>
      normalizeActivity(row as Record<string, unknown>)
    ),
  };
}
