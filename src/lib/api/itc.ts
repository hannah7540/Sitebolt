/**
 * Isolated ITC / ITP field-module data layer.
 * Queries prototype tables first (`itcs`, `services`, `zones`, `signoffs`,
 * `itc_photos`, `progress_log`, `pressure_tests`, `compaction_tests`, `drawings`)
 * and falls back to the existing SiteBolt project ITC tables without mutating them.
 */

import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  ITC_ATTACHMENTS_BUCKET,
  buildUniqueStorageFileName,
  logStorageUploadError,
} from "@/lib/itp-itc-storage";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  toSupabaseRequestError,
} from "@/lib/supabase-errors";
import {
  fetchItcDetail,
  fetchItcZones,
  fetchProjectItcs,
  getNextItcSequence,
  type ItcDetailBundle,
  type ItcPhoto,
  type ItcSignoff,
  type ItcZone,
  type ProjectItc,
} from "@/lib/itc-service";
import { formatItcAutoName } from "@/lib/itc-naming";
import { PROJECT_ITCS_TABLE, retryItpItcWrite } from "@/lib/itp-itc-payload";
import { fetchItcMasterSpecs } from "@/lib/itc-master-spec-service";
import { fetchCompactionTests, type ItcCompactionTest } from "@/lib/itc-compaction-service";
import {
  fetchLatestPressureTest,
  savePressureTest,
  type PressureTestRow,
  type SavePressureTestInput,
} from "@/lib/itc-pressure-test-service";
import {
  ELECTRICAL_CONDUIT_SPEC_TABLE,
  type ElectricalConduitSpecEntry,
} from "@/lib/itc-electrical-conduit-specs";
import {
  DEMO_ITC_ZONES,
  ITC_STATUS_COLORS,
  ITC_STATUS_LABELS,
  type ItcFormStepTemplate,
  type ItcStatus,
} from "@/lib/itc-templates";
import { ITC_SERVICE_TYPE_COLORS } from "@/lib/itc-batch-templates";

export const ITC_PHOTOS_BUCKET = "itc-photos";
export const ITC_IMAGE_MAX_EDGE_PX = 1600;
export const ITC_IMAGE_JPEG_QUALITY = 0.72;

export const FIELD_ITC_PHOTO_SLOTS = [
  { key: "trench", label: "Trench", legacyKey: "trench_bottom" },
  { key: "bedding", label: "Bedding", legacyKey: "bedding" },
  { key: "service", label: "Service", legacyKey: "service_installed" },
  { key: "haunch", label: "Haunch", legacyKey: "haunching" },
  { key: "cover", label: "Cover", legacyKey: "cover" },
  { key: "tape", label: "Tape", legacyKey: "warning_tape" },
  { key: "backfill", label: "Backfill", legacyKey: "backfill" },
  { key: "compaction", label: "Compaction", legacyKey: "compaction" },
  { key: "reinstatement", label: "Reinstatement", legacyKey: "reinstatement" },
] as const;

export type FieldItcPhotoSlotKey = (typeof FIELD_ITC_PHOTO_SLOTS)[number]["key"];

export const FIELD_ITC_FORM_STEPS: ItcFormStepTemplate[] = [
  {
    step_key: "permit_isolation",
    step_index: 0,
    title: "Permit / Isolation",
    description: "Confirm permits, isolations, and trench protection are in place.",
    compliance_text:
      "I confirm the required permits, isolations, and trench protection are in place before work proceeds.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "survey_setout",
    step_index: 1,
    title: "Survey Setout (Rovers)",
    description: "Record the rover used for design set-out.",
    compliance_text:
      "I confirm survey set-out was captured with the nominated rover and matches the approved design.",
    field_spec: { type: "survey", fields: ["rover_id", "operator_name"] },
  },
  {
    step_key: "survey_asbuilt",
    step_index: 2,
    title: "Survey As-Built (Surveyors)",
    description: "Record the surveyor / operator for as-built capture.",
    compliance_text:
      "I confirm as-built survey data was captured by the nominated surveyor and matches the installed works.",
    field_spec: { type: "survey", fields: ["rover_id", "operator_name"] },
  },
  {
    step_key: "grade_depth",
    step_index: 3,
    title: "Grade & Depth",
    description: "Trench grade and depth comply with specification.",
    compliance_text:
      "I confirm trench grade and depth comply with the approved drawings and specification.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "trench_width",
    step_index: 4,
    title: "Trench Width",
    description: "Minimum trench width for bedding, side fill, and cover.",
    compliance_text:
      "I confirm minimum trench width has been achieved for bedding, side fill, and cover.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "foundation",
    step_index: 5,
    title: "Foundation Inspect",
    description: "Trench base free of soft spots, water, and unsuitable material.",
    compliance_text:
      "I confirm the trench foundation is free of soft spots, standing water, and unsuitable material.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "bedding",
    step_index: 6,
    title: "Bedding",
    description: "Bedding thickness and material meet specification.",
    compliance_text:
      "I confirm bedding thickness and material meet the approved specification for this run.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "line_grade",
    step_index: 7,
    title: "Line & Grade",
    description: "Service installed to correct line and grade.",
    compliance_text:
      "I confirm the service was installed to the correct line and grade during placement.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "joints",
    step_index: 8,
    title: "Joints & Fittings",
    description: "Joints, bends, and fittings per manufacturer requirements.",
    compliance_text:
      "I confirm joints, bends, and fittings were installed per manufacturer requirements.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "service_install",
    step_index: 9,
    title: "Service Installation",
    description: "Conduit configuration, spacers, and separation distances.",
    compliance_text:
      "I confirm conduit configuration, spacers, and separation distances meet the approved design.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "tape_cover",
    step_index: 10,
    title: "Warning Tape / Cover",
    description: "Warning tape and initial cover material installed.",
    compliance_text:
      "I confirm warning tape and initial cover material were installed to specification.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "backfill",
    step_index: 11,
    title: "Backfill",
    description: "Backfill placed in layers without damage to services.",
    compliance_text:
      "I confirm backfill was placed in layers without damage to the installed services.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "compaction_test",
    step_index: 12,
    title: "Compaction Tests",
    description: "Link compaction test number and technician.",
    compliance_text:
      "I confirm compaction testing was completed by the nominated company/technician and is linked to this ITC.",
    field_spec: {
      type: "compaction",
      fields: ["test_number", "company_name", "technician_name"],
    },
  },
  {
    step_key: "cctv",
    step_index: 13,
    title: "CCTV Inspection",
    description: "Record pass/fail and return-to-site requirements.",
    compliance_text:
      "I confirm the CCTV inspection outcome recorded here is accurate and any return-to-site requirements have been noted.",
    field_spec: {
      type: "cctv",
      fields: ["outcome", "return_required"],
      outcomes: ["Pass", "Fail"],
      return_options: ["Return Required", "Not Required"],
    },
  },
  {
    step_key: "pressure_test",
    step_index: 14,
    title: "Pressure Test",
    description: "AS 2566.2 hydraulic pressure test.",
    compliance_text:
      "I confirm the AS 2566.2 pressure test was completed and the recorded outcome is accurate.",
    field_spec: { type: "pressure_test" },
  },
  {
    step_key: "reinstatement",
    step_index: 15,
    title: "Reinstatement",
    description: "Surface reinstatement and cleanup.",
    compliance_text:
      "I confirm surface reinstatement and site cleanup meet project requirements.",
    field_spec: { type: "checklist" },
  },
  {
    step_key: "final_signoff",
    step_index: 16,
    title: "Final Sign-Off",
    description: "Leading hand / supervisor final verification.",
    compliance_text:
      "I confirm all prior ITC quality steps for this run are complete and this installation is ready for close-out.",
    field_spec: { type: "checklist" },
  },
];

export type FieldItcStatus = "not_started" | "ongoing" | "issue" | "complete";

export interface FieldItcService {
  id: string;
  code: string;
  name: string;
  color: string;
}

export interface FieldItcZone {
  id: string;
  code: string;
  name: string;
  pin_x: number | null;
  pin_y: number | null;
}

export interface FieldItcRecord {
  id: string;
  project_id: string;
  itc_number: string;
  status: FieldItcStatus;
  zone_id: string | null;
  zone_code: string | null;
  building: string | null;
  service_id: string | null;
  service_code: string | null;
  service_name: string | null;
  start_location: string | null;
  end_location: string | null;
  conduits_label: string;
  length_m: number | null;
  drawing_rev: string | null;
  material_and_size: string | null;
  progress_percent: number;
  gps_lat: number | null;
  gps_lng: number | null;
  pin_x: number | null;
  pin_y: number | null;
  form_version_id: string | null;
  source: "prototype" | "project_itcs";
}

export interface FieldFormVersion {
  id: string;
  name: string;
  is_current: boolean;
}

export interface CreateItcFromPinInput {
  projectId: string;
  pinX: number;
  pinY: number;
  zoneId?: string | null;
  zoneCode?: string | null;
  serviceId?: string | null;
  serviceCode?: string | null;
  serviceName?: string | null;
  drawingRev?: string | null;
  formVersionId?: string | null;
  endA: string;
  endB: string;
  lengthM: number | null;
}

export interface FieldItcSignoff {
  id: string;
  itc_id: string;
  step_index: number;
  step_key: string;
  author_id: string;
  author_name: string;
  comments: string | null;
  field_data: Record<string, unknown>;
  signature_url: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  submitted_at: string | null;
}

export interface FieldItcPhoto {
  id: string;
  itc_id: string;
  slot_key: string;
  photo_url: string | null;
  not_required: boolean;
  gps_lat: number | null;
  gps_lng: number | null;
  captured_at: string | null;
}

export interface FieldProgressLog {
  id: string;
  itc_id: string;
  log_date: string;
  chainage_m: number | null;
  author_name: string | null;
  notes: string | null;
}

export interface FieldDrawing {
  id: string;
  title: string;
  current_rev: string | null;
  dwg_group: string | null;
  image_url: string | null;
}

export interface FieldItcFilters {
  projectId?: string | null;
  search?: string;
  status?: FieldItcStatus | "all";
  zone?: string | "all";
  building?: string | "all";
  service?: string | "all";
}

export interface FieldItcListResult {
  itcs: FieldItcRecord[];
  zones: FieldItcZone[];
  services: FieldItcService[];
  buildings: string[];
}

export const FIELD_ITC_STATUS_LABELS: Record<FieldItcStatus, string> = {
  not_started: "Not Started",
  ongoing: "Ongoing",
  issue: "Issue",
  complete: "Complete",
};

export const FIELD_ITC_STATUS_COLORS: Record<FieldItcStatus, { bg: string; text: string }> = {
  not_started: { bg: "bg-slate-100", text: "text-slate-700" },
  ongoing: { bg: "bg-amber-100", text: "text-amber-800" },
  issue: { bg: "bg-red-100", text: "text-red-800" },
  complete: { bg: "bg-emerald-100", text: "text-emerald-800" },
};

function isMissingRelation(message: string, table: string): boolean {
  const error = toSupabaseRequestError(message);
  if (isSupabaseRelationMissingError(error) || isSupabaseSchemaCacheError(error)) {
    return true;
  }
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function mapProjectStatus(status: ItcStatus | string | null | undefined): FieldItcStatus {
  const value = String(status ?? "not_started").toLowerCase();
  if (value === "issue" || value.includes("cr")) return "issue";
  if (value === "complete" || value === "completed") return "complete";
  if (value === "ongoing" || value === "in_progress") return "ongoing";
  return "not_started";
}

function formatConduits(value: unknown): string {
  if (typeof value === "string" && value.trim()) return value;
  if (!Array.isArray(value)) return "—";
  const parts = value
    .map((item) => {
      if (!item || typeof item !== "object") return "";
      const row = item as { n?: unknown; size?: unknown };
      const count = Number(row.n ?? 0);
      const size = String(row.size ?? "").trim();
      if (!size) return "";
      return count > 0 ? `${count} × ${size}` : size;
    })
    .filter(Boolean);
  return parts.length ? parts.join(", ") : "—";
}

function asRecord(row: unknown): Record<string, unknown> {
  return row && typeof row === "object" ? (row as Record<string, unknown>) : {};
}

function str(row: Record<string, unknown>, key: string): string | null {
  const value = row[key];
  if (value == null) return null;
  const text = String(value).trim();
  return text || null;
}

function num(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapPrototypeItc(row: Record<string, unknown>): FieldItcRecord {
  const serviceName = str(row, "service_name") ?? str(row, "service_type") ?? str(row, "service");
  return {
    id: String(row.id),
    project_id: String(row.project_id ?? ""),
    itc_number: String(row.itc_number ?? row.number ?? row.id),
    status: mapProjectStatus(str(row, "status")),
    zone_id: str(row, "zone_id"),
    zone_code: str(row, "zone_code") ?? str(row, "zone"),
    building: str(row, "building"),
    service_id: str(row, "service_id"),
    service_code: str(row, "service_code") ?? serviceName,
    service_name: serviceName,
    start_location: str(row, "start_location") ?? str(row, "from_pit"),
    end_location: str(row, "end_location") ?? str(row, "to_pit"),
    conduits_label: formatConduits(row.conduits) !== "—" ? formatConduits(row.conduits) : str(row, "size") ?? "—",
    length_m: num(row, "length_m"),
    drawing_rev: str(row, "drawing_rev"),
    material_and_size: str(row, "material_and_size") ?? str(row, "size"),
    progress_percent: num(row, "progress_percent") ?? 0,
    gps_lat: num(row, "gps_lat"),
    gps_lng: num(row, "gps_lng"),
    pin_x: num(row, "pin_x") ?? num(row, "map_x") ?? num(asRecord(row.form_data), "pin_x"),
    pin_y: num(row, "pin_y") ?? num(row, "map_y") ?? num(asRecord(row.form_data), "pin_y"),
    form_version_id: str(row, "form_version_id"),
    source: "prototype",
  };
}

function mapProjectItc(row: ProjectItc): FieldItcRecord {
  return {
    id: row.id,
    project_id: row.project_id,
    itc_number: row.itc_number,
    status: mapProjectStatus(row.status),
    zone_id: row.zone_id,
    zone_code: row.zone_code,
    building: row.building,
    service_id: null,
    service_code: row.service_type ?? row.service_discipline,
    service_name: row.service_type ?? row.trade_discipline ?? row.service_discipline,
    start_location: row.start_location,
    end_location: row.end_location,
    conduits_label: formatConduits(row.conduits),
    length_m: row.length_m,
    drawing_rev: row.drawing_rev,
    material_and_size: row.material_and_size ?? null,
    progress_percent: row.progress_percent,
    gps_lat: row.gps_lat,
    gps_lng: row.gps_lng,
    pin_x: row.map_x,
    pin_y: row.map_y,
    form_version_id:
      row.form_data && typeof row.form_data.form_version_id === "string"
        ? row.form_data.form_version_id
        : null,
    source: "project_itcs",
  };
}

export function fieldItcStatusChip(status: FieldItcStatus): { bg: string; text: string; label: string } {
  const colors = FIELD_ITC_STATUS_COLORS[status];
  return { ...colors, label: FIELD_ITC_STATUS_LABELS[status] };
}

export const SITE_PLAN_FALLBACK_URL = "/assets/site-plan.jpg";

function demoZoneToField(zone: (typeof DEMO_ITC_ZONES)[number]): FieldItcZone {
  return {
    id: `demo-${zone.zone_code}`,
    code: zone.zone_code,
    name: zone.zone_name,
    pin_x: zone.map_x,
    pin_y: zone.map_y,
  };
}

function withDemoZonePins(zone: FieldItcZone): FieldItcZone {
  if (zone.pin_x != null && zone.pin_y != null) return zone;
  const demo = DEMO_ITC_ZONES.find((item) => item.zone_code === zone.code);
  if (!demo) return zone;
  return { ...zone, pin_x: demo.map_x, pin_y: demo.map_y };
}

export function nearestZoneForPin(
  zones: FieldItcZone[],
  pinX: number,
  pinY: number
): FieldItcZone | null {
  const located = zones.filter((zone) => zone.pin_x != null && zone.pin_y != null);
  if (!located.length) return zones[0] ?? null;
  return located.reduce((best, zone) => {
    const bestDist =
      (Number(best.pin_x) - pinX) ** 2 + (Number(best.pin_y) - pinY) ** 2;
    const nextDist =
      (Number(zone.pin_x) - pinX) ** 2 + (Number(zone.pin_y) - pinY) ** 2;
    return nextDist < bestDist ? zone : best;
  });
}

export function serviceChipColor(service: string | null | undefined): string {
  if (!service) return "#64748b";
  return ITC_SERVICE_TYPE_COLORS[service] ?? "#64748b";
}

export function legacyItcStatusStyle(status: ItcStatus) {
  return {
    ...ITC_STATUS_COLORS[status],
    label: ITC_STATUS_LABELS[status],
  };
}

export async function downscaleImage(
  file: File,
  maxEdge = ITC_IMAGE_MAX_EDGE_PX,
  quality = ITC_IMAGE_JPEG_QUALITY
): Promise<File> {
  if (typeof createImageBitmap !== "function" || !file.type.startsWith("image/")) {
    return file;
  }

  const bitmap = await createImageBitmap(file);
  const scale = Math.min(1, maxEdge / Math.max(bitmap.width, bitmap.height));
  const width = Math.max(1, Math.round(bitmap.width * scale));
  const height = Math.max(1, Math.round(bitmap.height * scale));

  const canvas = document.createElement("canvas");
  canvas.width = width;
  canvas.height = height;
  const context = canvas.getContext("2d");
  if (!context) {
    bitmap.close();
    return file;
  }

  context.drawImage(bitmap, 0, 0, width, height);
  bitmap.close();

  const blob = await new Promise<Blob | null>((resolve) => {
    canvas.toBlob((result) => resolve(result), "image/jpeg", quality);
  });
  if (!blob) return file;

  const baseName = file.name.replace(/\.[^.]+$/, "") || "itc-photo";
  return new File([blob], `${baseName}.jpg`, { type: "image/jpeg" });
}

export async function captureGps(): Promise<{ lat: number | null; lng: number | null }> {
  if (typeof navigator === "undefined" || !navigator.geolocation) {
    return { lat: null, lng: null };
  }

  return new Promise((resolve) => {
    navigator.geolocation.getCurrentPosition(
      (position) =>
        resolve({
          lat: position.coords.latitude,
          lng: position.coords.longitude,
        }),
      () => resolve({ lat: null, lng: null }),
      { enableHighAccuracy: true, timeout: 8000, maximumAge: 60_000 }
    );
  });
}

async function queryTable<T>(
  table: string,
  run: () => Promise<{ data: T[] | null; error: { message: string } | null }>
): Promise<T[] | null> {
  if (!isSupabaseConfigured()) return null;
  try {
    const { data, error } = await run();
    if (error) {
      if (!isMissingRelation(error.message, table)) {
        console.warn(`[itc api] ${table}:`, error.message);
      }
      return null;
    }
    return data ?? [];
  } catch (error) {
    console.warn(`[itc api] ${table} threw:`, error);
    return null;
  }
}

export async function listServices(projectId?: string | null): Promise<FieldItcService[]> {
  const rows = await queryTable("services", async () => {
    let query = supabase.from("services").select("*");
    if (projectId) query = query.eq("project_id", projectId);
    return query.order("name");
  });

  if (rows && rows.length) {
    return rows.map((item) => {
      const row = asRecord(item);
      const name = str(row, "name") ?? str(row, "code") ?? "Service";
      const code = str(row, "code") ?? name;
      return {
        id: String(row.id ?? code),
        code,
        name,
        color: str(row, "color") ?? serviceChipColor(code),
      };
    });
  }

  return [
    { id: "HV", code: "HV", name: "HV", color: serviceChipColor("HV") },
    { id: "LV", code: "LV", name: "LV", color: serviceChipColor("LV") },
    { id: "Comms", code: "Comms", name: "Comms", color: serviceChipColor("Comms") },
    { id: "Sewer", code: "Sewer", name: "Sewer", color: serviceChipColor("Sewer") },
    { id: "Stormwater", code: "Stormwater", name: "Stormwater", color: serviceChipColor("Stormwater") },
    {
      id: "Potable Water",
      code: "Potable Water",
      name: "Potable Water",
      color: serviceChipColor("Potable Water"),
    },
  ];
}

export async function listZones(projectId?: string | null): Promise<FieldItcZone[]> {
  const prototype = await queryTable("zones", async () => {
    let query = supabase.from("zones").select("*");
    if (projectId) query = query.eq("project_id", projectId);
    return query.order("sort_order");
  });

  if (prototype && prototype.length) {
    return prototype.map((item) => {
      const row = asRecord(item);
      const code = str(row, "code") ?? str(row, "zone_code") ?? String(row.id);
      return {
        id: String(row.id),
        code,
        name: str(row, "name") ?? str(row, "zone_name") ?? code,
        pin_x: num(row, "pin_x") ?? num(row, "map_x"),
        pin_y: num(row, "pin_y") ?? num(row, "map_y"),
      };
    }).map(withDemoZonePins);
  }

  if (!projectId) return DEMO_ITC_ZONES.map(demoZoneToField);
  const zones: ItcZone[] = await fetchItcZones(projectId);
  if (!zones.length) return DEMO_ITC_ZONES.map(demoZoneToField);
  return zones.map((zone) =>
    withDemoZonePins({
      id: zone.id,
      code: zone.zone_code,
      name: zone.zone_name || zone.zone_code,
      pin_x: zone.map_x,
      pin_y: zone.map_y,
    })
  );
}

async function listPrototypeItcs(projectId?: string | null): Promise<FieldItcRecord[] | null> {
  const rows = await queryTable("itcs", async () => {
    let query = supabase.from("itcs").select("*");
    if (projectId) query = query.eq("project_id", projectId);
    return query.order("itc_number");
  });
  if (rows == null) return null;
  return rows.map((item) => mapPrototypeItc(asRecord(item)));
}

export async function listItcs(filters: FieldItcFilters = {}): Promise<FieldItcListResult> {
  const [prototype, services, zones] = await Promise.all([
    listPrototypeItcs(filters.projectId),
    listServices(filters.projectId),
    listZones(filters.projectId),
  ]);

  let itcs: FieldItcRecord[] =
    prototype ??
    (filters.projectId ? (await fetchProjectItcs(filters.projectId)).map(mapProjectItc) : []);

  const buildings = Array.from(
    new Set(itcs.map((row) => row.building).filter((value): value is string => Boolean(value)))
  ).sort();

  const search = filters.search?.trim().toLowerCase() ?? "";
  if (search) {
    itcs = itcs.filter((row) =>
      [row.itc_number, row.zone_code, row.building, row.service_name, row.start_location, row.end_location]
        .filter(Boolean)
        .join(" ")
        .toLowerCase()
        .includes(search)
    );
  }
  if (filters.status && filters.status !== "all") {
    itcs = itcs.filter((row) => row.status === filters.status);
  }
  if (filters.zone && filters.zone !== "all") {
    itcs = itcs.filter((row) => row.zone_code === filters.zone || row.zone_id === filters.zone);
  }
  if (filters.building && filters.building !== "all") {
    itcs = itcs.filter((row) => row.building === filters.building);
  }
  if (filters.service && filters.service !== "all") {
    itcs = itcs.filter(
      (row) =>
        row.service_code === filters.service ||
        row.service_name === filters.service ||
        row.service_id === filters.service
    );
  }

  return { itcs, zones, services, buildings };
}

export async function getItc(itcId: string): Promise<FieldItcRecord | null> {
  const prototype = await queryTable("itcs", async () =>
    supabase.from("itcs").select("*").eq("id", itcId)
  );
  if (prototype && prototype.length) {
    return mapPrototypeItc(asRecord(prototype[0]));
  }

  const bundle = await fetchItcDetail(itcId);
  return bundle ? mapProjectItc(bundle.itc) : null;
}

export async function getItcCertificateBundle(itcId: string): Promise<ItcDetailBundle | null> {
  return fetchItcDetail(itcId);
}

function mapSignoff(row: Record<string, unknown>): FieldItcSignoff {
  const fieldData =
    row.field_data && typeof row.field_data === "object"
      ? (row.field_data as Record<string, unknown>)
      : {};
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    step_index: Number(row.step_index ?? 0),
    step_key: String(row.step_key ?? ""),
    author_id: String(row.author_id ?? ""),
    author_name: String(row.author_name ?? ""),
    comments: str(row, "comments"),
    field_data: fieldData,
    signature_url: str(row, "signature_url"),
    gps_lat: num(row, "gps_lat") ?? num(fieldData, "gps_lat"),
    gps_lng: num(row, "gps_lng") ?? num(fieldData, "gps_lng"),
    submitted_at: str(row, "submitted_at") ?? str(row, "created_at"),
  };
}

export async function listSignoffs(itcId: string): Promise<FieldItcSignoff[]> {
  const prototype = await queryTable("signoffs", async () =>
    supabase.from("signoffs").select("*").eq("itc_id", itcId).order("step_index")
  );
  if (prototype) {
    return prototype.map((item) => mapSignoff(asRecord(item)));
  }

  const fallback = await queryTable("itc_signoffs", async () =>
    supabase.from("itc_signoffs").select("*").eq("itc_id", itcId).order("step_index")
  );
  return (fallback ?? []).map((item) => mapSignoff(asRecord(item)));
}

export async function insertSignoff(input: {
  itcId: string;
  step: ItcFormStepTemplate;
  authorId: string;
  authorName: string;
  comments: string;
  fieldData: Record<string, unknown>;
  signatureUrl: string;
  gpsLat: number | null;
  gpsLng: number | null;
}): Promise<{ error: string | null; signoff?: FieldItcSignoff }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const submittedAt = new Date().toISOString();
  const fieldData = {
    ...input.fieldData,
    gps_lat: input.gpsLat,
    gps_lng: input.gpsLng,
  };

  const prototypePayload = {
    itc_id: input.itcId,
    step_index: input.step.step_index,
    step_key: input.step.step_key,
    author_id: input.authorId,
    author_name: input.authorName.trim(),
    comments: input.comments.trim() || null,
    field_data: fieldData,
    signature_url: input.signatureUrl,
    gps_lat: input.gpsLat,
    gps_lng: input.gpsLng,
    submitted_at: submittedAt,
  };

  const prototypeInsert = await supabase.from("signoffs").insert(prototypePayload).select("*").maybeSingle();
  if (!prototypeInsert.error && prototypeInsert.data) {
    return { error: null, signoff: mapSignoff(asRecord(prototypeInsert.data)) };
  }

  if (prototypeInsert.error && !isMissingRelation(prototypeInsert.error.message, "signoffs")) {
    if (prototypeInsert.error.code === "23505") {
      return { error: "This step is already signed by you (append-only)." };
    }
    if (!isSupabaseMissingColumnError(toSupabaseRequestError(prototypeInsert.error))) {
      return { error: prototypeInsert.error.message };
    }
  }

  const siteboltPayload = {
    itc_id: input.itcId,
    step_key: input.step.step_key,
    step_index: input.step.step_index,
    author_id: input.authorId,
    author_name: input.authorName.trim(),
    comments: input.comments.trim() || null,
    field_data: fieldData,
    form_data: fieldData,
    signature_url: input.signatureUrl,
    signatures: [input.signatureUrl],
    status: "submitted",
    submitted_at: submittedAt,
    signed_at: submittedAt,
    signed_by_worker_id: input.authorId,
    updated_at: submittedAt,
  };

  const existing = await supabase
    .from("itc_signoffs")
    .select("id, status")
    .eq("itc_id", input.itcId)
    .eq("step_index", input.step.step_index)
    .eq("author_id", input.authorId)
    .maybeSingle();

  if (existing.data && String(existing.data.status) === "submitted") {
    return { error: "This step is already signed by you (append-only)." };
  }

  const write = existing.data?.id
    ? await supabase
        .from("itc_signoffs")
        .update(siteboltPayload)
        .eq("id", existing.data.id)
        .eq("status", "draft")
        .select("*")
        .maybeSingle()
    : await supabase.from("itc_signoffs").insert(siteboltPayload).select("*").maybeSingle();

  if (write.error) {
    if (write.error.code === "23505") {
      return { error: "This step is already signed by you (append-only)." };
    }
    return { error: write.error.message };
  }
  if (!write.data) return { error: "Sign-off insert failed." };
  return { error: null, signoff: mapSignoff(asRecord(write.data)) };
}

function mapPhoto(row: Record<string, unknown>): FieldItcPhoto {
  return {
    id: String(row.id),
    itc_id: String(row.itc_id),
    slot_key: String(row.slot_key ?? row.slot ?? ""),
    photo_url: str(row, "photo_url") ?? str(row, "url"),
    not_required: row.not_required === true,
    gps_lat: num(row, "gps_lat"),
    gps_lng: num(row, "gps_lng"),
    captured_at: str(row, "captured_at"),
  };
}

export function photoForSlot(
  photos: FieldItcPhoto[],
  slotKey: FieldItcPhotoSlotKey
): FieldItcPhoto | undefined {
  const slot = FIELD_ITC_PHOTO_SLOTS.find((item) => item.key === slotKey);
  return photos.find(
    (photo) => photo.slot_key === slotKey || (slot && photo.slot_key === slot.legacyKey)
  );
}

export async function listPhotos(itcId: string): Promise<FieldItcPhoto[]> {
  const rows = await queryTable("itc_photos", async () =>
    supabase.from("itc_photos").select("*").eq("itc_id", itcId)
  );
  return (rows ?? []).map((item) => mapPhoto(asRecord(item)));
}

async function resolvePhotoUrl(path: string, bucket: string): Promise<string | null> {
  const { data: signed } = await supabase.storage.from(bucket).createSignedUrl(path, 60 * 60 * 24);
  if (signed?.signedUrl) return signed.signedUrl;
  const { data } = supabase.storage.from(bucket).getPublicUrl(path);
  return data.publicUrl || null;
}

async function uploadFieldFile(input: {
  pathPrefix: string;
  file: File | Blob;
  fileName: string;
  contentType: string;
}): Promise<{ url: string | null; error: string | null }> {
  const uniqueName = buildUniqueStorageFileName(input.fileName);
  const fullPath = `${input.pathPrefix.replace(/\/+$/, "")}/${uniqueName}`.replace(/\/+/g, "/");
  const buckets = [ITC_PHOTOS_BUCKET, ITC_ATTACHMENTS_BUCKET];
  let lastError = "Upload failed";

  for (const bucket of buckets) {
    const { error } = await supabase.storage.from(bucket).upload(fullPath, input.file, {
      cacheControl: "3600",
      upsert: false,
      contentType: input.contentType,
    });
    if (error) {
      lastError = error.message;
      logStorageUploadError(`${bucket}/${fullPath}`, error.message);
      continue;
    }
    const url = await resolvePhotoUrl(fullPath, bucket);
    return { url, error: url ? null : lastError };
  }

  return { url: null, error: lastError };
}

export async function uploadFieldItcPhoto(input: {
  projectId: string;
  itcId: string;
  slotKey: FieldItcPhotoSlotKey;
  file: File;
  uploadedBy?: string | null;
}): Promise<{ error: string | null; photo?: FieldItcPhoto }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const [compressed, gps] = await Promise.all([downscaleImage(input.file), captureGps()]);
  const uploaded = await uploadFieldFile({
    pathPrefix: `${input.projectId}/${input.itcId}/${input.slotKey}`,
    file: compressed,
    fileName: compressed.name,
    contentType: compressed.type || "image/jpeg",
  });

  if (!uploaded.url || uploaded.error) {
    logStorageUploadError("uploadFieldItcPhoto", uploaded.error ?? "Upload failed");
    return { error: uploaded.error ?? "Photo upload failed" };
  }

  const photoUrl = uploaded.url;

  const payload = {
    itc_id: input.itcId,
    slot_key: input.slotKey,
    photo_url: photoUrl,
    photos: [photoUrl],
    not_required: false,
    gps_lat: gps.lat,
    gps_lng: gps.lng,
    captured_at: new Date().toISOString(),
    uploaded_by: input.uploadedBy ?? null,
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await supabase
    .from("itc_photos")
    .upsert(payload, { onConflict: "itc_id,slot_key" })
    .select("*")
    .maybeSingle();

  if (error) return { error: error.message };
  return { error: null, photo: data ? mapPhoto(asRecord(data)) : mapPhoto(payload) };
}

export async function markPhotoSlotNotRequired(input: {
  itcId: string;
  slotKey: FieldItcPhotoSlotKey;
  uploadedBy?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("itc_photos").upsert(
    {
      itc_id: input.itcId,
      slot_key: input.slotKey,
      photo_url: null,
      not_required: true,
      uploaded_by: input.uploadedBy ?? null,
      updated_at: new Date().toISOString(),
    },
    { onConflict: "itc_id,slot_key" }
  );
  return { error: error?.message ?? null };
}

export async function listProgressLog(itcId: string): Promise<FieldProgressLog[]> {
  const rows = await queryTable("progress_log", async () =>
    supabase.from("progress_log").select("*").eq("itc_id", itcId).order("log_date")
  );
  return (rows ?? []).map((item) => {
    const row = asRecord(item);
    return {
      id: String(row.id),
      itc_id: String(row.itc_id),
      log_date: str(row, "log_date") ?? str(row, "created_at") ?? "",
      chainage_m: num(row, "chainage_m"),
      author_name: str(row, "author_name"),
      notes: str(row, "notes"),
    };
  });
}

export async function listDrawings(projectId?: string | null): Promise<FieldDrawing[]> {
  const prototype = await queryTable("drawings", async () => {
    let query = supabase.from("drawings").select("*");
    if (projectId) query = query.eq("project_id", projectId);
    return query.order("title");
  });
  if (prototype && prototype.length) {
    return prototype.map((item) => {
      const row = asRecord(item);
      return {
        id: String(row.id),
        title: str(row, "title") ?? str(row, "name") ?? "Drawing",
        current_rev: str(row, "current_rev") ?? str(row, "revision"),
        dwg_group: str(row, "dwg_group"),
        image_url: str(row, "image_url") ?? str(row, "url"),
      };
    });
  }

  if (!projectId) return [];
  const plans = await queryTable("project_itc_plans", async () =>
    supabase.from("project_itc_plans").select("*").eq("project_id", projectId)
  );
  return (plans ?? []).map((item) => {
    const row = asRecord(item);
    return {
      id: String(row.id),
      title: str(row, "title") ?? "Floorplan",
      current_rev: str(row, "revision"),
      dwg_group: null,
      image_url: str(row, "image_url") ?? str(row, "plan_url"),
    };
  });
}

export async function listCompactionTests(
  projectId: string,
  itcId?: string | null
): Promise<ItcCompactionTest[]> {
  const prototype = await queryTable("compaction_tests", async () => {
    let query = supabase.from("compaction_tests").select("*");
    query = query.eq("project_id", projectId);
    return query.order("created_at", { ascending: false });
  });
  if (prototype) {
    return prototype.map((item) => {
      const row = asRecord(item);
      return {
        id: String(row.id),
        project_id: String(row.project_id ?? projectId),
        test_number: String(row.test_number ?? row.number ?? ""),
        company_name: str(row, "company_name"),
        technician_name: str(row, "technician_name"),
        mark_x: num(row, "mark_x"),
        mark_y: num(row, "mark_y"),
        gps_lat: num(row, "gps_lat"),
        gps_lng: num(row, "gps_lng"),
        map_lat: num(row, "map_lat"),
        map_lng: num(row, "map_lng"),
        signature_url: str(row, "signature_url"),
        tested_at: str(row, "tested_at"),
        linked_itc_ids: itcId ? [itcId] : undefined,
      };
    });
  }
  return fetchCompactionTests(projectId);
}

export async function getPressureTest(itcId: string): Promise<PressureTestRow | null> {
  return fetchLatestPressureTest(itcId);
}

export async function saveFieldPressureTest(
  input: SavePressureTestInput
): Promise<{ error: string | null; test: PressureTestRow | null }> {
  return savePressureTest(input);
}

export async function listRoverOptions(projectId: string): Promise<{
  rovers: string[];
  operators: string[];
}> {
  try {
    const specs = await fetchItcMasterSpecs(projectId);
    const rovers = Array.from(new Set(specs.flatMap((row) => row.rover_serial_numbers))).filter(Boolean);
    const operators = Array.from(new Set(specs.flatMap((row) => row.rover_operators))).filter(Boolean);
    return {
      rovers: rovers.length ? rovers : ["Rover-01", "Rover-02"],
      operators,
    };
  } catch {
    return { rovers: ["Rover-01", "Rover-02"], operators: [] };
  }
}

const PIPE_SPEC_STORAGE_KEY = "sitebolt.field-itc.pipe-specs";

export function defaultPipeDimensionSpecs(): ElectricalConduitSpecEntry[] {
  return ELECTRICAL_CONDUIT_SPEC_TABLE.map((row) => ({ ...row }));
}

export async function listPipeDimensionSpecs(): Promise<ElectricalConduitSpecEntry[]> {
  const rows = await queryTable("pipe_dimension_specs", async () =>
    supabase.from("pipe_dimension_specs").select("*").order("category")
  );
  if (rows && rows.length) {
    return rows.map((item) => {
      const row = asRecord(item);
      return {
        category: (str(row, "category") ?? "LV") as ElectricalConduitSpecEntry["category"],
        diameter_mm: num(row, "diameter_mm") ?? 0,
        material_and_size: str(row, "material_and_size") ?? "",
        min_horizontal_sep_mm: num(row, "min_horizontal_sep_mm") ?? 0,
        min_vertical_sep_mm: num(row, "min_vertical_sep_mm") ?? 0,
        min_bedding_mm: num(row, "min_bedding_mm") ?? 0,
        min_side_mm: num(row, "min_side_mm") ?? 0,
        min_overlay_mm: num(row, "min_overlay_mm") ?? 0,
        min_cover_mm: num(row, "min_cover_mm") ?? 0,
        bedding_and_overlay_material: str(row, "bedding_and_overlay_material") ?? "Bed Sand",
        cover_material: str(row, "cover_material") ?? "Roadbase",
      };
    });
  }

  if (typeof window !== "undefined") {
    try {
      const raw = window.localStorage.getItem(PIPE_SPEC_STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw) as ElectricalConduitSpecEntry[];
        if (Array.isArray(parsed) && parsed.length) return parsed;
      }
    } catch {
      /* ignore */
    }
  }

  return defaultPipeDimensionSpecs();
}

export async function savePipeDimensionSpecs(
  rows: ElectricalConduitSpecEntry[]
): Promise<{ error: string | null }> {
  if (typeof window !== "undefined") {
    window.localStorage.setItem(PIPE_SPEC_STORAGE_KEY, JSON.stringify(rows));
  }

  const payload = rows.map((row, index) => ({
    ...row,
    sort_order: index + 1,
  }));
  const { error } = await supabase.from("pipe_dimension_specs").upsert(payload);
  if (error && !isMissingRelation(error.message, "pipe_dimension_specs")) {
    return { error: error.message };
  }
  return { error: null };
}

export async function uploadFieldSignature(input: {
  projectId: string;
  itcId: string;
  stepKey: string;
  dataUrl: string;
}): Promise<{ url: string | null; error: string | null }> {
  const response = await fetch(input.dataUrl);
  const blob = await response.blob();
  const uploaded = await uploadFieldFile({
    pathPrefix: `${input.projectId}/${input.itcId}/signoffs/${input.stepKey}`,
    file: blob,
    fileName: "signature.png",
    contentType: "image/png",
  });
  if (uploaded.error) {
    logStorageUploadError("uploadFieldSignature", uploaded.error);
  }
  return { url: uploaded.url, error: uploaded.error };
}

export type { ItcPhoto, ItcSignoff, ProjectItc };

export async function listFormVersions(): Promise<FieldFormVersion[]> {
  const rows = await queryTable("form_versions", async () =>
    supabase.from("form_versions").select("*").order("created_at", { ascending: false })
  );
  return (rows ?? []).map((item) => {
    const row = asRecord(item);
    return {
      id: String(row.id),
      name: str(row, "name") ?? str(row, "title") ?? "Form version",
      is_current: row.is_current === true || row.current === true,
    };
  });
}

export async function createItcFromPin(
  input: CreateItcFromPinInput
): Promise<{ error: string | null; itc?: FieldItcRecord }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const pinX = Math.min(1, Math.max(0, input.pinX));
  const pinY = Math.min(1, Math.max(0, input.pinY));
  const zoneCode = input.zoneCode?.trim() || "SITE";
  const service = input.serviceName?.trim() || input.serviceCode?.trim() || "General";
  const sequence = await getNextItcSequence(input.projectId, zoneCode, service);
  const itcNumber = formatItcAutoName(zoneCode, service, sequence);
  const endA = input.endA.trim();
  const endB = input.endB.trim();

  const prototypePayload = {
    project_id: input.projectId,
    itc_number: itcNumber,
    zone_id: input.zoneId || null,
    zone: zoneCode,
    service_id: input.serviceId || null,
    form_version_id: input.formVersionId || null,
    drawing_rev: input.drawingRev || null,
    pin_x: pinX,
    pin_y: pinY,
    map_x: pinX,
    map_y: pinY,
    start_location: endA,
    end_location: endB,
    from_pit: endA,
    to_pit: endB,
    length_m: input.lengthM,
    status: "not_started",
    stage: "Not Started",
  };

  const prototypeInsert = await supabase.from("itcs").insert(prototypePayload).select("*").maybeSingle();
  if (!prototypeInsert.error && prototypeInsert.data) {
    return {
      error: null,
      itc: { ...mapPrototypeItc(asRecord(prototypeInsert.data)), pin_x: pinX, pin_y: pinY },
    };
  }

  if (
    prototypeInsert.error &&
    !isMissingRelation(prototypeInsert.error.message, "itcs") &&
    !isSupabaseMissingColumnError(toSupabaseRequestError(prototypeInsert.error))
  ) {
    // Continue to SiteBolt table if prototype insert is a schema miss; otherwise report.
    if (prototypeInsert.error.code !== "PGRST204") {
      const retry = await retryItpItcWrite("itcs.pin_drop", prototypePayload, async (next) => {
        const { data, error } = await supabase.from("itcs").insert(next).select("*").maybeSingle();
        return { data, error };
      });
      if (!retry.error && retry.data) {
        return {
          error: null,
          itc: { ...mapPrototypeItc(asRecord(retry.data)), pin_x: pinX, pin_y: pinY },
        };
      }
    }
  }

  const siteboltPayload: Record<string, unknown> = {
    project_id: input.projectId,
    itc_number: itcNumber,
    zone_id: input.zoneId || null,
    zone_code: zoneCode,
    service_discipline: service,
    service_type: service,
    trade_discipline: service,
    start_location: endA,
    end_location: endB,
    upstream_pit_number: endA,
    downstream_pit_number: endB,
    length_m: input.lengthM,
    pin_x: pinX,
    pin_y: pinY,
    map_x: pinX,
    map_y: pinY,
    drawing_rev: input.drawingRev || null,
    form_version_id: input.formVersionId || null,
    status: "not_started",
    progress_percent: 0,
    form_data: {
      pin_x: pinX,
      pin_y: pinY,
      service_id: input.serviceId,
      form_version_id: input.formVersionId,
    },
  };

  const result = await retryItpItcWrite("project_itcs.pin_drop", siteboltPayload, async (next) => {
    const { data, error } = await supabase
      .from(PROJECT_ITCS_TABLE)
      .insert(next)
      .select("*")
      .maybeSingle();
    return { data, error };
  });

  if (result.error || !result.data) {
    return { error: result.error ?? "Failed to create ITC from pin." };
  }
  return {
    error: null,
    itc: { ...mapPrototypeItc(asRecord(result.data)), pin_x: pinX, pin_y: pinY },
  };
}

