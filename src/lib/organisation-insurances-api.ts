export const INSURANCE_SELECT_FIELDS =
  "id, insurance_type, policy_number, insurer, expiry_date, date_obtained, start_date, document_url, all_states, states, created_at, updated_at";

export type CompanyInsuranceRow = Record<string, unknown> & {
  id?: string;
  insurance_type?: string | null;
  policy_number?: string | null;
  insurer?: string | null;
  expiry_date?: string | null;
  date_obtained?: string | null;
  start_date?: string | null;
  document_url?: string | null;
  all_states?: boolean | null;
  states?: string[] | null;
  created_at?: string | null;
  updated_at?: string | null;
};

export interface CompanyInsuranceRecord {
  id: string;
  insurance_type: string;
  policy_number: string | null;
  insurer: string | null;
  date_obtained: string | null;
  start_date: string | null;
  expiry_date: string | null;
  document_url: string | null;
  all_states: boolean;
  states: string[];
  created_at?: string | null;
  updated_at?: string | null;
}

function trimOrNull(value: unknown): string | null {
  const trimmed = String(value ?? "").trim();
  return trimmed ? trimmed : null;
}

function normalizeDateOnly(value: unknown): string | null {
  const trimmed = trimOrNull(value);
  if (!trimmed) return null;
  return trimmed.slice(0, 10);
}

export function resolveInsuranceStartDate(record: CompanyInsuranceRow): string | null {
  return (
    normalizeDateOnly(record.date_obtained) ??
    normalizeDateOnly(record.start_date)
  );
}

export function mapCompanyInsuranceResponse(
  record: CompanyInsuranceRow
): CompanyInsuranceRecord {
  const startDate = resolveInsuranceStartDate(record);
  return {
    id: String(record.id ?? ""),
    insurance_type: String(record.insurance_type ?? "").trim(),
    policy_number: trimOrNull(record.policy_number),
    insurer: trimOrNull(record.insurer),
    date_obtained: startDate,
    start_date: startDate,
    expiry_date: normalizeDateOnly(record.expiry_date),
    document_url: trimOrNull(record.document_url),
    all_states: Boolean(record.all_states),
    states: Array.isArray(record.states)
      ? record.states.map((value) => String(value).trim()).filter(Boolean)
      : [],
    created_at: record.created_at ?? null,
    updated_at: record.updated_at ?? null,
  };
}

export function normalizeCompanyInsuranceSavePayload(
  body: Record<string, unknown>
): Record<string, string | boolean | string[] | null> {
  const startDate =
    normalizeDateOnly(body.date_obtained) ?? normalizeDateOnly(body.start_date);
  const expiryDate = normalizeDateOnly(body.expiry_date);

  return {
    insurance_type: String(body.insurance_type ?? "").trim(),
    policy_number: trimOrNull(body.policy_number),
    insurer: trimOrNull(body.insurer),
    date_obtained: startDate,
    start_date: startDate,
    expiry_date: expiryDate,
    document_url: trimOrNull(body.document_url),
    all_states: Boolean(body.all_states),
    states: Array.isArray(body.states)
      ? body.states.map((value) => String(value).trim()).filter(Boolean)
      : [],
    updated_at: new Date().toISOString(),
  };
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
