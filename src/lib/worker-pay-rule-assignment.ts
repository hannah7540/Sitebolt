import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACT_SITE_WORKER_TEMPLATE_NAME,
  fetchPayRuleTemplateIdByName,
  NSW_SITE_WORKER_TEMPLATE_NAME,
  NZ_SITE_WORKER_TEMPLATE_NAME,
  QLD_SITE_WORKER_TEMPLATE_NAME,
  VIC_SITE_WORKER_TEMPLATE_NAME,
  WA_SITE_WORKER_TEMPLATE_NAME,
  updateWorkerPayRuleTemplateId,
} from "./pay-rule-templates";
import { updateWorkerPayRuleId } from "./pay-rules-assignment";
import { normalizeWorkerStateRegion } from "./worker-state-region";

export const TRAVEL_NSW_CATEGORY = "Travel NSW";
export const TRAVEL_NSW_APPRENTICE_CATEGORY = "Travel NSW Apprentice";

/**
 * State → pay rule template name (assigned automatically; never collected in UI forms).
 * ACT → ACT Site Worker, NSW → NSW Site Worker, WA → WA Site Worker, NZ → NZ Site Worker.
 * Other states fall back to "[STATE] Site Worker".
 */
export const STATE_PAY_RULE_TEMPLATE_NAMES: Record<string, string> = {
  ACT: ACT_SITE_WORKER_TEMPLATE_NAME,
  NSW: NSW_SITE_WORKER_TEMPLATE_NAME,
  WA: WA_SITE_WORKER_TEMPLATE_NAME,
  NZ: NZ_SITE_WORKER_TEMPLATE_NAME,
  VIC: VIC_SITE_WORKER_TEMPLATE_NAME,
  QLD: QLD_SITE_WORKER_TEMPLATE_NAME,
};

/** Map worker state/region to the default pay rule template name. */
export function resolvePayRuleTemplateNameForWorker(
  state: string | null | undefined
): string | null {
  const normalized = normalizeWorkerStateRegion(state) ?? state?.trim().toUpperCase();
  if (!normalized) return null;

  return (
    STATE_PAY_RULE_TEMPLATE_NAMES[normalized] ?? `${normalized} Site Worker`
  );
}

/** Payroll export category for NSW travel — apprentice uses a separate MYOB category. */
export function resolveTravelPayrollCategory(
  isApprentice: boolean,
  state?: string | null
): string {
  if (state === "NSW" || !state) {
    return isApprentice ? TRAVEL_NSW_APPRENTICE_CATEGORY : TRAVEL_NSW_CATEGORY;
  }
  return TRAVEL_NSW_CATEGORY;
}

export interface AssignDefaultPayRuleResult {
  templateId: string | null;
  templateName: string | null;
  error: string | null;
}

/**
 * Assign the state-default pay rule template to a worker.
 * NSW workers always receive "NSW Site Worker"; apprentice travel is resolved at export time.
 */
export async function assignDefaultPayRuleToWorker(
  workerId: string,
  state: string | null | undefined,
  _isApprentice = false
): Promise<AssignDefaultPayRuleResult> {
  const templateName = resolvePayRuleTemplateNameForWorker(state);
  if (!templateName) {
    return { templateId: null, templateName: null, error: null };
  }

  const { id, error: fetchError } = await fetchPayRuleTemplateIdByName(templateName);
  if (fetchError) {
    return { templateId: null, templateName, error: fetchError };
  }
  if (!id) {
    return {
      templateId: null,
      templateName,
      error: `Pay rule template "${templateName}" could not be resolved.`,
    };
  }

  const { error: templateError } = await updateWorkerPayRuleTemplateId(workerId, id);
  if (templateError) {
    return { templateId: null, templateName, error: templateError };
  }

  const { error: ruleError } = await updateWorkerPayRuleId(workerId, id);
  if (ruleError) {
    return { templateId: id, templateName, error: ruleError };
  }

  return { templateId: id, templateName, error: null };
}

/** Server-side pay rule assignment using the Supabase admin/service client. */
export async function assignDefaultPayRuleToWorkerAdmin(
  admin: SupabaseClient,
  workerId: string,
  state: string | null | undefined,
  _isApprentice = false
): Promise<AssignDefaultPayRuleResult> {
  const templateName = resolvePayRuleTemplateNameForWorker(state);
  if (!templateName) {
    return { templateId: null, templateName: null, error: null };
  }

  let templateId: string | null = null;
  const { data: existingTemplate, error: lookupError } = await admin
    .from("pay_rule_templates")
    .select("id")
    .eq("name", templateName)
    .limit(1)
    .maybeSingle();

  if (lookupError) {
    return { templateId: null, templateName, error: lookupError.message };
  }

  if (existingTemplate?.id) {
    templateId = String(existingTemplate.id);
  } else {
    const ensured = await fetchPayRuleTemplateIdByName(templateName);
    if (ensured.error) {
      return { templateId: null, templateName, error: ensured.error };
    }
    templateId = ensured.id;
  }

  if (!templateId) {
    return {
      templateId: null,
      templateName,
      error: `Pay rule template "${templateName}" could not be resolved.`,
    };
  }

  const { error: updateError } = await admin
    .from("workers")
    .update({
      pay_rule_template_id: templateId,
      pay_rule_id: templateId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", workerId);

  if (updateError) {
    return { templateId: null, templateName, error: updateError.message };
  }

  return { templateId, templateName, error: null };
}
