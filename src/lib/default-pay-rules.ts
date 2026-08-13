import {
  ACT_SITE_WORKER_TEMPLATE_INPUT,
  ACT_SITE_WORKER_TEMPLATE_NAME,
  NSW_SITE_WORKER_TEMPLATE_INPUT,
  NSW_SITE_WORKER_TEMPLATE_NAME,
  NZ_SITE_WORKER_TEMPLATE_INPUT,
  NZ_SITE_WORKER_TEMPLATE_NAME,
  PRESET_PAY_RULE_TEMPLATE_NAMES,
  WA_SITE_WORKER_TEMPLATE_NAME,
  type PayRuleCondition,
  type PayRuleConditionInput,
  type PayRuleTemplate,
  type PayRuleTemplateInput,
  type WeekdayCode,
} from "@/lib/pay-rule-templates";

export const DEFAULT_WA_SITE_WORKER_TEMPLATE_ID = "default-wa-site-worker";
export const DEFAULT_NSW_SITE_WORKER_TEMPLATE_ID = "default-nsw-site-worker";
export const DEFAULT_ACT_SITE_WORKER_TEMPLATE_ID = "default-act-site-worker";
export const DEFAULT_NZ_SITE_WORKER_TEMPLATE_ID = "default-nz-site-worker";

const WEEKDAYS: WeekdayCode[] = ["mon", "tue", "wed", "thu", "fri"];
const WEEKEND: WeekdayCode[] = ["sat", "sun"];
const ALL_DAYS: WeekdayCode[] = [...WEEKDAYS, ...WEEKEND];

/** Card display lines for the hardcoded WA Site Worker template. */
export const WA_SITE_WORKER_DISPLAY_LINES: string[] = [
  "Base Hourly | Mon-Fri | First 8 hours worked | 1.0x",
  "Overtime (1.5x) | Mon-Fri | After 8 hours worked | 1.5x",
  "Overtime (1.5x) | Sat-Sun | All hours worked | 1.5x",
  "Personal Leave Pay | Mon-Fri | Flat rate = 8 hours worked (Auto-applied on leave booked)",
  "Annual Leave Pay | Mon-Fri | Flat rate = 8 hours worked (Auto-applied on leave booked)",
  "Annual Leave Loading | Mon-Fri | Flat rate = 8 hours worked (Auto-applied on leave booked)",
  "RDO Taken | Mon-Fri | Flat rate = 8 hours worked (Auto-applied on leave booked)",
  "Leave Without Pay | Mon-Fri | Flat rate (Auto-applied on leave booked)",
  "Public Holiday Pay | Mon-Sun | Flat rate = 8 hours worked (Auto-applied on leave booked)",
];

function buildWaCondition(
  id: string,
  sortOrder: number,
  condition: Omit<PayRuleCondition, "id" | "template_id" | "sort_order">
): PayRuleCondition {
  return {
    id,
    template_id: DEFAULT_WA_SITE_WORKER_TEMPLATE_ID,
    sort_order: sortOrder,
    ...condition,
  };
}

const WA_SITE_WORKER_TEMPLATE: PayRuleTemplate = {
  id: DEFAULT_WA_SITE_WORKER_TEMPLATE_ID,
  name: WA_SITE_WORKER_TEMPLATE_NAME,
  conditions: [
    buildWaCondition("default-wa-c-0", 0, {
      condition_type: "pay_rate",
      condition_name: "Base Hourly",
      applicable_days: WEEKDAYS,
      time_condition: "first_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "standard_1x",
    }),
    buildWaCondition("default-wa-c-1", 1, {
      condition_type: "pay_rate",
      condition_name: "Overtime (1.5x)",
      applicable_days: WEEKDAYS,
      time_condition: "after_n_hours",
      hours_threshold: 8,
      pay_multiplier_type: "time_and_half_1_5x",
    }),
    buildWaCondition("default-wa-c-2", 2, {
      condition_type: "pay_rate",
      condition_name: "Overtime (1.5x)",
      applicable_days: WEEKEND,
      time_condition: "all_hours_worked",
      hours_threshold: 0,
      pay_multiplier_type: "time_and_half_1_5x",
    }),
    buildWaCondition("default-wa-c-3", 3, {
      condition_type: "allowance",
      condition_name: "Personal Leave Pay",
      applicable_days: WEEKDAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 8,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
    buildWaCondition("default-wa-c-4", 4, {
      condition_type: "allowance",
      condition_name: "Annual Leave Pay",
      applicable_days: WEEKDAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 8,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
    buildWaCondition("default-wa-c-5", 5, {
      condition_type: "allowance",
      condition_name: "Annual Leave Loading",
      applicable_days: WEEKDAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 8,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
    buildWaCondition("default-wa-c-6", 6, {
      condition_type: "allowance",
      condition_name: "RDO Taken",
      applicable_days: WEEKDAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 8,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
    buildWaCondition("default-wa-c-7", 7, {
      condition_type: "allowance",
      condition_name: "Leave Without Pay",
      applicable_days: WEEKDAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 0,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
    buildWaCondition("default-wa-c-8", 8, {
      condition_type: "allowance",
      condition_name: "Public Holiday Pay",
      applicable_days: ALL_DAYS,
      time_condition: "flat_daily_allowance",
      hours_threshold: 8,
      pay_multiplier_type: "flat_daily",
      allowance_trigger: "flat_per_day_worked",
      payout_unit: "daily_flat_1x",
    }),
  ],
};

function inputConditionToPayRuleCondition(
  templateId: string,
  condition: PayRuleConditionInput,
  index: number
): PayRuleCondition {
  return {
    id: `${templateId}-c-${index}`,
    template_id: templateId,
    condition_type: condition.condition_type,
    condition_name: condition.condition_name,
    applicable_days: condition.applicable_days,
    time_condition: condition.time_condition,
    hours_threshold: condition.hours_threshold,
    pay_multiplier_type: condition.pay_multiplier_type,
    allowance_trigger: condition.allowance_trigger,
    payout_unit: condition.payout_unit,
    sort_order: condition.sort_order,
  };
}

function inputToDefaultTemplate(
  templateId: string,
  input: PayRuleTemplateInput
): PayRuleTemplate {
  return {
    id: templateId,
    name: input.name,
    conditions: input.conditions.map((condition, index) =>
      inputConditionToPayRuleCondition(templateId, condition, index)
    ),
  };
}

const NSW_SITE_WORKER_TEMPLATE = inputToDefaultTemplate(
  DEFAULT_NSW_SITE_WORKER_TEMPLATE_ID,
  NSW_SITE_WORKER_TEMPLATE_INPUT
);

const ACT_SITE_WORKER_TEMPLATE = inputToDefaultTemplate(
  DEFAULT_ACT_SITE_WORKER_TEMPLATE_ID,
  ACT_SITE_WORKER_TEMPLATE_INPUT
);

const NZ_SITE_WORKER_TEMPLATE = inputToDefaultTemplate(
  DEFAULT_NZ_SITE_WORKER_TEMPLATE_ID,
  NZ_SITE_WORKER_TEMPLATE_INPUT
);

/** Hardcoded frontend fallback templates — always available offline. */
export const DEFAULT_PAY_RULES: PayRuleTemplate[] = [
  WA_SITE_WORKER_TEMPLATE,
  NSW_SITE_WORKER_TEMPLATE,
  ACT_SITE_WORKER_TEMPLATE,
  NZ_SITE_WORKER_TEMPLATE,
];

export function cloneDefaultPayRules(): PayRuleTemplate[] {
  return DEFAULT_PAY_RULES.map((template) => ({
    ...template,
    conditions: template.conditions.map((condition) => ({ ...condition })),
  }));
}

export function isDefaultPayRuleTemplate(template: PayRuleTemplate): boolean {
  return template.id.startsWith("default-");
}

export function getWaSiteWorkerDisplayLine(sortOrder: number): string | null {
  return WA_SITE_WORKER_DISPLAY_LINES[sortOrder] ?? null;
}

/** Always return preset templates — prefer Supabase rows when available. */
export function resolvePresetPayRuleTemplates(
  remote: PayRuleTemplate[] | null | undefined
): PayRuleTemplate[] {
  const defaults = cloneDefaultPayRules();
  const remoteList = remote ?? [];

  return PRESET_PAY_RULE_TEMPLATE_NAMES.map((presetName) => {
    const remoteMatch = remoteList.find((template) => template.name === presetName);
    if (remoteMatch) {
      return {
        ...remoteMatch,
        conditions: [...remoteMatch.conditions].sort((a, b) => a.sort_order - b.sort_order),
      };
    }
    const fallback = defaults.find((template) => template.name === presetName);
    return fallback ?? defaults[0];
  });
}

export function getDefaultTemplateByName(name: string): PayRuleTemplate | null {
  return cloneDefaultPayRules().find((template) => template.name === name) ?? null;
}
