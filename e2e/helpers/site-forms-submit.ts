import {
  buildSiteFormTestPayload,
  postSiteFormRecordPayload,
  SITE_FORM_TEST_CHECKLIST,
  SITE_FORM_TYPES,
} from "../../src/lib/site-form-payload";
import type { SiteFormType } from "../../src/lib/site-forms";
import { getSupabaseEnv } from "./env";
import type { E2ETestContext } from "./test-context";

const E2E_SITE_FORM_TAG = "E2E full-system site form POST";

export interface SiteFormSubmissionResult {
  formType: SiteFormType;
  status: number;
  id: string | null;
  error: string | null;
}

async function resolveWorkerName(workerId: string): Promise<string> {
  const env = getSupabaseEnv();
  if (!env) return "E2E Worker";

  const response = await fetch(
    `${env.url}/rest/v1/workers?id=eq.${encodeURIComponent(workerId)}&select=first_name,last_name,full_name,worker_name&limit=1`,
    {
      headers: {
        apikey: env.anonKey,
        Authorization: `Bearer ${env.anonKey}`,
      },
    }
  );

  if (!response.ok) return "E2E Worker";

  const rows = (await response.json()) as Array<{
    first_name?: string | null;
    last_name?: string | null;
    full_name?: string | null;
    worker_name?: string | null;
  }>;

  const row = rows[0];
  if (!row) return "E2E Worker";

  const fromParts = [row.first_name, row.last_name].filter(Boolean).join(" ").trim();
  return (
    row.full_name?.trim() ||
    row.worker_name?.trim() ||
    fromParts ||
    "E2E Worker"
  );
}

export async function submitAllSiteFormTypes(
  context: E2ETestContext
): Promise<SiteFormSubmissionResult[]> {
  const env = getSupabaseEnv();
  if (!env) {
    throw new Error("Supabase is not configured for site form E2E submissions.");
  }
  if (!context.projectId || !context.workerId) {
    throw new Error("E2E context is missing projectId or workerId.");
  }

  const workerName = await resolveWorkerName(context.workerId);
  const formContext = {
    projectId: context.projectId,
    projectName: context.projectName ?? "E2E Project",
    workerId: context.workerId,
    workerName,
  };

  const results: SiteFormSubmissionResult[] = [];

  for (const formType of SITE_FORM_TYPES) {
    const payload = buildSiteFormTestPayload(
      formContext,
      formType,
      {
        test: true,
        tag: E2E_SITE_FORM_TAG,
        ...SITE_FORM_TEST_CHECKLIST[formType],
      },
      E2E_SITE_FORM_TAG
    );

    const posted = await postSiteFormRecordPayload(env, payload);
    results.push({
      formType,
      status: posted.status,
      id: posted.id,
      error: posted.error,
    });
  }

  return results;
}

export async function cleanupSiteFormSubmissions(ids: string[]): Promise<void> {
  const env = getSupabaseEnv();
  if (!env || ids.length === 0) return;

  const filter = ids.map((id) => encodeURIComponent(id)).join(",");
  await fetch(`${env.url}/rest/v1/site_forms?id=in.(${filter})`, {
    method: "DELETE",
    headers: {
      apikey: env.anonKey,
      Authorization: `Bearer ${env.anonKey}`,
    },
  });
}
