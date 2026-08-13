import {
  ACT_SITE_WORKER_TEMPLATE_NAME,
  fetchPayRuleTemplateIdByName,
  NSW_SITE_WORKER_TEMPLATE_NAME,
  NZ_SITE_WORKER_TEMPLATE_NAME,
  updateWorkerPayRuleTemplateId,
  WA_SITE_WORKER_TEMPLATE_NAME,
} from "./pay-rule-templates";
import { updateWorkerPayRuleId } from "./pay-rules-assignment";
import {
  isWorkerStateRegion,
  type WorkerStateRegion,
} from "./worker-state-region";

export const TRAVEL_NSW_CATEGORY = "Travel NSW";
export const TRAVEL_NSW_APPRENTICE_CATEGORY = "Travel NSW Apprentice";

/** Map worker state/region to the default pay rule template name. */
export function resolvePayRuleTemplateNameForWorker(
  state: WorkerStateRegion | string | null | undefined
): string | null {
  if (!state || !isWorkerStateRegion(state)) return null;

  switch (state) {
    case "NSW":
      return NSW_SITE_WORKER_TEMPLATE_NAME;
    case "WA":
      return WA_SITE_WORKER_TEMPLATE_NAME;
    case "ACT":
      return ACT_SITE_WORKER_TEMPLATE_NAME;
    case "NZ":
      return NZ_SITE_WORKER_TEMPLATE_NAME;
    default:
      return null;
  }
}

/** Payroll export category for NSW travel — apprentice uses a separate MYOB category. */
export function resolveTravelPayrollCategory(
  isApprentice: boolean,
  state?: WorkerStateRegion | string | null
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
  state: WorkerStateRegion | string | null | undefined,
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
      error: `Pay rule template "${templateName}" was not found. Run pay rule migrations or seed templates.`,
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

/** Assign an explicit pay rule/template selection to a worker. */
export async function assignPayRuleToWorker(
  workerId: string,
  payRuleId: string | null
): Promise<{ error: string | null }> {
  const normalizedId = payRuleId?.trim() || null;
  if (!normalizedId) {
    return { error: null };
  }

  const { error: templateError } = await updateWorkerPayRuleTemplateId(
    workerId,
    normalizedId
  );
  if (templateError) {
    return { error: templateError };
  }

  return updateWorkerPayRuleId(workerId, normalizedId);
}
