import type { SupabaseClient } from "@supabase/supabase-js";
import { loadCompanyProfile } from "@/lib/company-profile-service";
import { sendEmail } from "@/lib/email-service";
import {
  FORM_WORKER_ASSIGNMENTS_TABLE,
  INDUCTION_FORM_TEMPLATES_TABLE,
  sanitizeFormWorkerAssignmentRow,
} from "@/lib/induction-form-builder";
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

type ProjectInductionTemplate = {
  id: string;
  title: string;
  project_id: string | null;
};

function isMissingTableError(message: string, table: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(table.toLowerCase()) &&
    (lower.includes("does not exist") ||
      lower.includes("could not find") ||
      lower.includes("schema cache"))
  );
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes(column.toLowerCase()) && lower.includes("column");
}

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

async function findActiveProjectInductionTemplate(
  admin: SupabaseClient,
  projectId: string
): Promise<ProjectInductionTemplate | null> {
  try {
    const projectKeys = new Set<string>([projectId]);
    const { data: projectRow } = await admin
      .from("projects")
      .select("id, slug")
      .or(`id.eq.${projectId},slug.eq.${projectId}`)
      .maybeSingle();

    if (projectRow) {
      if (projectRow.id) projectKeys.add(String(projectRow.id));
      if (projectRow.slug) projectKeys.add(String(projectRow.slug));
    }

    for (const key of projectKeys) {
      const { data, error } = await admin
        .from(INDUCTION_FORM_TEMPLATES_TABLE)
        .select("id, title, project_id, scope, status")
        .eq("scope", "project")
        .eq("status", "active")
        .eq("project_id", key)
        .order("updated_at", { ascending: false })
        .limit(1);

      if (error) {
        if (isMissingTableError(error.message, INDUCTION_FORM_TEMPLATES_TABLE)) {
          console.warn(
            "[worker-reallocation] induction templates table unavailable; skipping assignment."
          );
          return null;
        }
        console.warn("[worker-reallocation] template lookup failed:", error.message);
        continue;
      }

      const row = (data ?? [])[0] as Record<string, unknown> | undefined;
      if (row?.id) {
        return {
          id: String(row.id),
          title: String(row.title ?? "Site induction"),
          project_id: row.project_id ? String(row.project_id) : null,
        };
      }
    }

    console.warn(
      `[worker-reallocation] no active project induction template for project ${projectId}.`
    );
    return null;
  } catch (cause) {
    console.warn("[worker-reallocation] template lookup error:", cause);
    return null;
  }
}

async function workerAlreadyHasInductionAssignment(
  admin: SupabaseClient,
  templateId: string,
  workerId: string
): Promise<boolean> {
  const { data, error } = await admin
    .from(FORM_WORKER_ASSIGNMENTS_TABLE)
    .select("id")
    .eq("worker_id", workerId)
    .or(`form_id.eq.${templateId},form_template_id.eq.${templateId}`)
    .limit(1);

  if (error) {
    if (isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
      return false;
    }
    if (isMissingColumnError(error.message, "form_template_id")) {
      const fallback = await admin
        .from(FORM_WORKER_ASSIGNMENTS_TABLE)
        .select("id")
        .eq("worker_id", workerId)
        .eq("form_id", templateId)
        .limit(1);
      if (fallback.error) {
        console.warn(
          "[worker-reallocation] assignment lookup failed:",
          fallback.error.message
        );
        return false;
      }
      return (fallback.data ?? []).length > 0;
    }
    console.warn("[worker-reallocation] assignment lookup failed:", error.message);
    return false;
  }

  return (data ?? []).length > 0;
}

async function insertProjectInductionAssignment(
  admin: SupabaseClient,
  input: {
    template: ProjectInductionTemplate;
    worker: WorkerRow;
    workerId: string;
    projectId: string;
    projectName: string;
    effectiveDate: string;
  }
): Promise<boolean> {
  const workerName = getWorkerDisplayName(input.worker, "Worker");
  const assignedAt = `${input.effectiveDate.slice(0, 10)}T12:00:00.000Z`;
  const payload = sanitizeFormWorkerAssignmentRow({
    template: {
      id: input.template.id,
      title: input.template.title,
      project_id: input.projectId,
      project_name: input.projectName,
    },
    worker: {
      id: input.workerId,
      full_name: workerName,
      project_id: input.projectId,
      project_name: input.projectName,
    },
    assignedBy: { id: "system", full_name: "SiteBolt Calendar" },
    assignedAt,
  });

  let currentPayload: Record<string, unknown> = {
    ...payload,
    due_date: input.effectiveDate.slice(0, 10),
  };
  const optionalColumns = [
    "form_template_id",
    "template_id",
    "form_title",
    "worker_name",
    "project_name",
    "assigned_by",
    "assigned_by_id",
    "assigned_by_name",
    "due_date",
  ] as const;

  for (let attempt = 0; attempt <= optionalColumns.length; attempt++) {
    const { error } = await admin
      .from(FORM_WORKER_ASSIGNMENTS_TABLE)
      .insert([currentPayload]);

    if (!error) {
      return true;
    }

    if (isMissingTableError(error.message, FORM_WORKER_ASSIGNMENTS_TABLE)) {
      console.warn("[worker-reallocation] assignments table unavailable.");
      return false;
    }

    const columnToDrop = optionalColumns.find(
      (column) =>
        isMissingColumnError(error.message, column) && column in currentPayload
    );

    if (!columnToDrop) {
      console.warn("[worker-reallocation] assignment insert failed:", error.message);
      return false;
    }

    const nextPayload = { ...currentPayload };
    delete nextPayload[columnToDrop];
    currentPayload = nextPayload;
  }

  return false;
}

async function assignProjectInductionIfNeeded(
  admin: SupabaseClient,
  input: {
    workerId: string;
    projectId: string;
    projectName: string;
    worker: WorkerRow;
    effectiveDate: string;
  }
): Promise<boolean> {
  const template = await findActiveProjectInductionTemplate(admin, input.projectId);
  if (!template) {
    return false;
  }

  const alreadyAssigned = await workerAlreadyHasInductionAssignment(
    admin,
    template.id,
    input.workerId
  );
  if (alreadyAssigned) {
    return false;
  }

  return insertProjectInductionAssignment(admin, {
    template,
    worker: input.worker,
    workerId: input.workerId,
    projectId: input.projectId,
    projectName: input.projectName,
    effectiveDate: input.effectiveDate,
  });
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
    inductionAssigned = await assignProjectInductionIfNeeded(admin, {
      workerId,
      projectId,
      projectName,
      worker,
      effectiveDate,
    });
  } catch (cause) {
    console.warn("[worker-reallocation] induction assignment error:", cause);
    warnings.push("Project induction assignment skipped due to an error.");
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
