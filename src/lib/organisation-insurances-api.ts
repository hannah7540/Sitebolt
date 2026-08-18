import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_INSURANCE_REGIONS,
  normalizeInsuranceRegions,
  type InsuranceRegion,
} from "@/lib/insurance-utils";

export const PRIMARY_INSURANCE_TABLE = "organisation_insurances";
export const FALLBACK_INSURANCE_TABLE = "company_insurances";

export const INSURANCE_TABLES = [
  PRIMARY_INSURANCE_TABLE,
  FALLBACK_INSURANCE_TABLE,
] as const;

export type InsuranceTableName = (typeof INSURANCE_TABLES)[number];

export type CompanyInsuranceRow = Record<string, unknown>;

export interface CompanyInsuranceRecord {
  id: string;
  insurance_type: string;
  custom_type_name: string;
  policy_number: string;
  provider: string;
  all_states: boolean;
  states: InsuranceRegion[];
  start_date: string | null;
  date_obtained: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  notes: string;
  document_url: string | null;
  insurer: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

const VALID_REGIONS = new Set<string>(ALL_INSURANCE_REGIONS);

function asString(value: unknown): string {
  return typeof value === "string" ? value.trim() : String(value ?? "").trim();
}

function asNullableString(value: unknown): string | null {
  const trimmed = asString(value);
  return trimmed ? trimmed : null;
}

export function cleanInsuranceDate(value: unknown): string | null {
  if (value && typeof value === "string" && value.trim() !== "") {
    return value.trim().split("T")[0] ?? null;
  }
  return null;
}

export function isMissingInsuranceTableError(message: string, table?: string): boolean {
  const lower = message.toLowerCase();
  if (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find the table")
  ) {
    return table ? lower.includes(table.toLowerCase()) : true;
  }
  return false;
}

export function isMissingInsuranceColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") || lower.includes("schema cache"))
  );
}

function readStates(record: CompanyInsuranceRow): InsuranceRegion[] {
  const raw = Array.isArray(record.states)
    ? record.states
    : Array.isArray(record.regions)
      ? record.regions
      : Array.isArray(record.coverage_states)
        ? record.coverage_states
        : [];
  return normalizeInsuranceRegions(raw.map((value) => String(value)));
}

function readStartDate(record: CompanyInsuranceRow): string | null {
  return (
    cleanInsuranceDate(record.start_date) ??
    cleanInsuranceDate(record.date_obtained) ??
    cleanInsuranceDate(record.effective_date)
  );
}

function readExpiryDate(record: CompanyInsuranceRow): string | null {
  return (
    cleanInsuranceDate(record.expiry_date) ??
    cleanInsuranceDate(record.end_date) ??
    cleanInsuranceDate(record.expiration_date)
  );
}

function readFileUrl(record: CompanyInsuranceRow): string | null {
  return (
    asNullableString(record.file_url) ??
    asNullableString(record.document_url) ??
    asNullableString(record.attachment_url) ??
    asNullableString(record.url) ??
    asNullableString(record.doc_url)
  );
}

function readFileName(record: CompanyInsuranceRow): string | null {
  return (
    asNullableString(record.file_name) ?? asNullableString(record.document_name)
  );
}

function coversAllRegions(states: InsuranceRegion[], allFlag: boolean): boolean {
  if (allFlag) return true;
  return ALL_INSURANCE_REGIONS.every((region) => states.includes(region));
}

export function mapCompanyInsuranceResponse(
  record: CompanyInsuranceRow
): CompanyInsuranceRecord {
  const states = readStates(record);
  const allStates = coversAllRegions(
    states,
    Boolean(record.all_states || record.all_regions)
  );
  const provider =
    asString(record.provider) ||
    asString(record.insurer);
  const fileUrl = readFileUrl(record);

  return {
    id: String(record.id ?? ""),
    insurance_type:
      asString(record.insurance_type) ||
      asString(record.type) ||
      "Public Liability Insurance",
    custom_type_name:
      asString(record.custom_type_name) || asString(record.custom_name),
    policy_number:
      asString(record.policy_number) || asString(record.policy_no),
    provider,
    all_states: allStates,
    states: allStates ? [...ALL_INSURANCE_REGIONS] : states,
    start_date: readStartDate(record),
    date_obtained: readStartDate(record),
    expiry_date: readExpiryDate(record),
    file_url: fileUrl,
    file_name: readFileName(record),
    notes: asString(record.notes),
    document_url: fileUrl,
    insurer: provider || null,
    created_at: (record.created_at as string | null | undefined) ?? null,
    updated_at: (record.updated_at as string | null | undefined) ?? null,
  };
}

export function buildRecordPayload(
  body: Record<string, unknown>
): Record<string, unknown> {
  const cleanDate = cleanInsuranceDate;
  const sDate = cleanDate(body.start_date ?? body.date_obtained ?? body.effective_date);
  const eDate = cleanDate(body.expiry_date ?? body.end_date ?? body.expiration_date);
  const fUrl =
    asNullableString(body.file_url) ??
    asNullableString(body.document_url) ??
    asNullableString(body.attachment_url) ??
    asNullableString(body.url) ??
    asNullableString(body.doc_url);
  const fName =
    asNullableString(body.file_name) ?? asNullableString(body.document_name);
  const rawStates = Array.isArray(body.states)
    ? body.states
    : body.states
      ? [body.states]
      : Array.isArray(body.regions)
        ? body.regions
        : [];
  const validStates = rawStates
    .map((state) => String(state).trim().toUpperCase())
    .filter((state): state is InsuranceRegion => VALID_REGIONS.has(state));
  const allStates = Boolean(body.all_states ?? body.all_regions);
  const resolvedStates = allStates ? [...ALL_INSURANCE_REGIONS] : validStates;
  const insuranceType =
    asString(body.insurance_type) ||
    asString(body.type) ||
    "Public Liability Insurance";
  const provider =
    asString(body.provider) || asString(body.insurer);

  return {
    insurance_type: insuranceType,
    type: insuranceType,
    custom_type_name: asNullableString(body.custom_type_name ?? body.custom_name),
    custom_name: asNullableString(body.custom_type_name ?? body.custom_name),
    policy_number: asString(body.policy_number ?? body.policy_no),
    policy_no: asString(body.policy_number ?? body.policy_no),
    provider,
    insurer: provider,
    all_states: allStates,
    all_regions: allStates,
    states: resolvedStates,
    regions: resolvedStates,
    coverage_states: resolvedStates,
    start_date: sDate,
    date_obtained: sDate,
    effective_date: sDate,
    expiry_date: eDate,
    end_date: eDate,
    expiration_date: eDate,
    file_url: fUrl,
    document_url: fUrl,
    attachment_url: fUrl,
    url: fUrl,
    doc_url: fUrl,
    file_name: fName,
    document_name: fName,
    notes: asNullableString(body.notes),
    updated_at: new Date().toISOString(),
  };
}

function buildStandardPayload(record: Record<string, unknown>): Record<string, unknown> {
  return {
    insurance_type: record.insurance_type,
    custom_type_name: record.custom_type_name,
    policy_number: record.policy_number || null,
    provider: record.provider || null,
    insurer: record.insurer || null,
    all_states: record.all_states,
    states: record.states,
    start_date: record.start_date,
    date_obtained: record.date_obtained,
    expiry_date: record.expiry_date,
    file_url: record.file_url,
    file_name: record.file_name,
    document_url: record.document_url,
    notes: record.notes,
    updated_at: record.updated_at,
  };
}

function buildLegacyPayload(record: Record<string, unknown>): Record<string, unknown> {
  return {
    insurance_type: record.insurance_type,
    policy_number: record.policy_number || null,
    insurer: record.provider || null,
    expiry_date: record.expiry_date,
    date_obtained: record.start_date,
    start_date: record.start_date,
    document_url: record.file_url,
    all_states: record.all_states,
    states: record.states,
    updated_at: record.updated_at,
  };
}

function buildMinimalPayload(record: Record<string, unknown>): Record<string, unknown> {
  return {
    insurance_type: record.insurance_type,
    policy_number: record.policy_number || null,
    expiry_date: record.expiry_date,
    document_url: record.file_url,
    updated_at: record.updated_at,
  };
}

function payloadVariants(
  record: Record<string, unknown>,
  table: InsuranceTableName
): Record<string, unknown>[] {
  if (table === PRIMARY_INSURANCE_TABLE) {
    return [
      record,
      buildStandardPayload(record),
      buildLegacyPayload(record),
      buildMinimalPayload(record),
    ];
  }
  return [
    buildStandardPayload(record),
    buildLegacyPayload(record),
    buildMinimalPayload(record),
  ];
}

async function queryTable(
  admin: SupabaseClient,
  table: InsuranceTableName
): Promise<{ data: CompanyInsuranceRow[]; error: string | null }> {
  const created = await admin
    .from(table)
    .select("*")
    .order("created_at", { ascending: false });

  if (!created.error) {
    return { data: (created.data ?? []) as CompanyInsuranceRow[], error: null };
  }

  if (isMissingInsuranceColumnError(created.error.message)) {
    const expiry = await admin
      .from(table)
      .select("*")
      .order("expiry_date", { ascending: true, nullsFirst: false });
    if (!expiry.error) {
      return { data: (expiry.data ?? []) as CompanyInsuranceRow[], error: null };
    }
    if (!isMissingInsuranceTableError(expiry.error.message, table)) {
      return { data: [], error: expiry.error.message };
    }
  }

  if (isMissingInsuranceTableError(created.error.message, table)) {
    return { data: [], error: created.error.message };
  }

  return { data: [], error: created.error.message };
}

export async function listInsuranceRecords(
  admin: SupabaseClient
): Promise<{ data: CompanyInsuranceRow[]; error: string | null }> {
  for (const table of INSURANCE_TABLES) {
    const result = await queryTable(admin, table);
    if (result.error && isMissingInsuranceTableError(result.error, table)) {
      continue;
    }
    if (result.error) {
      return { data: [], error: result.error };
    }
    return result;
  }
  return { data: [], error: null };
}

async function syncMirror(
  admin: SupabaseClient,
  mirrorTable: InsuranceTableName,
  id: string,
  record: Record<string, unknown>
): Promise<void> {
  for (const row of payloadVariants(record, mirrorTable)) {
    const mirrorResult = await admin
      .from(mirrorTable)
      .upsert([{ ...row, id }], { onConflict: "id" })
      .select("*")
      .maybeSingle();
    if (!mirrorResult.error) return;
    if (
      isMissingInsuranceTableError(mirrorResult.error.message, mirrorTable) ||
      isMissingInsuranceColumnError(mirrorResult.error.message)
    ) {
      continue;
    }
    console.warn(`Insurance mirror upsert to ${mirrorTable} failed:`, mirrorResult.error.message);
    return;
  }
}

export async function insertInsuranceRecords(
  admin: SupabaseClient,
  body: Record<string, unknown>
): Promise<{ data: CompanyInsuranceRow | null; error: string | null }> {
  const record = buildRecordPayload(body);
  let lastError: string | null = null;

  for (const table of INSURANCE_TABLES) {
    for (const row of payloadVariants(record, table)) {
      const result = await admin.from(table).insert([row]).select("*").single();
      if (!result.error && result.data) {
        const savedRow = result.data as CompanyInsuranceRow;
        const mirrorTable =
          table === PRIMARY_INSURANCE_TABLE
            ? FALLBACK_INSURANCE_TABLE
            : PRIMARY_INSURANCE_TABLE;
        await syncMirror(admin, mirrorTable, String(savedRow.id), record);
        return { data: savedRow, error: null };
      }

      if (result.error) {
        console.error("Insurance Save Error:", {
          table,
          keys: Object.keys(row),
          error: result.error.message,
        });
        if (isMissingInsuranceTableError(result.error.message, table)) {
          lastError = result.error.message;
          break;
        }
        if (isMissingInsuranceColumnError(result.error.message)) {
          lastError = result.error.message;
          continue;
        }
        lastError = result.error.message;
      }
    }
  }

  return { data: null, error: lastError ?? "Failed to save insurance policy." };
}

export async function updateInsuranceRecords(
  admin: SupabaseClient,
  id: string,
  body: Record<string, unknown>
): Promise<{ data: CompanyInsuranceRow | null; error: string | null }> {
  const record = buildRecordPayload(body);
  let savedRow: CompanyInsuranceRow | null = null;
  let lastError: string | null = null;

  for (const table of INSURANCE_TABLES) {
    for (const row of payloadVariants(record, table)) {
      const result = await admin
        .from(table)
        .update(row)
        .eq("id", id)
        .select("*")
        .maybeSingle();

      if (!result.error && result.data) {
        savedRow = result.data as CompanyInsuranceRow;
        lastError = null;
        break;
      }

      if (result.error) {
        console.error("Insurance Update Error:", {
          table,
          id,
          keys: Object.keys(row),
          error: result.error.message,
        });
        if (isMissingInsuranceTableError(result.error.message, table)) break;
        if (isMissingInsuranceColumnError(result.error.message)) {
          lastError = result.error.message;
          continue;
        }
        if (!result.error.message.toLowerCase().includes("0 rows")) {
          lastError = result.error.message;
        }
      }
    }
    if (savedRow) break;
  }

  if (!savedRow) {
    return { data: null, error: lastError ?? "Insurance policy not found." };
  }

  for (const table of INSURANCE_TABLES) {
    await syncMirror(admin, table, id, record);
  }

  return { data: savedRow, error: null };
}

export async function deleteInsuranceRecords(
  admin: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  let deleted = false;
  let lastError: string | null = null;

  for (const table of INSURANCE_TABLES) {
    const { error, count } = await admin
      .from(table)
      .delete({ count: "exact" })
      .eq("id", id);
    if (!error && (count ?? 0) > 0) deleted = true;
    if (error) {
      if (isMissingInsuranceTableError(error.message, table)) continue;
      lastError = error.message;
      console.error("Insurance Delete Error:", { table, id, error: error.message });
    }
  }

  return deleted ? { error: null } : { error: lastError ?? "Insurance policy not found." };
}

/** @deprecated Use buildRecordPayload */
export function sanitizeInsuranceSavePayload(body: Record<string, unknown>) {
  return buildRecordPayload(body);
}

export function resolveInsuranceDisplayType(record: CompanyInsuranceRecord): string {
  if (record.insurance_type === "Other Insurance" && record.custom_type_name.trim()) {
    return record.custom_type_name.trim();
  }
  return record.insurance_type;
}

export function formatInsuranceDisplayDate(value: string | null | undefined): string {
  const iso = cleanInsuranceDate(value);
  if (!iso) return "Not set";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "Not set";
  return `${day}/${month}/${year}`;
}

export function formatInsuranceDateRange(input: {
  start_date?: string | null;
  date_obtained?: string | null;
  expiry_date?: string | null;
}): string {
  const start = formatInsuranceDisplayDate(input.start_date ?? input.date_obtained);
  const expiry = formatInsuranceDisplayDate(input.expiry_date);
  return `Start: ${start} — Expiry: ${expiry}`;
}

export function resolveInsuranceStartDate(record: CompanyInsuranceRow): string | null {
  return readStartDate(record);
}

export function resolveInsuranceFileUrl(record: CompanyInsuranceRow): string | null {
  return readFileUrl(record);
}

export function resolveInsuranceProvider(record: CompanyInsuranceRow): string {
  return asString(record.provider) || asString(record.insurer);
}
