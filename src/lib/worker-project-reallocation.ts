import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyProfile } from "@/lib/company-profile-service";
import { sendEmail } from "@/lib/email-service";
import { onWorkerProjectAssigned } from "@/lib/services/worker-assignment";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { getWorkerDisplayName, splitWorkerFullName } from "@/lib/worker-utils";
import { buildWorkerReallocationEmail } from "@/lib/worker-reallocation-email";

export interface WorkerProjectReallocationInput {
  workerId: string;
  projectId: string;
  projectName: string;
  effectiveDate: string;
  previousProjectId?: string | null;
  roleOnSite?: string | null;
}

export interface WorkerProjectReallocationResult {
  ok: boolean;
  skipped: boolean;
  inductionAssigned: boolean;
  emailSent: boolean;
  emailError?: string;
  warnings: string[];
}

type WorkerRow = {
  id: string;
  email: string | null;
  first_name: string | null;
  last_name: string | null;
  full_name: string | null;
  worker_name: string | null;
};

async function fetchWorkerRow(
  admin: SupabaseClient,
  workerId: string
): Promise<WorkerRow | null> {
  const { data, error } = await admin
    .from("workers")
    .select("id, email, first_name, last_name, full_name, worker_name")
    .eq("id", workerId)
    .maybeSingle();

  if (error) {
    console.warn("[worker-reallocation] worker lookup failed:", error.message);
    return null;
  }

  return (data as WorkerRow | null) ?? null;
}

function resolveWorkerFirstName(worker: WorkerRow): string {
  const direct = worker.first_name?.trim();
  if (direct) return direct;
  return splitWorkerFullName(getWorkerDisplayName(worker)).firstName || "there";
}

async function dispatchReallocationEmail(input: {
  worker: WorkerRow;
  workerId: string;
  projectName: string;
  effectiveDate: string;
  inductionAssigned: boolean;
}): Promise<{ sent: boolean; error?: string }> {
  const email = input.worker.email?.trim();
  if (!email) {
    return { sent: false, error: "Worker has no email address." };
  }

  const companyProfile = await loadCompanyProfile();
  const companyName =
    companyProfile?.company_name?.trim() || "Site Management Team";
  const dashboardUrl = `${getSiteUrl()}/worker-dashboard?worker_id=${encodeURIComponent(input.workerId)}`;
  const { subject, html, text } = buildWorkerReallocationEmail({
    firstName: resolveWorkerFirstName(input.worker),
    projectName: input.projectName,
    effectiveDate: input.effectiveDate,
    dashboardUrl,
    companyName,
    inductionAssigned: input.inductionAssigned,
  });

  const result = await sendEmail({ to: [email], subject, html, text });
  if (!result.sent && result.error) {
    console.warn("[worker-reallocation] email failed:", result.error);
  }
  return { sent: result.sent, error: result.error };
}

export async function processWorkerProjectReallocation(
  input: WorkerProjectReallocationInput
): Promise<WorkerProjectReallocationResult> {
  const warnings: string[] = [];
  const workerId = input.workerId.trim();
  const projectId = input.projectId.trim();
  const projectName = input.projectName.trim();
  const effectiveDate = input.effectiveDate.trim();

  if (!workerId || !projectId || !projectName || !effectiveDate) {
    return {
      ok: false,
      skipped: true,
      inductionAssigned: false,
      emailSent: false,
      warnings: ["Missing required reallocation fields."],
    };
  }

  if (!isSupabaseAdminConfigured()) {
    warnings.push(
      "SUPABASE_SERVICE_ROLE_KEY is not configured; server-side induction assignment skipped."
    );
    return {
      ok: true,
      skipped: false,
      inductionAssigned: false,
      emailSent: false,
      warnings,
    };
  }

  const admin = createSupabaseAdminClient();
  const worker = await fetchWorkerRow(admin, workerId);
  if (!worker) {
    warnings.push("Worker record not found; notifications skipped.");
    return {
      ok: true,
      skipped: false,
      inductionAssigned: false,
      emailSent: false,
      warnings,
    };
  }

  let inductionAssigned = false;
  try {
    const assignment = await onWorkerProjectAssigned(admin, workerId, {
      projectIds: [projectId],
      projectNames: { [projectId]: projectName },
    });
    inductionAssigned = assignment.inductions.projectAssigned > 0;
    warnings.push(...assignment.inductions.warnings, ...assignment.swms.warnings);
    if (
      assignment.inductions.projectAssigned === 0 &&
      assignment.inductions.skipped === 0
    ) {
      console.warn(
        `[worker-reallocation] no active project induction template for project ${projectId}.`
      );
    }
  } catch (cause) {
    console.warn("[worker-reallocation] assignment error:", cause);
    warnings.push("Project SWMS/induction assignment skipped due to an error.");
  }

  let emailSent = false;
  let emailError: string | undefined;
  try {
    const emailResult = await dispatchReallocationEmail({
      worker,
      workerId,
      projectName,
      effectiveDate,
      inductionAssigned,
    });
    emailSent = emailResult.sent;
    emailError = emailResult.error;
    if (emailError && !emailSent) {
      warnings.push(emailError);
    }
  } catch (cause) {
    emailError =
      cause instanceof Error ? cause.message : "Failed to send reallocation email.";
    console.warn("[worker-reallocation] email dispatch error:", cause);
    warnings.push(emailError);
  }

  return {
    ok: true,
    skipped: false,
    inductionAssigned,
    emailSent,
    emailError,
    warnings,
  };
}
