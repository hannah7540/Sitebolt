import { supabase, isSupabaseConfigured } from "@/lib/supabase";
import {
  ITP_ATTACHMENTS_BUCKET,
  ITP_DRAWINGS_BUCKET,
  buildUniqueStorageFileName,
  logStorageUploadError,
  uploadToStorageBucket,
} from "@/lib/itp-itc-storage";
import {
  PROJECT_ITCS_TABLE,
  PROJECT_ITPS_TABLE,
  hydrateItpItcRow,
  retryItpItcWrite,
} from "@/lib/itp-itc-payload";
import { fetchProjectItcs } from "@/lib/itc-service";
import { fetchProjectItps } from "@/lib/itp-service";
import { downscaleImage, captureGps } from "@/lib/api/itc";
import {
  getAdminItpTemplate,
  type AdminChecklistQuestion,
} from "@/components/itc/admin/itp-itc-admin-types";
import {
  adminItcNumberPrefix,
  formatAdminItcNumber,
  maxAdminItcSequence,
  parseAdminItcSequence,
  sanitizeAdminItcPart,
} from "@/components/itc/admin/itp-itc-admin-numbering";

export const ITP_PLANS_BUCKET = "itp-plans";

export type AdminRecordKind = "itp" | "itc";
export type AdminStatusBadge = "active" | "in_progress" | "completed";
export type ChecklistResult = "yes" | "no" | "na" | "";

export interface AdminChecklistItem {
  key: string;
  text: string;
  result: ChecklistResult;
  remarks: string;
}

export interface AdminItcPhoto {
  url: string;
  captured_at: string | null;
  gps_lat: number | null;
  gps_lng: number | null;
  label: string;
}

export interface AdminItpRecord {
  id: string;
  project_id: string;
  number: string;
  title: string;
  area: string | null;
  client: string | null;
  managing_contractor: string | null;
  subcontractor: string | null;
  drawing_ref: string | null;
  plan_url: string | null;
  template_key: string | null;
  status: AdminStatusBadge;
  created_at: string | null;
}

export interface AdminItcRecord {
  id: string;
  project_id: string;
  itp_id: string | null;
  number: string;
  run_number: string | null;
  area: string | null;
  drawing_ref: string | null;
  pipe_size: string | null;
  pipe_material: string | null;
  pin_x: number | null;
  pin_y: number | null;
  checklist: AdminChecklistItem[];
  photos: AdminItcPhoto[];
  wae_url: string | null;
  completed_by_name: string | null;
  completed_by_signature: string | null;
  completed_at: string | null;
  reviewed_by_name: string | null;
  reviewed_by_signature: string | null;
  reviewed_at: string | null;
  status: AdminStatusBadge;
  created_at: string | null;
}

export interface AdminBrowseItem {
  id: string;
  kind: AdminRecordKind;
  number: string;
  title: string;
  project_id: string;
  project_name: string;
  area: string | null;
  contractor: string | null;
  line_number: string | null;
  date: string | null;
  status: AdminStatusBadge;
  itp_id?: string | null;
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

function num(row: Record<string, unknown>, key: string): number | null {
  const value = row[key];
  if (value == null || value === "") return null;
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : null;
}

function mapStatus(value: string | null | undefined): AdminStatusBadge {
  const status = String(value ?? "").toLowerCase();
  if (
    status === "complete" ||
    status === "completed" ||
    status === "approved" ||
    status === "submitted"
  ) {
    return "completed";
  }
  if (status === "in_progress" || status === "ongoing" || status === "issue") {
    return "in_progress";
  }
  return "active";
}

export function toDbItcStatus(status: AdminStatusBadge): string {
  if (status === "completed") return "complete";
  if (status === "in_progress") return "in_progress";
  return "not_started";
}

function mapChecklist(
  raw: unknown,
  fallbackQuestions: AdminChecklistQuestion[] = []
): AdminChecklistItem[] {
  if (Array.isArray(raw) && raw.length) {
    return raw.map((item, index) => {
      const row = asRecord(item);
      return {
        key: str(row, "key") ?? `item_${index + 1}`,
        text: str(row, "text") ?? str(row, "description") ?? `Item ${index + 1}`,
        result: (str(row, "result") as ChecklistResult) ?? "",
        remarks: str(row, "remarks") ?? "",
      };
    });
  }
  return fallbackQuestions.map((question) => ({
    key: question.key,
    text: question.text,
    result: "",
    remarks: "",
  }));
}

function mapPhotos(raw: unknown): AdminItcPhoto[] {
  if (!Array.isArray(raw)) return [];
  return raw
    .map((item) => {
      if (typeof item === "string") {
        return {
          url: item,
          captured_at: null,
          gps_lat: null,
          gps_lng: null,
          label: "Photo",
        };
      }
      const row = asRecord(item);
      const url = str(row, "url") ?? str(row, "photo_url");
      if (!url) return null;
      return {
        url,
        captured_at: str(row, "captured_at"),
        gps_lat: num(row, "gps_lat"),
        gps_lng: num(row, "gps_lng"),
        label: str(row, "label") ?? "Photo",
      };
    })
    .filter((item): item is AdminItcPhoto => Boolean(item));
}

export function mapItpRow(row: Record<string, unknown>): AdminItpRecord {
  const hydrated = hydrateItpItcRow(row);
  const form = asRecord(hydrated.form_data);
  return {
    id: String(hydrated.id ?? ""),
    project_id: String(hydrated.project_id ?? ""),
    number: String(hydrated.itp_number ?? ""),
    title: String(hydrated.title ?? "ITP"),
    area: str(hydrated, "location_area") ?? str(form, "area"),
    client: str(form, "client"),
    managing_contractor: str(form, "managing_contractor"),
    subcontractor: str(hydrated, "subcontractor_name") ?? str(form, "subcontractor"),
    drawing_ref: str(form, "drawing_ref") ?? str(hydrated, "revision"),
    plan_url: str(form, "plan_url"),
    template_key: str(hydrated, "template_key") ?? str(form, "template_key"),
    status: mapStatus(str(hydrated, "status")),
    created_at: str(hydrated, "created_at"),
  };
}

export function mapItcRow(row: Record<string, unknown>): AdminItcRecord {
  const hydrated = hydrateItpItcRow(row);
  const form = asRecord(hydrated.form_data);
  const template = getAdminItpTemplate(str(form, "template_key"));
  return {
    id: String(hydrated.id ?? ""),
    project_id: String(hydrated.project_id ?? ""),
    itp_id: str(hydrated, "itp_id") ?? str(form, "itp_id"),
    number: String(hydrated.itc_number ?? hydrated.itp_number ?? ""),
    run_number:
      str(form, "run_number") ??
      str(hydrated, "start_location") ??
      str(hydrated, "upstream_pit_number"),
    area: str(hydrated, "building") ?? str(form, "area"),
    drawing_ref: str(hydrated, "drawing_rev") ?? str(form, "drawing_ref"),
    pipe_size: str(form, "pipe_size") ?? str(hydrated, "material_and_size"),
    pipe_material: str(form, "pipe_material"),
    pin_x: num(hydrated, "pin_x") ?? num(hydrated, "map_x") ?? num(form, "pin_x"),
    pin_y: num(hydrated, "pin_y") ?? num(hydrated, "map_y") ?? num(form, "pin_y"),
    checklist: mapChecklist(form.checklist ?? hydrated.checklist, template?.questions ?? []),
    photos: mapPhotos(form.photos ?? hydrated.photos),
    wae_url: str(form, "wae_url") ?? str(form, "wae_plan_markup_url"),
    completed_by_name: str(form, "completed_by_name") ?? str(form, "completed_by"),
    completed_by_signature:
      str(form, "completed_by_signature") ?? str(form, "signature_url"),
    completed_at: str(form, "signed_at") ?? str(form, "completed_at"),
    reviewed_by_name: str(form, "reviewed_by_name") ?? str(form, "reviewed_by"),
    reviewed_by_signature:
      str(form, "reviewed_by_signature") ?? str(form, "reviewed_signature_url"),
    reviewed_at: str(form, "reviewed_at"),
    status: mapStatus(str(hydrated, "status")),
    created_at: str(hydrated, "created_at"),
  };
}

async function queryItcTable(
  table: string,
  projectId?: string | null
): Promise<AdminItcRecord[]> {
  let query = supabase.from(table).select("*").limit(500);
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (error || !data?.length) return [];
  return data.map((row) => mapItcRow(row as Record<string, unknown>));
}

export async function listAdminItps(projectId?: string | null): Promise<AdminItpRecord[]> {
  if (!isSupabaseConfigured()) return [];
  let query = supabase.from(PROJECT_ITPS_TABLE).select("*");
  if (projectId) query = query.eq("project_id", projectId);
  const { data, error } = await query.order("created_at", { ascending: false });
  if (!error && data?.length) {
    return data.map((row) => mapItpRow(row as Record<string, unknown>));
  }
  if (projectId) {
    const rows = await fetchProjectItps(projectId);
    return rows.map((row) =>
      mapItpRow({
        id: row.id,
        project_id: row.project_id,
        itp_number: row.itp_number,
        title: row.title,
        location_area: row.location_area,
        subcontractor_name: row.subcontractor_name,
        status: row.status,
        template_key: row.template_key,
        revision: row.revision,
        created_at: row.created_at,
        form_data: {},
      })
    );
  }
  return [];
}

export async function listAdminItcs(projectId?: string | null): Promise<AdminItcRecord[]> {
  if (!isSupabaseConfigured()) return [];
  const [prototype, project] = await Promise.all([
    queryItcTable("itcs", projectId),
    queryItcTable(PROJECT_ITCS_TABLE, projectId),
  ]);
  if (prototype.length === 0 && project.length === 0 && projectId) {
    const rows = await fetchProjectItcs(projectId);
    return rows.map((row) => mapItcRow(row as unknown as Record<string, unknown>));
  }
  const byId = new Map<string, AdminItcRecord>();
  for (const row of [...project, ...prototype]) {
    if (row.id) byId.set(row.id, row);
  }
  return [...byId.values()].sort((a, b) =>
    String(b.created_at ?? "").localeCompare(String(a.created_at ?? ""))
  );
}

export async function getAdminItp(id: string): Promise<AdminItpRecord | null> {
  const { data, error } = await supabase.from(PROJECT_ITPS_TABLE).select("*").eq("id", id).maybeSingle();
  if (error || !data) return null;
  return mapItpRow(data as Record<string, unknown>);
}

export async function getAdminItc(id: string): Promise<AdminItcRecord | null> {
  for (const table of [PROJECT_ITCS_TABLE, "itcs"]) {
    const { data, error } = await supabase.from(table).select("*").eq("id", id).maybeSingle();
    if (!error && data) return mapItcRow(data as Record<string, unknown>);
  }
  return null;
}

export function toAdminBrowseItems(
  itps: AdminItpRecord[],
  itcs: AdminItcRecord[],
  projects: Array<{ id: string; name: string }>
): AdminBrowseItem[] {
  const projectName = (projectId: string) =>
    projects.find((row) => row.id === projectId)?.name ?? "Project";
  const itpItems: AdminBrowseItem[] = itps.map((itp) => ({
    id: itp.id,
    kind: "itp",
    number: itp.number,
    title: itp.title,
    project_id: itp.project_id,
    project_name: projectName(itp.project_id),
    area: itp.area,
    contractor: itp.subcontractor,
    line_number: null,
    date: itp.created_at,
    status: itp.status,
  }));
  const itpById = new Map(itps.map((itp) => [itp.id, itp]));
  const itcItems: AdminBrowseItem[] = itcs.map((itc) => ({
    id: itc.id,
    kind: "itc",
    number: itc.number,
    title: itc.run_number || itc.number,
    project_id: itc.project_id,
    project_name: projectName(itc.project_id),
    area: itc.area,
    contractor: itc.itp_id ? itpById.get(itc.itp_id)?.subcontractor ?? null : null,
    line_number: itc.run_number,
    date: itc.created_at,
    status: itc.status,
    itp_id: itc.itp_id,
  }));
  return [...itpItems, ...itcItems].sort((a, b) =>
    String(b.date ?? "").localeCompare(String(a.date ?? ""))
  );
}

export async function listItcsForItp(itpId: string): Promise<AdminItcRecord[]> {
  const all = await listAdminItcs();
  return all.filter((row) => row.itp_id === itpId);
}

export async function uploadItpPlan(input: {
  projectId: string;
  file: File;
}): Promise<{ url: string | null; preview: string | null; error: string | null }> {
  const preview = await new Promise<string | null>((resolve) => {
    const reader = new FileReader();
    reader.onload = () => resolve(String(reader.result ?? ""));
    reader.onerror = () => resolve(null);
    reader.readAsDataURL(input.file);
  });

  const uploaded = await uploadToStorageBucket({
    bucket: ITP_PLANS_BUCKET,
    pathPrefix: `${input.projectId}/plans`,
    file: input.file,
    fileName: buildUniqueStorageFileName(input.file.name),
    contentType: input.file.type || "application/octet-stream",
    fallbackBuckets: [ITP_DRAWINGS_BUCKET, ITP_ATTACHMENTS_BUCKET, "itp-uploads"],
  });
  if (uploaded.error) {
    logStorageUploadError("uploadItpPlan", uploaded.error);
  }
  return { url: uploaded.url, preview, error: uploaded.url ? null : uploaded.error };
}

export async function createAdminItp(input: {
  projectId: string;
  area: string;
  client: string;
  managingContractor: string;
  subcontractor: string;
  drawingRef: string;
  planUrl: string | null;
  templateKey: string;
  title: string;
}): Promise<{ error: string | null; itp?: AdminItpRecord }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { data: existing } = await supabase
    .from(PROJECT_ITPS_TABLE)
    .select("itp_number")
    .eq("project_id", input.projectId)
    .limit(80);
  const max = (existing ?? []).reduce((current, row) => {
    const match = String(row.itp_number ?? "").match(/(\d+)\s*$/);
    return Math.max(current, match ? Number(match[1]) : 0);
  }, 0);
  const itpNumber = `ITP-${String(max + 1).padStart(3, "0")}`;
  const template = getAdminItpTemplate(input.templateKey);

  const payload: Record<string, unknown> = {
    project_id: input.projectId,
    itp_number: itpNumber,
    title: input.title,
    revision: input.drawingRef || "A",
    trade_category: template?.trade ?? "General",
    subcontractor_name: input.subcontractor,
    location_area: input.area,
    status: "in_progress",
    template_key: input.templateKey,
    form_data: {
      client: input.client,
      managing_contractor: input.managingContractor,
      subcontractor: input.subcontractor,
      drawing_ref: input.drawingRef,
      plan_url: input.planUrl,
      template_key: input.templateKey,
      area: input.area,
    },
  };

  const result = await retryItpItcWrite("project_itps.admin_create", payload, async (next) => {
    const { data, error } = await supabase
      .from(PROJECT_ITPS_TABLE)
      .insert(next)
      .select("*")
      .maybeSingle();
    return { data, error };
  });
  if (result.error || !result.data) {
    return { error: result.error ?? "Failed to create ITP" };
  }
  return { error: null, itp: mapItpRow(asRecord(result.data)) };
}

async function listItcNumbersForPrefix(
  projectId: string,
  prefix: string
): Promise<string[]> {
  const numbers: string[] = [];
  for (const table of ["itcs", PROJECT_ITCS_TABLE]) {
    let query = supabase.from(table).select("itc_number");
    if (projectId) query = query.eq("project_id", projectId);
    const { data, error } = await query.ilike("itc_number", `${prefix}%`);
    if (error || !data?.length) continue;
    for (const row of data) {
      const value = String((row as { itc_number?: string }).itc_number ?? "").trim();
      if (value) numbers.push(value);
    }
  }
  return numbers;
}

function parseRpcItcResult(data: unknown): { number?: string; sequence?: number } {
  if (typeof data === "number" && Number.isFinite(data) && data > 0) {
    return { sequence: Math.floor(data) };
  }
  if (typeof data === "string") {
    const trimmed = data.trim();
    const fromPattern = parseAdminItcSequence(trimmed);
    if (fromPattern != null) {
      return { number: trimmed.includes("/") ? trimmed : undefined, sequence: fromPattern };
    }
    const asNumber = Number(trimmed);
    if (Number.isFinite(asNumber) && asNumber > 0) {
      return { sequence: Math.floor(asNumber) };
    }
  }
  if (Array.isArray(data) && data.length) {
    return parseRpcItcResult(data[0]);
  }
  if (data && typeof data === "object") {
    const row = data as Record<string, unknown>;
    return parseRpcItcResult(
      row.itc_no ?? row.itc_number ?? row.next_no ?? row.sequence ?? row.get_next_itc_no
    );
  }
  return {};
}

export async function allocateAdminItcNumber(input: {
  projectId: string;
  projectName: string;
  area: string;
  preferredNumber?: string | null;
  reservedNumbers?: string[];
}): Promise<{ number: string; sequence: number }> {
  const taken = new Set(
    (input.reservedNumbers ?? []).map((value) => value.trim()).filter(Boolean)
  );
  let rpcCandidate: { number: string; sequence: number } | null = null;

  if (isSupabaseConfigured()) {
    const existing = await listItcNumbersForPrefix(
      input.projectId,
      adminItcNumberPrefix(input.projectName, input.area)
    );
    for (const value of existing) taken.add(value);

    const rpc = await supabase.rpc("get_next_itc_no", {
      project_name: sanitizeAdminItcPart(input.projectName, "Project"),
      area: sanitizeAdminItcPart(input.area, "AREA"),
    });
    const parsed = rpc.error ? {} : parseRpcItcResult(rpc.data);
    if (parsed.number && !taken.has(parsed.number)) {
      rpcCandidate = {
        number: parsed.number,
        sequence: parseAdminItcSequence(parsed.number) ?? parsed.sequence ?? 1,
      };
    } else if (parsed.sequence && parsed.sequence > 0) {
      const candidate = formatAdminItcNumber(input.projectName, input.area, parsed.sequence);
      if (!taken.has(candidate)) {
        rpcCandidate = { number: candidate, sequence: parsed.sequence };
      }
    }
  }

  const preferred = input.preferredNumber?.trim() || "";
  const preferredSequence = parseAdminItcSequence(preferred);
  if (preferred && preferredSequence && !taken.has(preferred)) {
    return { number: preferred, sequence: preferredSequence };
  }
  if (rpcCandidate) return rpcCandidate;

  let sequence = maxAdminItcSequence([...taken]) + 1;
  let next = formatAdminItcNumber(input.projectName, input.area, sequence);
  while (taken.has(next)) {
    sequence += 1;
    next = formatAdminItcNumber(input.projectName, input.area, sequence);
  }
  return { number: next, sequence };
}

export async function createAdminItcFromPin(input: {
  projectId: string;
  projectName: string;
  itp: AdminItpRecord;
  pinX: number;
  pinY: number;
  runNumber: string;
  pipeSize: string;
  pipeMaterial: string;
  preferredNumber?: string | null;
  reservedNumbers?: string[];
}): Promise<{ error: string | null; itc?: AdminItcRecord }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const template = getAdminItpTemplate(input.itp.template_key);
  const service = template?.trade ?? "General";
  const zone = input.itp.area?.trim() || "SITE";
  const allocated = await allocateAdminItcNumber({
    projectId: input.projectId,
    projectName: input.projectName,
    area: input.itp.area || zone,
    preferredNumber: input.preferredNumber,
    reservedNumbers: input.reservedNumbers,
  });
  const itcNumber = allocated.number;
  const checklist: AdminChecklistItem[] = (template?.questions ?? []).map((question) => ({
    key: question.key,
    text: question.text,
    result: "",
    remarks: "",
  }));

  const payload: Record<string, unknown> = {
    project_id: input.projectId,
    itp_id: input.itp.id,
    itc_number: itcNumber,
    zone_code: zone,
    building: input.itp.area,
    service_discipline: service,
    service_type: service,
    trade_discipline: service,
    start_location: input.runNumber,
    end_location: input.runNumber,
    material_and_size: [input.pipeSize, input.pipeMaterial].filter(Boolean).join(" "),
    pin_x: input.pinX,
    pin_y: input.pinY,
    map_x: input.pinX,
    map_y: input.pinY,
    drawing_rev: input.itp.drawing_ref,
    status: "not_started",
    progress_percent: 0,
    form_data: {
      itp_id: input.itp.id,
      template_key: input.itp.template_key,
      run_number: input.runNumber,
      pipe_size: input.pipeSize,
      pipe_material: input.pipeMaterial,
      pin_x: input.pinX,
      pin_y: input.pinY,
      drawing_ref: input.itp.drawing_ref,
      area: input.itp.area,
      itc_number: itcNumber,
      checklist,
      photos: [],
    },
  };

  const prototype = await retryItpItcWrite("itcs.admin_pin", payload, async (next) => {
    const { data, error } = await supabase.from("itcs").insert(next).select("*").maybeSingle();
    return { data, error };
  });
  if (!prototype.error && prototype.data) {
    return {
      error: null,
      itc: { ...mapItcRow(asRecord(prototype.data)), number: itcNumber },
    };
  }

  const result = await retryItpItcWrite("project_itcs.admin_pin", payload, async (next) => {
    const { data, error } = await supabase
      .from(PROJECT_ITCS_TABLE)
      .insert(next)
      .select("*")
      .maybeSingle();
    return { data, error };
  });
  if (result.error || !result.data) {
    return { error: result.error ?? "Failed to create ITC" };
  }
  return {
    error: null,
    itc: {
      ...mapItcRow(asRecord(result.data)),
      number: itcNumber,
      pin_x: input.pinX,
      pin_y: input.pinY,
      itp_id: input.itp.id,
      checklist,
    },
  };
}

async function updateAdminItcRow(
  id: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null }> {
  const [project, prototype] = await Promise.all([
    retryItpItcWrite("project_itcs.admin_save", payload, async (next) => {
      const { error } = await supabase.from(PROJECT_ITCS_TABLE).update(next).eq("id", id);
      return { error };
    }),
    retryItpItcWrite("itcs.admin_save", payload, async (next) => {
      const { error } = await supabase.from("itcs").update(next).eq("id", id);
      return { error };
    }),
  ]);
  if (!project.error || !prototype.error) return { error: null };
  return { error: project.error ?? prototype.error };
}

function buildItcFormData(itc: AdminItcRecord): Record<string, unknown> {
  return {
    itp_id: itc.itp_id,
    run_number: itc.run_number,
    pipe_size: itc.pipe_size,
    pipe_material: itc.pipe_material,
    pin_x: itc.pin_x,
    pin_y: itc.pin_y,
    drawing_ref: itc.drawing_ref,
    area: itc.area,
    line_location: itc.area,
    checklist: itc.checklist,
    checklist_answers: itc.checklist,
    photos: itc.photos,
    photo_urls: itc.photos,
    wae_url: itc.wae_url,
    wae_plan_markup_url: itc.wae_url,
    completed_by: itc.completed_by_name,
    completed_by_name: itc.completed_by_name,
    completed_by_signature: itc.completed_by_signature,
    signature_url: itc.completed_by_signature,
    signed_at: itc.completed_at,
    completed_at: itc.completed_at,
    reviewed_by: itc.reviewed_by_name,
    reviewed_by_name: itc.reviewed_by_name,
    reviewed_by_signature: itc.reviewed_by_signature,
    reviewed_signature_url: itc.reviewed_by_signature,
    reviewed_at: itc.reviewed_at,
    status: itc.status,
  };
}

export async function saveAdminItcRecord(itc: AdminItcRecord): Promise<{ error: string | null }> {
  const answered = itc.checklist.filter((item) => item.result).length;
  const payload: Record<string, unknown> = {
    start_location: itc.run_number,
    end_location: itc.run_number,
    building: itc.area,
    line_location: itc.area,
    drawing_rev: itc.drawing_ref,
    pipe_size: itc.pipe_size,
    pipe_material: itc.pipe_material,
    material_and_size: [itc.pipe_size, itc.pipe_material].filter(Boolean).join(" "),
    checklist_answers: itc.checklist,
    photo_urls: itc.photos.map((photo) => photo.url),
    wae_plan_markup_url: itc.wae_url,
    status: toDbItcStatus(itc.status),
    progress_percent: itc.checklist.length
      ? Math.round((answered / itc.checklist.length) * 100)
      : 0,
    completed_by: itc.completed_by_name,
    signature_url: itc.completed_by_signature,
    signed_at: itc.completed_at,
    reviewed_by: itc.reviewed_by_name,
    reviewed_signature_url: itc.reviewed_by_signature,
    reviewed_at: itc.reviewed_at,
    updated_at: new Date().toISOString(),
    form_data: buildItcFormData(itc),
  };
  return updateAdminItcRow(itc.id, payload);
}

export async function saveAdminItcChecklist(input: {
  itc: AdminItcRecord;
  checklist: AdminChecklistItem[];
  completedByName: string;
  completedBySignature: string | null;
  reviewedByName: string;
  reviewedBySignature: string | null;
}): Promise<{ error: string | null }> {
  return saveAdminItcRecord({
    ...input.itc,
    checklist: input.checklist,
    completed_by_name: input.completedByName,
    completed_by_signature: input.completedBySignature,
    reviewed_by_name: input.reviewedByName,
    reviewed_by_signature: input.reviewedBySignature,
  });
}

export async function saveAdminItpRecord(itp: AdminItpRecord): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    title: itp.title,
    location_area: itp.area,
    subcontractor_name: itp.subcontractor,
    revision: itp.drawing_ref || "A",
    status: toDbItcStatus(itp.status),
    updated_at: new Date().toISOString(),
    form_data: {
      client: itp.client,
      managing_contractor: itp.managing_contractor,
      subcontractor: itp.subcontractor,
      drawing_ref: itp.drawing_ref,
      plan_url: itp.plan_url,
      template_key: itp.template_key,
      area: itp.area,
    },
  };
  return retryItpItcWrite("project_itps.admin_save", payload, async (next) => {
    const { error } = await supabase.from(PROJECT_ITPS_TABLE).update(next).eq("id", itp.id);
    return { error };
  });
}

export async function uploadAdminItcPhoto(input: {
  projectId: string;
  itcId: string;
  file: File;
  label?: string;
}): Promise<{ error: string | null; photo?: AdminItcPhoto }> {
  const [file, gps] = await Promise.all([downscaleImage(input.file), captureGps()]);
  const uploaded = await uploadToStorageBucket({
    bucket: "itc-photos",
    pathPrefix: `${input.projectId}/${input.itcId}/qa`,
    file,
    fileName: buildUniqueStorageFileName(file.name),
    contentType: file.type || "image/jpeg",
    fallbackBuckets: [ITP_ATTACHMENTS_BUCKET, "itp-uploads"],
  });
  if (!uploaded.url) return { error: uploaded.error ?? "Upload failed" };
  return {
    error: null,
    photo: {
      url: uploaded.url,
      captured_at: new Date().toISOString(),
      gps_lat: gps.lat,
      gps_lng: gps.lng,
      label: input.label ?? "Installation photo",
    },
  };
}

export async function persistAdminItcMedia(itc: AdminItcRecord): Promise<{ error: string | null }> {
  return updateAdminItcRow(itc.id, { form_data: buildItcFormData(itc) });
}

export async function uploadAdminWaeMarkup(input: {
  projectId: string;
  itcId: string;
  file: File;
}): Promise<{ error: string | null; url?: string }> {
  const uploaded = await uploadToStorageBucket({
    bucket: "itc-photos",
    pathPrefix: `${input.projectId}/${input.itcId}/wae`,
    file: input.file,
    fileName: buildUniqueStorageFileName(input.file.name),
    contentType: input.file.type || "application/octet-stream",
    fallbackBuckets: [ITP_ATTACHMENTS_BUCKET, ITP_DRAWINGS_BUCKET, "itp-uploads"],
  });
  if (!uploaded.url) return { error: uploaded.error ?? "Upload failed" };
  return { error: null, url: uploaded.url };
}

export function formatAdminDate(value: string | null | undefined): string {
  if (!value) return "—";
  const date = new Date(value);
  if (Number.isNaN(date.getTime())) return "—";
  return date.toLocaleDateString("en-AU", {
    day: "numeric",
    month: "short",
    year: "numeric",
  });
}

export function formatGpsTag(lat: number | null, lng: number | null): string | null {
  if (lat == null || lng == null) return null;
  return `${lat.toFixed(5)}, ${lng.toFixed(5)}`;
}

export function isPlanPdf(url: string | null | undefined, mime?: string | null): boolean {
  if (mime?.includes("pdf")) return true;
  return Boolean(url?.toLowerCase().includes(".pdf"));
}

export const ADMIN_STATUS_LABELS: Record<AdminStatusBadge, string> = {
  active: "Draft",
  in_progress: "In Progress",
  completed: "Completed",
};

export const ADMIN_STATUS_CLASSES: Record<AdminStatusBadge, string> = {
  active: "bg-sky-100 text-sky-800",
  in_progress: "bg-amber-100 text-amber-800",
  completed: "bg-emerald-100 text-emerald-800",
};
