import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId } from "./project-resolver";
import {
  DEFAULT_ITC_FORM_STEPS,
  DEMO_ITC_ZONES,
  deriveItcStatus,
  type ItcChangeRequestStatus,
  type ItcConduitConfig,
  type ItcFormStepTemplate,
  type ItcSignoffStatus,
  type ItcStatus,
} from "./itc-templates";

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
  start_location: string | null;
  end_location: string | null;
  conduits: ItcConduitConfig[];
  length_m: number | null;
  status: ItcStatus;
  progress_percent: number;
  map_x: number | null;
  map_y: number | null;
  trench_group: string | null;
  drawing_rev: string | null;
  assigned_to: string | null;
  assigned_name: string | null;
  has_open_cr: boolean;
  created_at?: string;
  updated_at?: string;
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
  signoffs: ItcSignoff[];
  changeRequests: ItcChangeRequest[];
  steps: ItcFormStepTemplate[];
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
    start_location: row.start_location ? String(row.start_location) : null,
    end_location: row.end_location ? String(row.end_location) : null,
    conduits,
    length_m: row.length_m == null ? null : Number(row.length_m),
    status: (row.status as ItcStatus) ?? "not_started",
    progress_percent: Number(row.progress_percent ?? 0),
    map_x: row.map_x == null ? null : Number(row.map_x),
    map_y: row.map_y == null ? null : Number(row.map_y),
    trench_group: row.trench_group ? String(row.trench_group) : null,
    drawing_rev: row.drawing_rev ? String(row.drawing_rev) : null,
    assigned_to: row.assigned_to ? String(row.assigned_to) : null,
    assigned_name: row.assigned_name ? String(row.assigned_name) : null,
    has_open_cr: row.has_open_cr === true,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
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

function buildDemoZones(projectId: string): ItcZone[] {
  return DEMO_ITC_ZONES.map((zone, index) => ({
    id: `demo-zone-${index}`,
    project_id: projectId,
    zone_code: zone.zone_code,
    zone_name: zone.zone_name,
    map_x: zone.map_x,
    map_y: zone.map_y,
    sort_order: zone.sort_order,
  }));
}

function buildDemoItcs(projectId: string, zones: ItcZone[]): ProjectItc[] {
  const samples = [
    {
      itc_number: "ITC-MP0-001",
      zone_code: "MP0",
      building: "Building 1",
      start: "Pit 12",
      end: "Pit 18",
      status: "ongoing" as ItcStatus,
      progress: 45,
      trench: "T-MP0-A",
    },
    {
      itc_number: "ITC-MP0-002",
      zone_code: "MP0",
      building: "Building 1",
      start: "Pit 18",
      end: "Node B",
      status: "complete" as ItcStatus,
      progress: 100,
      trench: "T-MP0-A",
    },
    {
      itc_number: "ITC-MP1-003",
      zone_code: "MP1",
      building: "Building 2",
      start: "Hub North",
      end: "Pit 04",
      status: "issue" as ItcStatus,
      progress: 60,
      trench: "T-MP1-B",
    },
    {
      itc_number: "ITC-HRN-004",
      zone_code: "HRN",
      building: "Haul Road",
      start: "Pit 22",
      end: "Pit 26",
      status: "not_started" as ItcStatus,
      progress: 0,
      trench: "T-HRN-1",
    },
  ];

  return samples.map((sample, index) => {
    const zone = zones.find((row) => row.zone_code === sample.zone_code);
    return {
      id: `demo-itc-${index}`,
      project_id: projectId,
      itc_number: sample.itc_number,
      zone_id: zone?.id ?? null,
      zone_code: sample.zone_code,
      building: sample.building,
      service_discipline: "Electrical LV",
      start_location: sample.start,
      end_location: sample.end,
      conduits: [
        { n: 4, size: "100mm" },
        { n: 2, size: "50mm" },
      ],
      length_m: 86 + index * 12,
      status: sample.status,
      progress_percent: sample.progress,
      map_x: (zone?.map_x ?? 0.5) + index * 0.03,
      map_y: (zone?.map_y ?? 0.5) + index * 0.02,
      trench_group: sample.trench,
      drawing_rev: "Rev C",
      assigned_to: null,
      assigned_name: null,
      has_open_cr: sample.status === "issue",
    };
  });
}

export async function fetchItcZones(projectId: string): Promise<ItcZone[]> {
  if (!isSupabaseConfigured()) return buildDemoZones(projectId);

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
      return buildDemoZones(projectId);
    }

    if (!data?.length) return buildDemoZones(projectId);
    return data.map((row) => normalizeZone(row as Record<string, unknown>));
  } catch {
    return buildDemoZones(projectId);
  }
}

export async function fetchProjectItcs(
  projectId: string,
  zoneCode?: string | null
): Promise<ProjectItc[]> {
  if (!isSupabaseConfigured()) {
    const zones = buildDemoZones(projectId);
    const demo = buildDemoItcs(projectId, zones);
    if (!zoneCode || zoneCode === "ALL") return demo;
    return demo.filter((row) => row.zone_code === zoneCode);
  }

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
      const zones = await fetchItcZones(projectId);
      const demo = buildDemoItcs(projectId, zones);
      if (!zoneCode || zoneCode === "ALL") return demo;
      return demo.filter((row) => row.zone_code === zoneCode);
    }

    if (!data?.length) {
      const zones = await fetchItcZones(projectId);
      const demo = buildDemoItcs(projectId, zones);
      if (!zoneCode || zoneCode === "ALL") return demo;
      return demo.filter((row) => row.zone_code === zoneCode);
    }

    return data.map((row) => normalizeItc(row as Record<string, unknown>));
  } catch {
    const zones = buildDemoZones(projectId);
    const demo = buildDemoItcs(projectId, zones);
    if (!zoneCode || zoneCode === "ALL") return demo;
    return demo.filter((row) => row.zone_code === zoneCode);
  }
}

export async function fetchItcDetail(itcId: string): Promise<ItcDetailBundle | null> {
  if (!itcId.startsWith("demo-itc-")) {
    if (!isSupabaseConfigured()) return null;

    const { data: itcRow, error } = await supabase
      .from("project_itcs")
      .select("*")
      .eq("id", itcId)
      .maybeSingle();

    if (error || !itcRow) return null;

    const [{ data: photoRows }, { data: signoffRows }, { data: crRows }] =
      await Promise.all([
        supabase.from("itc_photos").select("*").eq("itc_id", itcId),
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
      signoffs: (signoffRows ?? []).map((row) =>
        normalizeSignoff(row as Record<string, unknown>)
      ),
      changeRequests: (crRows ?? []).map((row) =>
        normalizeChangeRequest(row as Record<string, unknown>)
      ),
      steps: DEFAULT_ITC_FORM_STEPS,
    };
  }

  const projectId = "demo";
  const zones = buildDemoZones(projectId);
  const itc = buildDemoItcs(projectId, zones).find((row) => row.id === itcId);
  if (!itc) return null;

  return {
    itc,
    photos: [],
    signoffs: [],
    changeRequests: itc.has_open_cr
      ? [
          {
            id: "demo-cr-1",
            itc_id: itcId,
            signoff_id: null,
            requested_by: "worker-1",
            requested_by_name: "Site Worker",
            reason: "Compaction test number entered incorrectly.",
            status: "pending",
            reviewed_by: null,
            reviewed_by_name: null,
            reviewed_at: null,
            resolution_notes: null,
          },
        ]
      : [],
    steps: DEFAULT_ITC_FORM_STEPS,
  };
}

export async function bulkCreateItcs(
  input: BulkCreateItcInput
): Promise<{ error: string | null; created: number }> {
  if (!isSupabaseConfigured()) {
    const count = Math.max(0, input.endPit - input.startPit + 1);
    return { error: null, created: count };
  }

  try {
    const resolved = await resolveProject(input.projectId);
    const prefix = input.pitPrefix?.trim() || "Pit";
    const rows = [];

    for (let pit = input.startPit; pit <= input.endPit; pit += 1) {
      const nextPit = pit + 1;
      if (nextPit > input.endPit && input.endHub.trim()) {
        rows.push({
          project_id: resolved,
          itc_number: `ITC-${input.zoneCode}-${String(pit).padStart(2, "0")}`,
          zone_code: input.zoneCode,
          building: input.building?.trim() || null,
          service_discipline: input.serviceDiscipline,
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
        itc_number: `ITC-${input.zoneCode}-${String(pit).padStart(2, "0")}`,
        zone_code: input.zoneCode,
        building: input.building?.trim() || null,
        service_discipline: input.serviceDiscipline,
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
  if (input.itcId.startsWith("demo-itc-")) return { error: null };
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const payload = {
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
  };

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
  if (input.itcId.startsWith("demo-itc-")) {
    return {
      error: null,
      signoff: {
        id: `demo-signoff-${input.stepIndex}`,
        itc_id: input.itcId,
        step_key: input.stepKey,
        step_index: input.stepIndex,
        author_id: input.authorId,
        author_name: input.authorName,
        comments: input.comments ?? null,
        field_data: input.fieldData ?? {},
        signature_url: input.signatureUrl ?? null,
        status: "draft",
        submitted_at: null,
        verified_by: null,
        verified_by_name: null,
        verified_at: null,
      },
    };
  }

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

  const payload = {
    itc_id: input.itcId,
    step_key: input.stepKey,
    step_index: input.stepIndex,
    author_id: input.authorId,
    author_name: input.authorName.trim(),
    comments: input.comments?.trim() || null,
    field_data: input.fieldData ?? {},
    signature_url: input.signatureUrl ?? null,
    status: "draft" as const,
    updated_at: new Date().toISOString(),
  };

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
}): Promise<{ error: string | null }> {
  if (input.itcId.startsWith("demo-itc-")) return { error: null };
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const submittedAt = new Date().toISOString();
  const { error } = await supabase
    .from("itc_signoffs")
    .update({ status: "submitted", submitted_at: submittedAt, updated_at: submittedAt })
    .eq("id", input.signoffId)
    .eq("status", "draft");

  if (error) return { error: error.message };

  const { data: signoffs } = await supabase
    .from("itc_signoffs")
    .select("step_index, status")
    .eq("itc_id", input.itcId)
    .eq("status", "submitted");

  const submittedCount = new Set(
    (signoffs ?? []).map((row) => Number(row.step_index))
  ).size;
  const progress = Math.round((submittedCount / DEFAULT_ITC_FORM_STEPS.length) * 100);
  const status = deriveItcStatus({
    progress_percent: progress,
    has_open_cr: false,
    submittedSteps: submittedCount,
  });

  await supabase
    .from("project_itcs")
    .update({
      progress_percent: progress,
      status,
      updated_at: submittedAt,
    })
    .eq("id", input.itcId);

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

    if (itcId.startsWith("demo-itc-")) {
      signed += 1;
      continue;
    }

    const submit = await submitItcSignoff({
      signoffId: draft.signoff.id,
      itcId,
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
  if (input.itcId.startsWith("demo-itc-")) return { error: null };
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
  if (input.signoffId.startsWith("demo-")) return { error: null };
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

export { DEFAULT_ITC_FORM_STEPS };
