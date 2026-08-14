import { supabase, isSupabaseConfigured } from "./supabase";

export const PAY_RULES_TABLE = "pay_rules";

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
