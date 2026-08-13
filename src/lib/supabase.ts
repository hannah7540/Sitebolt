if (!process.env.NEXT_PUBLIC_SUPABASE_URL) process.env.NEXT_PUBLIC_SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY) process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY = 'placeholder';
if (!process.env.SUPABASE_URL) process.env.SUPABASE_URL = 'https://placeholder.supabase.co';
if (!process.env.SUPABASE_ANON_KEY) process.env.SUPABASE_ANON_KEY = 'placeholder';
import type { SupabaseClient } from "@supabase/supabase-js";
import { supabase as browserSupabaseClient } from "./supabase/client";
import { isSupabaseConfigured } from "./supabase/env";

export { isSupabaseConfigured } from "./supabase/env";
export { createSupabaseBrowserClient, signOutSupabase } from "./supabase/index";

export const supabase: SupabaseClient = browserSupabaseClient;
import type { PrestartTemplate } from "./prestart-templates";
import {
  getReadingFieldKey,
  getServiceFieldKey,
  usesKilometres,
} from "./prestart-templates";
import { computeWorkerStatusFromExpiries, getWorkerDisplayName, buildWorkerNameFields, nullIfBlankWorkerDate, sanitizeWorkerWritePayload } from "./worker-utils";
import {
  resolveProjectId,
  isProjectUuid,
  getProjectDisplayName,
  getCachedProjects,
  normalizeWorkerUuidArray,
  handleSupabaseNetworkFetchError,
} from "./project-resolver";
import { calculateTimesheetHours, normalizeTimesheetStatus } from "./timesheet-utils";
import { validateActBreakRequirement } from "./timesheet-act-break-validation";
import { normalizeWorkerStateRegion } from "./worker-state-region";
import {
  buildProjectScopeOrFilter,
  isMissingScopeColumnError,
  resolveProjectScopeValues,
} from "./project-scope";
import { normalizeSecurityRole, coerceSecurityRole, normalizeAccountsAccessRole, DEFAULT_WORKER_SECURITY_ROLE, type SecurityRole, type AccountsAccessRole } from "./security-roles";
import {
  getVocExpiriesFromDetails,
  type SubcontractorWorkerFormInput,
  buildSubcontractorWorkerPayload,
} from "./subcontractor-worker-payload";
import {
  nullIfBlank,
  nullIfBlankDate,
  parseMissingColumnFromError,
  sanitizeWritePayload,
} from "./form-payload-utils";
import {
  insertSiteFormRecord,
  isMissingSiteFormColumnError,
} from "./site-form-payload";
import {
  consolidatePayloadForTable,
  insertWithFormMetadataFallback,
} from "./form-metadata-consolidation";


export type PlantStatus =
  | "available"
  | "allocated"
  | "out_of_service"
  | "maintenance"
  | string;

export type WorkerStatus = "active" | "pending_induction" | "expired_ticket";

/** Re-export for convenience where worker rows are consumed. */
export { getWorkerDisplayName } from "./worker-utils";

export interface Worker {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  worker_name?: string | null;
  name?: string | null;
  full_name: string;
  email: string;
  phone: string | null;
  emergency_contact: string | null;
  emergency_contact_name: string | null;
  emergency_contact_phone: string | null;
  emergency_contact_relationship: string | null;
  dob: string | null;
  white_card_number: string | null;
  white_card_issue_date: string | null;
  white_card_photo_url: string | null;
  white_card_doc_url: string | null;
  drivers_licence_number: string | null;
  drivers_licence_class: string | null;
  drivers_licence_expiry: string | null;
  drivers_licence_photo_url: string | null;
  silica_cert_number: string | null;
  silica_cert_issue_date: string | null;
  silica_cert_photo_url: string | null;
  silica_cert_doc_url: string | null;
  voc_details: string | null;
  voc_title: string | null;
  voc_issuing_org: string | null;
  voc_document_url: string | null;
  tfn: string | null;
  bank_bsb: string | null;
  bank_account_number: string | null;
  bank_name: string | null;
  super_fund: string | null;
  super_member_number: string | null;
  super_usi: string | null;
  redundancy_fund_name: string | null;
  redundancy_member_number: string | null;
  assigned_project_id: string | null;
  assigned_project_ids: string[];
  project_id: string | null;
  assigned_project_name: string | null;
  project_name: string | null;
  status: WorkerStatus | string;
  induction_signature_url: string | null;
  induction_completed_at: string | null;
  security_role: SecurityRole;
  accounts_access_role: AccountsAccessRole;
  can_access_accounts: boolean;
  photo_url: string | null;
  trade: string | null;
  worker_type?: string | null;
  worker_code?: string | null;
  employment_type?: string | null;
  /** Legacy read-only field; pay rules are assigned via pay_rule_id / pay_rule_template_id. */
  hourly_rate?: number | null;
  pay_rate_id?: string | null;
  pay_rule_id?: string | null;
  pay_rule_template_id?: string | null;
  is_hsr?: boolean;
  is_apprentice?: boolean;
  has_company_vehicle?: boolean;
  assigned_vehicle_asset_id?: string | null;
  cards_vocs?: unknown;
  is_revoked: boolean;
  is_archived: boolean;
  is_subcontractor?: boolean;
  subcontractor_id?: string | null;
  state?: string | null;
  auth_user_id?: string | null;
  created_at?: string;
}

const WORKER_SELECT_COLUMNS = [
  "id",
  "first_name",
  "last_name",
  "full_name",
  "worker_name",
  "email",
  "phone",
  "emergency_contact",
  "emergency_contact_name",
  "emergency_contact_phone",
  "emergency_contact_relationship",
  "dob",
  "white_card_number",
  "white_card_issue_date",
  "white_card_photo_url",
  "white_card_doc_url",
  "drivers_licence_number",
  "drivers_licence_class",
  "drivers_licence_expiry",
  "drivers_licence_photo_url",
  "silica_cert_number",
  "silica_cert_issue_date",
  "silica_cert_photo_url",
  "silica_cert_doc_url",
  "voc_details",
  "voc_title",
  "voc_issuing_org",
  "voc_document_url",
  "tfn",
  "bank_bsb",
  "bank_account_number",
  "bank_name",
  "super_fund",
  "super_member_number",
  "super_usi",
  "redundancy_fund_name",
  "redundancy_member_number",
  "assigned_project_id",
  "assigned_project_ids",
  "status",
  "induction_signature_url",
  "induction_completed_at",
  "security_role",
  "accounts_access_role",
  "can_access_accounts",
  "photo_url",
  "trade",
  "worker_type",
  "worker_code",
  "employment_type",
  "pay_rate_id",
  "pay_rule_id",
  "pay_rule_template_id",
  "cards_vocs",
  "is_revoked",
  "is_archived",
  "is_subcontractor",
  "subcontractor_id",
  "is_apprentice",
  "has_company_vehicle",
  "assigned_vehicle_asset_id",
  "state",
  "auth_user_id",
  "created_at",
] as const;

let cachedWorkerSelectColumns: string[] | null = null;

const WORKER_COLUMNS_CACHE_KEY = "sitebolt_worker_select_columns";

function loadCachedWorkerColumnsFromStorage(): string[] | null {
  if (typeof window === "undefined") return null;
  try {
    const raw = window.sessionStorage.getItem(WORKER_COLUMNS_CACHE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw) as unknown;
    if (!Array.isArray(parsed)) return null;
    return parsed.filter((column): column is string => typeof column === "string");
  } catch {
    return null;
  }
}

function saveCachedWorkerColumnsToStorage(columns: string[]): void {
  cachedWorkerSelectColumns = columns;
  if (typeof window === "undefined") return;
  try {
    window.sessionStorage.setItem(WORKER_COLUMNS_CACHE_KEY, JSON.stringify(columns));
  } catch {
    // ignore storage failures
  }
}

const WORKER_SELECT = WORKER_SELECT_COLUMNS.join(", ");
const WORKER_SELECT_WITHOUT_VOC = WORKER_SELECT_COLUMNS.filter(
  (column) =>
    !["voc_details", "voc_title", "voc_issuing_org", "voc_document_url"].includes(column)
).join(", ");
const WORKER_SELECT_WITHOUT_DOC_URLS = WORKER_SELECT_COLUMNS.filter(
  (column) => !["white_card_doc_url", "silica_cert_doc_url"].includes(column)
).join(", ");
const WORKER_SELECT_WITHOUT_SUBCONTRACTOR = WORKER_SELECT_COLUMNS.filter(
  (column) => !["is_subcontractor", "subcontractor_id"].includes(column)
).join(", ");
const WORKER_SELECT_WITHOUT_ACCOUNTS = WORKER_SELECT_COLUMNS.filter(
  (column) => !["accounts_access_role", "can_access_accounts"].includes(column)
).join(", ");
const WORKER_SELECT_WITHOUT_ROLE = WORKER_SELECT_COLUMNS.filter(
  (column) => column !== "security_role"
).join(", ");
const WORKER_SELECT_WITHOUT_ASSIGNED_IDS = WORKER_SELECT_COLUMNS.filter(
  (column) => column !== "assigned_project_ids"
).join(", ");
const WORKER_SELECT_WITHOUT_ALT_NAMES = WORKER_SELECT_COLUMNS.filter(
  (column) => !["first_name", "last_name", "worker_name", "name"].includes(column)
).join(", ");
const WORKER_SELECT_WITHOUT_FULL_NAME = WORKER_SELECT_COLUMNS.filter(
  (column) => column !== "full_name"
).join(", ");
const WORKER_SELECT_MINIMAL =
  "id, first_name, last_name, email, status, assigned_project_id, security_role";
const WORKER_SELECT_CORE = "id, email, status, assigned_project_id, security_role";

const WORKER_SELECT_VARIANTS = [
  WORKER_SELECT,
  WORKER_SELECT_WITHOUT_VOC,
  WORKER_SELECT_WITHOUT_DOC_URLS,
  WORKER_SELECT_WITHOUT_SUBCONTRACTOR,
  WORKER_SELECT_WITHOUT_ALT_NAMES,
  WORKER_SELECT_WITHOUT_FULL_NAME,
  WORKER_SELECT_WITHOUT_ASSIGNED_IDS,
  WORKER_SELECT_WITHOUT_ACCOUNTS,
  WORKER_SELECT_WITHOUT_ROLE,
  WORKER_SELECT_MINIMAL,
  WORKER_SELECT_CORE,
] as const;

const WORKER_ORDER_COLUMNS = ["full_name", "first_name", "created_at", null] as const;

type RawWorkerRow = Partial<Omit<Worker, "security_role" | "assigned_project_ids" | "full_name">> & {
  id: string;
  full_name?: string | null;
  email?: string | null;
  security_role?: string | null;
  assigned_project_ids?: string[] | null;
};

function resolveWorkerAssignedProjectIds(
  ids: unknown,
  legacySingleId: string | null | undefined
): string[] {
  const normalized = normalizeWorkerUuidArray(ids);
  if (normalized.length > 0) return normalized;
  const legacy = legacySingleId?.trim();
  if (legacy && isProjectUuid(legacy)) return [legacy];
  return [];
}

/** Granted project UUIDs for a worker (array column with legacy single-id fallback). */
export function getWorkerAssignedProjectIds(
  worker: Pick<Worker, "assigned_project_ids" | "assigned_project_id">
): string[] {
  return resolveWorkerAssignedProjectIds(
    worker.assigned_project_ids,
    worker.assigned_project_id
  );
}

export function isWorkerRevokedRow(
  worker: Pick<
    RawWorkerRow,
    "is_revoked" | "status" | "is_archived"
  >
): boolean {
  return Boolean(
    worker.is_revoked === true ||
      String(worker.is_revoked) === "true" ||
      worker.status === "Revoked" ||
      worker.is_archived === true ||
      String(worker.is_archived) === "true"
  );
}

export function isWorkerRevoked(
  worker: Pick<Worker, "is_revoked" | "status" | "is_archived">
): boolean {
  return isWorkerRevokedRow(worker);
}

function normalizeWorkerRow(row: RawWorkerRow): Worker {
  const assigned_project_ids = resolveWorkerAssignedProjectIds(
    row.assigned_project_ids,
    row.assigned_project_id
  );
  const full_name = getWorkerDisplayName(row);
  const email = row.email?.trim() || "";

  return {
    id: row.id,
    first_name: row.first_name ?? null,
    last_name: row.last_name ?? null,
    worker_name: row.worker_name ?? null,
    name: row.name ?? null,
    full_name,
    email,
    phone: row.phone ?? null,
    emergency_contact: row.emergency_contact ?? null,
    emergency_contact_name: row.emergency_contact_name ?? null,
    emergency_contact_phone: row.emergency_contact_phone ?? null,
    emergency_contact_relationship: row.emergency_contact_relationship ?? null,
    dob: row.dob ?? null,
    white_card_number: row.white_card_number ?? null,
    white_card_issue_date: row.white_card_issue_date ?? null,
    white_card_photo_url: row.white_card_photo_url ?? null,
    white_card_doc_url: row.white_card_doc_url ?? row.white_card_photo_url ?? null,
    drivers_licence_number: row.drivers_licence_number ?? null,
    drivers_licence_class: row.drivers_licence_class ?? null,
    drivers_licence_expiry: row.drivers_licence_expiry ?? null,
    drivers_licence_photo_url: row.drivers_licence_photo_url ?? null,
    silica_cert_number: row.silica_cert_number ?? null,
    silica_cert_issue_date: row.silica_cert_issue_date ?? null,
    silica_cert_photo_url: row.silica_cert_photo_url ?? null,
    silica_cert_doc_url: row.silica_cert_doc_url ?? row.silica_cert_photo_url ?? null,
    voc_details: row.voc_details ?? null,
    voc_title: row.voc_title ?? null,
    voc_issuing_org: row.voc_issuing_org ?? null,
    voc_document_url: row.voc_document_url ?? null,
    tfn: row.tfn ?? null,
    bank_bsb: row.bank_bsb ?? null,
    bank_account_number: row.bank_account_number ?? null,
    bank_name: row.bank_name ?? null,
    super_fund: row.super_fund ?? null,
    super_member_number: row.super_member_number ?? null,
    super_usi: row.super_usi ?? null,
    redundancy_fund_name: row.redundancy_fund_name ?? null,
    redundancy_member_number: row.redundancy_member_number ?? null,
    assigned_project_id: row.assigned_project_id ?? null,
    assigned_project_ids,
    project_id: row.project_id ?? row.assigned_project_id ?? null,
    assigned_project_name: row.assigned_project_name ?? null,
    project_name: row.project_name ?? null,
    status: row.status ?? "pending_induction",
    induction_signature_url: row.induction_signature_url ?? null,
    induction_completed_at: row.induction_completed_at ?? null,
    security_role: normalizeSecurityRole(row.security_role),
    accounts_access_role: normalizeAccountsAccessRole(row.accounts_access_role),
    can_access_accounts:
      row.can_access_accounts === true ||
      normalizeAccountsAccessRole(row.accounts_access_role) !== "disabled",
    photo_url: row.photo_url ?? null,
    trade: row.trade ?? null,
    worker_type: row.worker_type ?? null,
    worker_code: row.worker_code ?? null,
    employment_type: row.employment_type ?? null,
    hourly_rate:
      row.hourly_rate == null || row.hourly_rate === undefined
        ? null
        : Number(row.hourly_rate),
    pay_rate_id: row.pay_rate_id ? String(row.pay_rate_id) : null,
    pay_rule_id: row.pay_rule_id ? String(row.pay_rule_id) : null,
    pay_rule_template_id: row.pay_rule_template_id
      ? String(row.pay_rule_template_id)
      : null,
    cards_vocs: row.cards_vocs ?? [],
    is_revoked: isWorkerRevokedRow(row),
    is_archived: Boolean(
      row.is_archived === true || String(row.is_archived) === "true"
    ),
    is_subcontractor: row.is_subcontractor ?? false,
    subcontractor_id: row.subcontractor_id ?? null,
    is_apprentice: row.is_apprentice === true,
    has_company_vehicle: row.has_company_vehicle === true,
    assigned_vehicle_asset_id: row.assigned_vehicle_asset_id
      ? String(row.assigned_vehicle_asset_id)
      : null,
    state: row.state ?? null,
    auth_user_id: row.auth_user_id ? String(row.auth_user_id) : null,
    created_at: row.created_at,
  };
}

async function queryWorkerRows(options?: {
  id?: string;
  limit?: number;
}): Promise<Worker[]> {
  let columns =
    cachedWorkerSelectColumns ??
    loadCachedWorkerColumnsFromStorage() ??
    [...WORKER_SELECT_COLUMNS];

  for (let attempt = 0; attempt < 24; attempt += 1) {
    const select = columns.join(", ");

    for (const orderColumn of WORKER_ORDER_COLUMNS) {
      try {
        if (options?.id) {
          const { data, error } = await supabase
            .from("workers")
            .select(select)
            .eq("id", options.id)
            .maybeSingle();

          if (!error) {
            saveCachedWorkerColumnsToStorage(columns);
            return data ? [normalizeWorkerRow(data as unknown as RawWorkerRow)] : [];
          }

          const missingColumn = parseMissingColumnFromError(error.message);
          if (missingColumn && columns.includes(missingColumn as (typeof WORKER_SELECT_COLUMNS)[number])) {
            columns = columns.filter((column) => column !== missingColumn);
            break;
          }

          if (isMissingWorkerColumnError(error.message)) {
            break;
          }

          if (handleSupabaseNetworkFetchError(error, "fetch worker")) {
            return [];
          }

          console.error("Failed to fetch worker:", error.message);
          return [];
        }

        let query = supabase.from("workers").select(select);
        if (orderColumn) {
          query = query.order(orderColumn, {
            ascending: true,
            nullsFirst: false,
          });
        }
        if (options?.limit) {
          query = query.limit(options.limit);
        }

        const { data, error } = await query;

        if (!error) {
          saveCachedWorkerColumnsToStorage(columns);
          return ((data ?? []) as unknown as RawWorkerRow[]).map(normalizeWorkerRow);
        }

        const missingColumn = parseMissingColumnFromError(error.message);
        if (missingColumn && columns.includes(missingColumn as (typeof WORKER_SELECT_COLUMNS)[number])) {
          columns = columns.filter((column) => column !== missingColumn);
          break;
        }

        if (isMissingWorkerColumnError(error.message)) {
          continue;
        }

        if (handleSupabaseNetworkFetchError(error, "fetch workers")) {
          return [];
        }

        console.error("Failed to fetch workers:", error.message);
        return [];
      } catch (error) {
        if (handleSupabaseNetworkFetchError(error, "fetch workers")) {
          return [];
        }
        console.error("Failed to fetch workers:", error);
        break;
      }
    }

    if (columns.length === 0) break;
  }

  return [];
}

function isMissingWorkerColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function formatWorkerFetchError(message: string): string {
  const lower = message.toLowerCase();
  if (
    lower.includes("row-level security") ||
    lower.includes("permission denied") ||
    lower.includes("not authorized")
  ) {
    return "Unable to load workers. Check Supabase SELECT policies on the workers table.";
  }
  if (isMissingWorkerColumnError(message)) {
    return "Workers table schema mismatch. Confirm migrations have been applied in Supabase.";
  }
  return message || "Failed to load workers. Please try again.";
}

async function fetchWorkerRows(): Promise<Worker[]> {
  return queryWorkerRows();
}

async function fetchWorkerRowById(id: string): Promise<Worker | null> {
  const rows = await queryWorkerRows({ id });
  return rows[0] ?? null;
}

export interface WorkerScheduleEntry {
  id: string;
  worker_id: string;
  project_id: string;
  project_name: string;
  start_date: string;
  end_date: string;
  role_on_site: string | null;
  leave_request_id?: string | null;
  schedule_kind?: string | null;
  created_at?: string;
}

export interface WorkerVoc {
  id: string;
  worker_id: string;
  title: string;
  voc_type?: string | null;
  issuing_org: string | null;
  issue_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  created_at?: string;
}

export type TimesheetStatus = "draft" | "pending" | "approved" | "rejected";

export type MyobExportStatus = "not_exported" | "exported" | "processed";

export interface WorkerTimesheet {
  id: string;
  worker_id: string;
  work_date: string;
  project_id: string | null;
  project_name: string | null;
  worker_trade?: string | null;
  start_time: string;
  finish_time: string;
  break_minutes: number;
  total_hours: number;
  work_hours?: number | null;
  break_hours?: number | null;
  daily_total_hours?: number | null;
  activities?: import("./timesheet-utils").TimesheetActivitySlot[];
  breaks?: import("./timesheet-utils").TimesheetBreakSlot[];
  signature_url?: string | null;
  is_draft?: boolean;
  submitted_at?: string | null;
  overtime_hours?: number;
  notes: string | null;
  status: TimesheetStatus;
  myob_export_status?: MyobExportStatus;
  myob_exported_at?: string | null;
  approved_at?: string | null;
  approved_by?: string | null;
  leave_request_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type LeaveRequestStatus = "pending" | "approved" | "declined";

export type LeaveType =
  | "Sick"
  | "Sick Leave"
  | "Personal Leave"
  | "Carers Leave"
  | "Annual Leave"
  | "Leave"
  | "Leave without pay"
  | "RDO"
  | "Flexi RDO"
  | "Public Holiday";

export interface LeaveRequest {
  id: string;
  worker_id: string;
  worker_name?: string | null;
  project_id: string | null;
  first_date: string;
  last_date: string;
  number_of_days: number;
  reason: string;
  signature_url: string | null;
  status: LeaveRequestStatus;
  leave_type: LeaveType | null;
  schedule_entry_id: string | null;
  created_at?: string;
  updated_at?: string;
}

export type WorkerOnboardingInput = Omit<
  Worker,
  "id" | "created_at" | "hourly_rate"
> & {
  first_name: string;
  last_name: string;
  email: string;
};

export const PRIMARY_PLANT_ASSIGNMENT_TABLE = "plant_equipment" as const;
export const ALIAS_PLANT_TABLE = "plant" as const;
/** Organisation master list reads/writes owned plant pre-start records. */
export const MASTER_PLANT_TABLE = ALIAS_PLANT_TABLE;

export interface PlantAsset {
  id: string;
  plant_id?: string | null;
  unit_number: string;
  plant_number?: string | null;
  name?: string | null;
  category: string;
  make: string | null;
  model: string | null;
  prestart_template: PrestartTemplate | null;
  current_hours: number | null;
  current_kms: number | null;
  next_service_hours: number | null;
  next_service_kms: number | null;
  service_contact_name: string | null;
  service_contact_phone: string | null;
  service_contact_company?: string | null;
  service_contact_email?: string | null;
  assigned_worker_id?: string | null;
  assigned_worker_name?: string | null;
  assigned_project_id: string | null;
  project_id: string | null;
  current_project_id: string | null;
  assigned_project_name: string | null;
  project_name: string | null;
  current_project_name: string | null;
  status: PlantStatus | string;
  photo_url?: string | null;
  serial_number?: string | null;
  registration_code?: string | null;
  hourly_cost_rate?: number | null;
  ownership_type?: string | null;
  plant_documents?: unknown;
  service_history_doc_url?: string | null;
  plant_risk_assessment_doc_url?: string | null;
  heavy_vehicle_check_required?: boolean;
  last_heavy_vehicle_check_date?: string | null;
  next_heavy_vehicle_check_due_date?: string | null;
  created_at?: string;
}

export type PlantProjectFieldSource = Pick<
  PlantAsset,
  "assigned_project_id" | "project_id" | "current_project_id"
>;

/** Resolve the active project id from plant row aliases. */
export function resolvePlantAssignedProjectId(
  plant: PlantProjectFieldSource | null | undefined
): string {
  if (!plant) return "";
  return String(
    plant.assigned_project_id?.trim() ||
      plant.project_id?.trim() ||
      plant.current_project_id?.trim() ||
      ""
  ).trim();
}

export type PlantProjectNameSource = Pick<
  PlantAsset,
  "assigned_project_name" | "project_name" | "current_project_name"
>;

/** Resolve the display project name from plant row aliases. */
export function resolvePlantAssignedProjectName(
  plant: PlantProjectNameSource | null | undefined
): string {
  if (!plant) return "Unassigned";
  return (
    plant.assigned_project_name?.trim() ||
    plant.project_name?.trim() ||
    "Unassigned"
  );
}

export type WorkerProjectNameSource = Pick<
  Worker,
  "assigned_project_name" | "project_name"
>;

/** Resolve the display project name from worker row aliases. */
export function resolveWorkerAssignedProjectName(
  worker: WorkerProjectNameSource | null | undefined
): string {
  if (!worker) return "Unassigned";
  return (
    worker.assigned_project_name?.trim() ||
    worker.project_name?.trim() ||
    "Unassigned"
  );
}

export type PlantAssignmentSource = {
  id?: string | null;
  plant_id?: string | null;
  unit_number?: string | null;
  plant_number?: string | null;
  name?: string | null;
};

export type ProjectAssignmentSource = {
  id?: string | null;
  project_id?: string | null;
  name?: string | null;
  project_name?: string | null;
};

export type WorkerAssignmentSource = {
  id?: string | null;
  worker_id?: string | null;
  full_name?: string | null;
  name?: string | null;
  worker_name?: string | null;
};

export function resolveAssignmentPlantId(
  plant: PlantAssignmentSource | null | undefined
): string {
  if (!plant) return "";
  return String(plant.id || plant.plant_id || "").trim();
}

export function resolveAssignmentProjectId(
  project: ProjectAssignmentSource | null | undefined
): string {
  if (!project) return "";
  return String(project.id || project.project_id || "").trim();
}

export function resolveAssignmentPlantName(
  plant: PlantAssignmentSource | null | undefined
): string {
  if (!plant) return "Plant";
  return (
    String(plant.name || plant.unit_number || plant.plant_number || "Plant").trim() ||
    "Plant"
  );
}

export function resolveAssignmentProjectName(
  project: ProjectAssignmentSource | null | undefined
): string {
  if (!project) return "";
  return String(project.name || project.project_name || "").trim();
}

export function resolveAssignmentWorkerId(
  worker: WorkerAssignmentSource | null | undefined
): string {
  if (!worker) return "";
  return String(worker.id || worker.worker_id || "").trim();
}

export function resolveAssignmentWorkerName(
  worker: WorkerAssignmentSource | null | undefined
): string {
  if (!worker) return "Worker";
  return getWorkerDisplayName(worker, "Worker");
}

const PLANT_PROJECT_OPTIONAL_COLUMNS = [
  "project_id",
  "current_project_id",
  "assigned_project_name",
  "project_name",
  "current_project_name",
] as const;

type RawPlantRow = Record<string, unknown>;

function normalizePlantRecord(row: RawPlantRow): PlantAsset {
  const record = row as Partial<PlantAsset> & {
    equipment_category?: string | null;
  };

  return {
    id: String(record.id ?? record.plant_id ?? "").trim(),
    plant_id: record.plant_id ? String(record.plant_id).trim() : null,
    unit_number: String(record.unit_number ?? record.plant_number ?? "").trim(),
    plant_number: record.plant_number ? String(record.plant_number).trim() : null,
    name: record.name ? String(record.name).trim() : null,
    category: String(record.category ?? record.equipment_category ?? "").trim(),
    make: record.make ? String(record.make).trim() : null,
    model: record.model ? String(record.model).trim() : null,
    prestart_template: (record.prestart_template as PrestartTemplate | null) ?? null,
    current_hours: record.current_hours ?? null,
    current_kms: record.current_kms ?? null,
    next_service_hours: record.next_service_hours ?? null,
    next_service_kms: record.next_service_kms ?? null,
    service_contact_name: record.service_contact_name ?? null,
    service_contact_phone: record.service_contact_phone ?? null,
    service_contact_company: record.service_contact_company ?? null,
    service_contact_email: record.service_contact_email ?? null,
    assigned_worker_id: record.assigned_worker_id
      ? String(record.assigned_worker_id)
      : null,
    assigned_worker_name: record.assigned_worker_name
      ? String(record.assigned_worker_name)
      : null,
    assigned_project_id: record.assigned_project_id ?? null,
    project_id: record.project_id ?? null,
    current_project_id: record.current_project_id ?? null,
    assigned_project_name: record.assigned_project_name ?? null,
    project_name: record.project_name ?? null,
    current_project_name: record.current_project_name ?? null,
    status: record.status ?? "available",
    photo_url: record.photo_url ?? null,
    serial_number: record.serial_number ?? null,
    registration_code: record.registration_code ?? null,
    hourly_cost_rate:
      record.hourly_cost_rate == null ? null : Number(record.hourly_cost_rate),
    ownership_type: record.ownership_type ?? null,
    plant_documents: record.plant_documents ?? [],
    service_history_doc_url: record.service_history_doc_url ?? null,
    plant_risk_assessment_doc_url: record.plant_risk_assessment_doc_url ?? null,
    heavy_vehicle_check_required: record.heavy_vehicle_check_required === true,
    last_heavy_vehicle_check_date: record.last_heavy_vehicle_check_date
      ? String(record.last_heavy_vehicle_check_date)
      : null,
    next_heavy_vehicle_check_due_date: record.next_heavy_vehicle_check_due_date
      ? String(record.next_heavy_vehicle_check_due_date)
      : null,
    created_at: record.created_at,
  };
}

/** Validate a plant id from a master plant list record. */
export function verifyMasterPlantId(
  plant: PlantAssignmentSource | string | null | undefined
): { plantId: string; error: string | null } {
  const plantId =
    typeof plant === "string" ? plant.trim() : resolveAssignmentPlantId(plant);

  if (!plantId) {
    return { plantId: "", error: "Plant id is required." };
  }

  if (!isProjectUuid(plantId)) {
    return {
      plantId: "",
      error: "Plant id must be a valid UUID from the master plant list.",
    };
  }

  return { plantId, error: null };
}

const PLANT_EQUIPMENT_OPTIONAL_COLUMNS = [
  "assigned_project_id",
  "project_id",
  "assigned_project_name",
  "project_name",
  "status",
  "photo_url",
  "name",
  "serial_number",
  "registration_code",
  "hourly_cost_rate",
  "ownership_type",
  "plant_documents",
  "equipment_category",
  "unit_reference",
] as const;

const WORKER_PROJECT_OPTIONAL_COLUMNS = [
  "project_id",
  "assigned_project_name",
  "project_name",
] as const;

const PLANT_JUNCTION_OPTIONAL_COLUMNS = [
  "plant_name",
  "project_name",
  "status",
] as const;

const WORKER_JUNCTION_OPTIONAL_COLUMNS = [
  "worker_name",
  "project_name",
  "status",
] as const;

function isMissingPlantTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  const tableLower = table.toLowerCase();
  return (
    lower.includes(tableLower) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isMissingPlantColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const columnLower = column.toLowerCase();
  return (
    lower.includes(columnLower) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function buildPlantProjectRowPayload(
  projectId: string | null,
  projectName: string | null
): Record<string, string | null> {
  const name = projectName?.trim() || null;
  return {
    assigned_project_id: projectId,
    project_id: projectId,
    current_project_id: projectId,
    assigned_project_name: name,
    project_name: name,
    current_project_name: name,
  };
}

async function tryUpdateTableWithOptionalColumns(
  table: string,
  idColumn: string,
  recordId: string,
  payload: Record<string, unknown>,
  optionalColumns: readonly string[]
): Promise<void> {
  try {
    let currentPayload = { ...payload };

    for (let attempt = 0; attempt <= optionalColumns.length + 1; attempt += 1) {
      const { error } = await supabase
        .from(table)
        .update(currentPayload)
        .eq(idColumn, recordId);

      if (!error) return;

      if (isMissingPlantTableError(error.message, table)) {
        console.warn(`Assignment update skipped (${table} unavailable).`);
        return;
      }

      const missingColumn = optionalColumns.find(
        (column) =>
          column in currentPayload && isMissingPlantColumnError(error.message, column)
      );

      if (missingColumn) {
        const { [missingColumn]: _removed, ...rest } = currentPayload;
        currentPayload = rest;
        continue;
      }

      console.warn(`Assignment update failed (${table}):`, error.message);
      return;
    }
  } catch (error) {
    console.warn(`Assignment update threw (${table}):`, error);
  }
}

async function tryUpsertJunctionRow(
  table: "project_plant_assignments" | "project_worker_assignments",
  payload: Record<string, unknown>,
  onConflict: string,
  optionalColumns: readonly string[]
): Promise<void> {
  try {
    let currentPayload = { ...payload };

    for (let attempt = 0; attempt <= optionalColumns.length + 1; attempt += 1) {
      const { error: upsertError } = await supabase
        .from(table)
        .upsert(currentPayload, { onConflict });

      if (!upsertError) return;

      if (isMissingPlantTableError(upsertError.message, table)) {
        console.warn(`Assignment upsert skipped (${table} unavailable).`);
        return;
      }

      const missingColumn = optionalColumns.find(
        (column) =>
          column in currentPayload &&
          isMissingPlantColumnError(upsertError.message, column)
      );

      if (missingColumn) {
        const { [missingColumn]: _removed, ...rest } = currentPayload;
        currentPayload = rest;
        continue;
      }

      const { error: insertError } = await supabase.from(table).insert([currentPayload]);
      if (!insertError) return;

      if (isMissingPlantTableError(insertError.message, table)) {
        console.warn(`Assignment insert skipped (${table} unavailable).`);
        return;
      }

      console.warn(`Assignment upsert failed (${table}):`, insertError.message);
      return;
    }
  } catch (error) {
    console.warn(`Assignment upsert threw (${table}):`, error);
  }
}

function buildPlantEquipmentAssignmentPayload(
  projectId: string,
  projectName: string | null
): Record<string, unknown> {
  const name = projectName?.trim() || null;
  return {
    assigned_project_id: projectId,
    project_id: projectId,
    assigned_project_name: name,
    project_name: name,
    status: "Allocated",
  };
}

async function syncAliasPlantAssignmentFields(
  plantId: string,
  projectId: string | null,
  projectName: string | null
): Promise<void> {
  const aliasPayload = {
    ...buildPlantProjectRowPayload(projectId, projectName),
    ...(projectId ? { status: "Allocated" } : {}),
  };
  await tryUpdateTableWithOptionalColumns(
    ALIAS_PLANT_TABLE,
    "id",
    plantId,
    aliasPayload,
    PLANT_PROJECT_OPTIONAL_COLUMNS
  );
}

async function syncWorkerProjectAssignmentFields(
  workerId: string,
  projectId: string | null,
  projectName: string | null
): Promise<void> {
  const name = projectName?.trim() || null;
  await tryUpdateTableWithOptionalColumns(
    "workers",
    "id",
    workerId,
    {
      assigned_project_id: projectId,
      project_id: projectId,
      assigned_project_name: name,
      project_name: name,
    },
    WORKER_PROJECT_OPTIONAL_COLUMNS
  );
}

/** Fail-safe plant assignment: primary table, alias table, junction upsert. */
export async function assignMasterPlantToProject(input: {
  plant: PlantAssignmentSource;
  project: ProjectAssignmentSource;
}): Promise<{ error: string | null }> {
  try {
    if (!isSupabaseConfigured()) {
      console.warn("assignMasterPlantToProject skipped: Supabase not configured.");
      return { error: null };
    }

    const { plantId, error: plantError } = verifyMasterPlantId(input.plant);
    if (plantError) {
      console.warn("assignMasterPlantToProject:", plantError);
      return { error: null };
    }

    const projectIdRaw = resolveAssignmentProjectId(input.project);
    const { id: resolvedProjectId, error: projectError } =
      await resolveProjectId(projectIdRaw);
    if (projectError || !resolvedProjectId) {
      console.warn("assignMasterPlantToProject: project resolve failed.", projectError);
      return { error: null };
    }

    const projectName =
      resolveAssignmentProjectName(input.project) ||
      getCachedProjects().find((row) => row.id === resolvedProjectId)?.name ||
      null;
    const plantName = resolveAssignmentPlantName(input.plant);

    await tryUpdateTableWithOptionalColumns(
      PRIMARY_PLANT_ASSIGNMENT_TABLE,
      "id",
      plantId,
      buildPlantEquipmentAssignmentPayload(resolvedProjectId, projectName),
      PLANT_EQUIPMENT_OPTIONAL_COLUMNS
    );

    await syncAliasPlantAssignmentFields(plantId, resolvedProjectId, projectName);

    await tryUpsertJunctionRow(
      "project_plant_assignments",
      {
        plant_id: plantId,
        project_id: resolvedProjectId,
        plant_name: plantName,
        project_name: projectName,
        status: "Assigned",
      },
      "project_id,plant_id",
      PLANT_JUNCTION_OPTIONAL_COLUMNS
    );

    return { error: null };
  } catch (error) {
    console.warn("assignMasterPlantToProject failed:", error);
    return { error: null };
  }
}

/** Fail-safe worker assignment: workers table + junction upsert. */
export async function assignMasterWorkerToProject(input: {
  worker: WorkerAssignmentSource;
  project: ProjectAssignmentSource;
}): Promise<{ error: string | null }> {
  try {
    if (!isSupabaseConfigured()) {
      console.warn("assignMasterWorkerToProject skipped: Supabase not configured.");
      return { error: null };
    }

    const workerId = resolveAssignmentWorkerId(input.worker);
    if (!workerId || !isProjectUuid(workerId)) {
      console.warn("assignMasterWorkerToProject: invalid worker id.");
      return { error: null };
    }

    const projectIdRaw = resolveAssignmentProjectId(input.project);
    const { id: resolvedProjectId, error: projectError } =
      await resolveProjectId(projectIdRaw);
    if (projectError || !resolvedProjectId) {
      console.warn("assignMasterWorkerToProject: project resolve failed.", projectError);
      return { error: null };
    }

    const projectName =
      resolveAssignmentProjectName(input.project) ||
      getCachedProjects().find((row) => row.id === resolvedProjectId)?.name ||
      null;
    const workerName = resolveAssignmentWorkerName(input.worker);

    await syncWorkerProjectAssignmentFields(workerId, resolvedProjectId, projectName);

    await tryUpsertJunctionRow(
      "project_worker_assignments",
      {
        worker_id: workerId,
        project_id: resolvedProjectId,
        worker_name: workerName,
        project_name: projectName,
        status: "Active",
      },
      "project_id,worker_id",
      WORKER_JUNCTION_OPTIONAL_COLUMNS
    );

    return { error: null };
  } catch (error) {
    console.warn("assignMasterWorkerToProject failed:", error);
    return { error: null };
  }
}

/** Sync project id aliases on the master plant alias table. */
export async function syncPlantProjectAssignmentFields(
  plantId: string,
  projectId: string | null,
  projectName: string | null
): Promise<{ error: string | null }> {
  try {
    const { plantId: verifiedPlantId, error: idError } = verifyMasterPlantId(plantId);
    if (idError) {
      console.warn("syncPlantProjectAssignmentFields:", idError);
      return { error: null };
    }

    if (projectId) {
      await assignMasterPlantToProject({
        plant: { id: verifiedPlantId },
        project: {
          id: projectId,
          project_id: projectId,
          name: projectName,
          project_name: projectName,
        },
      });
    } else {
      await syncAliasPlantAssignmentFields(verifiedPlantId, null, null);
      await tryUpdateTableWithOptionalColumns(
        PRIMARY_PLANT_ASSIGNMENT_TABLE,
        "id",
        verifiedPlantId,
        {
          assigned_project_id: null,
          project_id: null,
          assigned_project_name: null,
          project_name: null,
          status: "Available",
        },
        PLANT_EQUIPMENT_OPTIONAL_COLUMNS
      );
    }

    return { error: null };
  } catch (error) {
    console.warn("syncPlantProjectAssignmentFields failed:", error);
    return { error: null };
  }
}

export async function upsertProjectPlantAssignmentRecord(
  plant: PlantAssignmentSource,
  project: ProjectAssignmentSource
): Promise<{ error: string | null; upserted: boolean }> {
  await assignMasterPlantToProject({ plant, project });
  return { error: null, upserted: true };
}

export async function insertProjectPlantAssignmentRecord(
  plant: PlantAssignmentSource | string,
  projectId: string
): Promise<{ error: string | null; inserted: boolean }> {
  const source = typeof plant === "string" ? { id: plant } : plant;
  const result = await upsertProjectPlantAssignmentRecord(source, {
    id: projectId,
    project_id: projectId,
  });
  return { error: result.error, inserted: result.upserted };
}

export async function deleteProjectPlantAssignmentRecord(
  plant: PlantAssignmentSource | string,
  projectId: string
): Promise<{ error: string | null }> {
  const { plantId, error: idError } = verifyMasterPlantId(
    typeof plant === "string" ? plant : plant
  );
  if (idError) return { error: idError };
  if (!isSupabaseConfigured()) return { error: null };

  const { error } = await supabase
    .from("project_plant_assignments")
    .delete()
    .eq("plant_id", plantId)
    .eq("project_id", projectId);

  if (error && !isMissingPlantTableError(error.message, "project_plant_assignments")) {
    return { error: error.message };
  }

  return { error: null };
}

export interface PlantPrestart {
  id: string;
  plant_id: string;
  operator_name: string;
  operator_worker_id?: string | null;
  project_id: string | null;
  current_reading: number | null;
  next_service_due: number | null;
  check_data: Record<string, unknown>;
  has_defect: boolean;
  defect_summary?: string | null;
  defect_comments: string | null;
  defect_photo_url: string | null;
  signature_url: string | null;
  repair_notes: string | null;
  mechanic_invoice_ref: string | null;
  cleared_at: string | null;
  defect_status?: string | null;
  defect_resolved_at?: string | null;
  submitted_at?: string | null;
  created_at: string;
}

export async function fetchWorkers(): Promise<Worker[]> {
  if (!isSupabaseConfigured()) return [];
  return fetchWorkerRows();
}

/** All workers for Security Settings — no status filters; surfaces fetch errors. */
export async function fetchAllWorkers(): Promise<{
  workers: Worker[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return {
      workers: [],
      error:
        "Supabase is not configured. Add NEXT_PUBLIC_SUPABASE_URL and NEXT_PUBLIC_SUPABASE_ANON_KEY to .env.local.",
    };
  }

  try {
    for (const orderColumn of WORKER_ORDER_COLUMNS) {
      let query = supabase.from("workers").select("*");
      if (orderColumn) {
        query = query.order(orderColumn, { ascending: true, nullsFirst: false });
      }

      const { data, error } = await query;

      if (!error) {
        return {
          workers: ((data ?? []) as unknown as RawWorkerRow[]).map(normalizeWorkerRow),
          error: null,
        };
      }

      if (!isMissingWorkerColumnError(error.message)) {
        if (handleSupabaseNetworkFetchError(error, "fetch all workers")) {
          return { workers: [], error: null };
        }
        return { workers: [], error: formatWorkerFetchError(error.message) };
      }
    }

    const workers = await queryWorkerRows();
    return { workers, error: null };
  } catch (err) {
    if (handleSupabaseNetworkFetchError(err, "fetch all workers")) {
      return { workers: [], error: null };
    }
    console.error("fetchAllWorkers failed:", err);
    return {
      workers: [],
      error:
        err instanceof Error
          ? err.message
          : "Failed to load workers. Please try again.",
    };
  }
}

export async function fetchPlantList(): Promise<PlantAsset[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase
      .from(MASTER_PLANT_TABLE)
      .select("*")
      .order("unit_number");

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch plant")) {
        return [];
      }
      console.error(`Failed to fetch ${MASTER_PLANT_TABLE}:`, error.message);
      return [];
    }

    return (data ?? [])
      .map((row) => normalizePlantRecord(row as RawPlantRow))
      .filter((row) => Boolean(row.id));
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch plant")) {
      return [];
    }
    console.error(`Failed to fetch ${MASTER_PLANT_TABLE}:`, error);
    return [];
  }
}

export async function fetchPlant(): Promise<PlantAsset[]> {
  return fetchPlantList();
}

export async function fetchPlantById(id: string): Promise<PlantAsset | null> {
  const { plantId, error: idError } = verifyMasterPlantId(id);
  if (idError) return null;

  const { data, error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .select("*")
    .eq("id", plantId)
    .maybeSingle();

  if (error) {
    console.error(`Failed to fetch ${MASTER_PLANT_TABLE}:`, error.message);
    return null;
  }

  if (!data) return null;
  return normalizePlantRecord(data as RawPlantRow);
}

function prepareWorkerWritePayload(
  worker: Partial<WorkerOnboardingInput> & Record<string, unknown>
): Record<string, unknown> {
  const payload = { ...worker };

  const firstName = String(payload.first_name ?? "").trim();
  const lastName = String(payload.last_name ?? "").trim();
  const legacyFullName = String(payload.full_name ?? "").trim();

  if (firstName || lastName) {
    Object.assign(payload, buildWorkerNameFields(firstName, lastName));
  } else if (legacyFullName) {
    const parts = legacyFullName.split(/\s+/).filter(Boolean);
    Object.assign(
      payload,
      buildWorkerNameFields(parts[0] ?? "", parts.slice(1).join(" "))
    );
  }

  return sanitizeWorkerWritePayload(payload);
}

export async function addWorker(
  worker: Partial<Omit<WorkerOnboardingInput, "first_name" | "last_name" | "email">> & {
    first_name: string;
    last_name: string;
    email: string;
  },
  vocExpiries: (string | null | undefined)[] = []
): Promise<{ error: string | null; workerId: string | null }> {
  const expiries = [
    nullIfBlankWorkerDate(worker.drivers_licence_expiry),
    ...vocExpiries.map((expiry) => nullIfBlankWorkerDate(expiry)),
  ];
  let status = computeWorkerStatusFromExpiries(expiries);

  let resolvedProjectId: string | null = null;

  if (worker.assigned_project_id?.trim()) {
    const { id, error: projectError } = await resolveProjectId(
      worker.assigned_project_id
    );
    if (projectError) {
      return { error: projectError, workerId: null };
    }
    if (id && !isProjectUuid(id)) {
      return {
        error: "assigned_project_id must be a UUID, not a text slug.",
        workerId: null,
      };
    }
    resolvedProjectId = id;
  }

  const insertPayload = prepareWorkerWritePayload({
    ...worker,
    security_role: worker.security_role ?? DEFAULT_WORKER_SECURITY_ROLE,
    assigned_project_id: resolvedProjectId,
    status,
  });

  const { data, error } = await supabase
    .from("workers")
    .insert([insertPayload])
    .select("id")
    .single();

  return { error: error?.message ?? null, workerId: data?.id ?? null };
}

/** Workers linked to a subcontractor company (workers.subcontractor_id). */
export async function fetchWorkersForSubcontractor(
  subcontractorId: string
): Promise<Worker[]> {
  if (!subcontractorId.trim() || !isSupabaseConfigured()) return [];

  for (const select of WORKER_SELECT_VARIANTS) {
    try {
      const { data, error } = await supabase
        .from("workers")
        .select(select)
        .eq("subcontractor_id", subcontractorId.trim())
        .order("full_name", { ascending: true, nullsFirst: false });

      if (!error) {
        return ((data ?? []) as unknown as RawWorkerRow[]).map(normalizeWorkerRow);
      }

      if (isMissingWorkerColumnError(error.message)) {
        continue;
      }

      console.error("fetchWorkersForSubcontractor failed:", error.message);
      return [];
    } catch (error) {
      console.error("fetchWorkersForSubcontractor failed:", error);
      continue;
    }
  }

  return [];
}

function omitWorkerPayloadKeys(
  payload: Record<string, unknown>,
  keys: string[]
): Record<string, unknown> {
  const next = { ...payload };
  for (const key of keys) {
    delete next[key];
  }
  return next;
}

export async function addSubcontractorWorkerFromForm(
  input: SubcontractorWorkerFormInput
): Promise<{ error: string | null; workerId: string | null }> {
  return addSubcontractorWorker(buildSubcontractorWorkerPayload(input));
}

export async function addSubcontractorWorker(
  payload: Record<string, unknown>
): Promise<{ error: string | null; workerId: string | null }> {
  const first_name = String(payload.first_name ?? "").trim();
  const last_name = String(payload.last_name ?? "").trim();
  const email = String(payload.email ?? "").trim();
  if (!first_name || !last_name || !email) {
    return {
      error: "First name, last name, and email are required.",
      workerId: null,
    };
  }

  const vocExpiries = getVocExpiriesFromDetails(
    typeof payload.voc_details === "string" ? payload.voc_details : null
  );

  const attempts: Record<string, unknown>[] = [
    prepareWorkerWritePayload(payload),
    prepareWorkerWritePayload(
      omitWorkerPayloadKeys(payload, ["white_card_doc_url", "silica_cert_doc_url"])
    ),
    prepareWorkerWritePayload(
      omitWorkerPayloadKeys(payload, [
        "is_subcontractor",
        "subcontractor_id",
        "white_card_doc_url",
        "silica_cert_doc_url",
      ])
    ),
  ];

  let lastError: string | null = null;

  for (let index = 0; index < attempts.length; index++) {
    const attempt = attempts[index];
    const result = await addWorker(
      attempt as Partial<Omit<WorkerOnboardingInput, "first_name" | "last_name" | "email">> & {
        first_name: string;
        last_name: string;
        email: string;
      },
      vocExpiries
    );

    if (!result.error) {
      if (index === 1) {
        return {
          error:
            "Worker saved. Run migration 017_subcontractor_worker_doc_urls.sql for document URL columns.",
          workerId: result.workerId,
        };
      }
      if (index === 2) {
        return {
          error:
            "Worker saved. Run migrations 016 and 017 for full subcontractor worker linkage.",
          workerId: result.workerId,
        };
      }
      return result;
    }

    lastError = result.error;
    if (!isMissingWorkerColumnError(result.error)) {
      return result;
    }
  }

  return { error: lastError, workerId: null };
}

/** Append a project to each worker's assigned_project_ids. */
export async function assignWorkersToProject(
  workerIds: string[],
  projectId: string
): Promise<{ error: string | null }> {
  if (!projectId.trim() || workerIds.length === 0) {
    return { error: "Select at least one worker and a project." };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const targetProjectId = projectId.trim();

  for (const workerId of workerIds) {
    const worker = await fetchWorkerById(workerId);
    if (!worker) return { error: "Worker not found." };

    const current = getWorkerAssignedProjectIds(worker);
    if (current.includes(targetProjectId)) continue;

    const { error } = await updateWorkerAssignedProjectIds(workerId, [
      ...current,
      targetProjectId,
    ]);
    if (error) return { error };
  }

  return { error: null };
}

export async function fetchWorkerVocs(workerId: string): Promise<WorkerVoc[]> {
  try {
    const { data, error } = await supabase
      .from("worker_vocs")
      .select("*")
      .eq("worker_id", workerId)
      .order("expiry_date");

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch worker VOCs")) {
        return [];
      }
      console.error("Failed to fetch worker VOCs:", error.message);
      return [];
    }
    return (data ?? []) as WorkerVoc[];
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch worker VOCs")) {
      return [];
    }
    console.error("Failed to fetch worker VOCs:", error);
    return [];
  }
}

export async function fetchAllWorkerVocs(): Promise<WorkerVoc[]> {
  try {
    const { data, error } = await supabase
      .from("worker_vocs")
      .select("*")
      .order("expiry_date");

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch all worker VOCs")) {
        return [];
      }
      console.error("Failed to fetch worker VOCs:", error.message);
      return [];
    }
    return (data ?? []) as WorkerVoc[];
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch all worker VOCs")) {
      return [];
    }
    console.error("Failed to fetch worker VOCs:", error);
    return [];
  }
}

export async function insertWorkerVocs(
  workerId: string,
  vocs: {
    title: string;
    voc_type?: string | null;
    issuing_org?: string | null;
    issue_date?: string | null;
    expiry_date?: string | null;
    document_url?: string | null;
  }[]
): Promise<{ error: string | null }> {
  if (vocs.length === 0) return { error: null };

  const rows = vocs
    .map((v) => {
      const vocType = String(v.voc_type ?? v.title ?? "").trim();
      if (!vocType) return null;
      return {
        worker_id: workerId,
        title: vocType,
        voc_type: vocType,
        name: vocType,
        issuing_org: v.issuing_org ?? null,
        issue_date: nullIfBlankWorkerDate(v.issue_date),
        expiry_date: nullIfBlankWorkerDate(v.expiry_date),
        document_url: v.document_url ?? null,
      };
    })
    .filter((row): row is NonNullable<typeof row> => row !== null);

  if (rows.length === 0) return { error: null };

  const attempts = [
    rows,
    rows.map(({ name: _name, voc_type: _vocType, ...row }) => row),
    rows.map(({ name: _name, ...row }) => row),
  ];

  let lastError: string | null = null;
  for (const payload of attempts) {
    const { error } = await supabase.from("worker_vocs").insert(payload);
    if (!error) return { error: null };
    lastError = error.message;
    const lower = error.message.toLowerCase();
    if (
      !lower.includes("column") &&
      !lower.includes("schema cache") &&
      !lower.includes("could not find")
    ) {
      break;
    }
  }

  return { error: lastError };
}

export async function deleteWorkerVoc(vocId: string): Promise<{ error: string | null }> {
  const { error } = await supabase.from("worker_vocs").delete().eq("id", vocId);
  return { error: error?.message ?? null };
}

export async function fetchWorkerById(id: string): Promise<Worker | null> {
  if (!isSupabaseConfigured() || !id.trim()) return null;
  return fetchWorkerRowById(id.trim());
}

export async function updateWorkerStatusFromVocs(
  workerId: string,
  licenceExpiry: string | null | undefined,
  vocExpiries: (string | null | undefined)[]
): Promise<void> {
  const status = computeWorkerStatusFromExpiries([
    licenceExpiry,
    ...vocExpiries,
  ]);
  await supabase.from("workers").update({ status }).eq("id", workerId);
}

export async function updateWorker(
  workerId: string,
  updates: Partial<WorkerOnboardingInput> & {
    induction_signature_url?: string | null;
    induction_completed_at?: string | null;
    status?: WorkerStatus | string;
    cards_vocs?: unknown;
    worker_code?: string | null;
    employment_type?: string | null;
  }
): Promise<{ error: string | null }> {
  let payload = { ...updates };

  if (updates.assigned_project_id !== undefined) {
    let resolvedProjectId: string | null = null;

    if (updates.assigned_project_id?.trim()) {
      const { id, error: projectError } = await resolveProjectId(
        updates.assigned_project_id
      );
      if (projectError) return { error: projectError };
      if (id && !isProjectUuid(id)) {
        return { error: "assigned_project_id must be a UUID, not a text slug." };
      }
      resolvedProjectId = id;
    }

    payload = { ...payload, assigned_project_id: resolvedProjectId };
  }

  payload = prepareWorkerWritePayload(payload) as typeof payload;

  const { error } = await supabase
    .from("workers")
    .update(payload)
    .eq("id", workerId);

  return { error: error?.message ?? null };
}

export async function updateWorkerPhotoUrl(
  workerId: string,
  photoUrl: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from("workers")
    .update({ photo_url: photoUrl })
    .eq("id", workerId);

  return { error: error?.message ?? null };
}

export async function setWorkerRevokedState(
  workerId: string,
  revoked: boolean
): Promise<{ error: string | null }> {
  try {
    const payload = revoked
      ? {
          is_revoked: true,
          status: "Revoked",
          is_archived: true,
          assigned_project_id: null,
          assigned_project_name: "Unassigned",
          project_id: null,
          project_name: "Unassigned",
          assigned_project_ids: [] as string[],
        }
      : {
          is_revoked: false,
          is_archived: false,
          status: "active" as const,
        };

    const { error } = await supabase
      .from("workers")
      .update(payload)
      .eq("id", workerId);

    return { error: error?.message ?? null };
  } catch (error) {
    console.warn("setWorkerRevokedState failed:", error);
    return {
      error: error instanceof Error ? error.message : "Failed to update worker status.",
    };
  }
}

export async function addPlant(asset: {
  unit_number: string;
  category: string;
  make?: string;
  model?: string;
  serial_number?: string;
  current_hours?: number | null;
  next_service_hours?: number | null;
  prestart_template?: PrestartTemplate;
  service_contact_name?: string;
  service_contact_phone?: string;
  service_contact_company?: string;
  service_contact_email?: string;
  heavy_vehicle_check_required?: boolean;
  last_heavy_vehicle_check_date?: string | null;
  next_heavy_vehicle_check_due_date?: string | null;
}): Promise<{ error: string | null; data: PlantAsset | null }> {
  const { data, error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .insert([
      {
        ...asset,
        prestart_template: asset.prestart_template ?? "excavator",
        status: "available",
      },
    ])
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return {
    error: null,
    data: normalizePlantRecord(data as RawPlantRow),
  };
}

export async function updatePlantTemplate(
  plantId: string,
  template: PrestartTemplate
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .update({ prestart_template: template })
    .eq("id", plantId);

  return { error: error?.message ?? null };
}

export async function updatePlantPhotoUrl(
  plantId: string,
  photoUrl: string
): Promise<{ error: string | null }> {
  const { error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .update({ photo_url: photoUrl })
    .eq("id", plantId);

  if (error) return { error: error.message };

  await tryUpdateTableWithOptionalColumns(
    PRIMARY_PLANT_ASSIGNMENT_TABLE,
    "id",
    plantId,
    { photo_url: photoUrl },
    PLANT_EQUIPMENT_OPTIONAL_COLUMNS
  );

  return { error: null };
}

export async function updatePlant(
  plantId: string,
  updates: {
    unit_number?: string;
    name?: string | null;
    category?: string;
    make?: string | null;
    model?: string | null;
    serial_number?: string | null;
    registration_code?: string | null;
    hourly_cost_rate?: number | null;
    ownership_type?: string | null;
    status?: string;
    prestart_template?: PrestartTemplate | null;
    current_hours?: number | null;
    next_service_hours?: number | null;
    service_contact_name?: string | null;
    service_contact_phone?: string | null;
    service_contact_company?: string | null;
    service_contact_email?: string | null;
    heavy_vehicle_check_required?: boolean;
    last_heavy_vehicle_check_date?: string | null;
    next_heavy_vehicle_check_due_date?: string | null;
    plant_documents?: unknown;
    photo_url?: string | null;
  }
): Promise<{ error: string | null }> {
  const payload: Record<string, unknown> = {
    updated_at: new Date().toISOString(),
  };

  if (updates.unit_number !== undefined) payload.unit_number = updates.unit_number.trim();
  if (updates.name !== undefined) payload.name = updates.name?.trim() || null;
  if (updates.category !== undefined) payload.category = updates.category.trim();
  if (updates.make !== undefined) payload.make = updates.make?.trim() || null;
  if (updates.model !== undefined) payload.model = updates.model?.trim() || null;
  if (updates.serial_number !== undefined) {
    payload.serial_number = updates.serial_number?.trim() || null;
  }
  if (updates.registration_code !== undefined) {
    payload.registration_code = updates.registration_code?.trim() || null;
  }
  if (updates.hourly_cost_rate !== undefined) {
    payload.hourly_cost_rate = updates.hourly_cost_rate;
  }
  if (updates.ownership_type !== undefined) {
    payload.ownership_type = updates.ownership_type?.trim() || null;
  }
  if (updates.status !== undefined) payload.status = updates.status;
  if (updates.prestart_template !== undefined) {
    payload.prestart_template = updates.prestart_template;
  }
  if (updates.current_hours !== undefined) {
    payload.current_hours = updates.current_hours;
  }
  if (updates.next_service_hours !== undefined) {
    payload.next_service_hours = updates.next_service_hours;
  }
  if (updates.service_contact_name !== undefined) {
    payload.service_contact_name = updates.service_contact_name?.trim() || null;
  }
  if (updates.service_contact_phone !== undefined) {
    payload.service_contact_phone = updates.service_contact_phone?.trim() || null;
  }
  if (updates.service_contact_company !== undefined) {
    payload.service_contact_company = updates.service_contact_company?.trim() || null;
  }
  if (updates.service_contact_email !== undefined) {
    payload.service_contact_email = updates.service_contact_email?.trim() || null;
  }
  if (updates.heavy_vehicle_check_required !== undefined) {
    payload.heavy_vehicle_check_required = updates.heavy_vehicle_check_required;
  }
  if (updates.last_heavy_vehicle_check_date !== undefined) {
    payload.last_heavy_vehicle_check_date =
      updates.last_heavy_vehicle_check_date || null;
  }
  if (updates.next_heavy_vehicle_check_due_date !== undefined) {
    payload.next_heavy_vehicle_check_due_date =
      updates.next_heavy_vehicle_check_due_date || null;
  }
  if (updates.plant_documents !== undefined) payload.plant_documents = updates.plant_documents;
  if (updates.photo_url !== undefined) payload.photo_url = updates.photo_url;

  const { error } = await supabase
    .from(MASTER_PLANT_TABLE)
    .update(payload)
    .eq("id", plantId);

  if (error) return { error: error.message };

  const equipmentPayload: Record<string, unknown> = { updated_at: payload.updated_at };
  if (updates.unit_number !== undefined) {
    equipmentPayload.unit_number = updates.unit_number.trim();
    equipmentPayload.unit_reference = updates.unit_number.trim();
  }
  if (updates.name !== undefined) equipmentPayload.name = updates.name?.trim() || null;
  if (updates.category !== undefined) {
    equipmentPayload.equipment_category = updates.category.trim();
  }
  if (updates.make !== undefined) equipmentPayload.make = updates.make?.trim() || null;
  if (updates.model !== undefined) equipmentPayload.model = updates.model?.trim() || null;
  if (updates.serial_number !== undefined) {
    equipmentPayload.serial_number = updates.serial_number?.trim() || null;
  }
  if (updates.registration_code !== undefined) {
    equipmentPayload.registration_code = updates.registration_code?.trim() || null;
  }
  if (updates.hourly_cost_rate !== undefined) {
    equipmentPayload.hourly_cost_rate = updates.hourly_cost_rate;
  }
  if (updates.ownership_type !== undefined) {
    equipmentPayload.ownership_type = updates.ownership_type?.trim() || null;
    equipmentPayload.is_subcontractor_plant =
      updates.ownership_type?.trim().toLowerCase() === "subcontractor";
  }
  if (updates.status !== undefined) equipmentPayload.status = updates.status;
  if (updates.current_hours !== undefined) {
    equipmentPayload.current_hours = updates.current_hours;
  }
  if (updates.next_service_hours !== undefined) {
    equipmentPayload.next_service_hours = updates.next_service_hours;
  }
  if (updates.plant_documents !== undefined) {
    equipmentPayload.plant_documents = updates.plant_documents;
  }
  if (updates.photo_url !== undefined) equipmentPayload.photo_url = updates.photo_url;

  await tryUpdateTableWithOptionalColumns(
    PRIMARY_PLANT_ASSIGNMENT_TABLE,
    "id",
    plantId,
    equipmentPayload,
    PLANT_EQUIPMENT_OPTIONAL_COLUMNS
  );

  return { error: null };
}

export async function uploadPrestartFile(
  file: File | Blob,
  path: string
): Promise<{ url: string | null; error: string | null }> {
  const { error: uploadError } = await supabase.storage
    .from("prestart-uploads")
    .upload(path, file, { upsert: true, contentType: file.type || undefined });

  if (uploadError) {
    return { url: null, error: uploadError.message };
  }

  const { data } = supabase.storage.from("prestart-uploads").getPublicUrl(path);
  return { url: data.publicUrl, error: null };
}

export async function submitPlantPrestart(input: {
  plantId: string;
  operatorName: string;
  projectId?: string | null;
  siteId?: string | null;
  template: PrestartTemplate;
  checkData: Record<string, string | number | boolean | null>;
  hasDefect: boolean;
  defectComments?: string;
  defectPhotoUrl?: string;
  signatureUrl?: string;
}): Promise<{ error: string | null }> {
  const { resolveProjectId } = await import("./project-resolver");
  const projectRef = input.projectId ?? input.siteId ?? null;
  const { id: resolvedProjectId, error: projectError } =
    await resolveProjectId(projectRef);

  if (!resolvedProjectId) {
    return {
      error:
        projectError ??
        "A project assignment is required before submitting a plant pre-start.",
    };
  }

  const readingKey = getReadingFieldKey(input.template);
  const serviceKey = getServiceFieldKey(input.template);
  const currentReading = Number(input.checkData[readingKey] ?? 0);
  const nextServiceDue = Number(input.checkData[serviceKey] ?? 0);

  const basePayload: Record<string, unknown> = consolidatePayloadForTable(
    "plant_prestarts",
    {
      plant_id: input.plantId,
      operator_name: input.operatorName,
      project_id: resolvedProjectId,
      site_id: resolvedProjectId,
      current_reading: currentReading,
      next_service_due: nextServiceDue,
      check_data: input.checkData,
      has_defect: input.hasDefect,
      defect_comments: nullIfBlank(input.defectComments),
      defect_photo_url: nullIfBlank(input.defectPhotoUrl),
      signature_url: nullIfBlank(input.signatureUrl),
    }
  );

  let insertError = (
    await insertWithFormMetadataFallback(supabase, "plant_prestarts", basePayload)
  ).error;

  if (
    insertError &&
    isMissingScopeColumnError(insertError, "site_id")
  ) {
    const { site_id: _siteId, ...withoutSiteId } = basePayload;
    insertError = (
      await insertWithFormMetadataFallback(supabase, "plant_prestarts", withoutSiteId)
    ).error;
  }

  if (insertError) {
    return { error: insertError };
  }

  const plantUpdate: Record<string, unknown> = {
    status: input.hasDefect ? "out_of_service" : "available",
  };

  if (usesKilometres(input.template)) {
    plantUpdate.current_kms = currentReading;
    plantUpdate.next_service_kms = nextServiceDue;
  } else {
    plantUpdate.current_hours = currentReading;
    plantUpdate.next_service_hours = nextServiceDue;
  }

  const { error: updateError } = await supabase
    .from("plant")
    .update(plantUpdate)
    .eq("id", input.plantId);

  return { error: updateError?.message ?? null };
}

export function getPrestartUrl(plantId: string): string {
  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/prestart/${plantId}`;
}

export async function fetchLatestDefectPrestart(
  plantId: string
): Promise<PlantPrestart | null> {
  const { data, error } = await supabase
    .from("plant_prestarts")
    .select("*")
    .eq("plant_id", plantId)
    .eq("has_defect", true)
    .is("cleared_at", null)
    .order("created_at", { ascending: false })
    .limit(1)
    .maybeSingle();

  if (error) {
    console.error("Failed to fetch defect prestart:", error.message);
    return null;
  }

  return data as PlantPrestart | null;
}

export async function clearPlantDefect(input: {
  plantId: string;
  prestartId: string;
  repairNotes: string;
  mechanicInvoiceRef?: string;
}): Promise<{ error: string | null }> {
  return resolvePlantPrestartDefect({
    plantId: input.plantId,
    prestartId: input.prestartId,
    resolutionNotes: input.repairNotes,
    mechanicInvoiceRef: input.mechanicInvoiceRef,
    requireNotes: true,
  });
}

export async function resolvePlantPrestartDefect(input: {
  plantId: string;
  prestartId: string;
  resolutionNotes?: string;
  mechanicInvoiceRef?: string;
  requireNotes?: boolean;
}): Promise<{ error: string | null }> {
  if (input.requireNotes && !input.resolutionNotes?.trim()) {
    return { error: "Please enter resolution notes." };
  }

  if (!isSupabaseConfigured()) {
    return { error: null };
  }

  const resolvedAt = new Date().toISOString();
  const notes = input.resolutionNotes?.trim() || null;

  const payloads: Record<string, unknown>[] = [
    {
      has_defect: false,
      defect_status: "Resolved",
      defect_resolved_at: resolvedAt,
      cleared_at: resolvedAt,
      repair_notes: notes,
      mechanic_invoice_ref: input.mechanicInvoiceRef ?? null,
    },
    {
      has_defect: false,
      cleared_at: resolvedAt,
      repair_notes: notes,
      mechanic_invoice_ref: input.mechanicInvoiceRef ?? null,
    },
  ];

  let lastError: string | null = null;

  for (const payload of payloads) {
    const { error: prestartError } = await supabase
      .from("plant_prestarts")
      .update(payload)
      .eq("id", input.prestartId);

    if (!prestartError) {
      lastError = null;
      break;
    }
    lastError = prestartError.message;
  }

  if (lastError) {
    return { error: lastError };
  }

  const { error: plantError } = await supabase
    .from("plant")
    .update({ status: "available" })
    .eq("id", input.plantId);

  return { error: plantError?.message ?? null };
}

export async function assignPlantToProject(input: {
  plant: PlantAssignmentSource;
  projectId: string;
  projectName: string;
}): Promise<{ error: string | null }> {
  return assignMasterPlantToProject({
    plant: input.plant,
    project: {
      id: input.projectId,
      project_id: input.projectId,
      name: input.projectName,
      project_name: input.projectName,
    },
  });
}

export async function fetchWorkerSchedules(
  startDate: string,
  endDate: string
): Promise<WorkerScheduleEntry[]> {
  try {
    const { data, error } = await supabase
      .from("worker_schedule")
      .select("*")
      .lte("start_date", endDate)
      .gte("end_date", startDate)
      .order("start_date");

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch worker schedules")) {
        return [];
      }
      console.error("Failed to fetch worker schedules:", error.message);
      return [];
    }

    return (data ?? []) as WorkerScheduleEntry[];
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch worker schedules")) {
      return [];
    }
    console.error("Failed to fetch worker schedules:", error);
    return [];
  }
}

export async function assignWorkerToProject(input: {
  workerId: string;
  projectId: string;
  projectName: string;
  startDate: string;
  endDate: string;
  roleOnSite?: string;
}): Promise<{ error: string | null }> {
  const { id: resolvedProjectId, error: projectError } = await resolveProjectId(
    input.projectId
  );
  if (projectError) return { error: projectError };

  const { data: workerRow } = await supabase
    .from("workers")
    .select("drivers_licence_expiry")
    .eq("id", input.workerId)
    .single();

  const vocs = await fetchWorkerVocs(input.workerId);
  const status = computeWorkerStatusFromExpiries([
    workerRow?.drivers_licence_expiry,
    ...vocs.map((v) => v.expiry_date),
  ]);

  const { error: workerError } = await supabase
    .from("workers")
    .update({
      assigned_project_id: resolvedProjectId,
      status: status === "expired_ticket" ? "expired_ticket" : "active",
    })
    .eq("id", input.workerId);

  if (workerError) return { error: workerError.message };

  const { error: scheduleError } = await supabase.from("worker_schedule").insert([
    {
      worker_id: input.workerId,
      project_id: resolvedProjectId,
      project_name: input.projectName,
      start_date: input.startDate,
      end_date: input.endDate,
      role_on_site: input.roleOnSite ?? null,
    },
  ]);

  return { error: scheduleError?.message ?? null };
}

export async function fetchWorkerTimesheets(
  workerId: string,
  options?: { startDate?: string; endDate?: string; limit?: number }
): Promise<WorkerTimesheet[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    let query = supabase
      .from("worker_timesheets")
      .select("*")
      .eq("worker_id", workerId)
      .order("work_date", { ascending: false })
      .order("created_at", { ascending: false });

    if (options?.startDate) {
      query = query.gte("work_date", options.startDate);
    }
    if (options?.endDate) {
      query = query.lte("work_date", options.endDate);
    }
    if (options?.limit) {
      query = query.limit(options.limit);
    }

    const { data, error } = await query;

    if (error) {
      if (handleSupabaseNetworkFetchError(error, "fetch worker timesheets")) {
        return [];
      }
      if (!error.message.toLowerCase().includes("worker_timesheets")) {
        console.error("Failed to fetch worker timesheets:", error.message);
      }
      return [];
    }

    return (data ?? []).map((row) => {
      const timesheet = row as WorkerTimesheet;
      return {
        ...timesheet,
        status: normalizeTimesheetStatus(timesheet.status),
      };
    });
  } catch (error) {
    if (handleSupabaseNetworkFetchError(error, "fetch worker timesheets")) {
      return [];
    }
    console.error("Failed to fetch worker timesheets:", error);
    return [];
  }
}

export async function insertWorkerTimesheet(input: {
  workerId: string;
  workDate: string;
  projectId: string | null;
  startTime: string;
  finishTime: string;
  breakMinutes: number;
  notes?: string | null;
}): Promise<{ error: string | null; data: WorkerTimesheet | null }> {
  if (!input.projectId) {
    return { error: "Please select a project.", data: null };
  }

  const totalHours = calculateTimesheetHours(
    input.startTime,
    input.finishTime,
    input.breakMinutes
  );

  if (totalHours <= 0) {
    return {
      error: "Finish time must be after start time (minus breaks).",
      data: null,
    };
  }

  const { data: workerRow } = await supabase
    .from("workers")
    .select("state")
    .eq("id", input.workerId)
    .maybeSingle();

  const workerState =
    normalizeWorkerStateRegion(
      (workerRow as { state?: string | null } | null)?.state
    ) ??
    (workerRow as { state?: string | null } | null)?.state ??
    null;

  const actBreakError = validateActBreakRequirement({
    workerState,
    submit: true,
    breaks: [],
    breakMinutes: input.breakMinutes,
    notes: input.notes,
    activities: [{ label: "WORKING ON SITE" }],
  });
  if (actBreakError) {
    return { error: actBreakError, data: null };
  }

  let projectId = input.projectId;
  if (!isProjectUuid(projectId)) {
    const { id, error: projectError } = await resolveProjectId(projectId);
    if (projectError || !id) {
      return { error: projectError ?? "Invalid project selected.", data: null };
    }
    projectId = id;
  }

  const projectName = getProjectDisplayName(projectId);

  const { data, error } = await supabase
    .from("worker_timesheets")
    .insert([
      {
        worker_id: input.workerId,
        work_date: input.workDate,
        project_id: projectId,
        project_name: projectName,
        start_time: input.startTime,
        finish_time: input.finishTime,
        break_minutes: input.breakMinutes,
        total_hours: totalHours,
        notes: input.notes?.trim() || null,
        status: "pending",
      },
    ])
    .select("*")
    .single();

  if (error) {
    return { error: error.message, data: null };
  }

  return { error: null, data: data as WorkerTimesheet };
}

export async function fetchLeaveRequests(options?: {
  workerId?: string;
  projectId?: string;
  status?: LeaveRequestStatus;
}): Promise<LeaveRequest[]> {
  const { fetchLeaveRequestsNormalized } = await import("./leave-requests");
  return fetchLeaveRequestsNormalized(options);
}

export async function insertLeaveRequest(input: {
  workerId: string;
  projectId: string;
  firstDate: string;
  lastDate: string;
  numberOfDays: number;
  reason: string;
  signatureUrl: string | null;
  workerName?: string;
  worker?: import("./leave-requests").LeaveWorkerRef | null;
  leaveType?: LeaveType | string | null;
}): Promise<{ error: string | null; data: LeaveRequest | null }> {
  const { submitLeaveRequest } = await import("./leave-requests");
  return submitLeaveRequest(input);
}

export async function approveLeaveRequest(input: {
  leaveRequestId: string;
  leaveType: LeaveType;
}): Promise<import("./leave-requests").LeaveApprovalResult> {
  const { approveLeaveRequestWorkflow } = await import("./leave-requests");
  return approveLeaveRequestWorkflow({
    leaveRequestId: input.leaveRequestId,
    leaveType: input.leaveType,
  });
}

export async function declineLeaveRequest(
  leaveRequestId: string
): Promise<{ error: string | null }> {
  const { rejectLeaveRequestWorkflow } = await import("./leave-requests");
  return rejectLeaveRequestWorkflow(leaveRequestId);
}

/** @alias declineLeaveRequest */
export async function rejectLeaveRequest(
  leaveRequestId: string
): Promise<{ error: string | null }> {
  return declineLeaveRequest(leaveRequestId);
}

export interface CompanyProfile {
  id: string;
  company_name: string | null;
  abn: string | null;
  address: string | null;
  logo_url: string | null;
  updated_at?: string;
  source?: "company_profile" | "organisations";
}

export interface CompanyInsurance {
  id: string;
  insurance_type: string;
  policy_number: string | null;
  insurer?: string | null;
  expiry_date: string | null;
  document_url: string | null;
  created_at?: string;
  updated_at?: string;
}

export async function fetchCompanyProfile(): Promise<CompanyProfile | null> {
  const { loadCompanyProfile } = await import("./company-profile-service");
  return loadCompanyProfile();
}

export async function upsertCompanyProfile(input: {
  company_name: string;
  abn: string;
  address: string;
}): Promise<{ error: string | null }> {
  const { saveCompanyProfile } = await import("./company-profile-service");
  return saveCompanyProfile(input);
}

export async function updateCompanyLogoUrl(
  logoUrl: string | null
): Promise<{ error: string | null }> {
  const { saveCompanyLogoUrl } = await import("./company-profile-service");
  return saveCompanyLogoUrl(logoUrl);
}

export async function fetchCompanyInsurances(): Promise<CompanyInsurance[]> {
  if (!isSupabaseConfigured()) return [];

  const { data, error } = await supabase
    .from("company_insurances")
    .select("*")
    .order("expiry_date", { ascending: true, nullsFirst: false });

  if (error) {
    if (!error.message.toLowerCase().includes("company_insurances")) {
      console.error("Failed to fetch insurances:", error.message);
    }
    return [];
  }

  return (data ?? []) as CompanyInsurance[];
}

export async function insertCompanyInsurance(input: {
  insurance_type: string;
  policy_number?: string | null;
  expiry_date?: string | null;
  document_url?: string | null;
}): Promise<{ error: string | null }> {
  const { error } = await supabase.from("company_insurances").insert([
    {
      insurance_type: input.insurance_type,
      policy_number: input.policy_number?.trim() || null,
      expiry_date: input.expiry_date || null,
      document_url: input.document_url ?? null,
    },
  ]);
  return { error: error?.message ?? null };
}

export async function updateWorkerSecurityRole(
  workerId: string,
  securityRole: string
): Promise<{ error: string | null }> {
  try {
    if (!workerId?.trim()) {
      return { error: "Worker id is required." };
    }

    const role = coerceSecurityRole(securityRole);

    const { error } = await supabase
      .from("workers")
      .update({ security_role: role })
      .eq("id", workerId.trim());

    if (error) {
      const lower = error.message.toLowerCase();
      if (
        lower.includes("row-level security") ||
        lower.includes("permission denied") ||
        lower.includes("not authorized")
      ) {
        return {
          error:
            "You don't have permission to update security roles. Check Supabase UPDATE policies on the workers table.",
        };
      }
      if (isMissingWorkerColumnError(error.message)) {
        return {
          error:
            "The security_role column is missing on workers. Run migration 011_organisation.sql in Supabase.",
        };
      }
      if (lower.includes("workers_security_role_check")) {
        return {
          error:
            "Invalid security role. Choose a valid role from the Security Settings list.",
        };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error("updateWorkerSecurityRole failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to update security role. Please try again.",
    };
  }
}

export async function updateWorkerAccountsAccess(
  workerId: string,
  accountsAccessRole: AccountsAccessRole
): Promise<{ error: string | null }> {
  try {
    if (!workerId?.trim()) {
      return { error: "Worker id is required." };
    }

    const role = normalizeAccountsAccessRole(accountsAccessRole);
    const payload = {
      accounts_access_role: role,
      can_access_accounts: role !== "disabled",
    };

    let { error } = await supabase
      .from("workers")
      .update(payload)
      .eq("id", workerId.trim());

    if (error && isMissingWorkerColumnError(error.message)) {
      ({ error } = await supabase
        .from("workers")
        .update({ accounts_access_role: role })
        .eq("id", workerId.trim()));
    }

    if (error) {
      const lower = error.message.toLowerCase();
      if (
        lower.includes("row-level security") ||
        lower.includes("permission denied") ||
        lower.includes("not authorized")
      ) {
        return {
          error:
            "You don't have permission to update accounts access. Check Supabase UPDATE policies on the workers table.",
        };
      }
      if (isMissingWorkerColumnError(error.message)) {
        return {
          error:
            "Accounts access columns are missing on workers. Run migration 055_accounts_navigation_and_security.sql in Supabase.",
        };
      }
      if (lower.includes("workers_accounts_access_role_check")) {
        return {
          error:
            "Invalid accounts access role. Choose Full Access, View Only, or Disabled / No Access.",
        };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error("updateWorkerAccountsAccess failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to update accounts access. Please try again.",
    };
  }
}

export async function updateWorkerAssignedProjectIds(
  workerId: string,
  projectIds: string[] | null | undefined
): Promise<{ error: string | null }> {
  try {
    if (!workerId?.trim()) {
      return { error: "Worker id is required." };
    }

    const ids = normalizeWorkerUuidArray(projectIds);
    const primaryProjectId = ids[0] ?? null;

    const payload = {
      assigned_project_ids: ids,
      assigned_project_id: primaryProjectId,
    };

    let { error } = await supabase
      .from("workers")
      .update(payload)
      .eq("id", workerId.trim());

    if (error && isMissingWorkerColumnError(error.message)) {
      ({ error } = await supabase
        .from("workers")
        .update({ assigned_project_id: primaryProjectId })
        .eq("id", workerId.trim()));
    }

    if (error) {
      const lower = error.message.toLowerCase();
      if (
        lower.includes("row-level security") ||
        lower.includes("permission denied") ||
        lower.includes("not authorized")
      ) {
        return {
          error:
            "You don't have permission to update project assignments. Check Supabase UPDATE policies on the workers table.",
        };
      }
      return { error: error.message };
    }

    return { error: null };
  } catch (error) {
    console.error("updateWorkerAssignedProjectIds failed:", error);
    return {
      error:
        error instanceof Error
          ? error.message
          : "Failed to update assigned projects. Please try again.",
    };
  }
}

export type { SiteFormSubmission, SiteFormAttendee, SiteFormType } from "./site-forms";

/** Workers granted access to a project (assigned_project_ids or legacy id). */
export async function fetchWorkersForProject(projectId: string): Promise<Worker[]> {
  if (!projectId.trim() || !isSupabaseConfigured()) return [];
  const workers = await fetchWorkers();
  return workers.filter((worker) =>
    getWorkerAssignedProjectIds(worker).includes(projectId.trim())
  );
}

const SITE_FORM_ORDER_COLUMNS = ["created_at", "submitted_at"] as const;

export async function fetchSiteForms(options?: {
  projectId?: string;
  formType?: import("./site-forms").SiteFormType;
  limit?: number;
}): Promise<import("./site-forms").SiteFormSubmission[]> {
  if (!isSupabaseConfigured()) return [];

  const scopeValues = options?.projectId
    ? await resolveProjectScopeValues(options.projectId)
    : [];

  for (const orderColumn of SITE_FORM_ORDER_COLUMNS) {
    try {
      let query = supabase
        .from("site_forms")
        .select("*")
        .order(orderColumn, { ascending: false });

      if (scopeValues.length > 0) {
        const scopeFilter = buildProjectScopeOrFilter(scopeValues, [
          "project_id",
          "site_id",
        ]);
        if (scopeFilter) {
          query = query.or(scopeFilter);
        }
      }
      if (options?.formType) {
        query = query.eq("form_type", options.formType);
      }
      if (options?.limit) {
        query = query.limit(options.limit);
      }

      let { data, error } = await query;
      if (
        error &&
        scopeValues.length > 0 &&
        isMissingScopeColumnError(error.message, "site_id")
      ) {
        let fallbackQuery = supabase
          .from("site_forms")
          .select("*")
          .order(orderColumn, { ascending: false });
        const projectOnlyFilter = buildProjectScopeOrFilter(scopeValues, [
          "project_id",
        ]);
        if (projectOnlyFilter) {
          fallbackQuery = fallbackQuery.or(projectOnlyFilter);
        }
        if (options?.formType) {
          fallbackQuery = fallbackQuery.eq("form_type", options.formType);
        }
        if (options?.limit) {
          fallbackQuery = fallbackQuery.limit(options.limit);
        }
        ({ data, error } = await fallbackQuery);
      }

      if (!error) {
        return ((data ?? []) as RawSiteFormRow[]).map(normalizeSiteFormRow);
      }

      if (isMissingSiteFormColumnError(error.message, orderColumn)) {
        continue;
      }

      console.error("fetchSiteForms failed:", error.message);
      return [];
    } catch (error) {
      console.error("fetchSiteForms failed:", error);
      continue;
    }
  }

  return [];
}

export async function fetchPlantPrestarts(options?: {
  projectId?: string;
  plantIds?: string[];
  limit?: number;
  startDate?: string;
  endDate?: string;
}): Promise<PlantPrestart[]> {
  if (!isSupabaseConfigured()) return [];

  const scopeValues = options?.projectId
    ? await resolveProjectScopeValues(options.projectId)
    : [];
  const limit = options?.limit ?? 100;
  const results: PlantPrestart[] = [];

  const applyDateFilters = <T extends { gte: (col: string, val: string) => T; lte: (col: string, val: string) => T }>(
    query: T
  ) => {
    let next = query;
    if (options?.startDate) {
      next = next.gte("created_at", `${options.startDate}T00:00:00`);
    }
    if (options?.endDate) {
      next = next.lte("created_at", `${options.endDate}T23:59:59.999`);
    }
    return next;
  };

  if (scopeValues.length > 0) {
    const scopeFilter = buildProjectScopeOrFilter(scopeValues, [
      "project_id",
      "site_id",
    ]);
    if (scopeFilter) {
      let query = applyDateFilters(
        supabase
          .from("plant_prestarts")
          .select("*")
          .or(scopeFilter)
          .order("created_at", { ascending: false })
          .limit(limit)
      );

      let { data, error } = await query;
      if (error && isMissingScopeColumnError(error.message, "site_id")) {
        const projectOnlyFilter = buildProjectScopeOrFilter(scopeValues, [
          "project_id",
        ]);
        if (projectOnlyFilter) {
          ({ data, error } = await applyDateFilters(
            supabase
              .from("plant_prestarts")
              .select("*")
              .or(projectOnlyFilter)
              .order("created_at", { ascending: false })
              .limit(limit)
          ));
        }
      }

      if (!error) {
        results.push(...((data ?? []) as PlantPrestart[]));
      } else {
        console.error("fetchPlantPrestarts scope query failed:", error.message);
      }
    }
  }

  if (options?.plantIds?.length) {
    const { data, error } = await applyDateFilters(
      supabase
        .from("plant_prestarts")
        .select("*")
        .in("plant_id", options.plantIds)
        .order("created_at", { ascending: false })
        .limit(limit)
    );

    if (!error) {
      results.push(...((data ?? []) as PlantPrestart[]));
    } else {
      console.error("fetchPlantPrestarts plant query failed:", error.message);
    }
  }

  if (!options?.projectId && !options?.plantIds?.length) {
    const { data, error } = await applyDateFilters(
      supabase
        .from("plant_prestarts")
        .select("*")
        .order("created_at", { ascending: false })
        .limit(limit)
    );

    if (!error) {
      results.push(...((data ?? []) as PlantPrestart[]));
    } else {
      console.error("fetchPlantPrestarts query failed:", error.message);
    }
  }

  const seen = new Set<string>();
  return results
    .filter((row) => {
      if (seen.has(row.id)) return false;
      seen.add(row.id);
      return true;
    })
    .sort(
      (a, b) =>
        new Date(b.created_at).getTime() - new Date(a.created_at).getTime()
    )
    .slice(0, limit);
}

type RawSiteFormRow = {
  id: string;
  form_type: string;
  project_id: string;
  worker_id: string;
  submitted_at?: string | null;
  form_date: string;
  form_time?: string | null;
  location_scope?: string | null;
  form_data?: import("./site-forms").SiteFormData | null;
  checklist_data?: import("./site-forms").SiteFormData | null;
  photo_urls?: string[] | null;
  attendees?: import("./site-forms").SiteFormAttendee[] | null;
  additional_workers?: import("./site-forms").SiteFormAdditionalWorker[] | null;
  submitter_signature_url?: string | null;
  created_at?: string | null;
  status?: string | null;
  title?: string | null;
  notes?: string | null;
  is_viewed?: boolean | null;
  viewed_at?: string | null;
  form_metadata?: Record<string, unknown> | null;
};

function readSiteFormMetadataBoolean(
  row: RawSiteFormRow,
  key: "is_viewed"
): boolean {
  if (row[key] === true) return true;
  const meta = row.form_metadata;
  if (meta && typeof meta === "object" && meta[key] === true) return true;
  return false;
}

function readSiteFormMetadataString(
  row: RawSiteFormRow,
  columnKey: "viewed_at" | "status" | "title" | "notes"
): string | null {
  const columnValue = row[columnKey];
  if (typeof columnValue === "string" && columnValue.trim()) {
    return columnValue.trim();
  }
  const meta = row.form_metadata;
  if (meta && typeof meta === "object") {
    const metaValue = meta[columnKey];
    if (typeof metaValue === "string" && metaValue.trim()) {
      return metaValue.trim();
    }
  }
  return null;
}

function normalizeSiteFormRow(row: RawSiteFormRow): import("./site-forms").SiteFormSubmission {
  const formData =
    (row.form_data as import("./site-forms").SiteFormData | undefined) ??
    (row.checklist_data as import("./site-forms").SiteFormData | undefined) ??
    {};

  const submittedAt = row.submitted_at ?? row.created_at ?? "";
  const createdAt = row.created_at ?? row.submitted_at ?? submittedAt;

  return {
    id: row.id,
    form_type: row.form_type as import("./site-forms").SiteFormType,
    project_id: row.project_id,
    worker_id: row.worker_id,
    submitted_at: submittedAt,
    form_date: row.form_date,
    form_time: row.form_time ?? null,
    location_scope: row.location_scope ?? null,
    form_data: formData,
    checklist_data: formData,
    photo_urls: Array.isArray(row.photo_urls) ? row.photo_urls : [],
    attendees: Array.isArray(row.attendees) ? row.attendees : [],
    additional_workers: Array.isArray(row.additional_workers)
      ? row.additional_workers.filter(
          (worker): worker is import("./site-forms").SiteFormAdditionalWorker =>
            typeof worker === "object" &&
            worker !== null &&
            typeof (worker as { name?: unknown }).name === "string" &&
            typeof (worker as { signature?: unknown }).signature === "string"
        )
      : [],
    submitter_signature_url: row.submitter_signature_url ?? null,
    created_at: createdAt || undefined,
    status: readSiteFormMetadataString(row, "status"),
    title: readSiteFormMetadataString(row, "title"),
    notes: readSiteFormMetadataString(row, "notes"),
    is_viewed: readSiteFormMetadataBoolean(row, "is_viewed"),
    viewed_at: readSiteFormMetadataString(row, "viewed_at"),
  };
}

export async function insertSiteForm(input: {
  formType: import("./site-forms").SiteFormType;
  projectId: string;
  workerId: string;
  formDate: string;
  formTime?: string | null;
  locationScope?: string | null;
  weatherConditions?: string | null;
  title?: string | null;
  status?: string | null;
  projectName?: string | null;
  notes?: string | null;
  formData: import("./site-forms").SiteFormData;
  photoUrls?: string[];
  attendees?: import("./site-forms").SiteFormAttendee[];
  additionalWorkers?: import("./site-forms").SiteFormAdditionalWorker[];
  submitterSignatureUrl?: string | null;
}): Promise<{ error: string | null; id: string | null }> {
  try {
    const { resolveProjectId } = await import("./project-resolver");
    const { id: resolvedProjectId, error: projectError } = await resolveProjectId(
      input.projectId
    );

    if (!resolvedProjectId) {
      return {
        error: projectError ?? "A project must be selected before submitting this form.",
        id: null,
      };
    }

    return insertSiteFormRecord(supabase, {
      formType: input.formType,
      projectId: resolvedProjectId,
      workerId: input.workerId,
      formDate: input.formDate,
      formTime: input.formTime,
      locationScope: input.locationScope,
      weatherConditions: input.weatherConditions,
      title: input.title,
      status: input.status,
      projectName: input.projectName,
      notes: input.notes,
      formData: input.formData,
      photoUrls: input.photoUrls,
      attendees: input.attendees,
      additionalWorkers: input.additionalWorkers,
      submitterSignatureUrl: input.submitterSignatureUrl,
    });
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to submit form.",
      id: null,
    };
  }
}

export type SwmsDocumentTable = "swms_documents" | "swms";

export type SwmsScope = "company" | "site_specific";

export interface SwmsDocumentRecord {
  id: string;
  title: string;
  document_date: string;
  file_url: string;
  doc_url?: string | null;
  is_archived: boolean;
  status: string;
  project_id?: string | null;
  swms_scope?: SwmsScope;
  version?: string;
  master_swms_id?: string | null;
  previous_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
}

export type SwmsViewFilter = "active" | "archived" | "all";
export type SwmsAdminTabFilter = "company" | "site_specific" | "archived";

type RawSwmsDocumentRecord = Record<string, unknown> & {
  id?: string;
  title?: string | null;
  document_date?: string | null;
  issue_date?: string | null;
  date?: string | null;
  file_url?: string | null;
  doc_url?: string | null;
  is_archived?: boolean | null;
  status?: string | null;
  project_id?: string | null;
  swms_scope?: string | null;
  version?: string | null;
  master_swms_id?: string | null;
  previous_version_id?: string | null;
  created_at?: string;
  updated_at?: string;
};

function isMissingSwmsTableError(message: string, table: SwmsDocumentTable): boolean {
  const lower = message.toLowerCase();
  const tableLower = table.toLowerCase();
  return (
    lower.includes(tableLower) ||
    lower.includes("does not exist") ||
    lower.includes("could not find") ||
    lower.includes("schema cache")
  );
}

function isMissingSwmsColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  const columnLower = column.toLowerCase();
  return (
    lower.includes(columnLower) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

/** Safe document URL: doc_url first, then file_url. */
export function resolveSwmsDocumentUrl(
  swms:
    | {
        doc_url?: string | null;
        file_url?: string | null;
      }
    | null
    | undefined
): string {
  if (!swms) return "";
  return String(swms.doc_url || swms.file_url || "").trim();
}

/** Safe document date: document_date, then issue_date, then date. */
export function resolveSwmsDocumentDate(
  swms:
    | {
        document_date?: string | null;
        issue_date?: string | null;
        date?: string | null;
      }
    | null
    | undefined
): string {
  if (!swms) return "";
  return String(
    swms.document_date || swms.issue_date || swms.date || ""
  )
    .trim()
    .slice(0, 10);
}

function resolveSwmsSelectedDate(date?: string | null): string {
  return (date?.trim() || new Date().toISOString().split("T")[0]).slice(0, 10);
}

export function resolveSwmsIsArchived(
  doc:
    | {
        is_archived?: boolean | null;
        status?: string | null;
      }
    | null
    | undefined
): boolean {
  if (!doc) return false;
  return Boolean(doc.is_archived || doc.status === "Archived");
}

export function resolveSwmsDocumentStatus(
  doc:
    | {
        is_archived?: boolean | null;
        status?: string | null;
      }
    | null
    | undefined
): string {
  if (!doc) return "Active";
  const status = String(doc.status ?? "").trim();
  if (status) return status;
  return resolveSwmsIsArchived(doc) ? "Archived" : "Active";
}

export function resolveSwmsScope(
  doc:
    | {
        swms_scope?: string | null;
        project_id?: string | null;
      }
    | null
    | undefined
): SwmsScope {
  if (!doc) return "company";
  const scope = String(doc.swms_scope ?? "").trim().toLowerCase();
  if (scope === "site_specific" || scope === "site-specific") return "site_specific";
  if (scope === "company") return "company";
  if (doc.project_id?.trim()) return "site_specific";
  return "company";
}

export function resolveSwmsVersion(
  doc: { version?: string | null } | null | undefined
): string {
  const version = String(doc?.version ?? "").trim();
  return version || "1.0";
}

function normalizeSwmsDocumentRecord(row: RawSwmsDocumentRecord): SwmsDocumentRecord {
  const documentUrl = resolveSwmsDocumentUrl(row);
  const normalized = {
    id: String(row.id ?? ""),
    title: String(row.title ?? "").trim(),
    document_date: resolveSwmsDocumentDate(row),
    file_url: documentUrl,
    doc_url: row.doc_url ? String(row.doc_url).trim() : null,
    is_archived: resolveSwmsIsArchived(row),
    status: resolveSwmsDocumentStatus(row),
    project_id: row.project_id ? String(row.project_id) : null,
    swms_scope: resolveSwmsScope(row),
    version: resolveSwmsVersion(row),
    master_swms_id: row.master_swms_id ? String(row.master_swms_id) : null,
    previous_version_id: row.previous_version_id
      ? String(row.previous_version_id)
      : null,
    created_at: row.created_at,
    updated_at: row.updated_at,
  };
  return normalized;
}

function sortSwmsDocumentRecords(docs: SwmsDocumentRecord[]): SwmsDocumentRecord[] {
  return [...docs].sort((left, right) => {
    const dateCompare = right.document_date.localeCompare(left.document_date);
    if (dateCompare !== 0) return dateCompare;
    return (right.created_at ?? "").localeCompare(left.created_at ?? "");
  });
}

function buildSwmsInsertPayload(input: {
  title: string;
  documentDate?: string | null;
  uploadedUrl: string;
  projectId?: string | null;
  swmsScope?: SwmsScope;
  version?: string;
  masterSwmsId?: string | null;
  previousVersionId?: string | null;
}): Record<string, string | boolean> {
  const selectedDate = resolveSwmsSelectedDate(input.documentDate);
  const projectId = nullIfBlank(input.projectId);
  const scope = input.swmsScope ?? (projectId ? "site_specific" : "company");
  const payload: Record<string, string | boolean> = {
    title: nullIfBlank(input.title) ?? "Untitled SWMS",
    document_date: selectedDate,
    issue_date: selectedDate,
    date: selectedDate,
    doc_url: input.uploadedUrl,
    file_url: input.uploadedUrl,
    is_archived: false,
    status: "Active",
    swms_scope: scope,
    version: nullIfBlank(input.version) ?? "1.0",
  };

  const masterSwmsId = nullIfBlank(input.masterSwmsId);
  const previousVersionId = nullIfBlank(input.previousVersionId);

  if (projectId) {
    payload.project_id = projectId;
  }
  if (masterSwmsId) {
    payload.master_swms_id = masterSwmsId;
  }
  if (previousVersionId) {
    payload.previous_version_id = previousVersionId;
  }

  return payload;
}

const SWMS_OPTIONAL_INSERT_COLUMNS = [
  "doc_url",
  "issue_date",
  "date",
  "is_archived",
  "status",
  "project_id",
  "swms_scope",
  "version",
  "master_swms_id",
  "previous_version_id",
] as const;

async function insertSwmsRow(
  table: SwmsDocumentTable,
  payload: Record<string, string | boolean>
): Promise<{ data: RawSwmsDocumentRecord | null; error: string | null }> {
  let currentPayload: Record<string, string | boolean> = { ...payload };

  for (let attempt = 0; attempt <= SWMS_OPTIONAL_INSERT_COLUMNS.length; attempt++) {
    const { data, error } = await supabase
      .from(table)
      .insert([currentPayload])
      .select("*")
      .single();

    if (!error) {
      return { data: (data as RawSwmsDocumentRecord | null) ?? null, error: null };
    }

    const missingColumn = SWMS_OPTIONAL_INSERT_COLUMNS.find(
      (column) =>
        column in currentPayload && isMissingSwmsColumnError(error.message, column)
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    return { data: null, error: error.message };
  }

  return { data: null, error: "Failed to insert SWMS record." };
}

export function isValidSwmsId(id: string | null | undefined): id is string {
  const trimmed = id?.trim();
  return Boolean(trimmed && isProjectUuid(trimmed));
}

export function resolveSwmsTargetId(
  item:
    | {
        id?: string | null;
        swms_id?: string | null;
        doc_id?: string | null;
        _id?: string | null;
        swmsId?: string | null;
      }
    | Record<string, unknown>
    | null
    | undefined
): string {
  if (!item) return "";
  const record = item as Record<string, unknown>;
  return String(
    record?.id ||
      record?.swms_id ||
      record?.doc_id ||
      record?._id ||
      record?.swmsId ||
      ""
  ).trim();
}

function createSwmsRecordId(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID();
  }
  return `${Date.now()}-0000-4000-8000-${Math.random().toString(16).slice(2, 14)}`;
}

async function fetchSwmsRecordsFromTable(
  table: SwmsDocumentTable
): Promise<{
  rows: SwmsDocumentRecord[];
  error: string | null;
  missingTable: boolean;
}> {
  if (!isSupabaseConfigured()) {
    return { rows: [], error: null, missingTable: false };
  }

  const { data, error } = await supabase.from(table).select("*");

  if (error) {
    const missingTable = isMissingSwmsTableError(error.message, table);
    if (!missingTable) {
      console.error(`fetchSwmsRecordsFromTable(${table}) failed:`, error.message);
    }
    return { rows: [], error: error.message, missingTable };
  }

  return {
    rows: sortSwmsDocumentRecords(
      (data ?? []).map((row) =>
        normalizeSwmsDocumentRecord(row as RawSwmsDocumentRecord)
      )
    ),
    error: null,
    missingTable: false,
  };
}

export async function fetchSwmsDocumentRecords(): Promise<SwmsDocumentRecord[]> {
  try {
    const primary = await fetchSwmsRecordsFromTable("swms_documents");
    const fallback = await fetchSwmsRecordsFromTable("swms");

    const byId = new Map<string, SwmsDocumentRecord>();

    if (!fallback.missingTable) {
      for (const row of fallback.rows) {
        byId.set(row.id, row);
      }
    }

    if (!primary.missingTable) {
      for (const row of primary.rows) {
        byId.set(row.id, row);
      }
    }

    return sortSwmsDocumentRecords(Array.from(byId.values()));
  } catch (error) {
    console.error(
      "fetchSwmsDocumentRecords failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function fetchSwmsDocumentRecordsByIds(
  ids: string[]
): Promise<Map<string, SwmsDocumentRecord>> {
  const map = new Map<string, SwmsDocumentRecord>();
  if (!ids.length || !isSupabaseConfigured()) return map;

  try {
    const uniqueIds = Array.from(new Set(ids.filter(Boolean)));

    const { data: primaryDocs, error: primaryError } = await supabase
      .from("swms_documents")
      .select("*")
      .in("id", uniqueIds);

    if (!primaryError) {
      for (const row of primaryDocs ?? []) {
        const doc = normalizeSwmsDocumentRecord(row as RawSwmsDocumentRecord);
        map.set(doc.id, doc);
      }
    } else if (!isMissingSwmsTableError(primaryError.message, "swms_documents")) {
      console.error(
        "fetchSwmsDocumentRecordsByIds swms_documents failed:",
        primaryError.message
      );
    }

    const missingIds = uniqueIds.filter((id) => !map.has(id));
    if (missingIds.length === 0) return map;

    const { data: fallbackDocs, error: fallbackError } = await supabase
      .from("swms")
      .select("*")
      .in("id", missingIds);

    if (!fallbackError) {
      for (const row of fallbackDocs ?? []) {
        const doc = normalizeSwmsDocumentRecord(row as RawSwmsDocumentRecord);
        map.set(doc.id, doc);
      }
    } else if (!isMissingSwmsTableError(fallbackError.message, "swms")) {
      console.error("fetchSwmsDocumentRecordsByIds swms failed:", fallbackError.message);
    }

    return map;
  } catch (error) {
    console.error(
      "fetchSwmsDocumentRecordsByIds failed:",
      error instanceof Error ? error.message : error
    );
    return map;
  }
}

export async function insertSwmsDocumentRecord(input: {
  title: string;
  documentDate?: string | null;
  uploadedUrl: string;
  projectId?: string | null;
  swmsScope?: SwmsScope;
  version?: string;
  masterSwmsId?: string | null;
  previousVersionId?: string | null;
}): Promise<{ doc: SwmsDocumentRecord | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { doc: null, error: "Supabase is not configured." };
  }

  try {
    const payload = buildSwmsInsertPayload(input);
    const generatedId = createSwmsRecordId();
    const primaryPayload = { id: generatedId, ...payload };

    const { data: primaryRow, error: primaryError } = await insertSwmsRow(
      "swms",
      primaryPayload
    );

    if (primaryError && !isMissingSwmsTableError(primaryError, "swms")) {
      return { doc: null, error: primaryError };
    }

    const swmsId = isValidSwmsId(primaryRow?.id)
      ? primaryRow.id.trim()
      : generatedId;

    if (isMissingSwmsTableError(primaryError ?? "", "swms")) {
      const { data: documentsOnlyRow, error: documentsOnlyError } =
        await insertSwmsRow("swms_documents", { id: swmsId, ...payload });

      if (documentsOnlyError || !documentsOnlyRow) {
        return {
          doc: null,
          error:
            documentsOnlyError ??
            "Failed to create SWMS document in swms_documents.",
        };
      }

      if (!isValidSwmsId(documentsOnlyRow.id)) {
        return {
          doc: null,
          error: "SWMS document insert did not return a valid UUID.",
        };
      }

      return {
        doc: normalizeSwmsDocumentRecord(documentsOnlyRow),
        error: null,
      };
    }

    if (!isValidSwmsId(swmsId)) {
      return {
        doc: null,
        error: "SWMS document insert did not return a valid UUID.",
      };
    }

    const mirrorPayload = { id: swmsId, ...payload };
    const { data: mirrorRow, error: mirrorError } = await insertSwmsRow(
      "swms_documents",
      mirrorPayload
    );

    if (mirrorError && !isMissingSwmsTableError(mirrorError, "swms_documents")) {
      console.error(
        "insertSwmsDocumentRecord mirror to swms_documents failed:",
        mirrorError
      );
      return {
        doc: null,
        error: `SWMS saved to swms but failed to mirror into swms_documents: ${mirrorError}`,
      };
    }

    const resolvedRow =
      mirrorRow ??
      primaryRow ??
      ({
        id: swmsId,
        ...payload,
      } as RawSwmsDocumentRecord);

    return {
      doc: normalizeSwmsDocumentRecord(resolvedRow),
      error: null,
    };
  } catch (error) {
    console.error(
      "insertSwmsDocumentRecord failed:",
      error instanceof Error ? error.message : error
    );
    return {
      doc: null,
      error: error instanceof Error ? error.message : "Failed to create SWMS document.",
    };
  }
}

export type SwmsAssigneeType = "worker" | "subcontractor";
export type SwmsAssignmentStatus = "Pending" | "Signed";

export interface SwmsAssignmentRecord {
  id: string;
  swms_id: string;
  assignee_type: SwmsAssigneeType;
  assignee_id: string;
  worker_id?: string | null;
  assignee_name: string;
  signing_token: string;
  status: SwmsAssignmentStatus;
  signature_url: string | null;
  signed_at: string | null;
  created_at?: string;
}

type RawSwmsAssignmentRecord = Record<string, unknown> & {
  id?: string;
  swms_id?: string;
  assignee_type?: string | null;
  assignee_id?: string | null;
  worker_id?: string | null;
  assignee_name?: string | null;
  worker_name?: string | null;
  subcontractor_name?: string | null;
  name?: string | null;
  signing_token?: string | null;
  token?: string | null;
  signature_token?: string | null;
  status?: string | null;
  signature_url?: string | null;
  signed_at?: string | null;
  created_at?: string;
};

/** Safe assignee name across legacy column aliases. */
export function resolveSwmsAssigneeName(
  assignment:
    | {
        assignee_name?: string | null;
        worker_name?: string | null;
        subcontractor_name?: string | null;
        name?: string | null;
      }
    | null
    | undefined
): string {
  if (!assignment) return "";
  return String(
    assignment.assignee_name ||
      assignment.worker_name ||
      assignment.subcontractor_name ||
      assignment.name ||
      ""
  ).trim();
}

/** Safe signing token across legacy column aliases. */
export function resolveSwmsSigningToken(
  assignment:
    | {
        signing_token?: string | null;
        token?: string | null;
        signature_token?: string | null;
      }
    | null
    | undefined
): string {
  if (!assignment) return "";
  return String(
    assignment.signing_token ||
      assignment.token ||
      assignment.signature_token ||
      ""
  ).trim();
}

export function createSwmsSigningToken(): string {
  if (typeof crypto !== "undefined" && crypto.randomUUID) {
    return crypto.randomUUID().replace(/-/g, "");
  }
  return `${Date.now()}-${Math.random().toString(36).slice(2, 12)}`;
}

export function getSwmsSigningUrl(
  tokenOrAssignment:
    | string
    | {
        signing_token?: string | null;
        token?: string | null;
        signature_token?: string | null;
      }
    | null
    | undefined
): string {
  const token =
    typeof tokenOrAssignment === "string"
      ? tokenOrAssignment.trim()
      : resolveSwmsSigningToken(tokenOrAssignment);
  if (!token) return "";

  const base =
    process.env.NEXT_PUBLIC_APP_URL ||
    (typeof window !== "undefined" ? window.location.origin : "");
  return `${base}/swms/sign/${token}`;
}

function normalizeSwmsAssignmentRecord(
  row: RawSwmsAssignmentRecord
): SwmsAssignmentRecord {
  const assigneeName = resolveSwmsAssigneeName(row);
  const signingToken = resolveSwmsSigningToken(row);
  return {
    id: String(row.id ?? ""),
    swms_id: String(row.swms_id ?? ""),
    assignee_type:
      row.assignee_type === "subcontractor" ? "subcontractor" : "worker",
    assignee_id: String(row.assignee_id ?? ""),
    worker_id: row.worker_id ? String(row.worker_id) : null,
    assignee_name: assigneeName,
    signing_token: signingToken,
    status: row.status === "Signed" ? "Signed" : "Pending",
    signature_url: row.signature_url ? String(row.signature_url) : null,
    signed_at: row.signed_at ? String(row.signed_at) : null,
    created_at: row.created_at,
  };
}

function buildSwmsAssignmentInsertPayload(input: {
  swmsId: string;
  assigneeType: SwmsAssigneeType;
  assigneeId: string;
  fullName: string;
  signingToken: string;
}): Record<string, string> {
  const name = input.fullName.trim();
  const tokenVal = input.signingToken.trim();
  const payload: Record<string, string> = {
    swms_id: input.swmsId,
    assignee_type: input.assigneeType,
    assignee_id: input.assigneeId,
    assignee_name: name,
    worker_name: name,
    subcontractor_name: name,
    name,
    signing_token: tokenVal,
    token: tokenVal,
    signature_token: tokenVal,
    status: "Pending",
  };

  if (input.assigneeType === "worker") {
    payload.worker_id = input.assigneeId;
  }

  return payload;
}

const SWMS_OPTIONAL_ASSIGNMENT_COLUMNS = [
  "worker_name",
  "subcontractor_name",
  "name",
  "token",
  "signature_token",
  "worker_id",
] as const;

function buildSwmsTokenOrFilter(token: string): string {
  return `signing_token.eq.${token},token.eq.${token},signature_token.eq.${token}`;
}

function isMissingSwmsTokenColumnError(message: string): boolean {
  return (
    isMissingSwmsColumnError(message, "token") ||
    isMissingSwmsColumnError(message, "signature_token")
  );
}

async function insertSwmsAssignmentRows(
  rows: Array<Record<string, string>>
): Promise<{ error: string | null }> {
  if (!rows.length) return { error: null };
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  let currentRows = rows.map((row) => ({ ...row }));

  for (
    let attempt = 0;
    attempt <= SWMS_OPTIONAL_ASSIGNMENT_COLUMNS.length;
    attempt++
  ) {
    const { error } = await supabase.from("swms_assignments").insert(currentRows);
    if (!error) return { error: null };

    const missingColumn = SWMS_OPTIONAL_ASSIGNMENT_COLUMNS.find(
      (column) =>
        currentRows.some((row) => column in row) &&
        isMissingSwmsColumnError(error.message, column)
    );

    if (missingColumn) {
      currentRows = currentRows.map((row) => {
        if (!(missingColumn in row)) return row;
        const { [missingColumn]: _removed, ...rest } = row;
        return rest;
      });
      continue;
    }

    return { error: error.message };
  }

  return { error: "Failed to insert SWMS assignments." };
}

export async function insertSwmsAssignmentRecords(input: {
  swmsId: string;
  workerAssignments: Array<{ id: string; name: string; signingToken: string }>;
  subcontractorAssignments: Array<{ id: string; name: string; signingToken: string }>;
}): Promise<{ error: string | null }> {
  if (!isValidSwmsId(input.swmsId)) {
    return {
      error:
        "A valid SWMS document id is required before creating assignments.",
    };
  }

  try {
    const swmsId = input.swmsId.trim();
    const rows = [
      ...input.workerAssignments.map((worker) =>
        buildSwmsAssignmentInsertPayload({
          swmsId,
          assigneeType: "worker",
          assigneeId: worker.id,
          fullName: worker.name,
          signingToken: worker.signingToken,
        })
      ),
      ...input.subcontractorAssignments.map((subcontractor) =>
        buildSwmsAssignmentInsertPayload({
          swmsId,
          assigneeType: "subcontractor",
          assigneeId: subcontractor.id,
          fullName: subcontractor.name,
          signingToken: subcontractor.signingToken,
        })
      ),
    ];

    return await insertSwmsAssignmentRows(rows);
  } catch (error) {
    console.error(
      "insertSwmsAssignmentRecords failed:",
      error instanceof Error ? error.message : error
    );
    return {
      error:
        error instanceof Error ? error.message : "Failed to insert SWMS assignments.",
    };
  }
}

export async function fetchSwmsAssignmentRecords(): Promise<SwmsAssignmentRecord[]> {
  if (!isSupabaseConfigured()) return [];

  try {
    const { data, error } = await supabase.from("swms_assignments").select("*");

    if (error) {
      console.error("fetchSwmsAssignmentRecords failed:", error.message);
      return [];
    }

    return (data ?? []).map((row) =>
      normalizeSwmsAssignmentRecord(row as RawSwmsAssignmentRecord)
    );
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentRecords failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

function matchesWorkerSwmsAssignment(
  row: SwmsAssignmentRecord,
  workerId: string
): boolean {
  if (row.assignee_type === "subcontractor") return false;
  return row.assignee_id === workerId || row.worker_id === workerId;
}

export async function fetchSwmsAssignmentRecordsForWorker(
  workerId: string
): Promise<SwmsAssignmentRecord[]> {
  if (!isSupabaseConfigured()) return [];

  const trimmedWorkerId = workerId.trim();
  if (!trimmedWorkerId) return [];

  try {
    let { data, error } = await supabase
      .from("swms_assignments")
      .select("*")
      .or(`assignee_id.eq.${trimmedWorkerId},worker_id.eq.${trimmedWorkerId}`)
      .order("created_at", { ascending: false });

    if (error && isMissingSwmsColumnError(error.message, "worker_id")) {
      ({ data, error } = await supabase
        .from("swms_assignments")
        .select("*")
        .eq("assignee_type", "worker")
        .eq("assignee_id", trimmedWorkerId)
        .order("created_at", { ascending: false }));
    }

    if (error) {
      console.error("fetchSwmsAssignmentRecordsForWorker failed:", error.message);
      return [];
    }

    return (data ?? [])
      .map((row) => normalizeSwmsAssignmentRecord(row as RawSwmsAssignmentRecord))
      .filter((row) => matchesWorkerSwmsAssignment(row, trimmedWorkerId));
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentRecordsForWorker failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function fetchSwmsAssignmentRecordsForSwms(
  swmsId: string
): Promise<SwmsAssignmentRecord[]> {
  if (!isSupabaseConfigured() || !isValidSwmsId(swmsId)) return [];

  try {
    const { data, error } = await supabase
      .from("swms_assignments")
      .select("*")
      .eq("swms_id", swmsId.trim())
      .order("created_at", { ascending: true });

    if (error) {
      console.error("fetchSwmsAssignmentRecordsForSwms failed:", error.message);
      return [];
    }

    return (data ?? []).map((row) =>
      normalizeSwmsAssignmentRecord(row as RawSwmsAssignmentRecord)
    );
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentRecordsForSwms failed:",
      error instanceof Error ? error.message : error
    );
    return [];
  }
}

export async function updateSwmsDocumentFields(
  id: string,
  fields: {
    title?: string;
    documentDate?: string | null;
    uploadedUrl?: string;
  }
): Promise<{ error: string | null }> {
  if (!isValidSwmsId(id)) {
    return { error: "A valid SWMS document id is required." };
  }
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const payload: Record<string, string> = {
    updated_at: new Date().toISOString(),
  };

  if (fields.title !== undefined) {
    payload.title = fields.title.trim();
  }
  if (fields.documentDate !== undefined) {
    const selectedDate = resolveSwmsSelectedDate(fields.documentDate);
    payload.document_date = selectedDate;
    payload.issue_date = selectedDate;
    payload.date = selectedDate;
  }
  if (fields.uploadedUrl !== undefined) {
    payload.doc_url = fields.uploadedUrl;
    payload.file_url = fields.uploadedUrl;
  }

  const tables: SwmsDocumentTable[] = ["swms_documents", "swms"];
  let updatedAny = false;
  let lastError: string | null = null;

  for (const table of tables) {
    const result = await updateSwmsDocumentInTable(table, id.trim(), payload);
    if (result.updated) updatedAny = true;
    if (result.error && !result.skipped) lastError = result.error;
  }

  if (!updatedAny && lastError) {
    return { error: lastError };
  }

  return { error: null };
}

export async function resetSwmsAssignmentRecord(input: {
  assignmentId: string;
  signingToken?: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const assignmentId = input.assignmentId.trim();
  if (!assignmentId) {
    return { error: "Assignment id is required." };
  }

  const token = (input.signingToken ?? createSwmsSigningToken()).trim();
  const updatePayload: Record<string, string | null> = {
    status: "Pending",
    signature_url: null,
    signed_at: null,
    signing_token: token,
    token,
    signature_token: token,
  };

  let { error } = await supabase
    .from("swms_assignments")
    .update(updatePayload)
    .eq("id", assignmentId);

  if (error && isMissingSwmsColumnError(error.message, "token")) {
    ({ error } = await supabase
      .from("swms_assignments")
      .update({
        status: "Pending",
        signature_url: null,
        signed_at: null,
        signing_token: token,
      })
      .eq("id", assignmentId));
  }

  return { error: error?.message ?? null };
}

export async function fetchSwmsAssignmentRecordByToken(
  token: string
): Promise<SwmsAssignmentRecord | null> {
  if (!isSupabaseConfigured() || !token.trim()) return null;

  const trimmedToken = token.trim();

  try {
    let { data, error } = await supabase
      .from("swms_assignments")
      .select("*")
      .or(buildSwmsTokenOrFilter(trimmedToken))
      .maybeSingle();

    if (error && isMissingSwmsTokenColumnError(error.message)) {
      ({ data, error } = await supabase
        .from("swms_assignments")
        .select("*")
        .eq("signing_token", trimmedToken)
        .maybeSingle());
    }

    if (error || !data) {
      if (error) console.error("fetchSwmsAssignmentRecordByToken failed:", error.message);
      return null;
    }

    return normalizeSwmsAssignmentRecord(data as RawSwmsAssignmentRecord);
  } catch (error) {
    console.error(
      "fetchSwmsAssignmentRecordByToken failed:",
      error instanceof Error ? error.message : error
    );
    return null;
  }
}

export async function signSwmsAssignmentRecord(input: {
  token: string;
  signatureUrl: string;
}): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const trimmedToken = input.token.trim();
  if (!trimmedToken) {
    return { error: "Signing token is required." };
  }

  const updatePayload = {
    status: "Signed",
    signature_url: input.signatureUrl,
    signed_at: new Date().toISOString(),
  };

  let { error } = await supabase
    .from("swms_assignments")
    .update(updatePayload)
    .or(buildSwmsTokenOrFilter(trimmedToken))
    .eq("status", "Pending");

  if (error && isMissingSwmsTokenColumnError(error.message)) {
    ({ error } = await supabase
      .from("swms_assignments")
      .update(updatePayload)
      .eq("signing_token", trimmedToken)
      .eq("status", "Pending"));
  }

  return { error: error?.message ?? null };
}

const SWMS_OPTIONAL_ARCHIVE_COLUMNS = ["is_archived", "status"] as const;

async function updateSwmsRowWithPayload(
  table: SwmsDocumentTable,
  column: "id" | "swms_id",
  targetId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; skipped: boolean; updated: boolean }> {
  let currentPayload: Record<string, unknown> = { ...payload };

  for (
    let attempt = 0;
    attempt <= SWMS_OPTIONAL_ARCHIVE_COLUMNS.length;
    attempt++
  ) {
    if (
      !("is_archived" in currentPayload) &&
      !("status" in currentPayload) &&
      attempt > 0
    ) {
      return {
        error:
          "Archive columns are unavailable. Run migration 031_swms_archive.sql in Supabase.",
        skipped: false,
        updated: false,
      };
    }

    const { data, error } = await supabase
      .from(table)
      .update(currentPayload)
      .eq(column, targetId)
      .select("id");

    if (!error) {
      const updated = Array.isArray(data) && data.length > 0;
      return { error: null, skipped: false, updated };
    }

    if (isMissingSwmsTableError(error.message, table)) {
      return { error: null, skipped: true, updated: false };
    }

    if (
      column === "swms_id" &&
      isMissingSwmsColumnError(error.message, "swms_id")
    ) {
      return { error: null, skipped: false, updated: false };
    }

    const missingColumn = SWMS_OPTIONAL_ARCHIVE_COLUMNS.find(
      (field) =>
        field in currentPayload && isMissingSwmsColumnError(error.message, field)
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    return { error: error.message, skipped: false, updated: false };
  }

  return { error: null, skipped: false, updated: false };
}

async function updateSwmsDocumentInTable(
  table: SwmsDocumentTable,
  id: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; skipped: boolean; updated: boolean }> {
  return updateSwmsRowWithPayload(table, "id", id, payload);
}

async function updateSwmsDocumentsByTargetId(
  targetId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; skipped: boolean; updated: boolean }> {
  const byId = await updateSwmsRowWithPayload(
    "swms_documents",
    "id",
    targetId,
    payload
  );

  if (byId.updated) {
    return byId;
  }

  if (byId.error && !byId.skipped) {
    return byId;
  }

  const bySwmsId = await updateSwmsRowWithPayload(
    "swms_documents",
    "swms_id",
    targetId,
    payload
  );

  if (bySwmsId.updated) {
    return bySwmsId;
  }

  return {
    error: bySwmsId.error ?? byId.error,
    skipped: byId.skipped && bySwmsId.skipped,
    updated: false,
  };
}

async function updateSwmsByTitle(
  title: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; updated: boolean; resolvedId: string | null }> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || !isSupabaseConfigured()) {
    return { error: null, updated: false, resolvedId: null };
  }

  let currentPayload: Record<string, unknown> = { ...payload };

  for (
    let attempt = 0;
    attempt <= SWMS_OPTIONAL_ARCHIVE_COLUMNS.length;
    attempt++
  ) {
    const { data, error } = await supabase
      .from("swms")
      .update(currentPayload)
      .eq("title", trimmedTitle)
      .select("id");

    if (!error) {
      const updated = Array.isArray(data) && data.length > 0;
      const resolvedId =
        updated && data[0]?.id ? String((data[0] as { id: string }).id) : null;
      return { error: null, updated, resolvedId };
    }

    if (isMissingSwmsTableError(error.message, "swms")) {
      return { error: null, updated: false, resolvedId: null };
    }

    const missingColumn = SWMS_OPTIONAL_ARCHIVE_COLUMNS.find(
      (field) =>
        field in currentPayload && isMissingSwmsColumnError(error.message, field)
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    return { error: error.message, updated: false, resolvedId: null };
  }

  return { error: null, updated: false, resolvedId: null };
}

async function updateSwmsDocumentsByTitle(
  title: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; updated: boolean; resolvedId: string | null }> {
  const trimmedTitle = title.trim();
  if (!trimmedTitle || !isSupabaseConfigured()) {
    return { error: null, updated: false, resolvedId: null };
  }

  let currentPayload: Record<string, unknown> = { ...payload };

  for (
    let attempt = 0;
    attempt <= SWMS_OPTIONAL_ARCHIVE_COLUMNS.length;
    attempt++
  ) {
    const { data, error } = await supabase
      .from("swms_documents")
      .update(currentPayload)
      .eq("title", trimmedTitle)
      .select("id");

    if (!error) {
      const updated = Array.isArray(data) && data.length > 0;
      const resolvedId =
        updated && data[0]?.id ? String((data[0] as { id: string }).id) : null;
      return { error: null, updated, resolvedId };
    }

    if (isMissingSwmsTableError(error.message, "swms_documents")) {
      return { error: null, updated: false, resolvedId: null };
    }

    const missingColumn = SWMS_OPTIONAL_ARCHIVE_COLUMNS.find(
      (field) =>
        field in currentPayload && isMissingSwmsColumnError(error.message, field)
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    return { error: error.message, updated: false, resolvedId: null };
  }

  return { error: null, updated: false, resolvedId: null };
}

async function updateSwmsAssignmentsBySwmsId(
  swmsId: string,
  payload: Record<string, unknown>
): Promise<{ error: string | null; updated: boolean }> {
  if (!swmsId || !isSupabaseConfigured()) {
    return { error: null, updated: false };
  }

  let currentPayload: Record<string, unknown> = { ...payload };

  for (
    let attempt = 0;
    attempt <= SWMS_OPTIONAL_ARCHIVE_COLUMNS.length;
    attempt++
  ) {
    const { data, error } = await supabase
      .from("swms_assignments")
      .update(currentPayload)
      .eq("swms_id", swmsId)
      .select("id");

    if (!error) {
      return {
        error: null,
        updated: Array.isArray(data) && data.length > 0,
      };
    }

    const missingColumn = SWMS_OPTIONAL_ARCHIVE_COLUMNS.find(
      (field) =>
        field in currentPayload && isMissingSwmsColumnError(error.message, field)
    );

    if (missingColumn) {
      const { [missingColumn]: _removed, ...rest } = currentPayload;
      currentPayload = rest;
      continue;
    }

    console.warn("updateSwmsAssignmentsBySwmsId failed:", error.message);
    return { error: error.message, updated: false };
  }

  return { error: null, updated: false };
}

async function runSwmsArchiveUpdatesById(
  swmsId: string,
  payload: Record<string, unknown>
): Promise<boolean> {
  const swmsResult = await updateSwmsDocumentInTable("swms", swmsId, payload);
  const documentsResult = await updateSwmsDocumentsByTargetId(swmsId, payload);
  const assignmentsResult = await updateSwmsAssignmentsBySwmsId(swmsId, payload);

  return swmsResult.updated || documentsResult.updated || assignmentsResult.updated;
}

async function upsertSwmsArchiveFallback(
  item: {
    title?: string | null;
    document_date?: string | null;
    issue_date?: string | null;
    date?: string | null;
    file_url?: string | null;
    doc_url?: string | null;
  },
  targetId: string,
  archived: boolean
): Promise<{ error: string | null; updated: boolean; resolvedId: string }> {
  const resolvedId = isValidSwmsId(targetId) ? targetId : createSwmsRecordId();
  const selectedDate = resolveSwmsDocumentDate(item) || resolveSwmsSelectedDate(null);
  const documentUrl = resolveSwmsDocumentUrl(item);
  const upsertPayload: Record<string, string | boolean> = {
    id: resolvedId,
    title: String(item.title || "SWMS Document").trim() || "SWMS Document",
    document_date: selectedDate,
    is_archived: archived,
    status: archived ? "Archived" : "Active",
    updated_at: new Date().toISOString(),
  };

  if (documentUrl) {
    upsertPayload.file_url = documentUrl;
    upsertPayload.doc_url = documentUrl;
  }

  const { data, error } = await supabase
    .from("swms")
    .upsert([upsertPayload], { onConflict: "id" })
    .select("id");

  if (error) {
    if (isMissingSwmsTableError(error.message, "swms")) {
      return { error: null, updated: false, resolvedId };
    }
    return { error: error.message, updated: false, resolvedId };
  }

  return {
    error: null,
    updated: Array.isArray(data) && data.length > 0,
    resolvedId,
  };
}

export async function updateSwmsDocumentArchiveState(
  item: {
    id?: string | null;
    swms_id?: string | null;
    doc_id?: string | null;
    _id?: string | null;
    swmsId?: string | null;
    title?: string | null;
    document_date?: string | null;
    issue_date?: string | null;
    date?: string | null;
    file_url?: string | null;
    doc_url?: string | null;
  },
  archived: boolean
): Promise<{ error: string | null }> {
  console.log("SWMS item passed to archive:", item);

  const swmsId = resolveSwmsTargetId(item);
  const payload = {
    is_archived: archived,
    status: archived ? "Archived" : "Active",
    updated_at: new Date().toISOString(),
  };

  if (!isSupabaseConfigured()) {
    console.warn("SWMS archive skipped: Supabase is not configured.");
    return { error: null };
  }

  try {
    let updatedAny = false;
    let activeId = swmsId;

    if (swmsId) {
      updatedAny = await runSwmsArchiveUpdatesById(swmsId, payload);
    }

    if (!updatedAny && item.title?.trim()) {
      const title = item.title.trim();
      const swmsByTitle = await updateSwmsByTitle(title, payload);
      const docsByTitle = await updateSwmsDocumentsByTitle(title, payload);

      updatedAny = swmsByTitle.updated || docsByTitle.updated;

      if (swmsByTitle.resolvedId) {
        activeId = swmsByTitle.resolvedId;
        await updateSwmsDocumentsByTargetId(activeId, payload);
        await updateSwmsAssignmentsBySwmsId(activeId, payload);
      } else if (docsByTitle.resolvedId) {
        activeId = docsByTitle.resolvedId;
        await runSwmsArchiveUpdatesById(activeId, payload);
      }
    }

    if (!updatedAny) {
      const upsertResult = await upsertSwmsArchiveFallback(
        item,
        activeId || swmsId,
        archived
      );

      if (upsertResult.updated) {
        updatedAny = true;
        activeId = upsertResult.resolvedId;
        await updateSwmsDocumentsByTargetId(activeId, payload);
        await updateSwmsAssignmentsBySwmsId(activeId, payload);
      } else if (upsertResult.error) {
        console.warn("SWMS archive upsert failed:", upsertResult.error);
      }
    }

    if (!updatedAny) {
      console.warn("SWMS archive: no matching rows updated; UI will refresh optimistically.", {
        swmsId,
        title: item.title,
      });
    }

    return { error: null };
  } catch (error) {
    console.warn(
      "updateSwmsDocumentArchiveState failed:",
      error instanceof Error ? error.message : error
    );
    return { error: null };
  }
}

export async function deleteSwmsDocumentCascade(
  id: string
): Promise<{ error: string | null }> {
  if (!isValidSwmsId(id)) {
    return { error: "A valid SWMS document id is required." };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  try {
    const { error: assignmentsError } = await supabase
      .from("swms_assignments")
      .delete()
      .eq("swms_id", id);

    if (assignmentsError) {
      return { error: assignmentsError.message };
    }

    const tables: SwmsDocumentTable[] = ["swms_documents", "swms"];
    for (const table of tables) {
      const { error } = await supabase.from(table).delete().eq("id", id);
      if (error && !isMissingSwmsTableError(error.message, table)) {
        return { error: error.message };
      }
    }

    return { error: null };
  } catch (error) {
    console.error(
      "deleteSwmsDocumentCascade failed:",
      error instanceof Error ? error.message : error
    );
    return {
      error: error instanceof Error ? error.message : "Failed to delete SWMS document.",
    };
  }
}

export {
  fetchServiceSchedules,
  logPlantServiceSchedule,
  createPlantServiceSchedule,
  updatePlantServiceSchedule,
  completePlantServiceSchedule,
  buildPlantServiceCreateInput,
  resolvePlantServiceDisplayName,
  resolveServicePlantId,
  isValidUuid,
  type PlantServiceSchedule,
  type PlantServiceStatus,
  type CreatePlantServiceScheduleInput,
  type UpdatePlantServiceScheduleInput,
} from "./plant-services";


