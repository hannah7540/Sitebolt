import { supabase, isSupabaseConfigured } from "./supabase";
import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  isSupabaseSchemaOrConstraintError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";

export const PAY_RATES_AND_RULES_TABLE = "pay_rates_and_rules";

export const NSW_SITE_WORKER_PRESET_KEY = "nsw_site_worker";

export const NSW_SITE_WORKER_RULE_NAME = "NSW Site Worker";

/** Columns accepted by PostgREST insert/update on pay_rates_and_rules. */
export const PAY_RATES_DB_WRITE_COLUMNS = [
  "name",
  "base_hourly_rate",
  "overtime_multiplier",
  "overtime_threshold_hours",
  "site_allowance_hourly",
  "productivity_allowance_hourly",
  "hsr_allowance_hourly",
  "travel_allowance_daily",
  "travel_apprentice_daily",
  "meal_allowance_daily",
  "meal_allowance_threshold",
] as const;

/** Columns selected from pay_rates_and_rules (clean schema). */
export const PAY_RATES_DB_SELECT =
  "id,name,base_hourly_rate,overtime_multiplier,overtime_threshold_hours,site_allowance_hourly,productivity_allowance_hourly,hsr_allowance_hourly,travel_allowance_daily,travel_apprentice_daily,meal_allowance_daily,meal_allowance_threshold,created_at,updated_at";

export interface PayRateRule {
  id: string;
  rule_name: string;
  preset_key?: string | null;
  base_hourly_rate: number;
  saturday_rate: number;
  sunday_rate: number;
  public_holiday_rate: number;
  overtime_15_threshold_hours: number;
  overtime_20_threshold_hours: number;
  daily_allowance: number;
  site_allowance_hourly: number;
  productivity_allowance_hourly: number;
  hsr_allowance_hourly: number;
  travel_allowance_daily: number;
  travel_apprentice_daily: number;
  meal_allowance_daily: number;
  meal_allowance_threshold: number;
  overtime_multiplier: number;
  leave_flat_hours: number;
  created_at?: string;
  updated_at?: string;
}

export interface PayRateRuleInput {
  rule_name: string;
  preset_key?: string | null;
  base_hourly_rate: number;
  saturday_rate: number;
  sunday_rate: number;
  public_holiday_rate: number;
  overtime_15_threshold_hours: number;
  overtime_20_threshold_hours: number;
  daily_allowance: number;
  site_allowance_hourly: number;
  productivity_allowance_hourly: number;
  hsr_allowance_hourly: number;
  travel_allowance_daily: number;
  travel_apprentice_daily: number;
  meal_allowance_daily: number;
  meal_allowance_threshold: number;
  overtime_multiplier: number;
  leave_flat_hours: number;
}

/** CamelCase form model used by AccountsRatesAndRules UI. */
export interface PayRateRuleFormValues {
  ruleName: string;
  baseHourlyRate: number | string;
  saturdayRate: number | string;
  sundayRate: number | string;
  publicHolidayRate: number | string;
  overtime15ThresholdHours: number | string;
  overtime20ThresholdHours: number | string;
  dailyAllowance: number | string;
  siteAllowanceHourly: number | string;
  productivityAllowanceHourly: number | string;
  hsrAllowanceHourly: number | string;
  travelAllowanceDaily: number | string;
  travelApprenticeDaily: number | string;
  mealAllowanceDaily: number | string;
  mealAllowanceThreshold: number | string;
  overtimeMultiplier: number | string;
  leaveFlatHours: number | string;
}

export function parsePayRateFormNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

export const NSW_SITE_WORKER_PRESET_INPUT: PayRateRuleInput = {
  rule_name: NSW_SITE_WORKER_RULE_NAME,
  preset_key: NSW_SITE_WORKER_PRESET_KEY,
  base_hourly_rate: 52,
  saturday_rate: 104,
  sunday_rate: 104,
  public_holiday_rate: 156,
  overtime_15_threshold_hours: 8,
  overtime_20_threshold_hours: 10,
  daily_allowance: 0,
  site_allowance_hourly: 2.5,
  productivity_allowance_hourly: 1.2,
  hsr_allowance_hourly: 0.65,
  travel_allowance_daily: 45,
  travel_apprentice_daily: 0,
  meal_allowance_daily: 18.5,
  meal_allowance_threshold: 10,
  overtime_multiplier: 2,
  leave_flat_hours: 8,
};

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

/** Coerce form/API input so Supabase never receives NaN or undefined numerics. */
export function sanitizePayRateRuleInput(input: PayRateRuleInput): PayRateRuleInput {
  return {
    rule_name: String(input.rule_name ?? "").trim(),
    preset_key: input.preset_key?.trim() || null,
    base_hourly_rate: toNumber(input.base_hourly_rate),
    saturday_rate: toNumber(input.saturday_rate),
    sunday_rate: toNumber(input.sunday_rate),
    public_holiday_rate: toNumber(input.public_holiday_rate),
    overtime_15_threshold_hours: toNumber(input.overtime_15_threshold_hours, 8),
    overtime_20_threshold_hours: toNumber(input.overtime_20_threshold_hours, 10),
    daily_allowance: toNumber(input.daily_allowance),
    site_allowance_hourly: toNumber(input.site_allowance_hourly),
    productivity_allowance_hourly: toNumber(input.productivity_allowance_hourly),
    hsr_allowance_hourly: toNumber(input.hsr_allowance_hourly),
    travel_allowance_daily: toNumber(input.travel_allowance_daily),
    travel_apprentice_daily: toNumber(input.travel_apprentice_daily),
    meal_allowance_daily: toNumber(input.meal_allowance_daily),
    meal_allowance_threshold: toNumber(input.meal_allowance_threshold, 10),
    overtime_multiplier: toNumber(input.overtime_multiplier, 2),
    leave_flat_hours: toNumber(input.leave_flat_hours, 8),
  };
}

/** Map UI form fields to pay_rates_and_rules column names (snake_case). */
export function mapPayRateFormToInput(form: PayRateRuleFormValues): PayRateRuleInput {
  const mealThreshold = parsePayRateFormNumber(form.mealAllowanceThreshold, 10);

  return sanitizePayRateRuleInput({
    rule_name: String(form.ruleName ?? "").trim(),
    preset_key: null,
    base_hourly_rate: parsePayRateFormNumber(form.baseHourlyRate),
    saturday_rate: parsePayRateFormNumber(form.saturdayRate),
    sunday_rate: parsePayRateFormNumber(form.sundayRate),
    public_holiday_rate: parsePayRateFormNumber(form.publicHolidayRate),
    overtime_15_threshold_hours: parsePayRateFormNumber(form.overtime15ThresholdHours, 8),
    overtime_20_threshold_hours: mealThreshold,
    daily_allowance: 0,
    site_allowance_hourly: parsePayRateFormNumber(form.siteAllowanceHourly),
    productivity_allowance_hourly: parsePayRateFormNumber(form.productivityAllowanceHourly),
    hsr_allowance_hourly: parsePayRateFormNumber(form.hsrAllowanceHourly),
    travel_allowance_daily: parsePayRateFormNumber(form.travelAllowanceDaily),
    travel_apprentice_daily: parsePayRateFormNumber(form.travelApprenticeDaily),
    meal_allowance_daily: parsePayRateFormNumber(form.mealAllowanceDaily),
    meal_allowance_threshold: mealThreshold,
    overtime_multiplier: parsePayRateFormNumber(form.overtimeMultiplier, 2),
    leave_flat_hours: parsePayRateFormNumber(form.leaveFlatHours, 8),
  });
}

export function payRateRuleToFormValues(rule: PayRateRule): PayRateRuleFormValues {
  return {
    ruleName: rule.rule_name,
    baseHourlyRate: rule.base_hourly_rate,
    saturdayRate: rule.saturday_rate,
    sundayRate: rule.sunday_rate,
    publicHolidayRate: rule.public_holiday_rate,
    overtime15ThresholdHours: rule.overtime_15_threshold_hours,
    overtime20ThresholdHours: rule.overtime_20_threshold_hours,
    dailyAllowance: rule.daily_allowance,
    siteAllowanceHourly: rule.site_allowance_hourly,
    productivityAllowanceHourly: rule.productivity_allowance_hourly,
    hsrAllowanceHourly: rule.hsr_allowance_hourly,
    travelAllowanceDaily: rule.travel_allowance_daily,
    travelApprenticeDaily: rule.travel_apprentice_daily,
    mealAllowanceDaily: rule.meal_allowance_daily,
    mealAllowanceThreshold: rule.meal_allowance_threshold,
    overtimeMultiplier: rule.overtime_multiplier,
    leaveFlatHours: rule.leave_flat_hours,
  };
}

export function createEmptyPayRateRuleFormValues(): PayRateRuleFormValues {
  return payRateRuleToFormValues({
    id: "",
    rule_name: "",
    base_hourly_rate: 0,
    saturday_rate: 0,
    sunday_rate: 0,
    public_holiday_rate: 0,
    overtime_15_threshold_hours: 8,
    overtime_20_threshold_hours: 10,
    daily_allowance: 0,
    site_allowance_hourly: 0,
    productivity_allowance_hourly: 0,
    hsr_allowance_hourly: 0,
    travel_allowance_daily: 0,
    travel_apprentice_daily: 0,
    meal_allowance_daily: 0,
    meal_allowance_threshold: 10,
    overtime_multiplier: 2,
    leave_flat_hours: 8,
  });
}

function formatPayRateSupabaseError(
  error: SupabaseRequestError | null | undefined,
  fallback: string
): string {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.hint]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : fallback;
}

function logPayRateSupabaseError(
  operation: "create" | "update",
  error: SupabaseRequestError | null | undefined,
  payload: Record<string, unknown>
): void {
  console.error(
    `[pay-rates] ${operation}PayRateRule failed:`,
    JSON.stringify(error, null, 2),
    error,
    { payload }
  );
}

function mapPayRateRule(row: Record<string, unknown>): PayRateRule {
  const ruleName = String(row.name ?? row.rule_name ?? "").trim();
  const baseHourly = toNumber(row.base_hourly_rate);
  const overtimeThreshold = toNumber(
    row.overtime_threshold_hours ?? row.overtime_15_threshold_hours,
    8
  );
  const mealThreshold = toNumber(
    row.meal_allowance_threshold ?? row.overtime_20_threshold_hours,
    10
  );

  const presetKey = row.preset_key
    ? String(row.preset_key)
    : ruleName === NSW_SITE_WORKER_RULE_NAME
      ? NSW_SITE_WORKER_PRESET_KEY
      : null;

  return {
    id: String(row.id),
    rule_name: ruleName,
    preset_key: presetKey,
    base_hourly_rate: baseHourly,
    saturday_rate: toNumber(row.saturday_rate, baseHourly * 2),
    sunday_rate: toNumber(row.sunday_rate, baseHourly * 2),
    public_holiday_rate: toNumber(row.public_holiday_rate, baseHourly * 3),
    overtime_15_threshold_hours: overtimeThreshold,
    overtime_20_threshold_hours: mealThreshold,
    daily_allowance: toNumber(row.daily_allowance),
    site_allowance_hourly: toNumber(
      row.site_allowance_hourly ?? row.site_allowance_rate
    ),
    productivity_allowance_hourly: toNumber(
      row.productivity_allowance_hourly ?? row.productivity_allowance_rate
    ),
    hsr_allowance_hourly: toNumber(
      row.hsr_allowance_hourly ?? row.hsr_allowance_rate
    ),
    travel_allowance_daily: toNumber(row.travel_allowance_daily),
    travel_apprentice_daily: toNumber(row.travel_apprentice_daily),
    meal_allowance_daily: toNumber(row.meal_allowance_daily),
    meal_allowance_threshold: mealThreshold,
    overtime_multiplier: toNumber(row.overtime_multiplier, 2),
    leave_flat_hours: toNumber(row.leave_flat_hours, 8),
    created_at: row.created_at ? String(row.created_at) : undefined,
    updated_at: row.updated_at ? String(row.updated_at) : undefined,
  };
}

/** Build insert/update payload using only columns present in the clean DB schema. */
export function buildPayRateDbWritePayload(
  input: PayRateRuleInput
): Record<string, unknown> {
  const sanitized = sanitizePayRateRuleInput(input);

  return {
    name: sanitized.rule_name,
    base_hourly_rate: sanitized.base_hourly_rate,
    overtime_multiplier: sanitized.overtime_multiplier,
    overtime_threshold_hours: sanitized.overtime_15_threshold_hours,
    site_allowance_hourly: sanitized.site_allowance_hourly,
    productivity_allowance_hourly: sanitized.productivity_allowance_hourly,
    hsr_allowance_hourly: sanitized.hsr_allowance_hourly,
    travel_allowance_daily: sanitized.travel_allowance_daily,
    travel_apprentice_daily: sanitized.travel_apprentice_daily,
    meal_allowance_daily: sanitized.meal_allowance_daily,
    meal_allowance_threshold: sanitized.meal_allowance_threshold,
  };
}

function buildDbInsertPayload(input: PayRateRuleInput): Record<string, unknown> {
  return buildPayRateDbWritePayload(input);
}

function buildDbUpdatePayload(input: PayRateRuleInput): Record<string, unknown> {
  return {
    ...buildPayRateDbWritePayload(input),
    updated_at: new Date().toISOString(),
  };
}

export function createEmptyPayRateRuleInput(): PayRateRuleInput {
  return {
    rule_name: "",
    preset_key: null,
    base_hourly_rate: 0,
    saturday_rate: 0,
    sunday_rate: 0,
    public_holiday_rate: 0,
    overtime_15_threshold_hours: 8,
    overtime_20_threshold_hours: 10,
    daily_allowance: 0,
    site_allowance_hourly: 0,
    productivity_allowance_hourly: 0,
    hsr_allowance_hourly: 0,
    travel_allowance_daily: 0,
    travel_apprentice_daily: 0,
    meal_allowance_daily: 0,
    meal_allowance_threshold: 10,
    overtime_multiplier: 2,
    leave_flat_hours: 8,
  };
}

export function payRateRuleToInput(rule: PayRateRule): PayRateRuleInput {
  return {
    rule_name: rule.rule_name,
    preset_key: rule.preset_key ?? null,
    base_hourly_rate: rule.base_hourly_rate,
    saturday_rate: rule.saturday_rate,
    sunday_rate: rule.sunday_rate,
    public_holiday_rate: rule.public_holiday_rate,
    overtime_15_threshold_hours: rule.overtime_15_threshold_hours,
    overtime_20_threshold_hours: rule.overtime_20_threshold_hours,
    daily_allowance: rule.daily_allowance,
    site_allowance_hourly: rule.site_allowance_hourly,
    productivity_allowance_hourly: rule.productivity_allowance_hourly,
    hsr_allowance_hourly: rule.hsr_allowance_hourly,
    travel_allowance_daily: rule.travel_allowance_daily,
    travel_apprentice_daily: rule.travel_apprentice_daily,
    meal_allowance_daily: rule.meal_allowance_daily,
    meal_allowance_threshold: rule.meal_allowance_threshold,
    overtime_multiplier: rule.overtime_multiplier,
    leave_flat_hours: rule.leave_flat_hours,
  };
}

function payRatesTableMissingMessage(): string {
  return "Pay rates table is missing. Run migration 073_pay_rates_and_rules.sql in Supabase.";
}

const PAY_RATES_LEGACY_SELECT = `${PAY_RATES_DB_SELECT},rule_name,preset_key,saturday_rate,sunday_rate,public_holiday_rate,overtime_15_threshold_hours,overtime_20_threshold_hours,daily_allowance,leave_flat_hours,site_allowance_rate,productivity_allowance_rate,hsr_allowance_rate`;

const PAY_RATES_LEGACY_CORE_SELECT =
  "id,rule_name,base_hourly_rate,saturday_rate,sunday_rate,public_holiday_rate,overtime_15_threshold_hours,overtime_20_threshold_hours,daily_allowance,created_at,updated_at";

function isPayRatesTableMissingError(
  error: SupabaseRequestError | null | undefined
): boolean {
  if (!error) return false;
  // Only treat Postgres "relation does not exist" as missing table.
  // Do NOT use isSupabaseTableUnavailableError here — it also matches
  // PostgREST schema-cache errors (PGRST205) when the table exists.
  return isSupabaseRelationMissingError(error);
}

/** Probe whether pay_rates_and_rules is reachable (empty result = ready). */
export async function checkPayRatesTableReady(): Promise<{
  ready: boolean;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { ready: false, error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .select("id")
    .limit(1);

  if (!error) {
    return { ready: true, error: null };
  }

  if (isSupabaseRelationMissingError(error)) {
    return { ready: false, error: payRatesTableMissingMessage() };
  }

  if (isSupabaseSchemaCacheError(error)) {
    console.warn(
      "[pay-rates] Schema cache stale for pay_rates_and_rules; treating table as ready:",
      error.message
    );
    return { ready: true, error: null };
  }

  // Permission, RLS, or column issues — table exists; render UI with empty/fallback data.
  console.warn("[pay-rates] Non-fatal probe error; treating table as ready:", error.message);
  return { ready: true, error: null };
}

/** Query pay_rates_and_rules with column fallbacks for partially migrated schemas. */
async function fetchPayRateRowsResilient(): Promise<{
  rows: Record<string, unknown>[];
  error: string | null;
}> {
  const selectAttempts = [
    PAY_RATES_DB_SELECT,
    PAY_RATES_LEGACY_SELECT,
    PAY_RATES_LEGACY_CORE_SELECT,
    "id,name",
    "id,rule_name",
  ];

  for (const selectClause of selectAttempts) {
    const { data, error } = await supabase
      .from(PAY_RATES_AND_RULES_TABLE)
      .select(selectClause);

    if (!error) {
      return {
        rows: ((data ?? []) as unknown) as Record<string, unknown>[],
        error: null,
      };
    }

    if (isPayRatesTableMissingError(error)) {
      return { rows: [], error: payRatesTableMissingMessage() };
    }

    if (isSupabaseSchemaCacheError(error)) {
      console.warn(
        "[pay-rates] pay_rates_and_rules not visible in PostgREST schema cache yet:",
        error.message
      );
      return { rows: [], error: null };
    }

    if (
      isSupabaseSchemaOrConstraintError(error) ||
      isSupabaseMissingColumnError(error)
    ) {
      continue;
    }

    // Non-migration failures (RLS, network, etc.) — table may exist; don't block UI.
    console.warn("[pay-rates] fetchPayRatesAndRules failed:", error.message);
    return { rows: [], error: null };
  }

  return { rows: [], error: null };
}

export async function fetchPayRatesAndRules(): Promise<{
  rules: PayRateRule[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { rules: [], error: "Supabase is not configured." };
  }

  const { rows, error } = await fetchPayRateRowsResilient();
  if (error) {
    return { rules: [], error };
  }

  return {
    rules: rows
      .map((row) => mapPayRateRule(row))
      .sort((a, b) => a.rule_name.localeCompare(b.rule_name)),
    error: null,
  };
}

export async function fetchPayRateRuleById(
  id: string
): Promise<PayRateRule | null> {
  if (!isSupabaseConfigured() || !id.trim()) return null;

  const { data, error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .select(PAY_RATES_DB_SELECT)
    .eq("id", id.trim())
    .maybeSingle();

  if (error || !data) return null;
  return mapPayRateRule(data as Record<string, unknown>);
}

export async function fetchPayRateRulesByIds(
  ids: string[]
): Promise<Map<string, PayRateRule>> {
  const uniqueIds = [...new Set(ids.map((id) => id.trim()).filter(Boolean))];
  const map = new Map<string, PayRateRule>();

  if (!isSupabaseConfigured() || uniqueIds.length === 0) {
    return map;
  }

  const { data, error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .select(PAY_RATES_LEGACY_SELECT)
    .in("id", uniqueIds);

  if (error) {
    console.warn("Failed to fetch pay rate rules by id:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const rule = mapPayRateRule(row as Record<string, unknown>);
    map.set(rule.id, rule);
  }

  return map;
}

export async function ensureNswSiteWorkerPayRule(): Promise<{
  rule: PayRateRule | null;
  created: boolean;
  error: string | null;
}> {
  const existing = await fetchPayRatesAndRules();
  if (existing.error?.includes("Pay rates table is missing")) {
    return { rule: null, created: false, error: existing.error };
  }

  const found = existing.rules.find(
    (rule) =>
      rule.preset_key === NSW_SITE_WORKER_PRESET_KEY ||
      rule.rule_name === NSW_SITE_WORKER_RULE_NAME
  );
  if (found) {
    return { rule: found, created: false, error: null };
  }

  const created = await createPayRateRule(NSW_SITE_WORKER_PRESET_INPUT);
  if (created.error || !created.rule) {
    return {
      rule: null,
      created: false,
      error: created.error ?? "Failed to create NSW Site Worker preset.",
    };
  }

  return { rule: created.rule, created: true, error: null };
}

export async function createPayRateRule(
  input: PayRateRuleInput
): Promise<{ rule: PayRateRule | null; error: string | null }> {
  const sanitized = sanitizePayRateRuleInput(input);

  if (!sanitized.rule_name) {
    return { rule: null, error: "Rule name is required." };
  }

  if (!isSupabaseConfigured()) {
    return { rule: null, error: "Supabase is not configured." };
  }

  const insertPayload = buildDbInsertPayload(sanitized);

  const { data, error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .insert([insertPayload])
    .select(PAY_RATES_DB_SELECT)
    .single();

  if (!error && data) {
    return { rule: mapPayRateRule(data as Record<string, unknown>), error: null };
  }

  const normalizedError = toSupabaseRequestError(error);
  logPayRateSupabaseError("create", normalizedError, insertPayload);

  if (isPayRatesTableMissingError(normalizedError)) {
    return { rule: null, error: payRatesTableMissingMessage() };
  }

  return {
    rule: null,
    error: formatPayRateSupabaseError(normalizedError, "Failed to create pay rate rule."),
  };
}

export async function updatePayRateRule(
  id: string,
  input: PayRateRuleInput
): Promise<{ rule: PayRateRule | null; error: string | null }> {
  const sanitized = sanitizePayRateRuleInput(input);

  if (!sanitized.rule_name) {
    return { rule: null, error: "Rule name is required." };
  }

  if (!isSupabaseConfigured()) {
    return { rule: null, error: "Supabase is not configured." };
  }

  const updatePayload = buildDbUpdatePayload(sanitized);

  const { data, error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .update(updatePayload)
    .eq("id", id)
    .select(PAY_RATES_DB_SELECT)
    .single();

  if (!error && data) {
    return { rule: mapPayRateRule(data as Record<string, unknown>), error: null };
  }

  const normalizedError = toSupabaseRequestError(error);
  logPayRateSupabaseError("update", normalizedError, updatePayload);

  if (isPayRatesTableMissingError(normalizedError)) {
    return { rule: null, error: payRatesTableMissingMessage() };
  }

  return {
    rule: null,
    error: formatPayRateSupabaseError(normalizedError, "Failed to update pay rate rule."),
  };
}

export async function deletePayRateRule(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from(PAY_RATES_AND_RULES_TABLE)
    .delete()
    .eq("id", id);

  if (error) {
    return { error: error.message };
  }

  return { error: null };
}

export async function updateWorkerPayRateId(
  workerId: string,
  payRateId: string | null
): Promise<{ error: string | null }> {
  if (!workerId.trim()) {
    return { error: "Worker id is required." };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("workers")
    .update({ pay_rate_id: payRateId })
    .eq("id", workerId.trim());

  if (error) {
    if (isPayRatesTableMissingError(error)) {
      return { error: payRatesTableMissingMessage() };
    }
    if (error.message.toLowerCase().includes("pay_rate_id")) {
      return {
        error:
          "workers.pay_rate_id column is missing. Run migration 073_pay_rates_and_rules.sql in Supabase.",
      };
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function batchUpdateWorkerPayRateIds(
  assignments: Array<{ workerId: string; payRateId: string | null }>
): Promise<{ updated: number; error: string | null }> {
  if (assignments.length === 0) {
    return { updated: 0, error: null };
  }

  let updated = 0;
  let lastError: string | null = null;

  for (const assignment of assignments) {
    const result = await updateWorkerPayRateId(
      assignment.workerId,
      assignment.payRateId
    );
    if (result.error) {
      lastError = result.error;
      continue;
    }
    updated += 1;
  }

  return { updated, error: lastError };
}
