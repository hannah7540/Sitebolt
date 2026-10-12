import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { A_PLUS_ORGANISATION_ID } from "@/lib/active-organisation";
import { linkWorkerAuthAccount } from "@/lib/worker-auth-email";
import {
  emailsMatchExactly,
  matchWorkerForAuthUser,
} from "@/lib/worker-auth-lookup";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";

export type LinkWorkerProfileResult = {
  workerId: string | null;
  organisationId: string | null;
  securityRole: string | null;
  error: string | null;
};

/**
 * Server-only: find a worker by exact email (case-insensitive) with the
 * service-role client, then write auth.users id onto that row.
 * Never import this module from browser code.
 */
export async function linkWorkerProfile(
  email: string,
  authId: string
): Promise<LinkWorkerProfileResult> {
  const trimmedEmail = email.trim();
  const trimmedAuthId = authId.trim();
  if (!trimmedEmail || !trimmedAuthId) {
    return {
      workerId: null,
      organisationId: null,
      securityRole: null,
      error: "Email and auth id are required.",
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      workerId: null,
      organisationId: null,
      securityRole: null,
      error: "Server configuration error.",
    };
  }

  const admin = createSupabaseAdminClient();
  const match = await matchWorkerForAuthUser(
    admin,
    { id: trimmedAuthId, email: trimmedEmail },
    { activeOrgId: A_PLUS_ORGANISATION_ID }
  );

  if (!match?.workerId) {
    console.warn("[link-worker-profile] no workers row matched email via service role", {
      authId: trimmedAuthId,
      email: trimmedEmail,
    });
    return {
      workerId: null,
      organisationId: null,
      securityRole: null,
      error: "Worker profile not found.",
    };
  }

  const { data: workerRow, error: workerError } = await admin
    .from("workers")
    .select("email, organisation_id, auth_user_id, user_id")
    .eq("id", match.workerId)
    .maybeSingle();

  if (workerError) {
    console.warn("[link-worker-profile] admin email lookup failed", workerError.message);
    return {
      workerId: null,
      organisationId: null,
      securityRole: null,
      error: workerError.message,
    };
  }

  const rowEmail = String(
    (workerRow as { email?: string | null } | null)?.email ?? ""
  );
  if (!emailsMatchExactly(rowEmail, trimmedEmail)) {
    console.warn("[link-worker-profile] refused auto-link because emails do not match", {
      authId: trimmedAuthId,
      authEmail: trimmedEmail,
      workerId: match.workerId,
      workerEmail: rowEmail || null,
    });
    return {
      workerId: null,
      organisationId: null,
      securityRole: null,
      error: "Worker profile email does not match this account.",
    };
  }

  const linkedIds = workerRow as {
    auth_user_id?: string | null;
    user_id?: string | null;
  } | null;
  const alreadyLinked =
    linkedIds?.auth_user_id === trimmedAuthId &&
    (!linkedIds.user_id || linkedIds.user_id === trimmedAuthId);

  if (!alreadyLinked) {
    const linkResult = await linkWorkerAuthAccount(admin, {
      workerId: match.workerId,
      authUserId: trimmedAuthId,
      email: trimmedEmail,
      securityRole: match.securityRole ?? DEFAULT_WORKER_SECURITY_ROLE,
    });
    if (linkResult.error) {
      return {
        workerId: null,
        organisationId: match.organisationId,
        securityRole: match.securityRole,
        error: linkResult.error,
      };
    }
  }

  return {
    workerId: match.workerId,
    organisationId: match.organisationId,
    securityRole: match.securityRole,
    error: null,
  };
}
