import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ALL_INSURANCE_REGIONS,
  normalizeInsuranceRegions,
  type InsuranceDocumentAttachment,
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
  documents: InsuranceDocumentAttachment[];
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

function normalizeDocumentEntry(value: unknown): InsuranceDocumentAttachment | null {
  if (!value || typeof value !== "object") return null;
  const row = value as Record<string, unknown>;
  const url =
    asNullableString(row.url) ??
    asNullableString(row.file_url) ??
    asNullableString(row.document_url);
  if (!url) return null;
  const name =
    asNullableString(row.name) ??
    asNullableString(row.file_name) ??
    asNullableString(row.document_name) ??
    "Policy document";
  const uploadedAt =
    asNullableString(row.uploaded_at) ??
    asNullableString(row.uploadedAt) ??
    new Date().toISOString();
  const sizeRaw = row.size;
  const size =
    typeof sizeRaw === "number" && Number.isFinite(sizeRaw)
      ? sizeRaw
      : typeof sizeRaw === "string" && sizeRaw.trim()
        ? Number(sizeRaw)
        : undefined;
  return {
    name,
    url,
    uploaded_at: uploadedAt,
    ...(typeof size === "number" && Number.isFinite(size) ? { size } : {}),
  };
}

export function readInsuranceDocuments(
  record: CompanyInsuranceRow
): InsuranceDocumentAttachment[] {
  const raw = record.documents;
  let parsed: unknown[] = [];

  if (Array.isArray(raw)) {
    parsed = raw;
  } else if (typeof raw === "string" && raw.trim()) {
    try {
      const json = JSON.parse(raw) as unknown;
      if (Array.isArray(json)) parsed = json;
    } catch {
      parsed = [];
    }
  }

  const documents = parsed
    .map((entry) => normalizeDocumentEntry(entry))
    .filter((entry): entry is InsuranceDocumentAttachment => entry !== null);

  if (documents.length > 0) {
    return documents;
  }

  const legacyUrl = readFileUrl(record);
  if (!legacyUrl) return [];

  return [
    {
      name: readFileName(record) ?? "Policy document",
      url: legacyUrl,
      uploaded_at:
        asNullableString(record.updated_at) ??
        asNullableString(record.created_at) ??
        new Date().toISOString(),
    },
  ];
}

function readDocumentsFromBody(body: Record<string, unknown>): InsuranceDocumentAttachment[] {
  const raw = body.documents;
  if (Array.isArray(raw)) {
    return raw
      .map((entry) => normalizeDocumentEntry(entry))
      .filter((entry): entry is InsuranceDocumentAttachment => entry !== null);
  }
  return [];
}

function syncLegacyFileFields(
  documents: InsuranceDocumentAttachment[],
  fallbackUrl: string | null,
  fallbackName: string | null
): { file_url: string | null; file_name: string | null; document_url: string | null } {
  const primary = documents[0];
  const fileUrl = primary?.url ?? fallbackUrl;
  const fileName = primary?.name ?? fallbackName;
  return {
    file_url: fileUrl,
    file_name: fileName,
    document_url: fileUrl,
  };
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
  const documents = readInsuranceDocuments(record);
  const primary = documents[0];

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
    file_url: primary?.url ?? fileUrl,
    file_name: primary?.name ?? readFileName(record),
    documents,
    notes: asString(record.notes),
    document_url: primary?.url ?? fileUrl,
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
  const bodyDocuments = readDocumentsFromBody(body);
  const documents =
    bodyDocuments.length > 0
      ? bodyDocuments
      : fUrl
        ? [
            {
              name: fName ?? "Policy document",
              url: fUrl,
              uploaded_at: new Date().toISOString(),
            },
          ]
        : [];
  const legacyFields = syncLegacyFileFields(documents, fUrl, fName);
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
    custom_type_name: asNullableString(body.custom_type_name ?? body.custom_name),
    policy_number: asString(body.policy_number ?? body.policy_no),
    provider,
    insurer: provider,
    all_states: allStates,
    states: resolvedStates,
    start_date: sDate,
    date_obtained: sDate,
    expiry_date: eDate,
    documents,
    file_url: legacyFields.file_url,
    document_url: legacyFields.document_url,
    file_name: legacyFields.file_name,
    notes: asNullableString(body.notes),
    updated_at: new Date().toISOString(),
  };
}

function buildOrganisationTablePayload(
  record: Record<string, unknown>,
  includeDocuments: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    insurance_type: record.insurance_type,
    custom_type_name: record.custom_type_name ?? null,
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
    notes: record.notes ?? null,
    updated_at: record.updated_at,
  };
  if (includeDocuments) {
    payload.documents = record.documents ?? [];
  }
  return payload;
}

function buildCompanyTablePayload(
  record: Record<string, unknown>,
  includeDocuments: boolean
): Record<string, unknown> {
  const payload: Record<string, unknown> = {
    insurance_type: record.insurance_type,
    custom_type_name: record.custom_type_name ?? null,
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
    notes: record.notes ?? null,
    updated_at: record.updated_at,
  };
  if (includeDocuments) {
    payload.documents = record.documents ?? [];
  }
  return payload;
}

function buildLegacyPayload(record: Record<string, unknown>): Record<string, unknown> {
  return {
    insurance_type: record.insurance_type,
    policy_number: record.policy_number || null,
    insurer: record.provider || record.insurer || null,
    expiry_date: record.expiry_date,
    date_obtained: record.start_date,
    start_date: record.start_date,
    document_url: record.document_url ?? record.file_url,
    file_url: record.file_url ?? record.document_url,
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
    document_url: record.document_url ?? record.file_url,
    updated_at: record.updated_at,
  };
}

function buildTablePayload(
  record: Record<string, unknown>,
  table: InsuranceTableName,
  includeDocuments: boolean
): Record<string, unknown> {
  return table === PRIMARY_INSURANCE_TABLE
    ? buildOrganisationTablePayload(record, includeDocuments)
    : buildCompanyTablePayload(record, includeDocuments);
}

function payloadVariants(
  record: Record<string, unknown>,
  table: InsuranceTableName
): Record<string, unknown>[] {
  const variants = [
    buildTablePayload(record, table, true),
    buildTablePayload(record, table, false),
    buildLegacyPayload(record),
    buildMinimalPayload(record),
  ];

  return variants.filter(
    (variant, index) =>
      variants.findIndex((candidate) => JSON.stringify(candidate) === JSON.stringify(variant)) ===
      index
  );
}

async function findInsuranceRecordById(
  admin: SupabaseClient,
  id: string
): Promise<{ table: InsuranceTableName; row: CompanyInsuranceRow } | null> {
  for (const table of INSURANCE_TABLES) {
    const result = await admin.from(table).select("*").eq("id", id).maybeSingle();
    if (result.error) {
      if (
        isMissingInsuranceTableError(result.error.message, table) ||
        isMissingInsuranceColumnError(result.error.message)
      ) {
        continue;
      }
      console.error("Insurance lookup error:", {
        table,
        id,
        error: result.error.message,
      });
      continue;
    }
    if (result.data) {
      return { table, row: result.data as CompanyInsuranceRow };
    }
  }
  return null;
}

function formatInsuranceSaveError(
  action: "insert" | "update",
  details: {
    id?: string;
    table?: InsuranceTableName;
    postgrestError?: string | null;
    attemptedTables?: InsuranceTableName[];
  }
): string {
  if (details.postgrestError?.trim()) {
    return details.postgrestError.trim();
  }
  if (action === "update" && details.id) {
    const tables = details.attemptedTables?.join(", ") ?? INSURANCE_TABLES.join(", ");
    return `Insurance policy not found (id: ${details.id}). Checked tables: ${tables}.`;
  }
  return action === "update"
    ? "Failed to update insurance policy."
    : "Failed to create insurance policy.";
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
  const merged = new Map<string, CompanyInsuranceRow>();
  let lastError: string | null = null;

  for (const table of [...INSURANCE_TABLES].reverse()) {
    const result = await queryTable(admin, table);
    if (result.error && isMissingInsuranceTableError(result.error, table)) {
      continue;
    }
    if (result.error) {
      lastError = result.error;
      continue;
    }
    for (const row of result.data) {
      const id = String(row.id ?? "").trim();
      if (id) {
        merged.set(id, row);
      }
    }
  }

  if (merged.size === 0 && lastError) {
    return { data: [], error: lastError };
  }

  return { data: Array.from(merged.values()), error: null };
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

  return { data: null, error: formatInsuranceSaveError("insert", { postgrestError: lastError }) };
}

export async function updateInsuranceRecords(
  admin: SupabaseClient,
  id: string,
  body: Record<string, unknown>
): Promise<{ data: CompanyInsuranceRow | null; error: string | null }> {
  const trimmedId = id.trim();
  if (!trimmedId) {
    return { data: null, error: "Insurance id is required for update." };
  }

  const record = buildRecordPayload(body);
  const located = await findInsuranceRecordById(admin, trimmedId);

  if (!located) {
    console.error("Insurance update: record not found in any table", {
      id: trimmedId,
      tables: INSURANCE_TABLES,
    });
    return {
      data: null,
      error: formatInsuranceSaveError("update", {
        id: trimmedId,
        attemptedTables: [...INSURANCE_TABLES],
      }),
    };
  }

  const tablesToTry = [
    located.table,
    ...INSURANCE_TABLES.filter((table) => table !== located.table),
  ];
  let savedRow: CompanyInsuranceRow | null = null;
  let lastError: string | null = null;

  for (const table of tablesToTry) {
    for (const row of payloadVariants(record, table)) {
      const result = await admin
        .from(table)
        .update(row)
        .eq("id", trimmedId)
        .select("*")
        .maybeSingle();

      if (!result.error && result.data) {
        savedRow = result.data as CompanyInsuranceRow;
        lastError = null;
        break;
      }

      if (result.error) {
        lastError = result.error.message;
        console.error("Insurance Update Error:", {
          table,
          id: trimmedId,
          keys: Object.keys(row),
          error: result.error.message,
        });
        if (isMissingInsuranceTableError(result.error.message, table)) break;
        if (isMissingInsuranceColumnError(result.error.message)) {
          continue;
        }
      } else if (!result.data) {
        console.warn("Insurance update matched 0 rows:", { table, id: trimmedId });
      }
    }
    if (savedRow) break;
  }

  if (!savedRow) {
    return {
      data: null,
      error: formatInsuranceSaveError("update", {
        id: trimmedId,
        postgrestError: lastError,
        attemptedTables: tablesToTry,
      }),
    };
  }

  for (const table of INSURANCE_TABLES) {
    await syncMirror(admin, table, trimmedId, record);
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
