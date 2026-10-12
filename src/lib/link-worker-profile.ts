import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
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
  worker: Record<string, unknown> | null;
  error: string | null;
};

function emptyLinkResult(error: string | null): LinkWorkerProfileResult {
  return {
    workerId: null,
    organisationId: null,
    securityRole: null,
    worker: null,
    error,
  };
}

function workerRecordForClient(
  row: Record<string, unknown> | null
): Record<string, unknown> | null {
  if (!row) return null;
  const safe = { ...row };
  delete safe.invite_token;
  return safe;
}

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
    return emptyLinkResult("Email and auth id are required.");
  }

  if (!isSupabaseAdminConfigured()) {
    return emptyLinkResult("Server configuration error.");
  }

  const admin = createSupabaseAdminClient();
  const match = await matchWorkerForAuthUser(admin, {
    id: trimmedAuthId,
    email: trimmedEmail,
  });

  if (!match?.workerId) {
    console.warn("[link-worker-profile] no workers row matched email via service role", {
      authId: trimmedAuthId,
      email: trimmedEmail,
    });
    return emptyLinkResult("Worker profile not found.");
  }

  const { data: workerRow, error: workerError } = await admin
    .from("workers")
    .select("email, organisation_id, auth_user_id, user_id")
    .eq("id", match.workerId)
    .maybeSingle();

  if (workerError) {
    console.warn("[link-worker-profile] admin email lookup failed", workerError.message);
    return emptyLinkResult(workerError.message);
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
    return emptyLinkResult("Worker profile email does not match this account.");
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
        worker: null,
        error: linkResult.error,
      };
    }
  }

  const { data: linkedRow, error: linkedError } = await admin
    .from("workers")
    .select("*")
    .eq("id", match.workerId)
    .maybeSingle();

  if (linkedError) {
    console.warn("[link-worker-profile] linked worker read failed", linkedError.message);
  }

  return {
    workerId: match.workerId,
    organisationId: match.organisationId,
    securityRole: match.securityRole,
    worker: workerRecordForClient(
      (linkedRow as Record<string, unknown> | null) ?? null
    ),
    error: null,
  };
}
