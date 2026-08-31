import { supabase, isSupabaseConfigured } from "./supabase";
import { resolveProjectId, isProjectUuid } from "./project-resolver";
import {
  nullIfBlank,
  nullIfBlankDate,
  parseMissingColumnFromError,
  sanitizeWritePayload,
} from "./form-payload-utils";
import {
  uploadAssetCertificate,
  type AssetCertificateKind,
} from "./asset-document-upload";

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
  | "assigned_accounts"
  | "general_equipment";

export type AssetStatus = "active" | "in_service_calibration";

/** Active Asset Management categories — never include General Equipment. */
export const ASSET_TYPES = [
  "laptop",
  "ipad",
  "laser",
  "pressure_gauge",
  "assigned_accounts",
] as const;

export type ManagedAssetType = (typeof ASSET_TYPES)[number];

const KNOWN_ASSET_TYPES: AssetType[] = [
  ...ASSET_TYPES,
  "general_equipment",
];

export const ASSET_TYPE_LABELS: Record<AssetType, string> = {
  laptop: "Laptops",
  ipad: "iPads",
  laser: "Lasers",
  pressure_gauge: "Pressure Gauges",
  assigned_accounts: "Assigned Accounts",
  general_equipment: "General Equipment",
};

/** Singular labels used for auto-generated fallback names. */
export const ASSET_TYPE_SINGULAR_LABELS: Record<AssetType, string> = {
  laptop: "Laptop",
  ipad: "iPad",
  laser: "Laser",
  pressure_gauge: "Pressure Gauge",
  assigned_accounts: "Account",
  general_equipment: "Equipment",
};

const LEGACY_ASSET_TYPE_ALIASES: Record<string, AssetType> = {
  site_laser: "laser",
  lasers: "laser",
  laptops: "laptop",
  ipads: "ipad",
  "pressure gauges": "pressure_gauge",
  "pressure gauge": "pressure_gauge",
  "assigned accounts": "assigned_accounts",
};

export function isAssetType(value: string): value is AssetType {
  return (KNOWN_ASSET_TYPES as readonly string[]).includes(value);
}

export function isManagedAssetType(value: string): value is ManagedAssetType {
  return (ASSET_TYPES as readonly string[]).includes(value);
}

export function normalizeAssetType(value: unknown): AssetType {
  const raw = String(value ?? "").trim();
  if (!raw) return "laptop";
  if (isManagedAssetType(raw)) return raw;
  if (isAssetType(raw)) return raw;
  const aliased = LEGACY_ASSET_TYPE_ALIASES[raw.toLowerCase()];
  if (aliased) return aliased;
  const slug = raw.toLowerCase().replace(/[\s-]+/g, "_");
  if (isManagedAssetType(slug) || isAssetType(slug)) return slug as AssetType;
  return "laptop";
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

export const ASSET_CATEGORY_PATH_SLUGS: Record<ManagedAssetType, string> = {
  laptop: "laptops",
  ipad: "ipads",
  laser: "lasers",
  pressure_gauge: "pressure-gauges",
  assigned_accounts: "assigned-accounts",
};

const ASSET_CATEGORY_SLUG_ALIASES: Record<string, ManagedAssetType> = {
  laptops: "laptop",
  laptop: "laptop",
  ipads: "ipad",
  ipad: "ipad",
  lasers: "laser",
  laser: "laser",
  "pressure-gauges": "pressure_gauge",
  pressure_gauges: "pressure_gauge",
  "pressure-gauge": "pressure_gauge",
  pressure_gauge: "pressure_gauge",
  "assigned-accounts": "assigned_accounts",
  assigned_accounts: "assigned_accounts",
};

export function getAssetCategoryPathSlug(type: AssetType | string): string {
  const normalized = normalizeAssetType(type);
  if (isManagedAssetType(normalized)) return ASSET_CATEGORY_PATH_SLUGS[normalized];
  return normalized;
}

export function parseAssetCategorySlug(
  value: string | null | undefined
): ManagedAssetType | null {
  const raw = String(value ?? "").trim().toLowerCase();
  if (!raw) return null;
  const mapped =
    ASSET_CATEGORY_SLUG_ALIASES[raw] ??
    ASSET_CATEGORY_SLUG_ALIASES[raw.replace(/-/g, "_")];
  return mapped && isManagedAssetType(mapped) ? mapped : null;
}

/** Normalize Postgres date / timestamptz values for `<input type="date">`. */
export function toDateInputValue(value: string | null | undefined): string {
  const trimmed = value?.trim();
  if (!trimmed) return "";
  return trimmed.slice(0, 10);
}

export function getAssetCategoryPrefix(type: AssetType | string): string {
  switch (normalizeAssetType(type)) {
    case "laptop":
      return "LAP";
    case "ipad":
      return "IPAD";
    case "laser":
      return "LAS";
    case "pressure_gauge":
      return "PG";
    case "assigned_accounts":
      return "ACC";
    default:
      return "AST";
  }
}

/** Unique fallback when the form leaves asset_number blank. */
export function generateUniqueAssetNumber(type: AssetType | string): string {
  const categoryPrefix = getAssetCategoryPrefix(type);
  return `${categoryPrefix}-${Date.now()}-${Math.floor(1000 + Math.random() * 9000)}`;
}

export function resolveAssetNumber(
  value: string | null | undefined,
  type: AssetType | string
): string {
  const trimmed = value?.trim();
  return trimmed || generateUniqueAssetNumber(type);
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
  if (normalized === "laser" || normalized === "pressure_gauge") return "Ref #";
  if (normalized === "assigned_accounts") return "Account Reference";
  return "Asset #";
}

/** Primary heading for cards/tables — omits redundant Name for streamlined categories. */
export function getAssetPrimaryLabel(
  asset: Pick<
    Asset,
    "asset_type" | "asset_number" | "name" | "account_name" | "serial_number"
  >
): string {
  const type = normalizeAssetType(asset.asset_type);
  if (isMobileDeviceAssetType(type)) {
    return asset.asset_number.trim() || asset.name.trim() || getAssetTypeLabel(type);
  }
  if (assetTypeHidesNameField(type)) {
    return (
      (asset.serial_number ?? "").trim() ||
      asset.asset_number.trim() ||
      "Untitled asset"
    );
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
        "Ref #",
        "Assigned Worker",
        "Assigned Project",
        "Make",
        "Model",
        "Serial #",
        "Type",
        "Next Service",
        "Next Calibration",
        "Actions",
      ];
    case "pressure_gauge":
      return [
        "Ref #",
        "Assigned Worker",
        "Assigned Project",
        "Make",
        "Model",
        "Serial #",
        "Next Calibration",
        "Actions",
      ];
    case "assigned_accounts":
      return ["Account Name", "Account Reference", "Assigned To", "Actions"];
    default:
      return ["Asset", "Actions"];
  }
}

function nullIfBlankUuid(value: string | null | undefined): string | null {
  const trimmed = nullIfBlank(value);
  if (!trimmed) return null;
  // Reject empty / placeholder values that Postgres UUID columns reject.
  if (
    trimmed === "null" ||
    trimmed === "undefined" ||
    trimmed === "0" ||
    !/^[0-9a-f]{8}-[0-9a-f]{4}-[1-5][0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(
      trimmed
    )
  ) {
    return null;
  }
  return trimmed;
}

function resolveAssetDisplayName(input: AssetInput): string {
  const type = input.asset_type;
  const singular = ASSET_TYPE_SINGULAR_LABELS[type] ?? "Asset";

  if (isMobileDeviceAssetType(type)) {
    return (
      input.asset_number.trim() ||
      input.name?.trim() ||
      singular
    );
  }
  if (assetTypeHidesNameField(type)) {
    return (
      input.asset_number.trim() ||
      input.serial_number?.trim() ||
      input.name?.trim() ||
      "Asset"
    );
  }
  if (isAssignedAccountsAssetType(type)) {
    return input.account_name?.trim() || input.name?.trim() || singular;
  }
  return input.name?.trim() || input.asset_number.trim() || singular;
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

export function groupAssetsByType(assets: Asset[]): Record<ManagedAssetType, Asset[]> {
  const groups = Object.fromEntries(
    ASSET_TYPES.map((type) => [type, [] as Asset[]])
  ) as Record<ManagedAssetType, Asset[]>;

  for (const asset of assets) {
    const type = normalizeAssetType(asset.asset_type);
    if (!isManagedAssetType(type)) continue;
    groups[type].push({ ...asset, asset_type: type });
  }

  return groups;
}

export interface Asset {
  id: string;
  asset_number: string;
  name: string;
  asset_type: AssetType;
  category: string | null;
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
  service_cert_url: string | null;
  calibration_cert_url: string | null;
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
    asset_number: String(
      row.asset_number ?? row.reference_number ?? row.ref_number ?? ""
    ),
    name: String(row.name ?? ""),
    asset_type: normalizeAssetType(row.asset_type ?? row.category),
    category: String(row.category ?? row.asset_type ?? "").trim() || null,
    make: (row.make as string | null) ?? null,
    model: (row.model as string | null) ?? null,
    serial_number: (row.serial_number as string | null) ?? null,
    status: (row.status as AssetStatus) ?? "active",
    next_service_due_date:
      (row.next_service_due_date as string | null) ??
      (row.next_service_date as string | null) ??
      null,
    next_calibration_due_date:
      (row.next_calibration_due_date as string | null) ??
      (row.next_calibration_date as string | null) ??
      null,
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
    laser_type: normalizeLaserType(
      row.laser_type ??
        (row.is_pipe === true ? "pipe" : row.is_rotating === true ? "rotating" : null)
    ),
    account_name: (row.account_name as string | null) ?? null,
    account_reference: (row.account_reference as string | null) ?? null,
    service_contact_name: (row.service_contact_name as string | null) ?? null,
    service_contact_company: (row.service_contact_company as string | null) ?? null,
    service_contact_phone: (row.service_contact_phone as string | null) ?? null,
    service_contact_email: (row.service_contact_email as string | null) ?? null,
    service_cert_url: (row.service_cert_url as string | null) ?? null,
    calibration_cert_url: (row.calibration_cert_url as string | null) ?? null,
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
  category?: string | null;
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
  service_cert_url?: string | null;
  calibration_cert_url?: string | null;
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
  const type = normalizeAssetType(input.asset_type ?? input.category);
  const projectId =
    nullIfBlank(input.project_id) ?? nullIfBlank(input.assigned_project_id);
  const workerId = nullIfBlankUuid(input.assigned_worker_id);
  const displayName = resolveAssetDisplayName({ ...input, asset_type: type });
  const assetNumber = resolveAssetNumber(input.asset_number, type);

  const base: Record<string, unknown> = {
    asset_number: assetNumber,
    reference_number: assetNumber,
    name: displayName,
    // Write both columns so either live schema works after the type check was dropped.
    asset_type: type,
    category: type,
    status: input.status ?? "active",
    // Keep both project columns in sync for either live schema.
    assigned_project_id: projectId,
    project_id: projectId,
  };

  if (isMobileDeviceAssetType(type)) {
    return sanitizeWritePayload({
      ...base,
      make: null,
      model: null,
      serial_number: null,
      assigned_worker_id: workerId,
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
    });
  }

  if (type === "assigned_accounts") {
    const accountName =
      nullIfBlank(input.account_name) || displayName || ASSET_TYPE_SINGULAR_LABELS.assigned_accounts;
    const accountReference =
      nullIfBlank(input.account_reference) || assetNumber;
    return sanitizeWritePayload({
      ...base,
      asset_number: accountReference,
      reference_number: accountReference,
      name: accountName,
      account_name: accountName,
      account_reference: accountReference,
      assigned_worker_ids: normalizeWorkerIdArray(input.assigned_worker_ids)
        .map((id) => nullIfBlankUuid(id))
        .filter((id): id is string => Boolean(id)),
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
    });
  }

  const calibrationDate = nullIfBlankDate(input.next_calibration_due_date);
  const serviceDate = nullIfBlankDate(input.next_service_due_date);

  if (type === "laser") {
    return sanitizeWritePayload({
      ...base,
      ref_number: assetNumber,
      make: nullIfBlank(input.make),
      model: nullIfBlank(input.model),
      serial_number: nullIfBlank(input.serial_number),
      laser_type: input.laser_type ?? null,
      is_pipe: input.laser_type === "pipe",
      is_rotating: input.laser_type === "rotating",
      next_service_due_date: serviceDate,
      next_service_date: serviceDate,
      next_calibration_due_date: calibrationDate,
      next_calibration_date: calibrationDate,
      service_contact_name: nullIfBlank(input.service_contact_name),
      service_contact_company: nullIfBlank(input.service_contact_company),
      service_contact_phone: nullIfBlank(input.service_contact_phone),
      service_contact_email: nullIfBlank(input.service_contact_email),
      assigned_worker_id: workerId,
      assigned_worker_ids: [],
      account_name: null,
      account_reference: null,
      ...(input.service_cert_url !== undefined
        ? { service_cert_url: nullIfBlank(input.service_cert_url) }
        : {}),
      ...(input.calibration_cert_url !== undefined
        ? { calibration_cert_url: nullIfBlank(input.calibration_cert_url) }
        : {}),
    });
  }

  // pressure_gauge and any other calibrated equipment
  return sanitizeWritePayload({
    ...base,
    ref_number: assetNumber,
    make: nullIfBlank(input.make),
    model: nullIfBlank(input.model),
    serial_number: nullIfBlank(input.serial_number),
    laser_type: null,
    is_pipe: null,
    is_rotating: null,
    next_service_due_date: null,
    next_service_date: null,
    next_calibration_due_date: calibrationDate,
    next_calibration_date: calibrationDate,
    service_contact_name: nullIfBlank(input.service_contact_name),
    service_contact_company: nullIfBlank(input.service_contact_company),
    service_contact_phone: nullIfBlank(input.service_contact_phone),
    service_contact_email: nullIfBlank(input.service_contact_email),
    assigned_worker_id: workerId,
    assigned_worker_ids: [],
    account_name: null,
    account_reference: null,
    ...(input.calibration_cert_url !== undefined
      ? { calibration_cert_url: nullIfBlank(input.calibration_cert_url) }
      : {}),
  });
}

export function buildAssetInputFromForm(values: {
  assetType: AssetType;
  assetNumber: string;
  name: string;
  make: string;
  model: string;
  serialNumber: string;
  status?: AssetStatus;
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
  const singular = ASSET_TYPE_SINGULAR_LABELS[values.assetType];
  const generatedNumber = generateUniqueAssetNumber(values.assetType);

  if (isMobileDeviceAssetType(values.assetType)) {
    const ref = values.assetNumber.trim() || generatedNumber;
    return {
      asset_type: values.assetType,
      category: values.assetType,
      asset_number: ref,
      // Fallback name: laptop_ref / ipad_ref || "Laptop" / "iPad"
      name: values.assetNumber.trim() || singular,
      status: values.status ?? "active",
      make: undefined,
      model: undefined,
      serial_number: undefined,
      assigned_worker_id: values.assignedWorkerId || null,
      assigned_project_id: values.assignedProjectId || null,
      project_id: values.assignedProjectId || null,
    };
  }

  if (isAssignedAccountsAssetType(values.assetType)) {
    const accountName = values.accountName.trim() || singular;
    const accountReference =
      values.accountReference.trim() ||
      values.assetNumber.trim() ||
      generatedNumber;
    return {
      asset_type: values.assetType,
      category: values.assetType,
      asset_number: accountReference,
      name: accountName,
      status: values.status ?? "active",
      account_name: accountName,
      account_reference: accountReference,
      assigned_worker_ids: values.assignedWorkerIds,
    };
  }

  const serial = values.serialNumber.trim();
  const assetNumber = values.assetNumber.trim() || generatedNumber;
  const name = values.assetNumber.trim() || serial || "Asset";

  return {
    asset_type: values.assetType,
    category: values.assetType,
    asset_number: assetNumber,
    name,
    status: values.status ?? "active",
    make: values.make,
    model: values.model,
    serial_number: serial || undefined,
    laser_type: values.assetType === "laser" ? values.laserType : null,
    next_service_due_date: values.nextServiceDue || null,
    next_calibration_due_date: values.nextCalibrationDue || null,
    service_contact_name: values.serviceContactName,
    service_contact_company: values.serviceContactCompany,
    service_contact_phone: values.serviceContactPhone,
    service_contact_email: values.serviceContactEmail,
    assigned_worker_id: values.assignedWorkerId || null,
    assigned_project_id: values.assignedProjectId || null,
    project_id: values.assignedProjectId || null,
  };
}

const OPTIONAL_ASSET_COLUMNS = [
  "category",
  "project_id",
  "assigned_project_id",
  "assigned_worker_id",
  "assigned_worker_ids",
  "laser_type",
  "account_name",
  "account_reference",
  "service_contact_name",
  "service_contact_company",
  "service_contact_phone",
  "service_contact_email",
  "next_service_due_date",
  "next_calibration_due_date",
  "make",
  "model",
  "serial_number",
  "reference_number",
  "ref_number",
  "next_service_date",
  "next_calibration_date",
  "is_pipe",
  "is_rotating",
  "vendor_id",
  "service_cert_url",
  "calibration_cert_url",
  "updated_at",
] as const;

function isMissingAssetColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const col = column.toLowerCase();
  return (
    lower.includes(col) &&
    (lower.includes("schema cache") ||
      lower.includes("could not find") ||
      lower.includes("does not exist") ||
      (lower.includes("column") && lower.includes(col)))
  );
}

async function upsertAssetRow(options: {
  mode: "insert" | "update";
  id?: string;
  payload: Record<string, unknown>;
}): Promise<{ data: Record<string, unknown> | null; error: string | null }> {
  let current = { ...options.payload };

  for (let attempt = 0; attempt < 25; attempt++) {
    const query =
      options.mode === "insert"
        ? supabase.from("assets").insert(current).select("*").single()
        : supabase
            .from("assets")
            .update(current)
            .eq("id", options.id!)
            .select("*")
            .single();

    const { data, error } = await query;
    if (!error) {
      return { data: (data as Record<string, unknown> | null) ?? null, error: null };
    }

    const extracted = parseMissingColumnFromError(error.message);
    const missingColumn =
      (extracted && extracted in current ? extracted : null) ||
      OPTIONAL_ASSET_COLUMNS.find(
        (column) =>
          column in current && isMissingAssetColumnError(error.message, column)
      );

    if (missingColumn && missingColumn in current) {
      const { [missingColumn]: _removed, ...rest } = current;
      current = rest;
      continue;
    }

    // Invalid UUID / empty string on FK columns — null them out and retry.
    const lower = error.message.toLowerCase();
    if (
      (lower.includes("uuid") || lower.includes("invalid input syntax")) &&
      "assigned_worker_id" in current &&
      current.assigned_worker_id
    ) {
      current = { ...current, assigned_worker_id: null };
      continue;
    }

    // Duplicate asset_number — regenerate a unique identifier and retry inserts.
    if (
      options.mode === "insert" &&
      (lower.includes("asset_number") || lower.includes("reference_number")) &&
      (lower.includes("duplicate") ||
        lower.includes("unique") ||
        lower.includes("already exists"))
    ) {
      const type = String(current.asset_type ?? current.category ?? "AST");
      const nextNumber = generateUniqueAssetNumber(type);
      current = {
        ...current,
        asset_number: nextNumber,
        reference_number: nextNumber,
      };
      continue;
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "Failed to save asset." };
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
    const { data, error } = await upsertAssetRow({ mode: "insert", payload });
    if (error || !data) return { error: error ?? "Failed to add asset" };

    const asset = normalizeAsset(data);
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
    const { data, error } = await upsertAssetRow({
      mode: "update",
      id,
      payload,
    });
    if (error || !data) return { error: error ?? "Failed to update asset" };

    const asset = normalizeAsset(data);
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

export async function updateAssetCertificateUrl(
  assetId: string,
  kind: AssetCertificateKind,
  url: string | null
): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const column = kind === "service" ? "service_cert_url" : "calibration_cert_url";
  const payload = {
    [column]: nullIfBlank(url),
    updated_at: new Date().toISOString(),
  };

  const { data, error } = await upsertAssetRow({
    mode: "update",
    id: assetId,
    payload,
  });
  if (error || !data) return { error: error ?? "Failed to save certificate." };
  return { error: null, asset: normalizeAsset(data) };
}

export async function updateAssetDueDates(
  assetId: string,
  dates: {
    next_service_date?: string | null;
    next_calibration_date?: string | null;
  }
): Promise<{ error: string | null; asset?: Asset }> {
  if (!isSupabaseConfigured()) return { error: "Supabase is not configured" };

  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (dates.next_service_date !== undefined) {
    const serviceDate = nullIfBlankDate(dates.next_service_date);
    payload.next_service_due_date = serviceDate;
    payload.next_service_date = serviceDate;
  }

  if (dates.next_calibration_date !== undefined) {
    const calibrationDate = nullIfBlankDate(dates.next_calibration_date);
    payload.next_calibration_due_date = calibrationDate;
    payload.next_calibration_date = calibrationDate;
  }

  const { data, error } = await upsertAssetRow({
    mode: "update",
    id: assetId,
    payload,
  });
  if (error || !data) return { error: error ?? "Failed to save dates." };
  return { error: null, asset: normalizeAsset(data) };
}

export async function attachAssetCertificates(
  assetId: string,
  files: { service?: File | null; calibration?: File | null }
): Promise<{ error: string | null; asset?: Asset }> {
  let latest: Asset | undefined;

  if (files.service) {
    const uploaded = await uploadAssetCertificate(files.service, assetId, "service");
    if (uploaded.error || !uploaded.url) {
      return { error: uploaded.error ?? "Service certificate upload failed." };
    }
    const saved = await updateAssetCertificateUrl(assetId, "service", uploaded.url);
    if (saved.error) return saved;
    latest = saved.asset;
  }

  if (files.calibration) {
    const uploaded = await uploadAssetCertificate(
      files.calibration,
      assetId,
      "calibration"
    );
    if (uploaded.error || !uploaded.url) {
      return { error: uploaded.error ?? "Calibration certificate upload failed." };
    }
    const saved = await updateAssetCertificateUrl(assetId, "calibration", uploaded.url);
    if (saved.error) return saved;
    latest = saved.asset;
  }

  return { error: null, asset: latest };
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

/**
 * Soft category-aware validation. Non-essential fields are optional; missing
 * refs/names are auto-filled in buildAssetInputFromForm / buildAssetWritePayload.
 */
export function validateAssetInput(_input: AssetInput): string | null {
  // Category/type check constraint is dropped. Never block submit on optional fields.
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
