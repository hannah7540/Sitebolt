export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { resolveRequestAuthUser } from "@/lib/auth-request-user";
import { profileApiJson } from "@/lib/profile-api-response";
import { resolveActiveOrganisationIdFromRequest } from "@/lib/tenant-scope";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import { normalizeWorkerStateRegion } from "@/lib/worker-state-region";
import { onWorkerProjectAssigned } from "@/lib/services/worker-assignment";

const HIRED_LABOUR_CATEGORY = "hired_labour";

const HIRED_LABOUR_CHILD_TABLES = [
  "form_worker_assignments",
  "worker_timesheets",
  "leave_requests",
  "worker_calendar_events",
  "worker_schedule",
  "worker_vocs",
  "worker_requests",
  "project_worker_assignments",
  "project_workers",
  "swms_assignments",
  "site_forms",
] as const;

function readString(value: unknown): string {
  return typeof value === "string" ? value.trim() : "";
}

function isMissingRelation(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find")
  );
}

async function callerCanManageHiredLabour(user: User): Promise<boolean> {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workers")
    .select("security_role")
    .eq("auth_user_id", user.id)
    .limit(5);
  if (error || !data?.length) return false;
  return data.some((row) =>
    canAccessAdminConsole(
      normalizeSecurityRole(
        (row as { security_role?: string | null }).security_role
      )
    )
  );
}

async function loadHiredLabourRow(workerId: string, organisationId: string) {
  const admin = createSupabaseAdminClient();
  const { data, error } = await admin
    .from("workers")
    .select(
      "id, organisation_id, worker_category, auth_user_id, email, state, assigned_project_id"
    )
    .eq("id", workerId)
    .maybeSingle();
  if (error) return { error: error.message, worker: null };
  const worker = data as {
    id: string;
    organisation_id?: string | null;
    worker_category?: string | null;
    auth_user_id?: string | null;
    email?: string | null;
    state?: string | null;
    assigned_project_id?: string | null;
  } | null;
  if (!worker) return { error: "Worker not found.", worker: null };
  if (String(worker.organisation_id ?? "") !== organisationId) {
    return { error: "Worker is not in the active organisation.", worker: null };
  }
  if (String(worker.worker_category ?? "").trim().toLowerCase() !== HIRED_LABOUR_CATEGORY) {
    return { error: "This action is only available for hired labour.", worker: null };
  }
  return { error: null, worker };
}

async function updateHiredLabour(
  workerId: string,
  organisationId: string,
  payload: Record<string, unknown>
) {
  const admin = createSupabaseAdminClient();
  const next = { ...payload, updated_at: new Date().toISOString() };
  let { error } = await admin
    .from("workers")
    .update(next)
    .eq("id", workerId)
    .eq("organisation_id", organisationId);
  if (error && isMissingRelation(error.message)) {
    const fallback: Record<string, unknown> = { ...next };
    for (const key of Object.keys(fallback)) {
      if (error.message.toLowerCase().includes(key)) delete fallback[key];
    }
    ({ error } = await admin
      .from("workers")
      .update(fallback)
      .eq("id", workerId)
      .eq("organisation_id", organisationId));
  }
  return error?.message ?? null;
}

function isMissingAuthUser(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("not found") ||
    lower.includes("user not found") ||
    lower.includes("does not exist")
  );
}

/** Auth deletion is best-effort. A missing or never-created login must not block the worker row delete. */
async function deleteAuthUserIfPresent(authUserId: string | null): Promise<void> {
  const authId = authUserId?.trim() ?? "";
  if (!authId) return;
  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.deleteUser(authId);
    if (error && !isMissingAuthUser(error.message)) {
      console.warn("[hired-labour] auth delete ignored:", error.message);
    }
  } catch (cause) {
    const message = cause instanceof Error ? cause.message : "Auth user delete failed.";
    if (!isMissingAuthUser(message)) {
      console.warn("[hired-labour] auth delete ignored:", message);
    }
  }
}

async function hardDeleteHiredLabour(
  workerId: string,
  organisationId: string,
  authUserId: string | null,
  email: string | null
) {
  await deleteAuthUserIfPresent(authUserId);

  const admin = createSupabaseAdminClient();
  for (const table of HIRED_LABOUR_CHILD_TABLES) {
    const { error } = await admin.from(table).delete().eq("worker_id", workerId);
    if (error && !isMissingRelation(error.message)) {
      console.warn(`[hired-labour] child delete skipped for ${table}:`, error.message);
    }
  }

  await admin.from("profiles").update({ worker_id: null }).eq("worker_id", workerId);

  const { error: workerError } = await admin
    .from("workers")
    .delete()
    .eq("id", workerId)
    .eq("organisation_id", organisationId);
  if (!workerError) return null;

  const trimmedEmail = email?.trim() ?? "";
  if (!trimmedEmail) return workerError.message;

  const { error: emailError } = await admin
    .from("workers")
    .delete()
    .eq("organisation_id", organisationId)
    .eq("worker_category", HIRED_LABOUR_CATEGORY)
    .ilike("email", trimmedEmail);
  return emailError?.message ?? null;
}

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return profileApiJson({ error: "Server configuration error." }, 500);
  }

  const user = await resolveRequestAuthUser(req);
  if (!user) {
    return profileApiJson({ error: "Not authenticated." }, 401);
  }

  const body = (await req.json().catch(() => null)) as Record<string, unknown> | null;
  const action = readString(body?.action);
  const workerId = readString(body?.workerId);
  if (!action || !workerId) {
    return profileApiJson({ error: "action and workerId are required." }, 400);
  }

  const admin = createSupabaseAdminClient();

  if (action === "submit") {
    const { data: owned, error: ownedError } = await admin
      .from("workers")
      .select("id, auth_user_id, worker_category, organisation_id, state, assigned_project_id")
      .eq("id", workerId)
      .maybeSingle();
    if (ownedError || !owned) {
      return profileApiJson({ error: ownedError?.message ?? "Worker not found." }, 400);
    }
    const row = owned as {
      auth_user_id?: string | null;
      worker_category?: string | null;
      organisation_id?: string | null;
      state?: string | null;
      assigned_project_id?: string | null;
    };
    if (row.auth_user_id !== user.id) {
      return profileApiJson({ error: "You can only submit your own onboarding." }, 403);
    }
    if (String(row.worker_category ?? "").trim().toLowerCase() !== HIRED_LABOUR_CATEGORY) {
      return profileApiJson({ error: "This onboarding form is for hired labour." }, 403);
    }

    const whiteCardNumber = readString(body?.whiteCardNumber);
    const whiteCardDate = readString(body?.whiteCardDate);
    const whiteCardFileUrl = readString(body?.whiteCardFileUrl);
    const silicaCertNumber = readString(body?.silicaCertNumber);
    const silicaCertDate = readString(body?.silicaCertDate);
    const silicaCertFileUrl = readString(body?.silicaCertFileUrl);
    const emergencyContactName = readString(body?.emergencyContactName);
    const emergencyContactNumber = readString(body?.emergencyContactNumber);
    const emergencyContactRelationship = readString(body?.emergencyContactRelationship);

    if (
      !whiteCardNumber ||
      !whiteCardDate ||
      !whiteCardFileUrl ||
      !silicaCertNumber ||
      !silicaCertDate ||
      !silicaCertFileUrl ||
      !emergencyContactName ||
      !emergencyContactNumber ||
      !emergencyContactRelationship
    ) {
      return profileApiJson(
        {
          error:
            "White Card, Silica certificate, and emergency contact details are required.",
        },
        400
      );
    }

    const organisationId = String(row.organisation_id ?? "");
    const updateError = await updateHiredLabour(workerId, organisationId, {
      white_card_number: whiteCardNumber,
      white_card_date: whiteCardDate,
      white_card_issue_date: whiteCardDate,
      white_card_file_url: whiteCardFileUrl,
      white_card_doc_url: whiteCardFileUrl,
      white_card_photo_url: whiteCardFileUrl,
      white_card_provided: true,
      silica_cert_number: silicaCertNumber,
      silica_cert_date: silicaCertDate,
      silica_cert_issue_date: silicaCertDate,
      silica_cert_file_url: silicaCertFileUrl,
      silica_cert_doc_url: silicaCertFileUrl,
      silica_cert_photo_url: silicaCertFileUrl,
      silica_cert_provided: true,
      emergency_contact_name: emergencyContactName,
      emergency_contact_number: emergencyContactNumber,
      emergency_contact_phone: emergencyContactNumber,
      emergency_contact_relationship: emergencyContactRelationship,
      rejection_notes: null,
      hired_labour_status: "pending_approval",
      onboarding_completed: false,
    });
    if (updateError) return profileApiJson({ error: updateError }, 400);

    if (row.state || row.assigned_project_id) {
      await onWorkerProjectAssigned(admin, workerId, {
        state: row.state,
        projectIds: row.assigned_project_id ? [row.assigned_project_id] : [],
      });
    }

    return profileApiJson({ success: true, hiredLabourStatus: "pending_approval" });
  }

  const orgId = resolveActiveOrganisationIdFromRequest(req);
  if (!orgId) {
    return profileApiJson({ error: "Select an organisation before managing hired labour." }, 400);
  }
  if (!(await callerCanManageHiredLabour(user))) {
    return profileApiJson({ error: "You do not have permission to manage hired labour." }, 403);
  }

  const loaded = await loadHiredLabourRow(workerId, orgId);
  if (loaded.error || !loaded.worker) {
    return profileApiJson({ error: loaded.error ?? "Worker not found." }, 400);
  }

  if (action === "approve") {
    const updateError = await updateHiredLabour(workerId, orgId, {
      hired_labour_status: "approved",
      rejection_notes: null,
      onboarding_completed: true,
    });
    if (updateError) return profileApiJson({ error: updateError }, 400);
    await onWorkerProjectAssigned(admin, workerId, {
      state: loaded.worker.state,
      projectIds: loaded.worker.assigned_project_id ? [loaded.worker.assigned_project_id] : [],
    });
    return profileApiJson({ success: true, hiredLabourStatus: "approved" });
  }

  if (action === "reject") {
    const rejectionNotes = readString(body?.rejectionNotes);
    if (!rejectionNotes) {
      return profileApiJson({ error: "Rejection notes are required." }, 400);
    }
    const updateError = await updateHiredLabour(workerId, orgId, {
      hired_labour_status: "rejected",
      rejection_notes: rejectionNotes,
      onboarding_completed: false,
    });
    if (updateError) return profileApiJson({ error: updateError }, 400);
    return profileApiJson({ success: true, hiredLabourStatus: "rejected" });
  }

  if (action === "revoke") {
    const updateError = await updateHiredLabour(workerId, orgId, {
      hired_labour_status: "revoked",
    });
    if (updateError) return profileApiJson({ error: updateError }, 400);
    return profileApiJson({ success: true, hiredLabourStatus: "revoked" });
  }

  if (action === "reinstate") {
    const state = normalizeWorkerStateRegion(readString(body?.state));
    const projectId = readString(body?.projectId);
    if (!state || !projectId) {
      return profileApiJson({ error: "State and project are required to reinstate." }, 400);
    }
    const updateError = await updateHiredLabour(workerId, orgId, {
      hired_labour_status: "approved",
      rejection_notes: null,
      onboarding_completed: true,
      state,
      assigned_project_id: projectId,
      assigned_project_ids: [projectId],
    });
    if (updateError) return profileApiJson({ error: updateError }, 400);
    await onWorkerProjectAssigned(admin, workerId, {
      state,
      projectIds: [projectId],
    });
    return profileApiJson({ success: true, hiredLabourStatus: "approved" });
  }

  if (action === "delete") {
    const deleteError = await hardDeleteHiredLabour(
      workerId,
      orgId,
      loaded.worker.auth_user_id ?? null,
      loaded.worker.email ?? null
    );
    if (deleteError) return profileApiJson({ error: deleteError }, 400);
    return profileApiJson({ success: true });
  }

  return profileApiJson({ error: "Unknown hired labour action." }, 400);
}
