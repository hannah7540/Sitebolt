import type { SupabaseClient } from "@supabase/supabase-js";
import {
  ACT_SITE_WORKER_TEMPLATE_NAME,
  fetchPayRuleTemplateIdByName,
  fetchPayRuleTemplateIdByNameAdmin,
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
 * Assign the state-default pay rule template to a worker (browser/client).
 * Never surfaces pay rule / condition errors to the UI — logs and continues.
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

  try {
    if (typeof window !== "undefined") {
      const response = await fetch("/api/workers/assign-pay-rule", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ workerId, state }),
      });
      const payload = (await response.json().catch(() => null)) as {
        templateId?: string | null;
        templateName?: string | null;
      } | null;

      if (!response.ok) {
        console.warn(
          "[assignDefaultPayRuleToWorker] Pay rule assignment skipped:",
          payload
        );
        return {
          templateId: payload?.templateId ?? null,
          templateName: payload?.templateName ?? templateName,
          error: null,
        };
      }

      return {
        templateId: payload?.templateId ?? null,
        templateName: payload?.templateName ?? templateName,
        error: null,
      };
    }

    const { id } = await fetchPayRuleTemplateIdByName(templateName);
    if (!id) {
      console.warn(
        `[assignDefaultPayRuleToWorker] Pay rule template "${templateName}" not resolved; continuing.`
      );
      return { templateId: null, templateName, error: null };
    }

    await updateWorkerPayRuleTemplateId(workerId, id);
    await updateWorkerPayRuleId(workerId, id);

    return { templateId: id, templateName, error: null };
  } catch (err) {
    console.warn("Pay rule save skipped:", err);
    return { templateId: null, templateName, error: null };
  }
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

  try {
    const resolved = await fetchPayRuleTemplateIdByNameAdmin(admin, templateName);
    const templateId = resolved.id;

    if (!templateId) {
      console.warn(
        `[assignDefaultPayRuleToWorkerAdmin] Pay rule template "${templateName}" not resolved; continuing.`
      );
      return { templateId: null, templateName, error: null };
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
      console.warn(
        "[assignDefaultPayRuleToWorkerAdmin] Pay rule worker update skipped:",
        updateError.message
      );
      return { templateId: null, templateName, error: null };
    }

    return { templateId, templateName, error: null };
  } catch (err) {
    console.warn("Pay rule save skipped:", err);
    return { templateId: null, templateName, error: null };
  }
}
