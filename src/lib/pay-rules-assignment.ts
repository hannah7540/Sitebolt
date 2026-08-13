import { PAY_RULE_TEMPLATES_TABLE } from "./pay-rule-templates";
import { supabase, isSupabaseConfigured } from "./supabase";

export const PAY_RULES_TABLE = "pay_rules";

export interface PayRuleAssignmentOption {
  id: string;
  displayName: string;
  source: "pay_rule_templates" | "pay_rules";
  template_name?: string | null;
  rule_name?: string | null;
  name?: string | null;
  title?: string | null;
}

const PAY_RULE_LABEL_FIELDS = [
  "template_name",
  "rule_name",
  "name",
  "title",
] as const;

export function resolvePayRuleDisplayName(row: Record<string, unknown>): string {
  for (const field of PAY_RULE_LABEL_FIELDS) {
    const value = String(row[field] ?? "").trim();
    if (value) return value;
  }
  return "Unnamed Rule";
}

function mapPayRuleAssignmentRow(
  row: Record<string, unknown>,
  source: PayRuleAssignmentOption["source"]
): PayRuleAssignmentOption | null {
  if (row.id == null) return null;

  return {
    id: String(row.id),
    displayName: resolvePayRuleDisplayName(row),
    source,
    template_name: row.template_name != null ? String(row.template_name) : null,
    rule_name: row.rule_name != null ? String(row.rule_name) : null,
    name: row.name != null ? String(row.name) : null,
    title: row.title != null ? String(row.title) : null,
  };
}

function sortPayRuleOptions(rules: PayRuleAssignmentOption[]): PayRuleAssignmentOption[] {
  return [...rules].sort((left, right) =>
    left.displayName.localeCompare(right.displayName)
  );
}

async function fetchPayRuleTemplateRows(): Promise<{
  rules: PayRuleAssignmentOption[];
  error: string | null;
}> {
  const { data, error } = await supabase.from(PAY_RULE_TEMPLATES_TABLE).select("*");

  if (error) {
    console.error(
      "[pay-rules-assignment] Failed to fetch pay_rule_templates:",
      error.message,
      error
    );
    return { rules: [], error: error.message };
  }

  const rules = ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapPayRuleAssignmentRow(row, "pay_rule_templates"))
    .filter((row): row is PayRuleAssignmentOption => row != null);

  if (rules.length === 0) {
    console.warn("[pay-rules-assignment] pay_rule_templates query returned no rows.");
  }

  return { rules: sortPayRuleOptions(rules), error: null };
}

async function fetchLegacyPayRuleRows(): Promise<{
  rules: PayRuleAssignmentOption[];
  error: string | null;
}> {
  const { data, error } = await supabase.from(PAY_RULES_TABLE).select("*");

  if (error) {
    console.error(
      "[pay-rules-assignment] Failed to fetch pay_rules:",
      error.message,
      error
    );
    return { rules: [], error: error.message };
  }

  const rules = ((data ?? []) as Record<string, unknown>[])
    .map((row) => mapPayRuleAssignmentRow(row, "pay_rules"))
    .filter((row): row is PayRuleAssignmentOption => row != null);

  if (rules.length === 0) {
    console.warn("[pay-rules-assignment] pay_rules query returned no rows.");
  }

  return { rules: sortPayRuleOptions(rules), error: null };
}

/**
 * Load pay rules for admin assignment dropdowns.
 * Prefers Accounts -> Pay Rules templates, then falls back to pay_rules.
 */
export async function fetchPayRulesForAssignment(): Promise<{
  rules: PayRuleAssignmentOption[];
  error: string | null;
}> {
  if (!isSupabaseConfigured()) {
    return { rules: [], error: "Supabase is not configured." };
  }

  try {
    const templatesResult = await fetchPayRuleTemplateRows();
    if (templatesResult.rules.length > 0) {
      return templatesResult;
    }

    const legacyResult = await fetchLegacyPayRuleRows();
    if (legacyResult.rules.length > 0) {
      return legacyResult;
    }

    return {
      rules: [],
      error: templatesResult.error ?? legacyResult.error,
    };
  } catch (cause) {
    const message =
      cause instanceof Error ? cause.message : "Failed to load pay rules.";
    console.error("[pay-rules-assignment] Unexpected fetch error:", message, cause);
    return { rules: [], error: message };
  }
}

/** Persist the selected pay rule on workers.pay_rule_id. */
export async function updateWorkerPayRuleId(
  workerId: string,
  payRuleId: string | null
): Promise<{ error: string | null }> {
  if (!workerId.trim()) {
    return { error: "Worker id is required." };
  }

  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  const normalizedId = payRuleId?.trim() || null;

  const { error } = await supabase
    .from("workers")
    .update({ pay_rule_id: normalizedId })
    .eq("id", workerId.trim());

  if (error) {
    console.error(
      "[pay-rules-assignment] Failed to update workers.pay_rule_id:",
      error.message,
      error
    );

    if (error.message.toLowerCase().includes("pay_rule_id")) {
      return {
        error:
          "workers.pay_rule_id column is missing. Add pay_rule_id on workers in Supabase.",
      };
    }

    return { error: error.message };
  }

  return { error: null };
}
