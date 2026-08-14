import type { PostgrestError, SupabaseClient } from "@supabase/supabase-js";
import { supabase, isSupabaseConfigured } from "./supabase";
import {
  getPostgrestErrorCode,
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaOrConstraintError,
  isSupabaseZeroRowsError,
  toSupabaseRequestError,
  type SupabaseRequestError,
} from "./supabase-errors";
import { normalizeLeaveTypeLabel } from "./leave-type-calendar";
import { MEAL_ALLOWANCE_HOURS_THRESHOLD } from "./meal-allowance";

export const PAY_RULE_TEMPLATES_TABLE = "pay_rule_templates";
export const PAY_RULE_CONDITIONS_TABLE = "pay_rule_conditions";

/** Valid pay_rule_templates columns in production (no updated_at). */
export const PAY_RULE_TEMPLATE_COLUMNS = "id,name,created_at";

function logPayRuleConditionInsertError(
  operation: "insert" | "delete",
  payloadKind: "extended" | "base" | "replace",
  templateId: string,
  error: PostgrestError | SupabaseRequestError
): void {
  console.error(
    `[pay-rule-templates] Failed to ${operation} payroll conditions (pay_rule_conditions) for template ${templateId} [${payloadKind}]:`,
    {
      message: error.message,
      details: "details" in error && error.details != null ? error.details : "",
      hint: "hint" in error && error.hint != null ? error.hint : "",
      code: getPostgrestErrorCode(error),
    }
  );
}

/** Prefer service-role client on the server so RLS does not block template/condition writes. */
async function resolvePayRuleWriteClient(): Promise<SupabaseClient> {
  if (typeof window === "undefined") {
    const { isSupabaseAdminConfigured } = await import("./supabase/env");
    if (isSupabaseAdminConfigured()) {
      const { createSupabaseAdminClient } = await import("./supabase/admin");
      return createSupabaseAdminClient();
    }
  }
  return supabase;
}

export const NSW_SITE_WORKER_TEMPLATE_NAME = "NSW Site Worker";
export const WA_SITE_WORKER_TEMPLATE_NAME = "WA Site Worker";
export const ACT_SITE_WORKER_TEMPLATE_NAME = "ACT Site Worker";
export const VIC_SITE_WORKER_TEMPLATE_NAME = "VIC Site Worker";
export const QLD_SITE_WORKER_TEMPLATE_NAME = "QLD Site Worker";
export const NZ_SITE_WORKER_TEMPLATE_NAME = "NZ Site Worker";

export const PRESET_PAY_RULE_TEMPLATE_NAMES = [
  WA_SITE_WORKER_TEMPLATE_NAME,
  NSW_SITE_WORKER_TEMPLATE_NAME,
  ACT_SITE_WORKER_TEMPLATE_NAME,
  VIC_SITE_WORKER_TEMPLATE_NAME,
  QLD_SITE_WORKER_TEMPLATE_NAME,
  NZ_SITE_WORKER_TEMPLATE_NAME,
] as const;

export type WeekdayCode = "mon" | "tue" | "wed" | "thu" | "fri" | "sat" | "sun";

export type PayRuleConditionType = "pay_rate" | "allowance";

export type AllowanceTrigger =
  | "hours_gte_threshold"
  | "flat_per_day_worked"
  | "all_hours_worked";

export type AllowancePayoutUnit = "daily_flat_1x" | "per_hour_worked";

export type PayRuleTimeCondition =
  | "first_n_hours"
  | "after_n_hours"
  | "all_hours_worked"
  | "flat_daily_allowance";

export type PayRuleMultiplierType =
  | "standard_1x"
  | "time_and_half_1_5x"
  | "double_2x"
  | "flat_daily";

export interface PayRuleCondition {
  id: string;
  template_id: string;
  condition_type: PayRuleConditionType;
  condition_name: string;
  applicable_days: WeekdayCode[];
  time_condition: PayRuleTimeCondition;
  hours_threshold: number;
  pay_multiplier_type: PayRuleMultiplierType;
  allowance_trigger?: AllowanceTrigger | null;
  payout_unit?: AllowancePayoutUnit | null;
  sort_order: number;
}

export interface PayRuleTemplate {
  id: string;
  name: string;
  conditions: PayRuleCondition[];
  created_at?: string;
}

export interface PayRuleConditionInput {
  condition_type: PayRuleConditionType;
  condition_name: string;
  applicable_days: WeekdayCode[];
  time_condition: PayRuleTimeCondition;
  hours_threshold: number;
  pay_multiplier_type: PayRuleMultiplierType;
  allowance_trigger?: AllowanceTrigger | null;
  payout_unit?: AllowancePayoutUnit | null;
  sort_order: number;
}

export interface PayRuleTemplateInput {
  name: string;
  conditions: PayRuleConditionInput[];
}

export interface PayRuleConditionFormRow {
  clientId: string;
  id?: string;
  conditionType: PayRuleConditionType;
  conditionName: string;
  applicableDays: WeekdayCode[];
  timeCondition: PayRuleTimeCondition;
  hoursThreshold: number | string;
  payMultiplierType: PayRuleMultiplierType;
  allowanceTrigger: AllowanceTrigger;
  payoutUnit: AllowancePayoutUnit;
}

export const CONDITION_TYPE_OPTIONS: Array<{
  value: PayRuleConditionType;
  label: string;
}> = [
  { value: "pay_rate", label: "Pay Rate" },
  { value: "allowance", label: "Allowance / Entitlement" },
];

export const ALLOWANCE_TRIGGER_OPTIONS: Array<{
  value: AllowanceTrigger;
  label: string;
}> = [
  { value: "hours_gte_threshold", label: "When daily hours >= threshold" },
  { value: "flat_per_day_worked", label: "Flat 1 per day worked" },
  { value: "all_hours_worked", label: "All hours worked" },
];

export const ALLOWANCE_PAYOUT_OPTIONS: Array<{
  value: AllowancePayoutUnit;
  label: string;
}> = [
  { value: "daily_flat_1x", label: "1x Daily Flat" },
  { value: "per_hour_worked", label: "Per Hour Worked" },
];

export const WEEKDAY_OPTIONS: Array<{ code: WeekdayCode; label: string }> = [
  { code: "mon", label: "Mon" },
  { code: "tue", label: "Tue" },
  { code: "wed", label: "Wed" },
  { code: "thu", label: "Thu" },
  { code: "fri", label: "Fri" },
  { code: "sat", label: "Sat" },
  { code: "sun", label: "Sun" },
];

export const TIME_CONDITION_OPTIONS: Array<{
  value: PayRuleTimeCondition;
  label: string;
}> = [
  { value: "first_n_hours", label: "First N Hours" },
  { value: "after_n_hours", label: "After N Hours" },
  { value: "all_hours_worked", label: "All Hours Worked" },
  { value: "flat_daily_allowance", label: "Flat Daily Allowance" },
];

export const MULTIPLIER_OPTIONS: Array<{
  value: PayRuleMultiplierType;
  label: string;
}> = [
  { value: "standard_1x", label: "1.0x (Standard)" },
  { value: "time_and_half_1_5x", label: "1.5x (Time & Half)" },
  { value: "double_2x", label: "2.0x (Double Time)" },
  { value: "flat_daily", label: "Flat Daily" },
];

const WEEKDAY_ORDER: WeekdayCode[] = ["mon", "tue", "wed", "thu", "fri", "sat", "sun"];

function toNumber(value: unknown, fallback = 0): number {
  if (value === null || value === undefined || value === "") return fallback;
  const parsed = typeof value === "number" ? value : parseFloat(String(value));
  return Number.isFinite(parsed) ? parsed : fallback;
}

function normalizeWeekday(value: unknown): WeekdayCode | null {
  const code = String(value ?? "").trim().toLowerCase();
  return WEEKDAY_ORDER.includes(code as WeekdayCode) ? (code as WeekdayCode) : null;
}

function normalizeTimeCondition(value: unknown): PayRuleTimeCondition {
  const raw = String(value ?? "").trim();
  if (
    raw === "first_n_hours" ||
    raw === "after_n_hours" ||
    raw === "all_hours_worked" ||
    raw === "flat_daily_allowance"
  ) {
    return raw;
  }
  return "all_hours_worked";
}

function normalizeMultiplierType(value: unknown): PayRuleMultiplierType {
  const raw = String(value ?? "").trim();
  if (
    raw === "standard_1x" ||
    raw === "time_and_half_1_5x" ||
    raw === "double_2x" ||
    raw === "flat_daily"
  ) {
    return raw;
  }
  return "standard_1x";
}

function normalizeConditionType(value: unknown): PayRuleConditionType {
  const raw = String(value ?? "").trim();
  if (raw === "allowance" || raw === "allowance_entitlement") return "allowance";
  return "pay_rate";
}

function normalizeAllowanceTrigger(value: unknown): AllowanceTrigger {
  const raw = String(value ?? "").trim();
  if (
    raw === "hours_gte_threshold" ||
    raw === "flat_per_day_worked" ||
    raw === "all_hours_worked"
  ) {
    return raw;
  }
  return "all_hours_worked";
}

function normalizePayoutUnit(value: unknown): AllowancePayoutUnit {
  const raw = String(value ?? "").trim();
  if (raw === "daily_flat_1x" || raw === "per_hour_worked") return raw;
  return "daily_flat_1x";
}

function inferConditionType(row: Record<string, unknown>): PayRuleConditionType {
  const explicit = String(row.condition_type ?? "").trim();
  if (explicit === "allowance" || explicit === "allowance_entitlement") return "allowance";
  if (explicit === "pay_rate") return "pay_rate";

  const timeCondition = normalizeTimeCondition(row.time_condition);
  const multiplier = normalizeMultiplierType(row.pay_multiplier_type);
  const name = String(row.condition_name ?? "").toLowerCase();

  if (timeCondition === "flat_daily_allowance") return "allowance";
  if (timeCondition === "after_n_hours" && multiplier === "flat_daily") return "allowance";
  if (timeCondition === "all_hours_worked" && name.includes("allowance")) return "allowance";
  if (name.includes("travel")) return "allowance";

  return "pay_rate";
}

function inferAllowanceTrigger(row: Record<string, unknown>): AllowanceTrigger {
  const explicit = row.allowance_trigger;
  if (explicit) return normalizeAllowanceTrigger(explicit);

  const timeCondition = normalizeTimeCondition(row.time_condition);
  if (timeCondition === "flat_daily_allowance") return "flat_per_day_worked";
  if (timeCondition === "after_n_hours") return "hours_gte_threshold";
  return "all_hours_worked";
}

function inferPayoutUnit(row: Record<string, unknown>): AllowancePayoutUnit {
  const explicit = row.payout_unit;
  if (explicit) return normalizePayoutUnit(explicit);

  const multiplier = normalizeMultiplierType(row.pay_multiplier_type);
  const name = String(row.condition_name ?? "").toLowerCase();
  if (multiplier === "flat_daily") return "daily_flat_1x";
  if (name.includes("site allowance")) return "per_hour_worked";
  return "daily_flat_1x";
}

function mapPayRuleCondition(row: Record<string, unknown>): PayRuleCondition {
  const applicableDays = Array.isArray(row.applicable_days)
    ? row.applicable_days
        .map((day) => normalizeWeekday(day))
        .filter((day): day is WeekdayCode => day !== null)
    : [];

  const conditionType = inferConditionType(row);

  return {
    id: String(row.id),
    template_id: String(row.template_id),
    condition_type: conditionType,
    condition_name: String(row.condition_name ?? "").trim(),
    applicable_days: applicableDays,
    time_condition: normalizeTimeCondition(row.time_condition),
    hours_threshold: toNumber(row.hours_threshold),
    pay_multiplier_type: normalizeMultiplierType(row.pay_multiplier_type),
    allowance_trigger:
      conditionType === "allowance" ? inferAllowanceTrigger(row) : null,
    payout_unit: conditionType === "allowance" ? inferPayoutUnit(row) : null,
    sort_order: toNumber(row.sort_order),
  };
}

function mapPayRuleTemplate(
  row: Record<string, unknown>,
  conditions: PayRuleCondition[]
): PayRuleTemplate {
  return {
    id: String(row.id),
    name: String(row.name ?? "").trim(),
    conditions: [...conditions].sort((a, b) => a.sort_order - b.sort_order),
    created_at: row.created_at ? String(row.created_at) : undefined,
  };
}

/** Map PostgREST nested select rows: `*, pay_rule_conditions(*)`. */
export function mapPayRuleTemplatesFromJoin(
  rows: Record<string, unknown>[]
): PayRuleTemplate[] {
  return rows.map((row) => {
    const rawConditions = Array.isArray(row.pay_rule_conditions)
      ? row.pay_rule_conditions
      : [];
    const conditions = rawConditions.map((condition) =>
      mapPayRuleCondition(condition as Record<string, unknown>)
    );
    return mapPayRuleTemplate(row, conditions);
  });
}

export function formatApplicableDays(days: WeekdayCode[]): string {
  const sorted = WEEKDAY_ORDER.filter((day) => days.includes(day));
  if (sorted.length === 0) return "No days";
  if (sorted.length === 7) return "Mon-Sun";

  const weekdaySet: WeekdayCode[] = ["mon", "tue", "wed", "thu", "fri"];
  if (
    sorted.length === 5 &&
    weekdaySet.every((day) => sorted.includes(day))
  ) {
    return "Mon-Fri";
  }

  if (sorted.length === 2 && sorted.includes("sat") && sorted.includes("sun")) {
    return "Sat-Sun";
  }

  const labels = Object.fromEntries(WEEKDAY_OPTIONS.map((d) => [d.code, d.label]));
  return sorted.map((day) => labels[day]).join(", ");
}

export function formatTimeConditionLabel(
  timeCondition: PayRuleTimeCondition,
  hoursThreshold: number
): string {
  switch (timeCondition) {
    case "first_n_hours":
      return `First ${hoursThreshold} hrs`;
    case "after_n_hours":
      return `After ${hoursThreshold} hrs`;
    case "all_hours_worked":
      return "All Hours Worked";
    case "flat_daily_allowance":
      return "Flat Daily Allowance";
    default:
      return "All Hours Worked";
  }
}

export function formatMultiplierLabel(type: PayRuleMultiplierType): string {
  return MULTIPLIER_OPTIONS.find((option) => option.value === type)?.label ?? type;
}

export function formatAllowanceTriggerLabel(
  trigger: AllowanceTrigger,
  hoursThreshold: number
): string {
  switch (trigger) {
    case "hours_gte_threshold":
      return `When daily hours >= ${hoursThreshold} hrs`;
    case "flat_per_day_worked":
      return "Flat 1 per day worked";
    case "all_hours_worked":
      return "All hours worked";
    default:
      return "All hours worked";
  }
}

export function formatPayoutUnitLabel(unit: AllowancePayoutUnit): string {
  return ALLOWANCE_PAYOUT_OPTIONS.find((option) => option.value === unit)?.label ?? unit;
}

export function isPresetPayRuleTemplateName(name: string): boolean {
  return PRESET_PAY_RULE_TEMPLATE_NAMES.includes(
    name as (typeof PRESET_PAY_RULE_TEMPLATE_NAMES)[number]
  );
}

export function sortPayRuleTemplates(templates: PayRuleTemplate[]): PayRuleTemplate[] {
  return [...templates].sort((a, b) => {
    const orderA = PRESET_PAY_RULE_TEMPLATE_NAMES.indexOf(
      a.name as (typeof PRESET_PAY_RULE_TEMPLATE_NAMES)[number]
    );
    const orderB = PRESET_PAY_RULE_TEMPLATE_NAMES.indexOf(
      b.name as (typeof PRESET_PAY_RULE_TEMPLATE_NAMES)[number]
    );

    if (orderA !== -1 && orderB !== -1) return orderA - orderB;
    if (orderA !== -1) return -1;
    if (orderB !== -1) return 1;
    return a.name.localeCompare(b.name);
  });
}

export function partitionTemplateConditions(template: PayRuleTemplate): {
  payRates: PayRuleCondition[];
  allowances: PayRuleCondition[];
} {
  const payRates: PayRuleCondition[] = [];
  const allowances: PayRuleCondition[] = [];

  for (const condition of template.conditions) {
    if (condition.condition_type === "allowance") {
      allowances.push(condition);
    } else {
      payRates.push(condition);
    }
  }

  return { payRates, allowances };
}

export function isLeavePayRuleCondition(condition: PayRuleCondition): boolean {
  const name = condition.condition_name.toLowerCase();
  return (
    name.includes("leave") ||
    name.includes("rdo") ||
    name.includes("holiday") ||
    name.includes("without pay")
  );
}

const LEAVE_PAY_RULE_MATCHERS: Array<{
  matchesLeaveType: (normalized: string) => boolean;
  matchesConditionName: (name: string) => boolean;
}> = [
  {
    matchesLeaveType: (normalized) => normalized === "Public Holiday",
    matchesConditionName: (name) => name.includes("public holiday"),
  },
  {
    matchesLeaveType: (normalized) => normalized === "Annual Leave" || normalized === "Leave",
    matchesConditionName: (name) =>
      name.includes("annual leave pay") && !name.includes("loading"),
  },
  {
    matchesLeaveType: (normalized) =>
      normalized === "Sick Leave" ||
      normalized === "Sick" ||
      normalized === "Personal Leave" ||
      normalized === "Carers Leave",
    matchesConditionName: (name) => name.includes("personal leave"),
  },
  {
    matchesLeaveType: (normalized) => normalized === "RDO",
    matchesConditionName: (name) => name.includes("rdo taken") || name.includes("rdo"),
  },
  {
    matchesLeaveType: (normalized) => normalized === "Flexi RDO",
    matchesConditionName: (name) => name.includes("flexi") && name.includes("rdo"),
  },
  {
    matchesLeaveType: (normalized) => normalized === "Leave without pay",
    matchesConditionName: (name) => name.includes("without pay") || name.includes("leave without pay"),
  },
];

/** Match an approved leave type to a leave-pay condition on a worker's pay rule template. */
export function matchLeaveTypeToPayRuleCondition(
  leaveType: string | null | undefined,
  conditions: PayRuleCondition[]
): PayRuleCondition | null {
  const normalized = normalizeLeaveTypeLabel(leaveType);
  const leaveConditions = conditions.filter(isLeavePayRuleCondition);

  for (const matcher of LEAVE_PAY_RULE_MATCHERS) {
    if (!matcher.matchesLeaveType(normalized)) continue;

    const match = leaveConditions.find((condition) =>
      matcher.matchesConditionName(condition.condition_name.toLowerCase())
    );
    if (match) return match;
  }

  return null;
}

export async function fetchWorkerLeavePayRuleCondition(
  workerId: string,
  leaveType: string | null | undefined
): Promise<{
  condition: PayRuleCondition | null;
  templateName: string | null;
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { condition: null, templateName: null, error: null };
  }

  const { data: workerRows, error: workerError } = await supabase
    .from("workers")
    .select("pay_rule_template_id")
    .eq("id", workerId)
    .limit(1);

  if (workerError) {
    if (isSupabaseMissingColumnError(workerError)) {
      return { condition: null, templateName: null, error: null };
    }
    return { condition: null, templateName: null, error: workerError.message };
  }

  const worker = firstSelectedRow(
    workerRows as Array<{ pay_rule_template_id?: string | null }> | null
  );
  const templateId = worker?.pay_rule_template_id?.trim();
  if (!templateId) {
    return { condition: null, templateName: null, error: null };
  }

  const { data: templateRows, error: templateError } = await supabase
    .from(PAY_RULE_TEMPLATES_TABLE)
    .select("id,name,pay_rule_conditions(*)")
    .eq("id", templateId)
    .limit(1);

  if (templateError) {
    if (isSupabaseRelationMissingError(templateError)) {
      return { condition: null, templateName: null, error: null };
    }
    return { condition: null, templateName: null, error: templateError.message };
  }

  const templateRow = firstSelectedRow(templateRows as Record<string, unknown>[] | null);
  if (!templateRow) {
    return { condition: null, templateName: null, error: null };
  }

  const template = mapPayRuleTemplatesFromJoin([templateRow])[0];
  if (!template) {
    return { condition: null, templateName: null, error: null };
  }

  return {
    condition: matchLeaveTypeToPayRuleCondition(leaveType, template.conditions),
    templateName: template.name,
    error: null,
  };
}

export function formatLeavePayRuleNoteSuffix(options: {
  conditionName: string;
  templateName?: string | null;
}): string {
  const templateSuffix = options.templateName?.trim()
    ? `: ${options.templateName.trim()}`
    : "";
  return ` - ${options.conditionName} (Pay Rule${templateSuffix})`;
}

export function partitionPayRuleConditionsForDisplay(template: PayRuleTemplate): {
  payRates: PayRuleCondition[];
  allowances: PayRuleCondition[];
  leaveRules: PayRuleCondition[];
} {
  const payRates: PayRuleCondition[] = [];
  const allowances: PayRuleCondition[] = [];
  const leaveRules: PayRuleCondition[] = [];

  for (const condition of [...template.conditions].sort(
    (a, b) => a.sort_order - b.sort_order
  )) {
    if (condition.condition_type === "pay_rate") {
      payRates.push(condition);
    } else if (isLeavePayRuleCondition(condition)) {
      leaveRules.push(condition);
    } else {
      allowances.push(condition);
    }
  }

  return { payRates, allowances, leaveRules };
}

export async function lookupPayRuleTemplateIdByName(
  name: string
): Promise<{ id: string | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { id: null, error: "Supabase is not configured." };
  }
  return lookupPayRuleTemplateIdByNameWithClient(supabase, name);
}

async function lookupPayRuleTemplateIdByNameWithClient(
  client: SupabaseClient,
  name: string
): Promise<{ id: string | null; error: string | null }> {
  const { data, error } = await client
    .from(PAY_RULE_TEMPLATES_TABLE)
    .select("id")
    .eq("name", name)
    .limit(1);

  if (error) {
    return { id: null, error: error.message };
  }

  const row = firstSelectedRow(data as Array<{ id: string }> | null);
  return { id: row?.id ? String(row.id) : null, error: null };
}

/**
 * Resolve/create pay rule templates using the service-role client (bypasses RLS).
 * Use from server API routes and onboarding handlers only.
 */
export async function fetchPayRuleTemplateIdByNameAdmin(
  admin: SupabaseClient,
  name: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return { id: null, error: "Template name is required." };
  }

  const existing = await lookupPayRuleTemplateIdByNameWithClient(admin, trimmed);
  if (existing.error || existing.id) {
    return existing;
  }

  const preset = getPayRuleTemplateInputByName(trimmed);
  if (preset) {
    const ensured = await ensurePayRuleTemplateByNameWithClient(admin, preset);
    if (ensured.error) {
      return { id: null, error: ensured.error };
    }
    return {
      id: ensured.template?.id ?? null,
      error: ensured.template?.id
        ? null
        : `Failed to create pay rule template "${trimmed}".`,
    };
  }

  const seeded = await ensureDefaultPayRuleTemplatesWithClient(admin);
  if (seeded.error) {
    return { id: null, error: seeded.error };
  }

  const retry = await lookupPayRuleTemplateIdByNameWithClient(admin, trimmed);
  if (retry.error || retry.id) {
    return retry;
  }

  if (trimmed !== NSW_SITE_WORKER_TEMPLATE_NAME) {
    return fetchPayRuleTemplateIdByNameAdmin(admin, NSW_SITE_WORKER_TEMPLATE_NAME);
  }

  return { id: null, error: null };
}

async function ensureDefaultPayRuleTemplatesWithClient(
  client: SupabaseClient
): Promise<{ created: number; error: string | null }> {
  let created = 0;

  for (const preset of DEFAULT_PAY_RULE_TEMPLATE_INPUTS) {
    const result = await ensurePayRuleTemplateByNameWithClient(client, preset);
    if (result.error) {
      return { created, error: result.error };
    }
    if (result.created) created += 1;
  }

  return { created, error: null };
}

async function ensurePayRuleTemplateByNameWithClient(
  client: SupabaseClient,
  input: PayRuleTemplateInput
): Promise<{ template: PayRuleTemplate | null; created: boolean; error: string | null }> {
  const sanitized = sanitizePayRuleTemplateInput(input);
  const existing = await lookupPayRuleTemplateIdByNameWithClient(client, sanitized.name);
  if (existing.error) {
    return { template: null, created: false, error: existing.error };
  }

  if (existing.id) {
    const conditionsByTemplate = await fetchConditionRowsByTemplateIdsWithClient(client, [
      existing.id,
    ]);
    const existingConditions = conditionsByTemplate.get(existing.id) ?? [];

    if (existingConditions.length > 0) {
      return {
        template: mapPayRuleTemplate(
          { id: existing.id, name: sanitized.name },
          existingConditions
        ),
        created: false,
        error: null,
      };
    }

    await saveConditionsWithClient(client, existing.id, sanitized.conditions, { silent: true });

    const refreshed = await fetchConditionRowsByTemplateIdsWithClient(client, [existing.id]);
    return {
      template: mapPayRuleTemplate(
        { id: existing.id, name: sanitized.name },
        refreshed.get(existing.id) ?? []
      ),
      created: false,
      error: null,
    };
  }

  const created = await createPayRuleTemplateWithClient(client, input, {
    silentConditionErrors: true,
  });
  if (created.error || !created.template) {
    return {
      template: null,
      created: false,
      error: created.error ?? `Failed to create ${sanitized.name} template.`,
    };
  }

  return { template: created.template, created: true, error: null };
}

async function createPayRuleTemplateWithClient(
  client: SupabaseClient,
  input: PayRuleTemplateInput,
  options: { silentConditionErrors?: boolean } = {}
): Promise<{ template: PayRuleTemplate | null; error: string | null }> {
  const sanitized = sanitizePayRuleTemplateInput(input);

  if (!sanitized.name) {
    return { template: null, error: "Template name is required." };
  }

  if (sanitized.conditions.length === 0) {
    return { template: null, error: "Add at least one rule condition." };
  }

  if (sanitized.conditions.some((condition) => !condition.condition_name)) {
    return { template: null, error: "Every condition needs a name." };
  }

  const { data, error } = await client
    .from(PAY_RULE_TEMPLATES_TABLE)
    .insert([{ name: sanitized.name }])
    .select(PAY_RULE_TEMPLATE_COLUMNS);

  const row = firstSelectedRow(data as Record<string, unknown>[] | null);

  if (error) {
    if (isSupabaseRelationMissingError(error)) {
      return { template: null, error: tableMissingMessage() };
    }
    if (isSupabaseZeroRowsError(error)) {
      return {
        template: null,
        error: zeroRowResultMessage("Pay rule template was not returned after create."),
      };
    }
    return {
      template: null,
      error: formatSupabaseError(toSupabaseRequestError(error), "Failed to create pay rule."),
    };
  }

  if (!row) {
    return {
      template: null,
      error: zeroRowResultMessage("Pay rule template was not returned after create."),
    };
  }

  const templateId = String(row.id);
  const conditionError = await saveConditionsWithClient(
    client,
    templateId,
    sanitized.conditions,
    { silent: options.silentConditionErrors }
  );
  if (conditionError && !options.silentConditionErrors) {
    await client.from(PAY_RULE_TEMPLATES_TABLE).delete().eq("id", templateId);
    return { template: null, error: conditionError };
  }

  const conditionsByTemplate = await fetchConditionRowsByTemplateIdsWithClient(client, [
    templateId,
  ]);
  return {
    template: mapPayRuleTemplate(row, conditionsByTemplate.get(templateId) ?? []),
    error: null,
  };
}

async function fetchConditionRowsByTemplateIdsWithClient(
  client: SupabaseClient,
  templateIds: string[]
): Promise<Map<string, PayRuleCondition[]>> {
  const map = new Map<string, PayRuleCondition[]>();
  if (templateIds.length === 0) return map;

  const { data, error } = await client
    .from(PAY_RULE_CONDITIONS_TABLE)
    .select("*")
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[pay-rules] fetch conditions failed:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const condition = mapPayRuleCondition(row as Record<string, unknown>);
    const list = map.get(condition.template_id) ?? [];
    list.push(condition);
    map.set(condition.template_id, list);
  }

  return map;
}

/** Core pay_rule_conditions columns present in all schema versions. */
function buildBaseConditionInsertRow(
  templateId: string,
  condition: PayRuleConditionInput
): Record<string, unknown> {
  return {
    template_id: templateId,
    condition_name: condition.condition_name,
    applicable_days: condition.applicable_days,
    time_condition: condition.time_condition,
    hours_threshold: condition.hours_threshold,
    pay_multiplier_type: condition.pay_multiplier_type,
    sort_order: condition.sort_order,
  };
}

/** Extended row when allowance columns exist (migration 079+). */
function buildExtendedConditionInsertRow(
  templateId: string,
  condition: PayRuleConditionInput
): Record<string, unknown> {
  const row = buildBaseConditionInsertRow(templateId, condition);
  row.condition_type = condition.condition_type;
  if (condition.allowance_trigger != null) {
    row.allowance_trigger = condition.allowance_trigger;
  }
  if (condition.payout_unit != null) {
    row.payout_unit = condition.payout_unit;
  }
  return row;
}

async function saveConditionsWithClient(
  _client: SupabaseClient,
  templateId: string,
  conditions: PayRuleConditionInput[],
  options: { silent?: boolean } = {}
): Promise<string | null> {
  if (conditions.length === 0) return null;

  const writeClient = await resolvePayRuleWriteClient();

  const { error: deleteError } = await writeClient
    .from(PAY_RULE_CONDITIONS_TABLE)
    .delete()
    .eq("template_id", templateId);

  if (deleteError) {
    logPayRuleConditionInsertError("delete", "replace", templateId, deleteError);
    if (options.silent) return null;
    return deleteError.message;
  }

  const extendedPayload = conditions.map((condition) =>
    buildExtendedConditionInsertRow(templateId, condition)
  );
  const basePayload = conditions.map((condition) =>
    buildBaseConditionInsertRow(templateId, condition)
  );

  let lastError: string | null = null;

  for (const [payloadKind, payload] of [
    ["extended", extendedPayload],
    ["base", basePayload],
  ] as const) {
    const { error } = await writeClient.from(PAY_RULE_CONDITIONS_TABLE).insert(payload);
    if (!error) return null;

    logPayRuleConditionInsertError("insert", payloadKind, templateId, error);
    lastError = error.message;

    if (
      isSupabaseMissingColumnError(error) ||
      isSupabaseSchemaOrConstraintError(error)
    ) {
      continue;
    }

    if (options.silent) return null;
    return error.message;
  }

  console.error(
    "[pay-rule-templates] All payroll condition (pay_rule_conditions) insert attempts failed.",
    { templateId, lastError }
  );

  if (options.silent) return null;
  return lastError ?? "Failed to save payroll conditions.";
}

/**
 * Resolve a pay rule template id by name, creating preset templates on demand when missing.
 * Falls back to NSW Site Worker when an unknown name cannot be resolved.
 */
export async function fetchPayRuleTemplateIdByName(
  name: string
): Promise<{ id: string | null; error: string | null }> {
  const trimmed = String(name ?? "").trim();
  if (!trimmed) {
    return { id: null, error: "Template name is required." };
  }

  const existing = await lookupPayRuleTemplateIdByName(trimmed);
  if (existing.error || existing.id) {
    return existing;
  }

  const preset = getPayRuleTemplateInputByName(trimmed);
  if (preset) {
    const ensured = await ensurePayRuleTemplateByName(preset);
    if (ensured.error) {
      return { id: null, error: ensured.error };
    }
    return {
      id: ensured.template?.id ?? null,
      error: ensured.template?.id
        ? null
        : `Failed to create pay rule template "${trimmed}".`,
    };
  }

  const seeded = await ensureDefaultPayRuleTemplates();
  if (seeded.error) {
    return { id: null, error: seeded.error };
  }

  const retry = await lookupPayRuleTemplateIdByName(trimmed);
  if (retry.error || retry.id) {
    return retry;
  }

  if (trimmed !== NSW_SITE_WORKER_TEMPLATE_NAME) {
    return fetchPayRuleTemplateIdByName(NSW_SITE_WORKER_TEMPLATE_NAME);
  }

  return { id: null, error: null };
}

/** Display labels for the WA Site Worker preset template card. */
export const WA_SITE_WORKER_CONDITION_DISPLAY: Record<number, string> = {
  0: "Base Hourly (Mon-Fri First 8 hrs @ 1.0x)",
  1: "Overtime 1.5x (Mon-Fri After 8 hrs)",
  2: "Overtime 1.5x (Sat & Sun All Hours)",
  3: "Personal Leave Pay (Auto 8 hrs when booked)",
  4: "Annual Leave Pay (Auto 8 hrs when booked)",
  5: "Annual Leave Loading (Auto 8 hrs when Annual Leave booked)",
  6: "RDO Taken (Auto 8 hrs when booked)",
  7: "Leave Without Pay (Auto applied when booked)",
  8: "Public Holiday Pay (Auto 8 hrs when booked)",
};

export function formatTemplateConditionDisplay(
  template: PayRuleTemplate,
  condition: PayRuleCondition
): string {
  if (template.name === WA_SITE_WORKER_TEMPLATE_NAME) {
    const label = WA_SITE_WORKER_CONDITION_DISPLAY[condition.sort_order];
    if (label) return label;
  }
  return formatConditionSummary(condition);
}

export function formatConditionSummary(condition: PayRuleCondition): string {
  if (condition.condition_type === "allowance") {
    const trigger = formatAllowanceTriggerLabel(
      condition.allowance_trigger ?? "all_hours_worked",
      condition.hours_threshold
    );
    const payout = formatPayoutUnitLabel(condition.payout_unit ?? "daily_flat_1x");
    return `${condition.condition_name}: ${trigger} · ${payout}`;
  }

  const days = formatApplicableDays(condition.applicable_days);
  const time = formatTimeConditionLabel(
    condition.time_condition,
    condition.hours_threshold
  );
  const multiplierShort: Record<PayRuleMultiplierType, string> = {
    standard_1x: "1.0x",
    time_and_half_1_5x: "1.5x",
    double_2x: "2.0x",
    flat_daily: "Flat Daily",
  };

  return `${condition.condition_name}: ${days} ${time} @ ${multiplierShort[condition.pay_multiplier_type]}`;
}

function allowanceToLegacyFields(condition: PayRuleConditionInput): {
  time_condition: PayRuleTimeCondition;
  pay_multiplier_type: PayRuleMultiplierType;
} {
  if (condition.condition_type !== "allowance") {
    return {
      time_condition: condition.time_condition,
      pay_multiplier_type: condition.pay_multiplier_type,
    };
  }

  const trigger = condition.allowance_trigger ?? "all_hours_worked";
  const payout = condition.payout_unit ?? "daily_flat_1x";

  let time_condition: PayRuleTimeCondition = "all_hours_worked";
  if (trigger === "hours_gte_threshold") time_condition = "after_n_hours";
  if (trigger === "flat_per_day_worked") time_condition = "flat_daily_allowance";

  const pay_multiplier_type: PayRuleMultiplierType =
    payout === "daily_flat_1x" ? "flat_daily" : "standard_1x";

  return { time_condition, pay_multiplier_type };
}

export function sanitizePayRuleTemplateInput(
  input: PayRuleTemplateInput
): PayRuleTemplateInput {
  const templateName = String(input.name ?? "").trim();

  return {
    name: templateName,
    conditions: withMealAllowanceCondition(
      withStandardLeaveConditions(input.conditions ?? []),
      templateName
    ).map((condition, index) => {
      const conditionType = normalizeConditionType(condition.condition_type);
      const legacy = allowanceToLegacyFields({ ...condition, condition_type: conditionType });

      return {
        condition_type: conditionType,
        condition_name: String(condition.condition_name ?? "").trim(),
        applicable_days: (condition.applicable_days ?? []).filter((day) =>
          WEEKDAY_ORDER.includes(day)
        ),
        time_condition:
          conditionType === "allowance"
            ? legacy.time_condition
            : normalizeTimeCondition(condition.time_condition),
        hours_threshold: toNumber(condition.hours_threshold),
        pay_multiplier_type:
          conditionType === "allowance"
            ? legacy.pay_multiplier_type
            : normalizeMultiplierType(condition.pay_multiplier_type),
        allowance_trigger:
          conditionType === "allowance"
            ? normalizeAllowanceTrigger(condition.allowance_trigger)
            : null,
        payout_unit:
          conditionType === "allowance"
            ? normalizePayoutUnit(condition.payout_unit)
            : null,
        sort_order: index,
      };
    }),
  };
}

export function mapConditionFormRowsToInput(
  rows: PayRuleConditionFormRow[]
): PayRuleConditionInput[] {
  return rows.map((row, index) => {
    const base = {
      condition_type: row.conditionType,
      condition_name: String(row.conditionName ?? "").trim(),
      applicable_days: row.applicableDays,
      hours_threshold: toNumber(row.hoursThreshold),
      sort_order: index,
    };

    if (row.conditionType === "allowance") {
      const legacy = allowanceToLegacyFields({
        ...base,
        time_condition: "all_hours_worked",
        pay_multiplier_type: "flat_daily",
        allowance_trigger: row.allowanceTrigger,
        payout_unit: row.payoutUnit,
      });

      return {
        ...base,
        time_condition: legacy.time_condition,
        pay_multiplier_type: legacy.pay_multiplier_type,
        allowance_trigger: row.allowanceTrigger,
        payout_unit: row.payoutUnit,
      };
    }

    return {
      ...base,
      time_condition: row.timeCondition,
      pay_multiplier_type: row.payMultiplierType,
      allowance_trigger: null,
      payout_unit: null,
    };
  });
}

export function templateToFormRows(template: PayRuleTemplate): PayRuleConditionFormRow[] {
  return template.conditions.map((condition) => ({
    clientId: condition.id,
    id: condition.id,
    conditionType: condition.condition_type,
    conditionName: condition.condition_name,
    applicableDays: condition.applicable_days,
    timeCondition: condition.time_condition,
    hoursThreshold: condition.hours_threshold,
    payMultiplierType: condition.pay_multiplier_type,
    allowanceTrigger: condition.allowance_trigger ?? "all_hours_worked",
    payoutUnit: condition.payout_unit ?? "daily_flat_1x",
  }));
}

export function createEmptyConditionRow(): PayRuleConditionFormRow {
  return {
    clientId: crypto.randomUUID(),
    conditionType: "pay_rate",
    conditionName: "",
    applicableDays: ["mon", "tue", "wed", "thu", "fri"],
    timeCondition: "first_n_hours",
    hoursThreshold: 8,
    payMultiplierType: "standard_1x",
    allowanceTrigger: "hours_gte_threshold",
    payoutUnit: "daily_flat_1x",
  };
}

export function createNswMealAllowancePresetRow(): PayRuleConditionFormRow {
  return {
    clientId: crypto.randomUUID(),
    conditionType: "allowance",
    conditionName: "Meal Allowance NSW",
    applicableDays: [...WEEKDAY_ORDER],
    timeCondition: "after_n_hours",
    hoursThreshold: MEAL_ALLOWANCE_HOURS_THRESHOLD,
    payMultiplierType: "flat_daily",
    allowanceTrigger: "hours_gte_threshold",
    payoutUnit: "daily_flat_1x",
  };
}

function formatSupabaseError(
  error: SupabaseRequestError | null | undefined,
  fallback: string
): string {
  if (!error) return fallback;
  const parts = [error.message, error.details, error.hint]
    .map((part) => String(part ?? "").trim())
    .filter(Boolean);
  return parts.length > 0 ? parts.join(" — ") : fallback;
}

function tableMissingMessage(): string {
  return "Pay rule tables are missing. Run migration 078_pay_rule_templates.sql in Supabase.";
}

function firstSelectedRow<T>(data: T | T[] | null | undefined): T | null {
  if (data == null) return null;
  if (Array.isArray(data)) return data.length > 0 ? data[0] : null;
  return data;
}

function zeroRowResultMessage(fallback: string): string {
  return fallback;
}

async function fetchConditionRowsByTemplateIds(
  templateIds: string[]
): Promise<Map<string, PayRuleCondition[]>> {
  const map = new Map<string, PayRuleCondition[]>();
  if (!isSupabaseConfigured() || templateIds.length === 0) return map;

  const { data, error } = await supabase
    .from(PAY_RULE_CONDITIONS_TABLE)
    .select("*")
    .in("template_id", templateIds)
    .order("sort_order", { ascending: true });

  if (error) {
    console.warn("[pay-rules] fetch conditions failed:", error.message);
    return map;
  }

  for (const row of data ?? []) {
    const condition = mapPayRuleCondition(row as Record<string, unknown>);
    const list = map.get(condition.template_id) ?? [];
    list.push(condition);
    map.set(condition.template_id, list);
  }

  return map;
}

export async function fetchPayRuleTemplatesWithConditions(): Promise<{
  templates: PayRuleTemplate[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { templates: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from(PAY_RULE_TEMPLATES_TABLE)
    .select(`${PAY_RULE_TEMPLATE_COLUMNS},pay_rule_conditions(*)`)
    .order("name", { ascending: true });

  if (error) {
    if (isSupabaseRelationMissingError(error)) {
      return { templates: [], error: tableMissingMessage() };
    }
    if (isSupabaseZeroRowsError(error)) {
      return { templates: [], error: null };
    }
    return { templates: [], error: error.message };
  }

  const rows = Array.isArray(data) ? data : data ? [data] : [];
  return {
    templates: sortPayRuleTemplates(
      mapPayRuleTemplatesFromJoin(rows as Record<string, unknown>[])
    ),
    error: null,
  };
}

export async function fetchPayRuleTemplates(): Promise<{
  templates: PayRuleTemplate[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { templates: [], error: "Supabase is not configured." };
  }

  const { data, error } = await supabase
    .from(PAY_RULE_TEMPLATES_TABLE)
    .select(PAY_RULE_TEMPLATE_COLUMNS)
    .order("name", { ascending: true });

  if (error) {
    if (isSupabaseRelationMissingError(error)) {
      return { templates: [], error: tableMissingMessage() };
    }
    return { templates: [], error: error.message };
  }

  const templateRows = (data ?? []) as Record<string, unknown>[];
  const conditionsByTemplate = await fetchConditionRowsByTemplateIds(
    templateRows.map((row) => String(row.id))
  );

  return {
    templates: templateRows.map((row) =>
      mapPayRuleTemplate(row, conditionsByTemplate.get(String(row.id)) ?? [])
    ),
    error: null,
  };
}

async function insertConditions(
  templateId: string,
  conditions: PayRuleConditionInput[]
): Promise<string | null> {
  const client = await resolvePayRuleWriteClient();
  return saveConditionsWithClient(client, templateId, conditions);
}

export async function createPayRuleTemplate(
  input: PayRuleTemplateInput
): Promise<{ template: PayRuleTemplate | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { template: null, error: "Supabase is not configured." };
  }

  const client = await resolvePayRuleWriteClient();
  return createPayRuleTemplateWithClient(client, input);
}

async function updatePayRuleTemplateWithClient(
  client: SupabaseClient,
  id: string,
  input: PayRuleTemplateInput
): Promise<{ template: PayRuleTemplate | null; error: string | null }> {
  const sanitized = sanitizePayRuleTemplateInput(input);

  if (!sanitized.name) {
    return { template: null, error: "Template name is required." };
  }

  if (sanitized.conditions.length === 0) {
    return { template: null, error: "Add at least one rule condition." };
  }

  const { data, error } = await client
    .from(PAY_RULE_TEMPLATES_TABLE)
    .update({
      name: sanitized.name,
    })
    .eq("id", id)
    .select(PAY_RULE_TEMPLATE_COLUMNS);

  const row = firstSelectedRow(data as Record<string, unknown>[] | null);

  if (error) {
    if (isSupabaseZeroRowsError(error)) {
      return {
        template: null,
        error: zeroRowResultMessage("Pay rule template not found."),
      };
    }
    return {
      template: null,
      error: formatSupabaseError(toSupabaseRequestError(error), "Failed to update pay rule."),
    };
  }

  if (!row) {
    return {
      template: null,
      error: zeroRowResultMessage("Pay rule template not found."),
    };
  }

  const conditionError = await saveConditionsWithClient(client, id, sanitized.conditions);
  if (conditionError) {
    return { template: null, error: conditionError };
  }

  const conditionsByTemplate = await fetchConditionRowsByTemplateIdsWithClient(client, [id]);
  return {
    template: mapPayRuleTemplate(row, conditionsByTemplate.get(id) ?? []),
    error: null,
  };
}

export async function updatePayRuleTemplate(
  id: string,
  input: PayRuleTemplateInput
): Promise<{ template: PayRuleTemplate | null; error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { template: null, error: "Supabase is not configured." };
  }

  const client = await resolvePayRuleWriteClient();
  return updatePayRuleTemplateWithClient(client, id, input);
}

export async function deletePayRuleTemplate(
  id: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const client = await resolvePayRuleWriteClient();
  const { error } = await client.from(PAY_RULE_TEMPLATES_TABLE).delete().eq("id", id);
  if (error) {
    console.error("[pay-rule-templates] Failed to delete pay_rule_template:", {
      templateId: id,
      message: error.message,
      details: error.details,
      code: error.code,
    });
  }
  return { error: error?.message ?? null };
}

export async function updateWorkerPayRuleTemplateId(
  workerId: string,
  templateId: string | null
): Promise<{ error: string | null }> {
  if (!workerId.trim()) {
    return { error: "Worker id is required." };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const { error } = await supabase
    .from("workers")
    .update({ pay_rule_template_id: templateId })
    .eq("id", workerId.trim());

  if (error) {
    if (
      isSupabaseMissingColumnError(error) ||
      isSupabaseSchemaOrConstraintError(error)
    ) {
      if (error.message.toLowerCase().includes("pay_rule_template_id")) {
        return {
          error:
            "workers.pay_rule_template_id column is missing. Run migration 078_pay_rule_templates.sql.",
        };
      }
    }
    return { error: error.message };
  }

  return { error: null };
}

export async function batchUpdateWorkerPayRuleTemplateIds(
  assignments: Array<{ workerId: string; templateId: string | null }>
): Promise<{ updated: number; error: string | null }> {
  if (assignments.length === 0) {
    return { updated: 0, error: null };
  }

  let updated = 0;
  let lastError: string | null = null;

  for (const assignment of assignments) {
    const result = await updateWorkerPayRuleTemplateId(
      assignment.workerId,
      assignment.templateId
    );
    if (result.error) {
      lastError = result.error;
      continue;
    }
    updated += 1;
  }

  return { updated, error: lastError };
}

export const ANNUAL_LEAVE_LOADING_CONDITION_NAME = "Annual Leave Loading";
export const ANNUAL_LEAVE_PAY_CONDITION_NAME = "Annual Leave Pay";

export type StandardLeaveConditionName =
  | "Personal Leave Pay"
  | typeof ANNUAL_LEAVE_PAY_CONDITION_NAME
  | typeof ANNUAL_LEAVE_LOADING_CONDITION_NAME
  | "RDO Taken"
  | "Leave Without Pay"
  | "Public Holiday Pay";

const STANDARD_LEAVE_CONDITION_SPECS: Array<{
  name: StandardLeaveConditionName;
  hoursThreshold: number;
}> = [
  { name: "Personal Leave Pay", hoursThreshold: 8 },
  { name: ANNUAL_LEAVE_PAY_CONDITION_NAME, hoursThreshold: 8 },
  { name: ANNUAL_LEAVE_LOADING_CONDITION_NAME, hoursThreshold: 8 },
  { name: "RDO Taken", hoursThreshold: 8 },
  { name: "Leave Without Pay", hoursThreshold: 0 },
  { name: "Public Holiday Pay", hoursThreshold: 8 },
];

/** WA-style flat leave entitlements applied when matching leave is booked. */
export function buildStandardSiteWorkerLeaveCondition(
  name: StandardLeaveConditionName,
  sortOrder: number
): PayRuleConditionInput {
  const spec = STANDARD_LEAVE_CONDITION_SPECS.find((entry) => entry.name === name);
  const hoursThreshold = spec?.hoursThreshold ?? 8;

  return {
    condition_type: "allowance",
    condition_name: name,
    applicable_days: [...WEEKDAY_ORDER],
    time_condition: "flat_daily_allowance",
    hours_threshold: hoursThreshold,
    pay_multiplier_type: "flat_daily",
    allowance_trigger: "flat_per_day_worked",
    payout_unit: "daily_flat_1x",
    sort_order: sortOrder,
  };
}

export function buildStandardSiteWorkerLeaveConditions(
  startSortOrder: number
): PayRuleConditionInput[] {
  return STANDARD_LEAVE_CONDITION_SPECS.map((spec, index) =>
    buildStandardSiteWorkerLeaveCondition(spec.name, startSortOrder + index)
  );
}

/** Ensure every pay rule template includes the standard leave set (incl. Annual Leave Loading). */
export function withStandardLeaveConditions(
  conditions: PayRuleConditionInput[]
): PayRuleConditionInput[] {
  const existing = new Set(
    conditions.map((condition) => condition.condition_name.trim().toLowerCase())
  );
  const missingSpecs = STANDARD_LEAVE_CONDITION_SPECS.filter(
    (spec) => !existing.has(spec.name.toLowerCase())
  );

  if (missingSpecs.length === 0) {
    return conditions;
  }

  const maxSort = conditions.reduce(
    (max, condition) => Math.max(max, condition.sort_order),
    -1
  );
  let nextSort = maxSort + 1;

  const appended = missingSpecs.map((spec) =>
    buildStandardSiteWorkerLeaveCondition(spec.name, nextSort++)
  );

  return [...conditions, ...appended];
}

function isMealAllowanceConditionName(name: string): boolean {
  return name.toLowerCase().includes("meal allowance");
}

function resolveMealAllowanceConditionName(templateName?: string): string {
  if (!templateName) return "Meal Allowance NSW";
  if (templateName.includes("WA")) return "Meal Allowance WA";
  if (templateName.includes("ACT")) return "Meal Allowance ACT";
  if (templateName.includes("NZ")) return "Meal Allowance NZ";
  return "Meal Allowance NSW";
}

/** WA-style meal allowance — flat daily rate when net worked hours reach the threshold. */
export function buildMealAllowanceCondition(
  sortOrder: number,
  conditionName = "Meal Allowance NSW"
): PayRuleConditionInput {
  return {
    condition_type: "allowance",
    condition_name: conditionName,
    applicable_days: [...WEEKDAY_ORDER],
    time_condition: "after_n_hours",
    hours_threshold: MEAL_ALLOWANCE_HOURS_THRESHOLD,
    pay_multiplier_type: "flat_daily",
    allowance_trigger: "hours_gte_threshold",
    payout_unit: "daily_flat_1x",
    sort_order: sortOrder,
  };
}

/** Normalize or inject meal allowance on every pay rule template. */
export function withMealAllowanceCondition(
  conditions: PayRuleConditionInput[],
  templateName?: string
): PayRuleConditionInput[] {
  let updated = conditions.map((condition) => {
    if (!isMealAllowanceConditionName(condition.condition_name)) {
      return condition;
    }

    return {
      ...condition,
      hours_threshold: MEAL_ALLOWANCE_HOURS_THRESHOLD,
      allowance_trigger: "hours_gte_threshold" as AllowanceTrigger,
      time_condition: "after_n_hours" as PayRuleTimeCondition,
      pay_multiplier_type: "flat_daily" as PayRuleMultiplierType,
      payout_unit: "daily_flat_1x" as AllowancePayoutUnit,
    };
  });

  if (updated.some((condition) => isMealAllowanceConditionName(condition.condition_name))) {
    return updated;
  }

  const leaveSortOrders = updated
    .filter((condition) => isLeavePayRuleConditionName(condition.condition_name))
    .map((condition) => condition.sort_order);
  const insertSort =
    leaveSortOrders.length > 0 ? Math.min(...leaveSortOrders) : updated.length;

  updated = updated.map((condition) =>
    condition.sort_order >= insertSort
      ? { ...condition, sort_order: condition.sort_order + 1 }
      : condition
  );

  return [
    ...updated,
    buildMealAllowanceCondition(
      insertSort,
      resolveMealAllowanceConditionName(templateName)
    ),
  ];
}

function isLeavePayRuleConditionName(name: string): boolean {
  const normalized = name.toLowerCase();
  return (
    normalized.includes("leave") ||
    normalized.includes("rdo") ||
    normalized.includes("holiday") ||
    normalized.includes("without pay")
  );
}

export const NSW_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput = {
  name: NSW_SITE_WORKER_TEMPLATE_NAME,
  conditions: [
    {
      condition_type: "pay_rate",
      condition_name: "Basic Pay",
      applicable_days: ["mon", "tue", "wed", "thu", "fri"],
      time_condition: "first_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "standard_1x",
      sort_order: 0,
    },
    {
      condition_type: "pay_rate",
      condition_name: "Overtime",
      applicable_days: ["mon", "tue", "wed", "thu", "fri"],
      time_condition: "after_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "double_2x",
      sort_order: 1,
    },
    {
      condition_type: "pay_rate",
      condition_name: "Double Pay",
      applicable_days: ["sat"],
      time_condition: "all_hours_worked",
      hours_threshold: 0,
      pay_multiplier_type: "double_2x",
      sort_order: 2,
    },
    {
      condition_type: "pay_rate",
      condition_name: "Double Pay",
      applicable_days: ["sun"],
      time_condition: "all_hours_worked",
      hours_threshold: 0,
      pay_multiplier_type: "double_2x",
      sort_order: 3,
    },
    {
      condition_type: "allowance",
      condition_name: "Site Allowance 2026",
      applicable_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      time_condition: "all_hours_worked",
      hours_threshold: 0,
      pay_multiplier_type: "standard_1x",
      allowance_trigger: "all_hours_worked",
      payout_unit: "per_hour_worked",
      sort_order: 4,
    },
    {
      condition_type: "allowance",
      condition_name: "Travel Allowance NSW",
      applicable_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      time_condition: "flat_daily_allowance",
      hours_threshold: 0,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
      sort_order: 5,
    },
    {
      condition_type: "allowance",
      condition_name: "Meal Allowance NSW",
      applicable_days: ["mon", "tue", "wed", "thu", "fri", "sat", "sun"],
      time_condition: "after_n_hours",
      hours_threshold: MEAL_ALLOWANCE_HOURS_THRESHOLD,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "hours_gte_threshold",
      payout_unit: "daily_flat_1x",
      sort_order: 6,
    },
    ...buildStandardSiteWorkerLeaveConditions(7),
  ],
};

export const WA_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput = {
  name: WA_SITE_WORKER_TEMPLATE_NAME,
  conditions: [
    {
      condition_type: "pay_rate",
      condition_name: "Base Hourly",
      applicable_days: ["mon", "tue", "wed", "thu", "fri"],
      time_condition: "first_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "standard_1x",
      sort_order: 0,
    },
    {
      condition_type: "pay_rate",
      condition_name: "Overtime 1.5x (Mon-Fri)",
      applicable_days: ["mon", "tue", "wed", "thu", "fri"],
      time_condition: "after_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "time_and_half_1_5x",
      sort_order: 1,
    },
    {
      condition_type: "pay_rate",
      condition_name: "Overtime 1.5x (Weekend)",
      applicable_days: ["sat", "sun"],
      time_condition: "all_hours_worked",
      hours_threshold: 0,
      pay_multiplier_type: "time_and_half_1_5x",
      sort_order: 2,
    },
    buildMealAllowanceCondition(3, "Meal Allowance WA"),
    ...buildStandardSiteWorkerLeaveConditions(4),
  ],
};

function cloneNswSiteWorkerTemplate(
  templateName: string,
  travelAllowanceName: string
): PayRuleTemplateInput {
  return {
    name: templateName,
    conditions: NSW_SITE_WORKER_TEMPLATE_INPUT.conditions.map((condition) => ({
      ...condition,
      condition_name:
        condition.condition_name === "Travel Allowance NSW"
          ? travelAllowanceName
          : condition.condition_name,
    })),
  };
}

export const ACT_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput =
  cloneNswSiteWorkerTemplate(ACT_SITE_WORKER_TEMPLATE_NAME, "Travel Allowance ACT");

export const VIC_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput =
  cloneNswSiteWorkerTemplate(VIC_SITE_WORKER_TEMPLATE_NAME, "Travel Allowance VIC");

export const QLD_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput =
  cloneNswSiteWorkerTemplate(QLD_SITE_WORKER_TEMPLATE_NAME, "Travel Allowance QLD");

export const NZ_SITE_WORKER_TEMPLATE_INPUT: PayRuleTemplateInput = {
  name: NZ_SITE_WORKER_TEMPLATE_NAME,
  conditions: WA_SITE_WORKER_TEMPLATE_INPUT.conditions.map((condition) => ({
    ...condition,
    condition_name: condition.condition_name.replace(/\bWA\b/g, "NZ"),
  })),
};

const DEFAULT_PAY_RULE_TEMPLATE_INPUTS: PayRuleTemplateInput[] = [
  WA_SITE_WORKER_TEMPLATE_INPUT,
  NSW_SITE_WORKER_TEMPLATE_INPUT,
  ACT_SITE_WORKER_TEMPLATE_INPUT,
  VIC_SITE_WORKER_TEMPLATE_INPUT,
  QLD_SITE_WORKER_TEMPLATE_INPUT,
  NZ_SITE_WORKER_TEMPLATE_INPUT,
];

const PAY_RULE_TEMPLATE_INPUT_BY_NAME: Record<string, PayRuleTemplateInput> =
  Object.fromEntries(
    DEFAULT_PAY_RULE_TEMPLATE_INPUTS.map((input) => [input.name, input])
  );

export function getPayRuleTemplateInputByName(
  name: string
): PayRuleTemplateInput | null {
  const trimmed = String(name ?? "").trim();
  return trimmed ? (PAY_RULE_TEMPLATE_INPUT_BY_NAME[trimmed] ?? null) : null;
}

export async function ensureDefaultPayRuleTemplates(): Promise<{
  created: number;
  error: string | null;
}> {
  let created = 0;

  for (const preset of DEFAULT_PAY_RULE_TEMPLATE_INPUTS) {
    const result = await ensurePayRuleTemplateByName(preset);
    if (result.error) {
      return { created, error: result.error };
    }
    if (result.created) created += 1;
  }

  return { created, error: null };
}

export async function ensurePayRuleTemplateByName(
  input: PayRuleTemplateInput
): Promise<{ template: PayRuleTemplate | null; created: boolean; error: string | null }> {
  const existing = await fetchPayRuleTemplates();
  if (existing.error?.includes("Pay rule tables are missing")) {
    return { template: null, created: false, error: existing.error };
  }

  const found = existing.templates.find((template) => template.name === input.name);
  if (found) {
    return { template: found, created: false, error: null };
  }

  const created = await createPayRuleTemplate(input);
  if (created.error || !created.template) {
    return {
      template: null,
      created: false,
      error: created.error ?? `Failed to create ${input.name} template.`,
    };
  }

  return { template: created.template, created: true, error: null };
}

export async function ensureNswSiteWorkerPayRuleTemplate(): Promise<{
  template: PayRuleTemplate | null;
  created: boolean;
  error: string | null;
}> {
  return ensurePayRuleTemplateByName(NSW_SITE_WORKER_TEMPLATE_INPUT);
}
