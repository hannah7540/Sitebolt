import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId, isProjectUuid } from "./project-resolver";
import { nullIfBlankDate } from "./form-payload-utils";

export type LaserType = "pipe" | "rotating";

export const LASER_TYPE_OPTIONS: LaserType[] = ["pipe", "rotating"];

export const LASER_TYPE_LABELS: Record<LaserType, string> = {
  pipe: "Pipe",
  rotating: "Rotating",
};

export type AssetType =
  | "laptop"
  | "ipad"
  | "laser"
  | "pressure_gauge"
  | "assigned_accounts";

export type AssetStatus = "active" | "in_service_calibration";

export const ASSET_TYPES: AssetType[] = [
  "laptop",
  "ipad",
  "laser",
  "pressure_gauge",
  "assigned_accounts",
];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  laptop: "Laptops",
  ipad: "iPads",
  laser: "Lasers",
  pressure_gauge: "Pressure Gauges",
  assigned_accounts: "Assigned Accounts",
};

const LEGACY_ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  site_laser: "laser",
};

export function isAssetType(value: string): value is AssetType {
  return (ASSET_TYPES as readonly string[]).includes(value);
}

export function normalizeAssetType(value: unknown): AssetType {
  const raw = String(value ?? "").trim();
  if (isAssetType(raw)) return raw;
  if (LEGACY_ASSET_TYPE_ALIASES[raw]) return LEGACY_ASSET_TYPE_ALIASES[raw];
  return "laser";
}

export function getAssetTypeLabel(type: string): string {
  const normalized = normalizeAssetType(type);
  return ASSET_TYPE_LABELS[normalized];
}

export function isLaserAssetType(type: AssetType | string): boolean {
  return normalizeAssetType(type) === "laser";
}

export function assetTypeRequiresCalibration(type: AssetType): boolean {
  return type === "laser" || type === "pressure_gauge";
}

export function assetTypeRequiresService(type: AssetType): boolean {
  return type === "laser";
}

export function isMobileDeviceAssetType(type: AssetType): boolean {
  return type === "laptop" || type === "ipad";
}

export function isAssignedAccountsAssetType(type: AssetType): boolean {
  return type === "assigned_accounts";
}

/** Lasers / pressure gauges no longer collect or display a separate Name field. */
export function assetTypeHidesNameField(type: AssetType | string): boolean {
  const normalized = normalizeAssetType(type);
  return normalized === "laser" || normalized === "pressure_gauge";
}

export function getAssetReferenceLabel(type: AssetType | string): string {
  const normalized = normalizeAssetType(type);
  if (normalized === "laptop") return "Laptop Ref";
  if (normalized === "ipad") return "iPad Ref";
  if (normalized === "assigned_accounts") return "Account Reference";
  return "Asset #";
}

/** Primary heading for cards/tables — omits redundant Name for streamlined categories. */
export function getAssetPrimaryLabel(asset: Pick<Asset, "asset_type" | "asset_number" | "name" | "account_name">): string {
  const type = normalizeAssetType(asset.asset_type);
  if (isMobileDeviceAssetType(type)) {
    return asset.asset_number.trim() || asset.name.trim() || getAssetTypeLabel(type);
  }
  if (assetTypeHidesNameField(type)) {
    return asset.asset_number.trim() || "Untitled asset";
  }
  if (isAssignedAccountsAssetType(type)) {
    return (asset.account_name ?? asset.name).trim() || asset.asset_number;
  }
  const number = asset.asset_number.trim();
  const name = asset.name.trim();
  if (number && name && number !== name) return `${number} — ${name}`;
  return number || name || "Untitled asset";
}

export function getAssetCategoryColumnHeaders(type: AssetType): string[] {
  switch (type) {
    case "laptop":
      return ["Laptop Ref", "Assigned Worker", "Assigned Project", "Actions"];
    case "ipad":
      return ["iPad Ref", "Assigned Worker", "Assigned Project", "Actions"];
    case "laser":
      return [
        "Asset #",
        "Serial #",
        "Laser Type",
        "Service Due",
        "Calibration Due",
        "Status",
        "Assigned Worker",
        "Actions",
      ];
    case "pressure_gauge":
      return [
        "Asset #",
        "Serial #",
        "Calibration Due",
        "Status",
        "Assigned Worker",
        "Actions",
      ];
    case "assigned_accounts":
      return ["Account Name", "Account Reference", "Assigned To", "Actions"];
    default:
      return ["Asset", "Actions"];
  }
}

function resolveAssetDisplayName(input: AssetInput): string {
  const type = input.asset_type;
  if (isMobileDeviceAssetType(type)) {
    return (
      input.asset_number.trim() ||
      input.name?.trim() ||
      `${ASSET_TYPE_LABELS[type]} Asset`
    );
  }
  if (assetTypeHidesNameField(type)) {
    return (
      input.asset_number.trim() ||
      input.serial_number?.trim() ||
      input.name?.trim() ||
      `${ASSET_TYPE_LABELS[type]} Asset`
    );
  }
  if (isAssignedAccountsAssetType(type)) {
    return input.account_name?.trim() || input.name?.trim() || "";
  }
  return input.name?.trim() || input.asset_number.trim();
}

function normalizeWorkerIdArray(value: unknown): string[] {
  if (!Array.isArray(value)) return [];
  return value
    .map((item) => String(item ?? "").trim())
    .filter(Boolean);
}

function normalizeLaserType(value: unknown): LaserType | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (raw === "pipe" || raw === "rotating") return raw;
  return null;
}

export function groupAssetsByType(assets: Asset[]): Record<AssetType, Asset[]> {
  const groups = Object.fromEntries(
    ASSET_TYPES.map((type) => [type, [] as Asset[]])
  ) as Record<AssetType, Asset[]>;

  for (const asset of assets) {
    const type = normalizeAssetType(asset.asset_type);
    groups[type].push({ ...asset, asset_type: type });
  }

  return groups;
}

export interface Asset {
  id: string;
  asset_number: string;
  name: string;
  asset_type: AssetType;
  make: string | null;
  model: string | null;
  serial_number: string | null;
  status: AssetStatus;
  next_service_due_date: string | null;
  next_calibration_due_date: string | null;
  assigned_project_id: string | null;
  project_id: string | null;
  assigned_worker_id: string | null;
  assigned_worker_ids: string[];
  laser_type: LaserType | null;
  account_name: string | null;
  account_reference: string | null;
  service_contact_name: string | null;
  service_contact_company: string | null;
  service_contact_phone: string | null;
  service_contact_email: string | null;
  created_at?: string;
  updated_at?: string;
}

export interface AssetLaserSignout {
  id: string;
  asset_id: string;
  project_id: string;
  worker_name: string | null;
  signed_out_at: string;
  signed_in_at: string | null;
  notes: string | null;
}

export const ASSET_STATUS_LABELS: Record<AssetStatus, string> = {
  active: "Active",
  in_service_calibration: "In Service/Calibration",
};

function normalizeAsset(row: Record<string, unknown>): Asset {
  return {
    id: String(row.id ?? ""),
    asset_number: String(row.asset_number ?? ""),
    name: String(row.name ?? ""),
    asset_type: normalizeAssetType(row.asset_type),
    make: (row.make as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serial_number: (row.serial_number as string | null) ?? null,
    status: (row.status as AssetStatus) ?? "active",
    next_service_due_date: (row.next_service_due_date as string | null) ?? null,
    next_calibration_due_date: (row.next_calibration_due_date as string | null) ?? null,
    assigned_project_id:
      (row.assigned_project_id as string | null) ??
      (row.project_id as string | null) ??
      null,
    project_id:
      (row.project_id as string | null) ??
      (row.assigned_project_id as string | null) ??
      null,
    assigned_worker_id: row.assigned_worker_id
      ? String(row.assigned_worker_id)
      : null,
    assigned_worker_ids: normalizeWorkerIdArray(row.assigned_worker_ids),
    laser_type: normalizeLaserType(row.laser_type),
    account_name: (row.account_name as string | null) ?? null,
    account_reference: (row.account_reference as string | null) ?? null,
    service_contact_name: (row.service_contact_name as string | null) ?? null,
    service_contact_company: (row.service_contact_company as string | null) ?? null,
    service_contact_phone: (row.service_contact_phone as string | null) ?? null,
    service_contact_email: (row.service_contact_email as string | null) ?? null,
    created_at: row.created_at as string | undefined,
    updated_at: row.updated_at as string | undefined,
  };
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

export async function fetchAssets(): Promise<Asset[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .order("asset_number");

    if (error) {
      if (!isMissingTableError(error.message, "assets")) {
        console.warn("fetchAssets failed:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => normalizeAsset(row as Record<string, unknown>));
  } catch (error) {
    console.warn("fetchAssets threw:", error);
    return [];
  }
}

export async function fetchAssetById(id: string): Promise<Asset | null> {
  if (!isSupabaseConfigured()) return null;

  try {
    const { data, error } = await supabase
      .from("assets")
      .select("*")
      .eq("id", id)
      .maybeSingle();

    if (error || !data) return null;
    return normalizeAsset(data as Record<string, unknown>);
  } catch {
    return null;
  }
}

export interface AssetInput {
  asset_number: string;
  /** Optional for laptops, iPads, lasers, and pressure gauges (auto-populated). */
  name?: string;
  asset_type: AssetType;
  make?: string;
  model?: string;
  serial_number?: string;
  status?: AssetStatus;
  next_service_due_date?: string | null;
  next_calibration_due_date?: string | null;
  assigned_project_id?: string | null;
  project_id?: string | null;
  assigned_worker_id?: string | null;
  assigned_worker_ids?: string[];
  laser_type?: LaserType | null;
  account_name?: string;
  account_reference?: string;
  service_contact_name?: string;
  service_contact_company?: string;
  service_contact_phone?: string;
  service_contact_email?: string;
}

async function resolveAssetProjectId(
  projectId: string | null | undefined
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = projectId?.trim();
  if (!trimmed) return { id: null, error: null };

  if (isProjectUuid(trimmed)) return { id: trimmed, error: null };

  const { id, error } = await resolveProjectId(trimmed);
  if (error || !id) {
    return { id: null, error: error ?? "Invalid project selected." };
  }
  return { id, error: null };
}

async function syncAssetProjectAssignment(
  assetId: string,
  projectId: string | null
): Promise<{ error: string | null }> {
  if (!projectId) {
    await supabase
      .from("project_asset_assignments")
      .delete()
      .eq("asset_id", assetId);
    return { error: null };
  }

  const existing = await fetchProjectAssetAssignments();
  const currentAssignment = existing.find((row) => row.asset_id === assetId);

  if (currentAssignment && currentAssignment.project_id !== projectId) {
    await supabase
      .from("project_asset_assignments")
      .delete()
      .eq("id", currentAssignment.id);
  }

  const { error: upsertError } = await supabase
    .from("project_asset_assignments")
    .upsert(
      { project_id: projectId, asset_id: assetId },
      { onConflict: "project_id,asset_id" }
    );

  if (upsertError && !isMissingTableError(upsertError.message, "project_asset_assignments")) {
    return { error: upsertError.message };
  }

  return { error: null };
}

export function buildAssetWritePayload(input: AssetInput): Record<string, unknown> {
  const type = input.asset_type;
  const projectId = input.project_id ?? input.assigned_project_id ?? null;
  const displayName = resolveAssetDisplayName(input);

  const base: Record<string, unknown> = {
    asset_number: input.asset_number.trim(),
    name: displayName,
    asset_type: type,
    status: input.status ?? "active",
    assigned_project_id: projectId,
    project_id: projectId,
  };

  if (isMobileDeviceAssetType(type)) {
    return {
      ...base,
      make: null,
      model: null,
      serial_number: null,
      assigned_worker_id: input.assigned_worker_id?.trim() || null,
      assigned_worker_ids: [],
      laser_type: null,
      account_name: null,
      account_reference: null,
      next_service_due_date: null,
      next_calibration_due_date: null,
      service_contact_name: null,
      service_contact_company: null,
      service_contact_phone: null,
      service_contact_email: null,
    };
  }

  if (type === "assigned_accounts") {
    return {
      ...base,
      name: input.account_name?.trim() || displayName,
      account_name: input.account_name?.trim() || null,
      account_reference: input.account_reference?.trim() || null,
      assigned_worker_ids: normalizeWorkerIdArray(input.assigned_worker_ids),
      assigned_worker_id: null,
      laser_type: null,
      make: null,
      model: null,
      serial_number: null,
      next_service_due_date: null,
      next_calibration_due_date: null,
      service_contact_name: null,
      service_contact_company: null,
      service_contact_phone: null,
      service_contact_email: null,
    };
  }

  if (type === "laser") {
    return {
      ...base,
      make: input.make?.trim() || null,
      model: input.model?.trim() || null,
      serial_number: input.serial_number?.trim() || null,
      laser_type: input.laser_type ?? null,
      next_service_due_date: nullIfBlankDate(input.next_service_due_date),
      next_calibration_due_date: nullIfBlankDate(input.next_calibration_due_date),
      service_contact_name: input.service_contact_name?.trim() || null,
      service_contact_company: input.service_contact_company?.trim() || null,
      service_contact_phone: input.service_contact_phone?.trim() || null,
      service_contact_email: input.service_contact_email?.trim() || null,
      assigned_worker_id: input.assigned_worker_id?.trim() || null,
      assigned_worker_ids: [],
      account_name: null,
      account_reference: null,
    };
  }

  return {
    ...base,
    make: input.make?.trim() || null,
    model: input.model?.trim() || null,
    serial_number: input.serial_number?.trim() || null,
    laser_type: null,
    next_service_due_date: null,
    next_calibration_due_date: nullIfBlankDate(input.next_calibration_due_date),
    service_contact_name: input.service_contact_name?.trim() || null,
    service_contact_company: input.service_contact_company?.trim() || null,
    service_contact_phone: input.service_contact_phone?.trim() || null,
    service_contact_email: input.service_contact_email?.trim() || null,
    assigned_worker_id: input.assigned_worker_id?.trim() || null,
    assigned_worker_ids: [],
    account_name: null,
    account_reference: null,
  };
}

export function buildAssetInputFromForm(values: {
  assetType: AssetType;
  assetNumber: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  assignedWorkerId: string | null;
  assignedProjectId: string | null;
  assignedWorkerIds: string[];
  laserType: LaserType | null;
  accountName: string;
  accountReference: string;
  nextServiceDue: string;
  nextCalibrationDue: string;
  serviceContactName: string;
  serviceContactCompany: string;
  serviceContactPhone: string;
  serviceContactEmail: string;
}): AssetInput {
  const prefix =
    values.assetType === "ipad"
      ? "IPAD"
      : values.assetType === "laptop"
        ? "LAP"
        : values.assetType === "assigned_accounts"
          ? "ACC"
          : "AST";

  if (isMobileDeviceAssetType(values.assetType)) {
    const ref = values.assetNumber.trim();
    return {
      asset_type: values.assetType,
      asset_number: ref || `${prefix}-${Date.now()}`,
      name: ref || values.name.trim() || `${ASSET_TYPE_LABELS[values.assetType]} Asset`,
      make: "",
      model: "",
      serial_number: "",
      assigned_worker_id: values.assignedWorkerId,
      assigned_project_id: values.assignedProjectId,
      project_id: values.assignedProjectId,
    };
  }

  if (isAssignedAccountsAssetType(values.assetType)) {
    const accountName = values.accountName.trim();
    const accountReference = values.accountReference.trim();
    return {
      asset_type: values.assetType,
      asset_number: accountReference || values.assetNumber.trim() || `${prefix}-${Date.now()}`,
      name: accountName || values.name.trim(),
      account_name: accountName,
      account_reference: accountReference,
      assigned_worker_ids: values.assignedWorkerIds,
    };
  }

  const assetNumber = values.assetNumber.trim();
  return {
    asset_type: values.assetType,
    asset_number: assetNumber,
    // Name is not collected for lasers/gauges — mirror Asset # for DB compatibility.
    name: assetTypeHidesNameField(values.assetType)
      ? assetNumber || values.serialNumber.trim() || values.name.trim()
      : values.name.trim(),
    make: values.make,
    model: values.model,
    serial_number: values.serialNumber,
    laser_type: values.assetType === "laser" ? values.laserType : null,
    next_service_due_date: values.nextServiceDue || null,
    next_calibration_due_date: values.nextCalibrationDue || null,
    service_contact_name: values.serviceContactName,
    service_contact_company: values.serviceContactCompany,
    service_contact_phone: values.serviceContactPhone,
    service_contact_email: values.serviceContactEmail,
    assigned_worker_id: values.assignedWorkerId,
    assigned_project_id: values.assignedProjectId,
    project_id: values.assignedProjectId,
  };
}

export async function addAsset(input: AssetInput): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const validationError = validateAssetInput(input);
  if (validationError) return { error: validationError };

  const projectRef = input.project_id ?? input.assigned_project_id ?? null;
  const { id: resolvedProjectId, error: projectError } =
    await resolveAssetProjectId(projectRef);
  if (projectError) return { error: projectError };

  const payload = buildAssetWritePayload({
    ...input,
    assigned_project_id: resolvedProjectId,
    project_id: resolvedProjectId,
  });

  try {
    const { data, error } = await supabase
      .from("assets")
      .insert(payload)
      .select("*")
      .single();

    if (error) return { error: error.message };

    const asset = normalizeAsset(data as Record<string, unknown>);
    const { error: assignError } = await syncAssetProjectAssignment(
      asset.id,
      resolvedProjectId
    );
    if (assignError) return { error: assignError };

    return { error: null, asset };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to add asset" };
  }
}

export async function updateAsset(
  id: string,
  input: AssetInput
): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const validationError = validateAssetInput(input);
  if (validationError) return { error: validationError };

  const projectRef = input.project_id ?? input.assigned_project_id ?? null;
  const { id: resolvedProjectId, error: projectError } =
    await resolveAssetProjectId(projectRef);
  if (projectError) return { error: projectError };

  const payload = {
    ...buildAssetWritePayload({
      ...input,
      assigned_project_id: resolvedProjectId,
      project_id: resolvedProjectId,
    }),
    updated_at: new Date().toISOString(),
  };

  try {
    const { data, error } = await supabase
      .from("assets")
      .update(payload)
      .eq("id", id)
      .select("*")
      .single();

    if (error) return { error: error.message };

    const asset = normalizeAsset(data as Record<string, unknown>);
    const { error: assignError } = await syncAssetProjectAssignment(
      id,
      resolvedProjectId
    );
    if (assignError) return { error: assignError };

    return { error: null, asset };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to update asset" };
  }
}

export async function deleteAsset(id: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { error } = await supabase.from("assets").delete().eq("id", id);
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to delete asset" };
  }
}

export interface ProjectAssetAssignment {
  id: string;
  project_id: string;
  asset_id: string;
}

export async function fetchProjectAssetAssignments(): Promise<ProjectAssetAssignment[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from("project_asset_assignments")
      .select("id, project_id, asset_id");

    if (error) {
      if (!isMissingTableError(error.message, "project_asset_assignments")) {
        console.warn("fetchProjectAssetAssignments failed:", error.message);
      }
      return [];
    }

    return (data ?? []) as ProjectAssetAssignment[];
  } catch (error) {
    console.warn("fetchProjectAssetAssignments threw:", error);
    return [];
  }
}

export function buildAssetProjectMap(
  assignments: ProjectAssetAssignment[]
): Map<string, string[]> {
  const map = new Map<string, string[]>();
  for (const row of assignments) {
    const list = map.get(row.asset_id) ?? [];
    if (!list.includes(row.project_id)) list.push(row.project_id);
    map.set(row.asset_id, list);
  }
  return map;
}

export function getAssetAssignedProjectIds(
  asset: Pick<Asset, "assigned_project_id">,
  junctionIds: string[] = []
): string[] {
  const ids = new Set(junctionIds.filter(Boolean));
  if (asset.assigned_project_id) ids.add(asset.assigned_project_id);
  return [...ids];
}

export async function assignAssetToProject(
  assetId: string,
  projectId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId, error: resolveError } = await resolveProjectId(projectId);
    if (resolveError || !resolvedId) return { error: resolveError ?? "Project not found" };

    const existing = await fetchProjectAssetAssignments();
    const currentAssignment = existing.find((row) => row.asset_id === assetId);

    if (currentAssignment && currentAssignment.project_id !== resolvedId) {
      await supabase
        .from("project_asset_assignments")
        .delete()
        .eq("id", currentAssignment.id);
    }

    const { error: upsertError } = await supabase
      .from("project_asset_assignments")
      .upsert(
        { project_id: resolvedId, asset_id: assetId },
        { onConflict: "project_id,asset_id" }
      );

    if (upsertError && !isMissingTableError(upsertError.message, "project_asset_assignments")) {
      return { error: upsertError.message };
    }

    await supabase
      .from("assets")
      .update({ assigned_project_id: resolvedId, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to assign asset" };
  }
}

export async function unassignAssetFromProject(
  assetId: string,
  projectId: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId } = await resolveProjectId(projectId);

    await supabase
      .from("project_asset_assignments")
      .delete()
      .eq("asset_id", assetId)
      .eq("project_id", resolvedId ?? projectId);

    await supabase
      .from("assets")
      .update({ assigned_project_id: null, updated_at: new Date().toISOString() })
      .eq("id", assetId);

    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to unassign asset" };
  }
}

export function filterAssetsForProject(
  assets: Asset[],
  projectId: string,
  assetProjectMap: Map<string, string[]>
): Asset[] {
  return assets.filter((asset) => {
    const junctionIds = assetProjectMap.get(asset.id) ?? [];
    return getAssetAssignedProjectIds(asset, junctionIds).includes(projectId);
  });
}

export async function fetchLaserSignouts(projectId?: string): Promise<AssetLaserSignout[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    let query = supabase
      .from("asset_laser_signouts")
      .select("*")
      .order("signed_out_at", { ascending: false });

    if (projectId) {
      const { id: resolvedId } = await resolveProjectId(projectId);
      query = query.eq("project_id", resolvedId ?? projectId);
    }

    const { data, error } = await query;

    if (error) {
      if (!isMissingTableError(error.message, "asset_laser_signouts")) {
        console.warn("fetchLaserSignouts failed:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => ({
      id: String(row.id),
      asset_id: String(row.asset_id),
      project_id: String(row.project_id),
      worker_name: row.worker_name ?? null,
      signed_out_at: String(row.signed_out_at),
      signed_in_at: row.signed_in_at ?? null,
      notes: row.notes ?? null,
    }));
  } catch (error) {
    console.warn("fetchLaserSignouts threw:", error);
    return [];
  }
}

export async function signOutLaser(
  assetId: string,
  projectId: string,
  workerName?: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { id: resolvedId } = await resolveProjectId(projectId);
    const { error } = await supabase.from("asset_laser_signouts").insert({
      asset_id: assetId,
      project_id: resolvedId ?? projectId,
      worker_name: workerName?.trim() || null,
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to sign out laser" };
  }
}

export async function signInLaser(signoutId: string): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  try {
    const { error } = await supabase
      .from("asset_laser_signouts")
      .update({ signed_in_at: new Date().toISOString() })
      .eq("id", signoutId);

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return { error: error instanceof Error ? error.message : "Failed to sign in laser" };
  }
}

export async function updateAssetStatus(
  assetId: string,
  status: AssetStatus
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const { error } = await supabase
    .from("assets")
    .update({ status, updated_at: new Date().toISOString() })
    .eq("id", assetId);

  return { error: error?.message ?? null };
}

export function validateAssetInput(input: AssetInput): string | null {
  if (!isAssetType(input.asset_type)) return "Asset Type is required";

  if (isMobileDeviceAssetType(input.asset_type)) {
    if (!input.asset_number.trim()) {
      return `${getAssetReferenceLabel(input.asset_type)} is required.`;
    }
    return null;
  }

  if (isAssignedAccountsAssetType(input.asset_type)) {
    if (!input.account_name?.trim()) return "Account Name is required.";
    if (!input.account_reference?.trim()) return "Account Reference is required.";
    if (!input.assigned_worker_ids?.length) {
      return "Select at least one worker for Assigned To.";
    }
    return null;
  }

  if (!input.asset_number.trim()) return "Asset # is required";
  // Name is optional for lasers / pressure gauges (auto-filled from Asset #).
  if (!assetTypeHidesNameField(input.asset_type) && !input.name?.trim()) {
    return "Name is required";
  }

  if (input.asset_type === "laser" && !input.laser_type) {
    return "Laser Type is required.";
  }

  if (assetTypeRequiresCalibration(input.asset_type) && !input.next_calibration_due_date) {
    return "Next Calibration Due Date is required for Lasers and Pressure Gauges";
  }

  if (assetTypeRequiresService(input.asset_type) && !input.next_service_due_date) {
    return "Next Service Due Date is required for Lasers";
  }

  return null;
}

export function getActiveLaserSignouts(
  signouts: AssetLaserSignout[]
): AssetLaserSignout[] {
  return signouts.filter((row) => !row.signed_in_at);
}

export function isLaserOverdueNotReturned(signout: AssetLaserSignout): boolean {
  if (signout.signed_in_at) return false;
  const signedOut = new Date(signout.signed_out_at);
  const now = new Date();
  const cutoff = new Date(signedOut);
  cutoff.setHours(17, 0, 0, 0);
  if (now <= cutoff) return false;
  const sameDay =
    signedOut.getFullYear() === now.getFullYear() &&
    signedOut.getMonth() === now.getMonth() &&
    signedOut.getDate() === now.getDate();
  return sameDay;
}

export function hasLaserWarningToday(signouts: AssetLaserSignout[]): boolean {
  const now = new Date();
  if (now.getHours() < 17) return false;
  return signouts.some(isLaserOverdueNotReturned);
}
