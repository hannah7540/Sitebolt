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
  SA: "SA Site Worker",
  TAS: "TAS Site Worker",
  NT: "NT Site Worker",
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

/** Extract state code from a pay rule template display name (e.g. "ACT Site Worker" → ACT). */
export function stateCodeForPayRuleTemplateName(templateName: string): string | null {
  for (const [state, name] of Object.entries(STATE_PAY_RULE_TEMPLATE_NAMES)) {
    if (name === templateName) return state;
  }

  const match = templateName.trim().match(/^([A-Z]{2,3})\b/i);
  return match?.[1]?.toUpperCase() ?? null;
}

/** True when worker is linked by template id or matching state/region. */
export function workerMatchesPayRuleTemplate(
  worker: {
    state?: string | null;
    pay_rule_template_id?: string | null;
    pay_rule_id?: string | null;
  },
  templateName: string,
  templateId: string | null
): boolean {
  if (templateId) {
    if (worker.pay_rule_template_id === templateId) return true;
    if (worker.pay_rule_id === templateId) return true;
  }

  const templateState = stateCodeForPayRuleTemplateName(templateName);
  if (!templateState || !worker.state) return false;

  const workerState =
    normalizeWorkerStateRegion(worker.state) ?? worker.state.trim().toUpperCase();
  return workerState === templateState;
}

function normalizeWorkerStateForPayRule(
  state: string | null | undefined
): string | null {
  return normalizeWorkerStateRegion(state) ?? state?.trim().toUpperCase() ?? null;
}

/** Resolve pay_rule_templates.id by worker state (exact name, then ILIKE fallback). */
async function lookupPayRuleTemplateIdByStateAdmin(
  admin: SupabaseClient,
  state: string | null | undefined
): Promise<{ id: string | null; templateName: string | null }> {
  const normalized = normalizeWorkerStateForPayRule(state);
  if (!normalized) {
    return { id: null, templateName: null };
  }

  const templateName = resolvePayRuleTemplateNameForWorker(normalized);
  if (templateName) {
    const byName = await fetchPayRuleTemplateIdByNameAdmin(admin, templateName);
    if (byName.id) {
      return { id: byName.id, templateName };
    }
  }

  const { data, error } = await admin
    .from("pay_rule_templates")
    .select("id,name")
    .ilike("name", `%${normalized}%`)
    .order("name", { ascending: true })
    .limit(10);

  if (error) {
    console.warn("[pay-rule-assignment] Template ILIKE lookup failed:", error.message);
    return { id: null, templateName: templateName ?? null };
  }

  const rows = (data ?? []) as Array<{ id: string; name: string }>;
  const match =
    rows.find((row) => row.name.toUpperCase().includes(normalized)) ??
    rows.find((row) => row.name.toLowerCase().includes("site worker")) ??
    rows[0];

  if (!match?.id) {
    return { id: null, templateName: templateName ?? null };
  }

  return { id: String(match.id), templateName: match.name };
}

/** Set pay_rule_template_id from worker state when missing or out of sync. */
export async function syncWorkerPayRuleTemplateFromStateAdmin(
  admin: SupabaseClient,
  workerId: string,
  stateOverride?: string | null
): Promise<{ templateId: string | null; updated: boolean }> {
  const trimmedId = workerId.trim();
  if (!trimmedId) {
    return { templateId: null, updated: false };
  }

  let state = stateOverride ?? null;

  const { data: workerRow, error: fetchError } = await admin
    .from("workers")
    .select("state, pay_rule_template_id, pay_rule_id")
    .eq("id", trimmedId)
    .maybeSingle();

  if (fetchError) {
    console.warn("[pay-rule-assignment] Worker fetch failed:", fetchError.message);
    return { templateId: null, updated: false };
  }

  if (!state) {
    state = typeof workerRow?.state === "string" ? workerRow.state : null;
  }

  const { id: templateId, templateName } = await lookupPayRuleTemplateIdByStateAdmin(
    admin,
    state
  );

  if (!templateId) {
    return { templateId: null, updated: false };
  }

  const alreadyAssigned =
    workerRow?.pay_rule_template_id === templateId &&
    workerRow?.pay_rule_id === templateId;

  if (alreadyAssigned) {
    return { templateId, updated: false };
  }

  const { error: updateError } = await admin
    .from("workers")
    .update({
      pay_rule_template_id: templateId,
      pay_rule_id: templateId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", trimmedId);

  if (updateError) {
    console.warn("[pay-rule-assignment] Worker pay rule sync failed:", updateError.message);
    return { templateId: null, updated: false };
  }

  if (templateName) {
    console.info(
      `[pay-rule-assignment] Linked worker ${trimmedId} → ${templateName} (${templateId})`
    );
  }

  return { templateId, updated: true };
}

/** Backfill pay_rule_template_id for workers with state but no assignment. */
export async function syncAllWorkersPayRuleTemplatesAdmin(
  admin: SupabaseClient
): Promise<{ synced: number; scanned: number }> {
  const { data, error } = await admin
    .from("workers")
    .select("id, state, pay_rule_template_id")
    .not("state", "is", null);

  if (error) {
    console.warn("[pay-rule-assignment] Worker scan failed:", error.message);
    return { synced: 0, scanned: 0 };
  }

  let synced = 0;
  const rows = data ?? [];

  for (const row of rows) {
    const workerId = String(row.id);
    const state = typeof row.state === "string" ? row.state : null;
    if (!state) continue;

    const needsSync = !row.pay_rule_template_id;
    if (!needsSync) continue;

    const result = await syncWorkerPayRuleTemplateFromStateAdmin(admin, workerId, state);
    if (result.updated) synced += 1;
  }

  return { synced, scanned: rows.length };
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
  try {
    let resolvedState = state;

    if (!resolvedState) {
      const { data: workerRow } = await admin
        .from("workers")
        .select("state")
        .eq("id", workerId)
        .maybeSingle();
      resolvedState =
        typeof workerRow?.state === "string" ? workerRow.state : null;
    }

    const templateName = resolvePayRuleTemplateNameForWorker(resolvedState);
    if (!templateName && !resolvedState) {
      return { templateId: null, templateName: null, error: null };
    }

    const syncResult = await syncWorkerPayRuleTemplateFromStateAdmin(
      admin,
      workerId,
      resolvedState
    );

    if (syncResult.templateId) {
      return {
        templateId: syncResult.templateId,
        templateName: templateName ?? null,
        error: null,
      };
    }

    console.warn(
      `[assignDefaultPayRuleToWorkerAdmin] Pay rule template not resolved for state "${resolvedState ?? ""}".`
    );
    return { templateId: null, templateName: templateName ?? null, error: null };
  } catch (err) {
    console.warn("Pay rule assignment skipped:", err);
    return { templateId: null, templateName: null, error: null };
  }
}
