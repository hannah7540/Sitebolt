import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_INSURANCE_REGIONS,
  normalizeInsuranceRegions,
  type InsuranceRegion,
} from "@/lib/insurance-utils";

export const PRIMARY_INSURANCE_TABLE = "company_insurances";
export const FALLBACK_INSURANCE_TABLE = "organisation_insurances";

export const INSURANCE_TABLES = [
  PRIMARY_INSURANCE_TABLE,
  FALLBACK_INSURANCE_TABLE,
] as const;

export type InsuranceTableName = (typeof INSURANCE_TABLES)[number];

export type CompanyInsuranceRow = Record<string, unknown> & {
  id?: string;
  insurance_type?: string | null;
  custom_type_name?: string | null;
  policy_number?: string | null;
  provider?: string | null;
  insurer?: string | null;
  expiry_date?: string | null;
  date_obtained?: string | null;
  start_date?: string | null;
  file_url?: string | null;
  file_name?: string | null;
  document_url?: string | null;
  notes?: string | null;
  all_states?: boolean | null;
  states?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export interface CompanyInsuranceRecord {
  id: string;
  insurance_type: string;
  custom_type_name: string | null;
  policy_number: string;
  provider: string;
  all_states: boolean;
  states: InsuranceRegion[];
  start_date: string | null;
  date_obtained: string | null;
  expiry_date: string | null;
  file_url: string | null;
  file_name: string | null;
  notes: string | null;
  /** @deprecated Use file_url */
  document_url: string | null;
  /** @deprecated Use provider */
  insurer: string | null;
  created_at?: string | null;
  updated_at?: string | null;
}

function trimOrNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function trimOrEmpty(value: unknown): string {
  return String(value ?? "").trim();
}

function normalizeDateOnly(value: unknown): string | null {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

export function isMissingInsuranceTableError(
  message: string,
  table?: string
): boolean {
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

export function resolveInsuranceStartDate(record: CompanyInsuranceRow): string | null {
  return (
    normalizeDateOnly(record.date_obtained) ??
    normalizeDateOnly(record.start_date)
  );
}

export function resolveInsuranceFileUrl(record: CompanyInsuranceRow): string | null {
  return trimOrNull(record.file_url) ?? trimOrNull(record.document_url);
}

export function resolveInsuranceProvider(record: CompanyInsuranceRow): string {
  return trimOrEmpty(record.provider) || trimOrEmpty(record.insurer);
}

export function resolveInsuranceDisplayType(record: CompanyInsuranceRecord): string {
  if (
    record.insurance_type === "Other Insurance" &&
    record.custom_type_name?.trim()
  ) {
    return record.custom_type_name.trim();
  }
  return record.insurance_type;
}

export function mapCompanyInsuranceResponse(
  record: CompanyInsuranceRow
): CompanyInsuranceRecord {
  const startDate = resolveInsuranceStartDate(record);
  const fileUrl = resolveInsuranceFileUrl(record);
  const provider = resolveInsuranceProvider(record);
  const states = normalizeInsuranceRegions(
    Array.isArray(record.states) ? record.states : []
  );

  return {
    id: String(record.id ?? ""),
    insurance_type: trimOrEmpty(record.insurance_type),
    custom_type_name: trimOrNull(record.custom_type_name),
    policy_number: trimOrEmpty(record.policy_number),
    provider,
    all_states: Boolean(record.all_states) || insuranceCoversAllRegionsFromStates(states),
    states: record.all_states ? [...ALL_INSURANCE_REGIONS] : states,
    start_date: startDate,
    date_obtained: startDate,
    expiry_date: normalizeDateOnly(record.expiry_date),
    file_url: fileUrl,
    file_name: trimOrNull(record.file_name),
    notes: trimOrNull(record.notes),
    document_url: fileUrl,
    insurer: provider || null,
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
  };
}

function insuranceCoversAllRegionsFromStates(states: InsuranceRegion[]): boolean {
  return ALL_INSURANCE_REGIONS.every((region) => states.includes(region));
}

function cleanDate(value: unknown): string | null {
  if (value && typeof value === "string" && value.trim() !== "") {
    return value.trim().slice(0, 10);
  }
  return null;
}

function sanitizeStates(value: unknown): InsuranceRegion[] {
  if (Array.isArray(value)) {
    return normalizeInsuranceRegions(value);
  }
  if (value && typeof value === "string" && value.trim()) {
    return normalizeInsuranceRegions([value]);
  }
  return [];
}

export function sanitizeInsuranceSavePayload(
  body: Record<string, unknown>
): Record<string, string | boolean | string[] | null> {
  const rawStates = sanitizeStates(body.states);
  const allStates =
    Boolean(body.all_states) || insuranceCoversAllRegionsFromStates(rawStates);
  const startDate = cleanDate(body.start_date ?? body.date_obtained);
  const expiryDate = cleanDate(body.expiry_date);
  const fileUrl =
    body.file_url && typeof body.file_url === "string" && body.file_url.trim()
      ? body.file_url.trim()
      : body.document_url &&
          typeof body.document_url === "string" &&
          body.document_url.trim()
        ? body.document_url.trim()
        : null;

  return {
    insurance_type:
      typeof body.insurance_type === "string" && body.insurance_type.trim()
        ? body.insurance_type.trim()
        : "Public Liability Insurance",
    custom_type_name:
      body.custom_type_name &&
      typeof body.custom_type_name === "string" &&
      body.custom_type_name.trim()
        ? body.custom_type_name.trim()
        : null,
    policy_number:
      typeof body.policy_number === "string" ? body.policy_number.trim() : "",
    provider:
      typeof body.provider === "string"
        ? body.provider.trim()
        : typeof body.insurer === "string"
          ? body.insurer.trim()
          : "",
    all_states: allStates,
    states: allStates ? [...ALL_INSURANCE_REGIONS] : rawStates,
    start_date: startDate,
    date_obtained: startDate,
    expiry_date: expiryDate,
    file_url: fileUrl,
    file_name:
      body.file_name && typeof body.file_name === "string" && body.file_name.trim()
        ? body.file_name.trim()
        : null,
    document_url: fileUrl,
    insurer:
      typeof body.provider === "string"
        ? body.provider.trim()
        : typeof body.insurer === "string"
          ? body.insurer.trim()
          : "",
    notes:
      body.notes && typeof body.notes === "string" && body.notes.trim()
        ? body.notes.trim()
        : null,
    updated_at: new Date().toISOString(),
  };
}

/** @deprecated Use sanitizeInsuranceSavePayload */
export function normalizeCompanyInsuranceSavePayload(
  body: Record<string, unknown>
): Record<string, string | boolean | string[] | null> {
  return sanitizeInsuranceSavePayload(body);
}

function buildMinimalCompanyPayload(
  payload: Record<string, string | boolean | string[] | null>
): Record<string, unknown> {
  return {
    insurance_type: payload.insurance_type,
    policy_number: payload.policy_number || null,
    expiry_date: payload.expiry_date,
    document_url: payload.file_url,
    updated_at: payload.updated_at,
  };
}

function buildLegacyCompanyPayload(
  payload: Record<string, string | boolean | string[] | null>
): Record<string, unknown> {
  return {
    insurance_type: payload.insurance_type,
    policy_number: payload.policy_number || null,
    insurer: payload.provider || null,
    expiry_date: payload.expiry_date,
    date_obtained: payload.date_obtained,
    start_date: payload.start_date,
    document_url: payload.file_url,
    all_states: payload.all_states,
    states: payload.states,
    updated_at: payload.updated_at,
  };
}

function buildExtendedPayload(
  payload: Record<string, string | boolean | string[] | null>
): Record<string, unknown> {
  return { ...payload };
}

export async function listInsuranceRecords(
  admin: SupabaseClient
): Promise<{ data: CompanyInsuranceRow[]; error: string | null }> {
  for (const table of INSURANCE_TABLES) {
    const { data, error } = await admin
      .from(table)
      .select("*")
      .order("expiry_date", { ascending: true, nullsFirst: false });

    if (!error) {
      return { data: (data ?? []) as CompanyInsuranceRow[], error: null };
    }

    if (!isMissingInsuranceTableError(error.message, table)) {
      return { data: [], error: error.message };
    }
  }

  return { data: [], error: null };
}

export async function insertInsuranceRecords(
  admin: SupabaseClient,
  payload: Record<string, string | boolean | string[] | null>
): Promise<{ data: CompanyInsuranceRow | null; error: string | null }> {
  const extended = buildExtendedPayload(payload);
  const legacy = buildLegacyCompanyPayload(payload);
  const minimal = buildMinimalCompanyPayload(payload);
  let lastError: string | null = null;

  const tryInsert = async (
    table: InsuranceTableName,
    row: Record<string, unknown>
  ) => {
    return admin.from(table).insert([row]).select("*").single();
  };

  const attemptPayloads =
    (table: InsuranceTableName) =>
      table === PRIMARY_INSURANCE_TABLE
        ? [legacy, minimal, extended]
        : [extended, legacy, minimal];

  for (const table of INSURANCE_TABLES) {
    for (const row of attemptPayloads(table)) {
      const result = await tryInsert(table, row);

      if (!result.error && result.data) {
        const savedRow = result.data as CompanyInsuranceRow;

        const mirrorTable =
          table === PRIMARY_INSURANCE_TABLE
            ? FALLBACK_INSURANCE_TABLE
            : PRIMARY_INSURANCE_TABLE;

        for (const mirrorRow of attemptPayloads(mirrorTable)) {
          const mirrorResult = await admin
            .from(mirrorTable)
            .upsert([{ ...mirrorRow, id: savedRow.id }], { onConflict: "id" })
            .select("*")
            .maybeSingle();

          if (!mirrorResult.error) {
            break;
          }

          if (
            !isMissingInsuranceTableError(mirrorResult.error.message, mirrorTable) &&
            !isMissingInsuranceColumnError(mirrorResult.error.message)
          ) {
            console.warn(
              `Insurance mirror upsert to ${mirrorTable} failed:`,
              mirrorResult.error.message
            );
          }
        }

        return { data: savedRow, error: null };
      }

      if (result.error) {
        console.error("Insurance Save Error:", {
          table,
          payload: Object.keys(row),
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
  payload: Record<string, string | boolean | string[] | null>
): Promise<{ data: CompanyInsuranceRow | null; error: string | null }> {
  const extended = buildExtendedPayload(payload);
  const legacy = buildLegacyCompanyPayload(payload);
  const minimal = buildMinimalCompanyPayload(payload);
  let savedRow: CompanyInsuranceRow | null = null;
  let lastError: string | null = null;

  const tryUpdate = async (
    table: InsuranceTableName,
    row: Record<string, unknown>
  ) => {
    return admin.from(table).update(row).eq("id", id).select("*").maybeSingle();
  };

  const attemptPayloads =
    (table: InsuranceTableName) =>
      table === PRIMARY_INSURANCE_TABLE
        ? [legacy, minimal, extended]
        : [extended, legacy, minimal];

  for (const table of INSURANCE_TABLES) {
    for (const row of attemptPayloads(table)) {
      const result = await tryUpdate(table, row);

      if (!result.error && result.data) {
        savedRow = result.data as CompanyInsuranceRow;
        lastError = null;
        break;
      }

      if (result.error) {
        console.error("Insurance Update Error:", {
          table,
          id,
          payload: Object.keys(row),
          error: result.error.message,
        });

        if (isMissingInsuranceTableError(result.error.message, table)) {
          break;
        }

        if (isMissingInsuranceColumnError(result.error.message)) {
          lastError = result.error.message;
          continue;
        }

        if (!result.error.message.toLowerCase().includes("0 rows")) {
          lastError = result.error.message;
        }
      }
    }
  }

  if (savedRow) {
    for (const table of INSURANCE_TABLES) {
      for (const row of attemptPayloads(table)) {
        const mirrorResult = await admin
          .from(table)
          .upsert([{ ...row, id }], { onConflict: "id" })
          .select("*")
          .maybeSingle();
        if (!mirrorResult.error) break;
      }
    }
    return { data: savedRow, error: null };
  }

  return { data: null, error: lastError ?? "Insurance policy not found." };
}

export async function deleteInsuranceRecords(
  admin: SupabaseClient,
  id: string
): Promise<{ error: string | null }> {
  let deleted = false;
  let lastError: string | null = null;

  for (const table of INSURANCE_TABLES) {
    const { error, count } = await admin.from(table).delete({ count: "exact" }).eq("id", id);
    if (!error && (count ?? 0) > 0) {
      deleted = true;
      continue;
    }
    if (error) {
      if (isMissingInsuranceTableError(error.message, table)) {
        continue;
      }
      lastError = error.message;
    }
  }

  if (deleted) {
    return { error: null };
  }

  return { error: lastError ?? "Insurance policy not found." };
}

export function formatInsuranceDisplayDate(value: string | null | undefined): string {
  const iso = normalizeDateOnly(value);
  if (!iso) return "Not set";
  const [year, month, day] = iso.split("-");
  if (!year || !month || !day) return "Not set";
  return `${day}/${month}/${year}`;
}

export function formatInsuranceDateRange(input: {
  date_obtained?: string | null;
  start_date?: string | null;
  expiry_date?: string | null;
}): string {
  const start = formatInsuranceDisplayDate(
    resolveInsuranceStartDate(input as CompanyInsuranceRow)
  );
  const expiry = formatInsuranceDisplayDate(input.expiry_date);
  return `Start: ${start} — Expiry: ${expiry}`;
}
