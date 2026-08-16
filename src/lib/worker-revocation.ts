import type { SupabaseClient, User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const WORKER_REVOKED_LOGIN_MESSAGE =
  "Your account has been revoked. Please contact administration for assistance.";

export const WORKER_REVOKED_LOGIN_ERROR_PARAM = "revoked";

/** ~100 years — permanent login ban via Supabase Auth. */
const PERMANENT_AUTH_BAN_DURATION = "876000h";

export type WorkerAccessRow = {
  id?: string;
  is_revoked?: boolean | null;
  status?: string | null;
  is_archived?: boolean | null;
};

export function isWorkerAccessRevoked(
  worker: WorkerAccessRow | null | undefined
): boolean {
  if (!worker) return false;
  const status = String(worker.status ?? "").trim().toLowerCase();
  return (
    worker.is_revoked === true ||
    String(worker.is_revoked) === "true" ||
    status === "revoked" ||
    worker.is_archived === true ||
    String(worker.is_archived) === "true"
  );
}

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  return lower.includes(column.toLowerCase()) && lower.includes("column");
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      console.warn("[worker-revocation] listUsers failed:", error.message);
      return null;
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

async function resolveAuthUserIdForWorker(
  admin: SupabaseClient,
  worker: {
    auth_user_id?: string | null;
    email?: string | null;
  }
): Promise<User | null> {
  const linkedId = worker.auth_user_id?.trim();
  if (linkedId) {
    const { data, error } = await admin.auth.admin.getUserById(linkedId);
    if (!error && data.user) return data.user;
  }

  const email = worker.email?.trim();
  if (!email) return null;
  return findAuthUserByEmail(admin, email);
}

async function invalidateAuthUserSessions(
  admin: SupabaseClient,
  authUserId: string
): Promise<void> {
  const signOut = (
    admin.auth.admin as {
      signOut?: (
        id: string,
        scope?: "global" | "local" | "others"
      ) => Promise<{ error: { message: string } | null }>;
    }
  ).signOut;

  if (typeof signOut !== "function") {
    return;
  }

  try {
    const { error } = await signOut(authUserId, "global");
    if (error) {
      console.warn("[worker-revocation] auth signOut failed:", error.message);
    }
  } catch (cause) {
    console.warn("[worker-revocation] auth signOut error:", cause);
  }
}

async function lockAuthUser(
  admin: SupabaseClient,
  authUser: User
): Promise<string | null> {
  const metadata =
    authUser.user_metadata && typeof authUser.user_metadata === "object"
      ? (authUser.user_metadata as Record<string, unknown>)
      : {};

  const { error } = await admin.auth.admin.updateUserById(authUser.id, {
    ban_duration: PERMANENT_AUTH_BAN_DURATION,
    user_metadata: {
      ...metadata,
      status: "revoked",
    },
  });

  if (error) {
    return error.message;
  }

  await invalidateAuthUserSessions(admin, authUser.id);
  return null;
}

async function unlockAuthUser(
  admin: SupabaseClient,
  authUser: User
): Promise<string | null> {
  const metadata =
    authUser.user_metadata && typeof authUser.user_metadata === "object"
      ? (authUser.user_metadata as Record<string, unknown>)
      : {};

  const nextMetadata = { ...metadata };
  delete nextMetadata.status;

  const { error } = await admin.auth.admin.updateUserById(authUser.id, {
    ban_duration: "none",
    user_metadata: nextMetadata,
  });

  return error?.message ?? null;
}

function buildRevokedWorkerPayload(now: string): Record<string, unknown> {
  return {
    is_revoked: true,
    status: "Revoked",
    is_archived: true,
    revoked_at: now,
    assigned_project_id: null,
    assigned_project_name: "Unassigned",
    project_id: null,
    project_name: "Unassigned",
    assigned_project_ids: [],
  };
}

function buildRestoredWorkerPayload(): Record<string, unknown> {
  return {
    is_revoked: false,
    is_archived: false,
    status: "active",
    revoked_at: null,
  };
}

async function persistWorkerRevocationState(
  admin: SupabaseClient,
  workerId: string,
  revoked: boolean
): Promise<string | null> {
  const now = new Date().toISOString();
  let payload: Record<string, unknown> = revoked
    ? buildRevokedWorkerPayload(now)
    : buildRestoredWorkerPayload();

  for (let attempt = 0; attempt < 2; attempt++) {
    const { error } = await admin.from("workers").update(payload).eq("id", workerId);
    if (!error) return null;

    if (isMissingColumnError(error.message, "revoked_at") && "revoked_at" in payload) {
      const { revoked_at: _removed, ...withoutRevokedAt } = payload;
      payload = withoutRevokedAt;
      continue;
    }

    return error.message;
  }

  return "Failed to update worker revocation state.";
}

export async function setWorkerRevokedAccess(
  workerId: string,
  revoked: boolean
): Promise<{ error: string | null }> {
  const trimmedId = workerId.trim();
  if (!trimmedId) {
    return { error: "Worker id is required." };
  }

  if (!isSupabaseAdminConfigured()) {
    return { error: "SUPABASE_SERVICE_ROLE_KEY is not configured." };
  }

  const admin = createSupabaseAdminClient();

  const { data: worker, error: workerError } = await admin
    .from("workers")
    .select("id, email, auth_user_id")
    .eq("id", trimmedId)
    .maybeSingle();

  if (workerError) {
    return { error: workerError.message };
  }
  if (!worker) {
    return { error: "Worker not found." };
  }

  const workerUpdateError = await persistWorkerRevocationState(admin, trimmedId, revoked);
  if (workerUpdateError) {
    return { error: workerUpdateError };
  }

  const authUser = await resolveAuthUserIdForWorker(admin, worker);
  if (!authUser) {
    return { error: null };
  }

  const authError = revoked
    ? await lockAuthUser(admin, authUser)
    : await unlockAuthUser(admin, authUser);

  return { error: authError };
}

export async function fetchWorkerAccessRevokedById(
  supabase: SupabaseClient,
  workerId: string
): Promise<boolean> {
  const { data, error } = await supabase
    .from("workers")
    .select("is_revoked, status, is_archived")
    .eq("id", workerId)
    .maybeSingle();

  if (error || !data) return false;
  return isWorkerAccessRevoked(data as WorkerAccessRow);
}

export async function fetchWorkerAccessRevokedForAuthUser(
  supabase: SupabaseClient,
  user: Pick<User, "id" | "email">
): Promise<boolean> {
  const metadata = user as User;
  const metaStatus = (
    metadata.user_metadata as Record<string, unknown> | undefined
  )?.status;
  if (String(metaStatus ?? "").toLowerCase() === "revoked") {
    return true;
  }

  const { data: workerByAuth } = await supabase
    .from("workers")
    .select("is_revoked, status, is_archived")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (workerByAuth && isWorkerAccessRevoked(workerByAuth as WorkerAccessRow)) {
    return true;
  }

  const email = user.email?.trim();
  if (!email) return false;

  const { data: workerByEmail } = await supabase
    .from("workers")
    .select("is_revoked, status, is_archived")
    .ilike("email", email)
    .maybeSingle();

  return isWorkerAccessRevoked(workerByEmail as WorkerAccessRow);
}
