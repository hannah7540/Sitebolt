import { supabase, isSupabaseConfigured } from "./supabase";
import { nullIfBlank, sanitizeWritePayload } from "./form-payload-utils";
import { resolveProjectId } from "./project-resolver";
import {
  DEFAULT_ITC_FORM_STEPS,
  deriveItcStatus,
  getItcFormSteps,
  isHydraulicDiscipline,
  isItcStepUnlocked,
  type ItcChangeRequestStatus,
  type ItcConduitConfig,
  type ItcFormStepTemplate,
  type ItcSignoffStatus,
  type ItcStatus,
} from "./itc-templates";
import {
  formatItcAutoName,
  ITC_FIELD_PHOTO_STEP_KEY,
  ITC_MAX_FIELD_PHOTOS,
  ITC_MAX_FINAL_PHOTOS,
  itcAutoNamePrefix,
  parseItcAutoNameSequence,
} from "./itc-naming";
import type { ItcInspectionActivity } from "./itc-batch-templates";
import { STANDARD_ITC_INSPECTION_ACTIVITIES } from "./itc-batch-templates";

export interface ItcZone {
  id: string;
  project_id: string;
  zone_code: string;
  zone_name: string;
  map_x: number | null;
  map_y: number | null;
  sort_order: number;
}

export interface ProjectItc {
  id: string;
  project_id: string;
  itc_number: string;
  zone_id: string | null;
  zone_code: string | null;
  building: string | null;
  service_discipline: string;
  trade_discipline: string | null;
  service_type: string | null;
  material_colour: string | null;
  start_location: string | null;
  end_location: string | null;
  conduits: ItcConduitConfig[];
  length_m: number | null;
  length_of_run_m: number | null;
  number_of_tees: number | null;
  redline_markup_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  form_data: Record<string, unknown>;
  status: ItcStatus;
  progress_percent: number;
  map_x: number | null;
  map_y: number | null;
  trench_group: string | null;
  drawing_rev: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  has_open_cr: boolean;
  linked_compaction_tests?: string[];
  material_and_size?: string | null;
  upstream_pit_number?: string | null;
  downstream_pit_number?: string | null;
  number_of_conduits?: number | null;
  package_name?: string | null;
  client_name?: string | null;
  subcontractor_name?: string | null;
  min_horizontal_sep_mm?: number | null;
  min_vertical_sep_mm?: number | null;
  min_bedding_mm?: number | null;
  min_side_mm?: number | null;
  min_overlay_mm?: number | null;
  min_cover_mm?: number | null;
  bedding_and_overlay_material?: string | null;
  cover_material?: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface ItcStepPhoto {
  id: string;
  itc_id: string;
  step_key: string;
  activity_number: number | null;
  photo_url: string;
  gps_lat: number | null;
  gps_lng: number | null;
  captured_at: string | null;
  uploaded_by: string | null;
  uploaded_by_name: string | null;
  is_approved_for_export: boolean;
  approved_by: string | null;
  approved_by_name: string | null;
  approved_at: string | null;
}

export interface ItcPhoto {
  id: string;
  itc_id: string;
  slot_key: string;
  photo_url: string | null;
  not_required: boolean;
  not_required_reason: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  captured_at: string | null;
  uploaded_by: string | null;
}

export interface ItcSignoff {
  id: string;
  itc_id: string;
  step_key: string;
  step_index: number;
  author_id: string;
  author_name: string;
  comments: string | null;
  field_data: Record<string, unknown>;
  signature_url: string | null;
  status: ItcSignoffStatus;
  submitted_at: string | null;
  signed_at: string | null;
  signed_by_worker_id: string | null;
  verified_by: string | null;
  verified_by_name: string | null;
  verified_at: string | null;
}

export interface ItcChangeRequest {
  id: string;
  itc_id: string;
  signoff_id: string | null;
  requested_by: string;
  requested_by_name: string;
  reason: string;
  status: ItcChangeRequestStatus;
  reviewed_by: string | null;
  reviewed_by_name: string | null;
  reviewed_at: string | null;
  resolution_notes: string | null;
  created_at?: string;
}

export interface ItcDetailBundle {
  itc: ProjectItc;
  photos: ItcPhoto[];
  stepPhotos: ItcStepPhoto[];
  signoffs: ItcSignoff[];
  changeRequests: ItcChangeRequest[];
  steps: ItcFormStepTemplate[];
  inspectionActivities: ItcInspectionActivity[];
}

export interface BulkCreateItcInput {
  projectId: string;
  zoneCode: string;
  building?: string;
  serviceDiscipline: string;
  startHub: string;
  endHub: string;
  pitPrefix?: string;
  startPit: number;
  endPit: number;
  conduits: ItcConduitConfig[];
  lengthM?: number;
  trenchGroup?: string;
}

function stripItcPayload(payload: Record<string, unknown>): Record<string, unknown> {
  return sanitizeWritePayload(
    Object.fromEntries(Object.entries(payload).filter(([, value]) => value !== undefined))
  );
}

async function submitItcSignoffViaApi(input: {
  signoffId: string;
  itcId: string;
  signedByWorkerId: string;
  autoVerify?: boolean;
  verifiedBy?: string;
  verifiedByName?: string;
}): Promise<{ error: string | null; useFallback: boolean }> {
  try {
    const response = await fetch("/api/itc/signoffs/submit", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(input),
    });

    if (response.status === 503) {
      return { error: null, useFallback: true };
    }

    const payload = (await response.json()) as { error?: string };
    if (!response.ok) {
      return { error: payload.error ?? "Submit failed", useFallback: false };
    }

    return { error: null, useFallback: false };
  } catch {
    return { error: null, useFallback: true };
  }
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

function normalizeZone(row: Record<string, unknown>): ItcZone {
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    zone_code: String(row.zone_code ?? ""),
    zone_name: String(row.zone_name ?? row.zone_code ?? ""),
    map_x: row.map_x == null ? null : Number(row.map_x),
    map_y: row.map_y == null ? null : Number(row.map_y),
    sort_order: Number(row.sort_order ?? 0),
  };
}

function normalizeItc(row: Record<string, unknown>): ProjectItc {
  const conduits = Array.isArray(row.conduits)
    ? (row.conduits as ItcConduitConfig[])
    : [];
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    itc_number: String(row.itc_number ?? ""),
    zone_id: row.zone_id ? String(row.zone_id) : null,
    zone_code: row.zone_code ? String(row.zone_code) : null,
    building: row.building ? String(row.building) : null,
    service_discipline: String(row.service_discipline ?? "Electrical"),
    trade_discipline: row.trade_discipline ? String(row.trade_discipline) : null,
    service_type: row.service_type ? String(row.service_type) : null,
    material_colour: row.material_colour ? String(row.material_colour) : null,
    start_location: row.start_location ? String(row.start_location) : null,
    end_location: row.end_location ? String(row.end_location) : null,
    conduits,
    length_m: row.length_m == null ? null : Number(row.length_m),
    length_of_run_m: row.length_of_run_m == null ? null : Number(row.length_of_run_m),
    number_of_tees: row.number_of_tees == null ? null : Number(row.number_of_tees),
    redline_markup_url: row.redline_markup_url ? String(row.redline_markup_url) : null,
    gps_lat: row.gps_lat == null ? null : Number(row.gps_lat),
    gps_lng: row.gps_lng == null ? null : Number(row.gps_lng),
    form_data:
      row.form_data && typeof row.form_data === "object"
        ? (row.form_data as Record<string, unknown>)
        : {},
    status: (row.status as ItcStatus) ?? "not_started",
    progress_percent: Number(row.progress_percent ?? 0),
    map_x: row.map_x == null ? null : Number(row.map_x),
    map_y: row.map_y == null ? null : Number(row.map_y),
    trench_group: row.trench_group ? String(row.trench_group) : null,
    drawing_rev: row.drawing_rev ? String(row.drawing_rev) : null,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_name: row.assigned_name ? String(row.assigned_name) : null,
    has_open_cr: row.has_open_cr === true,
    material_and_size: row.material_and_size
      ? String(row.material_and_size)
      : null,
    upstream_pit_number: row.upstream_pit_number ? String(row.upstream_pit_number) : null,
    downstream_pit_number: row.downstream_pit_number ? String(row.downstream_pit_number) : null,
    number_of_conduits: row.number_of_conduits == null ? null : Number(row.number_of_conduits),
    package_name: row.package_name ? String(row.package_name) : null,
    client_name: row.client_name ? String(row.client_name) : null,
    subcontractor_name: row.subcontractor_name ? String(row.subcontractor_name) : null,
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
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
}

function normalizeInspectionActivity(row: Record<string, unknown>): ItcInspectionActivity {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id ?? ""),
    activity_number: Number(row.activity_number ?? 0),
    title: String(row.title ?? ""),
    inspection_criteria: row.inspection_criteria ? String(row.inspection_criteria) : null,
    check_result: row.check_result ? String(row.check_result) : null,
    requires_photo: row.requires_photo === true,
    check_by: row.check_by ? String(row.check_by) : null,
    checked_date: row.checked_date ? String(row.checked_date) : null,
    comments: row.comments ? String(row.comments) : null,
    photo_url: row.photo_url ? String(row.photo_url) : null,
    sort_order: Number(row.sort_order ?? 0),
  };
}

function buildDefaultInspectionActivities(
  itcId: string,
  discipline?: string | null
): ItcInspectionActivity[] {
  return STANDARD_ITC_INSPECTION_ACTIVITIES.map((activity, index) => {
    const isPressure =
      isHydraulicDiscipline(discipline) && activity.activity_number === 12;
    return {
      id: `${itcId}-act-${activity.activity_number}`,
      itc_id: itcId,
      activity_number: activity.activity_number,
      title: isPressure ? "Pressure test" : activity.title,
      inspection_criteria: isPressure
        ? "AS 2566.2 Section M5 pressure test completed and recorded."
        : activity.inspection_criteria,
      check_result: null,
      requires_photo: activity.requires_photo,
      check_by: null,
      checked_date: null,
      comments: null,
      photo_url: null,
      sort_order: index,
    };
  });
}

export function mergeInspectionActivities(
  itcId: string,
  stored: ItcInspectionActivity[],
  discipline?: string | null
): ItcInspectionActivity[] {
  const defaults = buildDefaultInspectionActivities(itcId, discipline);
  if (!stored.length) return defaults;

  return defaults.map((template) => {
    const match = stored.find((row) => row.activity_number === template.activity_number);
    if (!match) return template;
    return {
      ...template,
      ...match,
      inspection_criteria: match.inspection_criteria ?? template.inspection_criteria,
    };
  });
}

function normalizePhoto(row: Record<string, unknown>): ItcPhoto {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    slot_key: String(row.slot_key),
    photo_url: row.photo_url ? String(row.photo_url) : null,
    not_required: row.not_required === true,
    not_required_reason: row.not_required_reason
      ? String(row.not_required_reason)
      : null,
    gps_lat: row.gps_lat == null ? null : Number(row.gps_lat),
    gps_lng: row.gps_lng == null ? null : Number(row.gps_lng),
    captured_at: row.captured_at ? String(row.captured_at) : null,
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
  };
}

function normalizeStepPhoto(row: Record<string, unknown>): ItcStepPhoto {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    step_key: String(row.step_key ?? "general"),
    activity_number: row.activity_number == null ? null : Number(row.activity_number),
    photo_url: String(row.photo_url ?? ""),
    gps_lat: row.gps_lat == null ? null : Number(row.gps_lat),
    gps_lng: row.gps_lng == null ? null : Number(row.gps_lng),
    captured_at: row.captured_at ? String(row.captured_at) : null,
    uploaded_by: row.uploaded_by ? String(row.uploaded_by) : null,
    uploaded_by_name: row.uploaded_by_name ? String(row.uploaded_by_name) : null,
    is_approved_for_export: row.is_approved_for_export === true,
    approved_by: row.approved_by ? String(row.approved_by) : null,
    approved_by_name: row.approved_by_name ? String(row.approved_by_name) : null,
    approved_at: row.approved_at ? String(row.approved_at) : null,
  };
}

function normalizeSignoff(row: Record<string, unknown>): ItcSignoff {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    step_key: String(row.step_key),
    step_index: Number(row.step_index ?? 0),
    author_id: String(row.author_id ?? ""),
    author_name: String(row.author_name ?? ""),
    comments: row.comments ? String(row.comments) : null,
    field_data:
      row.field_data && typeof row.field_data === "object"
        ? (row.field_data as Record<string, unknown>)
        : {},
    signature_url: row.signature_url ? String(row.signature_url) : null,
    status: (row.status as ItcSignoffStatus) ?? "draft",
    submitted_at: row.submitted_at ? String(row.submitted_at) : null,
    signed_at: row.signed_at ? String(row.signed_at) : null,
    signed_by_worker_id: row.signed_by_worker_id
      ? String(row.signed_by_worker_id)
      : null,
    verified_by: row.verified_by ? String(row.verified_by) : null,
    verified_by_name: row.verified_by_name ? String(row.verified_by_name) : null,
    verified_at: row.verified_at ? String(row.verified_at) : null,
  };
}

function normalizeChangeRequest(row: Record<string, unknown>): ItcChangeRequest {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    signoff_id: row.signoff_id ? String(row.signoff_id) : null,
    requested_by: String(row.requested_by ?? ""),
    requested_by_name: String(row.requested_by_name ?? ""),
    reason: String(row.reason ?? ""),
    status: (row.status as ItcChangeRequestStatus) ?? "pending",
    reviewed_by: row.reviewed_by ? String(row.reviewed_by) : null,
    reviewed_by_name: row.reviewed_by_name ? String(row.reviewed_by_name) : null,
    reviewed_at: row.reviewed_at ? String(row.reviewed_at) : null,
    resolution_notes: row.resolution_notes ? String(row.resolution_notes) : null,
    created_at: row.created_at as string | undefined,
  };
}

export async function fetchItcZones(projectId: string): Promise<ItcZone[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const resolved = await resolveProject(projectId);
    const { data, error } = await supabase
      .from("itc_zones")
      .select("*")
      .eq("project_id", resolved)
      .order("sort_order");

    if (error) {
      if (!isMissingTableError(error.message, "itc_zones")) {
        console.warn("fetchItcZones failed:", error.message);
      }
      return [];
    }

    if (!data?.length) return [];
    return data.map((row) => normalizeZone(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function fetchProjectItcs(
  projectId: string,
  zoneCode?: string | null
): Promise<ProjectItc[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const resolved = await resolveProject(projectId);
    let query = supabase.from("project_itcs").select("*").eq("project_id", resolved);
    if (zoneCode && zoneCode !== "ALL") {
      query = query.eq("zone_code", zoneCode);
    }
    const { data, error } = await query.order("itc_number");

    if (error) {
      if (!isMissingTableError(error.message, "project_itcs")) {
        console.warn("fetchProjectItcs failed:", error.message);
      }
      return [];
    }

    if (!data?.length) return [];

    return data.map((row) => normalizeItc(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function fetchItcDetail(itcId: string): Promise<ItcDetailBundle | null> {
  if (!isSupabaseConfigured()) return null;

  const { data: itcRow, error } = await supabase
    .from("project_itcs")
    .select("*")
    .eq("id", itcId)
    .maybeSingle();

  if (error || !itcRow) return null;

  const [
    { data: photoRows },
    { data: stepPhotoRows },
    { data: signoffRows },
    { data: crRows },
  ] = await Promise.all([
    supabase.from("itc_photos").select("*").eq("itc_id", itcId),
    supabase.from("itc_step_photos").select("*").eq("itc_id", itcId).order("created_at"),
    supabase.from("itc_signoffs").select("*").eq("itc_id", itcId).order("step_index"),
    supabase
      .from("itc_change_requests")
      .select("*")
      .eq("itc_id", itcId)
      .order("created_at", { ascending: false }),
  ]);

  return {
    itc: normalizeItc(itcRow as Record<string, unknown>),
    photos: (photoRows ?? []).map((row) => normalizePhoto(row as Record<string, unknown>)),
    stepPhotos: (stepPhotoRows ?? []).map((row) =>
      normalizeStepPhoto(row as Record<string, unknown>)
    ),
    signoffs: (signoffRows ?? []).map((row) =>
      normalizeSignoff(row as Record<string, unknown>)
    ),
    changeRequests: (crRows ?? []).map((row) =>
      normalizeChangeRequest(row as Record<string, unknown>)
    ),
    steps: getItcFormSteps(
      String(
        (itcRow as { trade_discipline?: string | null }).trade_discipline ??
          (itcRow as { service_discipline?: string | null }).service_discipline ??
          ""
      )
    ),
    inspectionActivities: mergeInspectionActivities(
      itcId,
      [],
      String(
        (itcRow as { trade_discipline?: string | null }).trade_discipline ??
          (itcRow as { service_discipline?: string | null }).service_discipline ??
          ""
      )
    ),
  };
}

export async function bulkCreateItcs(
  input: BulkCreateItcInput
): Promise<{ error: string | null; created: number }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured", created: 0 };
  }

  try {
    const resolved = await resolveProject(input.projectId);
    const prefix = input.pitPrefix?.trim() || "Pit";
    const rows = [];
    let sequence = await getNextItcSequence(
      resolved,
      input.zoneCode,
      input.serviceDiscipline
    );

    for (let pit = input.startPit; pit <= input.endPit; pit += 1) {
      const nextPit = pit + 1;
      const itcNumber = formatItcAutoName(
        input.zoneCode,
        input.serviceDiscipline,
        sequence
      );
      sequence += 1;

      if (nextPit > input.endPit && input.endHub.trim()) {
        rows.push({
          project_id: resolved,
          itc_number: itcNumber,
          zone_code: input.zoneCode,
          building: input.building?.trim() || null,
          service_discipline: input.serviceDiscipline,
          service_type: input.serviceDiscipline,
          trade_discipline: input.serviceDiscipline,
          start_location: `${prefix} ${pit}`,
          end_location: input.endHub.trim(),
          conduits: input.conduits,
          length_m: input.lengthM ?? null,
          trench_group: input.trenchGroup?.trim() || `T-${input.zoneCode}`,
          status: "not_started",
          progress_percent: 0,
        });
        break;
      }

      rows.push({
        project_id: resolved,
        itc_number: itcNumber,
        zone_code: input.zoneCode,
        building: input.building?.trim() || null,
        service_discipline: input.serviceDiscipline,
        service_type: input.serviceDiscipline,
        trade_discipline: input.serviceDiscipline,
        start_location: pit === input.startPit ? input.startHub.trim() : `${prefix} ${pit}`,
        end_location:
          nextPit <= input.endPit ? `${prefix} ${nextPit}` : input.endHub.trim(),
        conduits: input.conduits,
        length_m: input.lengthM ?? null,
        trench_group: input.trenchGroup?.trim() || `T-${input.zoneCode}`,
        status: "not_started",
        progress_percent: 0,
      });
    }

    if (rows.length === 0) return { error: "No ITCs generated.", created: 0 };

    const { error } = await supabase.from("project_itcs").insert(rows);
    if (error) return { error: error.message, created: 0 };
    return { error: null, created: rows.length };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Bulk create failed",
      created: 0,
    };
  }
}

export async function saveItcPhoto(input: {
  itcId: string;
  slotKey: string;
  photoUrl?: string | null;
  notRequired?: boolean;
  notRequiredReason?: string | null;
  gpsLat?: number | null;
  gpsLng?: number | null;
  uploadedBy?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const payload = stripItcPayload({
    itc_id: input.itcId,
    slot_key: input.slotKey,
    photo_url: input.photoUrl ?? null,
    not_required: input.notRequired ?? false,
    not_required_reason: input.notRequiredReason?.trim() || null,
    gps_lat: input.gpsLat ?? null,
    gps_lng: input.gpsLng ?? null,
    captured_at: new Date().toISOString(),
    uploaded_by: input.uploadedBy ?? null,
    updated_at: new Date().toISOString(),
  });

  const { error } = await supabase.from("itc_photos").upsert(payload, {
    onConflict: "itc_id,slot_key",
  });

  return { error: error?.message ?? null };
}

export async function upsertItcSignoffDraft(input: {
  itcId: string;
  stepKey: string;
  stepIndex: number;
  authorId: string;
  authorName: string;
  comments?: string;
  fieldData?: Record<string, unknown>;
  signatureUrl?: string | null;
}): Promise<{ error: string | null; signoff?: ItcSignoff }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { data: existing } = await supabase
    .from("itc_signoffs")
    .select("*")
    .eq("itc_id", input.itcId)
    .eq("step_index", input.stepIndex)
    .eq("author_id", input.authorId)
    .maybeSingle();

  if (existing && existing.status === "submitted") {
    return { error: "Submitted sign-offs are locked. Submit a Change Request to alter." };
  }

  const { data: authorSignoffs } = await supabase
    .from("itc_signoffs")
    .select("step_index, author_id, status")
    .eq("itc_id", input.itcId)
    .eq("author_id", input.authorId);

  const priorSignoffs = (authorSignoffs ?? []).map((row) => ({
    step_index: Number(row.step_index),
    author_id: String(row.author_id),
    status: String(row.status),
  }));

  if (!isItcStepUnlocked(input.stepIndex, priorSignoffs, input.authorId)) {
    return { error: "Complete and submit the previous step before working on this one." };
  }

  const payload = stripItcPayload({
    itc_id: input.itcId,
    step_key: input.stepKey,
    step_index: input.stepIndex,
    author_id: input.authorId,
    author_name: input.authorName.trim(),
    comments: nullIfBlank(input.comments),
    field_data: input.fieldData ?? {},
    signature_url: nullIfBlank(input.signatureUrl),
    status: "draft" as const,
    updated_at: new Date().toISOString(),
  });

  const { data, error } = existing?.id
    ? await supabase
        .from("itc_signoffs")
        .update(payload)
        .eq("id", existing.id)
        .select("*")
        .single()
    : await supabase.from("itc_signoffs").insert(payload).select("*").single();

  if (error || !data) return { error: error?.message ?? "Failed to save draft" };
  return { error: null, signoff: normalizeSignoff(data as Record<string, unknown>) };
}

export async function submitItcSignoff(input: {
  signoffId: string;
  itcId: string;
  signedByWorkerId: string;
  autoVerify?: boolean;
  verifiedBy?: string;
  verifiedByName?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const apiResult = await submitItcSignoffViaApi(input);
  if (!apiResult.useFallback) {
    return { error: apiResult.error };
  }

  const { data: signoffRow, error: fetchError } = await supabase
    .from("itc_signoffs")
    .select("*")
    .eq("id", input.signoffId)
    .maybeSingle();

  if (fetchError || !signoffRow) {
    return { error: fetchError?.message ?? "Sign-off not found." };
  }

  if (signoffRow.status === "submitted") {
    return { error: "This step is already submitted and locked." };
  }

  if (!signoffRow.signature_url) {
    return { error: "A signature is required before submitting this step." };
  }

  const { data: authorSignoffs } = await supabase
    .from("itc_signoffs")
    .select("step_index, author_id, status")
    .eq("itc_id", input.itcId)
    .eq("author_id", signoffRow.author_id);

  if (
    !isItcStepUnlocked(
      Number(signoffRow.step_index),
      (authorSignoffs ?? []).map((row) => ({
        step_index: Number(row.step_index),
        author_id: String(row.author_id),
        status: String(row.status),
      })),
      String(signoffRow.author_id)
    )
  ) {
    return { error: "Complete and submit the previous step before submitting this one." };
  }

  const submittedAt = new Date().toISOString();
  const verifyPayload = input.autoVerify
    ? {
        verified_by: input.verifiedBy ?? input.signedByWorkerId,
        verified_by_name: input.verifiedByName?.trim() || null,
        verified_at: submittedAt,
      }
    : {};

  const { error } = await supabase
    .from("itc_signoffs")
    .update(
      stripItcPayload({
        status: "submitted",
        submitted_at: submittedAt,
        signed_at: submittedAt,
        signed_by_worker_id: input.signedByWorkerId,
        updated_at: submittedAt,
        ...verifyPayload,
      })
    )
    .eq("id", input.signoffId)
    .eq("status", "draft");

  if (error) return { error: error.message };

  const { data: signoffs, error: signoffsError } = await supabase
    .from("itc_signoffs")
    .select("step_index, status")
    .eq("itc_id", input.itcId)
    .eq("status", "submitted");

  if (signoffsError) return { error: signoffsError.message };

  const submittedCount = new Set(
    (signoffs ?? []).map((row) => Number(row.step_index))
  ).size;
  const progress = Math.round((submittedCount / DEFAULT_ITC_FORM_STEPS.length) * 100);
  const status = deriveItcStatus({
    progress_percent: progress,
    has_open_cr: false,
    submittedSteps: submittedCount,
  });

  const { error: itcUpdateError } = await supabase
    .from("project_itcs")
    .update(
      stripItcPayload({
        progress_percent: progress,
        status,
        updated_at: submittedAt,
      })
    )
    .eq("id", input.itcId);

  if (itcUpdateError) return { error: itcUpdateError.message };

  return { error: null };
}

export async function bulkSignOffItcStep(input: {
  itcIds: string[];
  stepKey: string;
  stepIndex: number;
  authorId: string;
  authorName: string;
  comments?: string;
  fieldData?: Record<string, unknown>;
  signatureUrl?: string;
}): Promise<{ error: string | null; signed: number }> {
  let signed = 0;
  for (const itcId of input.itcIds) {
    const draft = await upsertItcSignoffDraft({
      itcId,
      stepKey: input.stepKey,
      stepIndex: input.stepIndex,
      authorId: input.authorId,
      authorName: input.authorName,
      comments: input.comments,
      fieldData: input.fieldData,
      signatureUrl: input.signatureUrl,
    });
    if (draft.error || !draft.signoff) continue;

    const submit = await submitItcSignoff({
      signoffId: draft.signoff.id,
      itcId,
      signedByWorkerId: input.authorId,
    });
    if (!submit.error) signed += 1;
  }

  return { error: null, signed };
}

export async function createItcChangeRequest(input: {
  itcId: string;
  signoffId?: string | null;
  requestedBy: string;
  requestedByName: string;
  reason: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { error } = await supabase.from("itc_change_requests").insert({
    itc_id: input.itcId,
    signoff_id: input.signoffId ?? null,
    requested_by: input.requestedBy,
    requested_by_name: input.requestedByName.trim(),
    reason: input.reason.trim(),
    status: "pending",
  });

  if (error) return { error: error.message };

  await supabase
    .from("project_itcs")
    .update({ has_open_cr: true, status: "issue", updated_at: new Date().toISOString() })
    .eq("id", input.itcId);

  return { error: null };
}

export async function verifyItcSignoff(input: {
  signoffId: string;
  verifiedBy: string;
  verifiedByName: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { error } = await supabase
    .from("itc_signoffs")
    .update({
      verified_by: input.verifiedBy,
      verified_by_name: input.verifiedByName.trim(),
      verified_at: new Date().toISOString(),
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.signoffId)
    .eq("status", "submitted");

  return { error: error?.message ?? null };
}

export async function fetchVerificationQueue(projectId: string): Promise<ItcSignoff[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const resolved = await resolveProject(projectId);
    const { data: itcs } = await supabase
      .from("project_itcs")
      .select("id")
      .eq("project_id", resolved);

    const itcIds = (itcs ?? []).map((row) => String(row.id));
    if (itcIds.length === 0) return [];

    const { data, error } = await supabase
      .from("itc_signoffs")
      .select("*")
      .in("itc_id", itcIds)
      .eq("status", "submitted")
      .is("verified_at", null)
      .order("submitted_at", { ascending: false });

    if (error) {
      console.warn("fetchVerificationQueue failed:", error.message);
      return [];
    }

    return (data ?? []).map((row) => normalizeSignoff(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function fetchPendingChangeRequests(
  projectId: string
): Promise<ItcChangeRequest[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const resolved = await resolveProject(projectId);
    const { data: itcs } = await supabase
      .from("project_itcs")
      .select("id")
      .eq("project_id", resolved);
    const itcIds = (itcs ?? []).map((row) => String(row.id));
    if (itcIds.length === 0) return [];

    const { data, error } = await supabase
      .from("itc_change_requests")
      .select("*")
      .in("itc_id", itcIds)
      .eq("status", "pending")
      .order("created_at", { ascending: false });

    if (error) return [];
    return (data ?? []).map((row) => normalizeChangeRequest(row as Record<string, unknown>));
  } catch {
    return [];
  }
}

export async function reviewItcChangeRequest(input: {
  requestId: string;
  itcId: string;
  status: "approved" | "rejected";
  reviewedBy: string;
  reviewedByName: string;
  resolutionNotes?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const reviewedAt = new Date().toISOString();
  const { error } = await supabase
    .from("itc_change_requests")
    .update({
      status: input.status,
      reviewed_by: input.reviewedBy,
      reviewed_by_name: input.reviewedByName.trim(),
      reviewed_at: reviewedAt,
      resolution_notes: input.resolutionNotes?.trim() || null,
    })
    .eq("id", input.requestId);

  if (error) return { error: error.message };

  if (input.status === "approved") {
    await supabase
      .from("project_itcs")
      .update({ has_open_cr: false, updated_at: reviewedAt })
      .eq("id", input.itcId);
  }

  return { error: null };
}

export async function fetchItcStepPhotos(itcId: string): Promise<ItcStepPhoto[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("itc_step_photos")
    .select("*")
    .eq("itc_id", itcId)
    .order("created_at");

  if (error) {
    if (!isMissingTableError(error.message, "itc_step_photos")) {
      console.warn("fetchItcStepPhotos failed:", error.message);
    }
    return [];
  }

  return (data ?? []).map((row) => normalizeStepPhoto(row as Record<string, unknown>));
}

export async function addItcStepPhoto(input: {
  itcId: string;
  stepKey: string;
  activityNumber?: number | null;
  photoUrl: string;
  gpsLat?: number | null;
  gpsLng?: number | null;
  uploadedBy?: string;
  uploadedByName?: string;
}): Promise<{ error: string | null; photo?: ItcStepPhoto }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  if (input.stepKey === ITC_FIELD_PHOTO_STEP_KEY) {
    const { count, error: countError } = await supabase
      .from("itc_step_photos")
      .select("id", { count: "exact", head: true })
      .eq("itc_id", input.itcId)
      .eq("step_key", ITC_FIELD_PHOTO_STEP_KEY);

    if (countError) return { error: countError.message };
    if ((count ?? 0) >= ITC_MAX_FIELD_PHOTOS) {
      return { error: `Maximum of ${ITC_MAX_FIELD_PHOTOS} field photos reached.` };
    }
  }

  const payload = {
    itc_id: input.itcId,
    step_key: input.stepKey,
    activity_number: input.activityNumber ?? null,
    photo_url: input.photoUrl,
    gps_lat: input.gpsLat ?? null,
    gps_lng: input.gpsLng ?? null,
    captured_at: new Date().toISOString(),
    uploaded_by: input.uploadedBy ?? null,
    uploaded_by_name: input.uploadedByName ?? null,
  };

  const { data, error } = await supabase
    .from("itc_step_photos")
    .insert([payload])
    .select("*")
    .single();

  if (error || !data) return { error: error?.message ?? "Failed to save step photo" };
  return { error: null, photo: normalizeStepPhoto(data as Record<string, unknown>) };
}

export async function setStepPhotoApproval(input: {
  photoId: string;
  approved: boolean;
  approvedBy?: string;
  approvedByName?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  if (input.approved) {
    const { data: photoRow } = await supabase
      .from("itc_step_photos")
      .select("itc_id, step_key")
      .eq("id", input.photoId)
      .maybeSingle();

    if (photoRow?.step_key === ITC_FIELD_PHOTO_STEP_KEY) {
      const { count, error: countError } = await supabase
        .from("itc_step_photos")
        .select("id", { count: "exact", head: true })
        .eq("itc_id", photoRow.itc_id)
        .eq("step_key", ITC_FIELD_PHOTO_STEP_KEY)
        .eq("is_approved_for_export", true);

      if (countError) return { error: countError.message };
      if ((count ?? 0) >= ITC_MAX_FINAL_PHOTOS) {
        return {
          error: `Maximum of ${ITC_MAX_FINAL_PHOTOS} final photos can be featured on the certified report.`,
        };
      }
    }
  }

  const payload = input.approved
    ? {
        is_approved_for_export: true,
        approved_by: input.approvedBy ?? null,
        approved_by_name: input.approvedByName?.trim() || null,
        approved_at: new Date().toISOString(),
      }
    : {
        is_approved_for_export: false,
        approved_by: null,
        approved_by_name: null,
        approved_at: null,
      };

  const { error } = await supabase
    .from("itc_step_photos")
    .update(payload)
    .eq("id", input.photoId);

  return { error: error?.message ?? null };
}

export async function getNextItcSequence(
  projectId: string,
  siteNumber: string,
  serviceType: string
): Promise<number> {
  if (!isSupabaseConfigured()) return 1;

  const prefix = itcAutoNamePrefix(siteNumber, serviceType);
  const { data } = await supabase
    .from("project_itcs")
    .select("itc_number")
    .eq("project_id", projectId)
    .ilike("itc_number", `${prefix}%`);

  let maxSeq = 0;
  for (const row of data ?? []) {
    const seq = parseItcAutoNameSequence(String(row.itc_number ?? ""));
    if (seq != null) maxSeq = Math.max(maxSeq, seq);
  }
  return maxSeq + 1;
}

export async function createItcDraft(input: {
  projectId: string;
  zoneCode?: string;
  serviceDiscipline?: string;
  serviceType?: string;
}): Promise<{ error: string | null; itc?: ProjectItc }> {
  const zone = input.zoneCode?.trim() || "SITE";
  const service =
    input.serviceType?.trim() || input.serviceDiscipline?.trim() || "General";

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured" };
  }

  const resolved = await resolveProject(input.projectId);
  const sequence = await getNextItcSequence(resolved, zone, service);
  const itcNumber = formatItcAutoName(zone, service, sequence);

  const { data, error } = await supabase
    .from("project_itcs")
    .insert({
      project_id: resolved,
      itc_number: itcNumber,
      zone_code: zone,
      service_discipline: service,
      service_type: service,
      trade_discipline: service,
      status: "not_started",
      progress_percent: 0,
      form_data: {},
    })
    .select("*")
    .single();

  if (error || !data) {
    return { error: error?.message ?? "Failed to create ITC draft" };
  }

  return { error: null, itc: normalizeItc(data as Record<string, unknown>) };
}

export async function updateItcTradeForm(input: {
  itcId: string;
  payload: Record<string, unknown>;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const formData = input.payload.form_data;
  const updatePayload: Record<string, unknown> = {
    ...input.payload,
    updated_at: new Date().toISOString(),
  };

  if (input.payload.upstream_pit_number) {
    updatePayload.start_location = input.payload.upstream_pit_number;
  }
  if (input.payload.downstream_pit_number) {
    updatePayload.end_location = input.payload.downstream_pit_number;
  }

  const { error } = await supabase
    .from("project_itcs")
    .update(updatePayload)
    .eq("id", input.itcId);

  return { error: error?.message ?? null };
}

export async function updateItcGpsLocation(input: {
  itcId: string;
  projectId: string;
  gpsLat: number;
  gpsLng: number;
}): Promise<{ error: string | null; linkedTests?: string[] }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { error } = await supabase
    .from("project_itcs")
    .update({
      gps_lat: input.gpsLat,
      gps_lng: input.gpsLng,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.itcId);

  if (error) return { error: error.message };

  const { linkItcToNearbyCompactionTests } = await import("./itc-compaction-service");
  const linkedTests = await linkItcToNearbyCompactionTests(
    input.itcId,
    input.projectId,
    input.gpsLat,
    input.gpsLng
  );

  return { error: null, linkedTests };
}

export { DEFAULT_ITC_FORM_STEPS };
