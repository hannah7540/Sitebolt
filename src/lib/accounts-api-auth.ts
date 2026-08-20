import type { SupabaseClient, User } from "@supabase/supabase-js";
import {
  canManageAccountsActions,
  normalizeAccountsAccessRole,
  normalizeSecurityRole,
  type AccountsAccessRole,
  type SecurityRole,
} from "@/lib/security-roles";
import {
  extractRoleFromAuthMetadata,
  normalizeProfileRole,
  profileRoleToAccountsAccessRole,
  ROLE_PERMISSIONS,
} from "@/lib/platform-roles";
import { getWorkerDisplayName } from "@/lib/worker-utils";

type CallerWorkerRow = {
  id: string;
  first_name?: string | null;
  last_name?: string | null;
  full_name?: string | null;
  worker_name?: string | null;
  email?: string | null;
  security_role?: string | null;
  accounts_access_role?: string | null;
  can_access_accounts?: boolean | null;
};

const CALLER_WORKER_SELECT =
  "id, first_name, last_name, full_name, worker_name, email, security_role, accounts_access_role, can_access_accounts";

async function fetchCallerWorkerById(
  admin: SupabaseClient,
  workerId: string
): Promise<CallerWorkerRow | null> {
  const { data, error } = await admin
    .from("workers")
    .select(CALLER_WORKER_SELECT)
    .eq("id", workerId)
    .maybeSingle();

  if (error || !data?.id) return null;
  return data as CallerWorkerRow;
}

async function fetchProfileForAuthUser(
  admin: SupabaseClient,
  authUserId: string
): Promise<{ role: string | null; worker_id: string | null } | null> {
  const { data, error } = await admin
    .from("profiles")
    .select("role, worker_id")
    .eq("id", authUserId)
    .maybeSingle();

  if (error) {
    const message = error.message.toLowerCase();
    if (message.includes("profiles") && message.includes("does not exist")) {
      return null;
    }
    return null;
  }

  if (!data) return null;

  return {
    role: data.role ? String(data.role) : null,
    worker_id: data.worker_id ? String(data.worker_id) : null,
  };
}

/** Resolve the signed-in user's worker row (auth link, email, or profiles.worker_id). */
export async function fetchAccountsCallerWorkerRow(
  admin: SupabaseClient,
  user: User
): Promise<CallerWorkerRow | null> {
  const authLookup = await admin
    .from("workers")
    .select(CALLER_WORKER_SELECT)
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (!authLookup.error && authLookup.data?.id) {
    return authLookup.data as CallerWorkerRow;
  }

  const email = user.email?.trim();
  if (email) {
    const emailLookup = await admin
      .from("workers")
      .select(CALLER_WORKER_SELECT)
      .ilike("email", email)
      .maybeSingle();

    if (!emailLookup.error && emailLookup.data?.id) {
      return emailLookup.data as CallerWorkerRow;
    }
  }

  const profile = await fetchProfileForAuthUser(admin, user.id);
  if (profile?.worker_id) {
    return fetchCallerWorkerById(admin, profile.worker_id);
  }

  return null;
}

function resolveCallerSecurityRole(
  worker: CallerWorkerRow | null,
  profileRole: string | null,
  metadataRole: string | null
): SecurityRole {
  const candidates = [worker?.security_role, profileRole, metadataRole].filter(
    Boolean
  ) as string[];

  for (const candidate of candidates) {
    const normalized = normalizeSecurityRole(candidate);
    if (normalized === "owner" || normalized === "full_access") {
      return normalized;
    }
  }

  for (const candidate of candidates) {
    const raw = String(candidate).trim().toLowerCase();
    if (raw === "owner") return "owner";
    if (raw === "admin" || raw === "manager" || raw === "full_access") {
      return "full_access";
    }
  }

  if (candidates[0]) {
    return normalizeSecurityRole(candidates[0]);
  }

  return "general_worker";
}

export interface AccountsTimesheetCallerContext {
  canManage: boolean;
  approverName: string;
  callerWorkerId: string | null;
  securityRole: SecurityRole;
  accountsAccessRole: AccountsAccessRole;
}

export async function resolveAccountsTimesheetCallerContext(
  admin: SupabaseClient,
  user: User
): Promise<AccountsTimesheetCallerContext> {
  const profile = await fetchProfileForAuthUser(admin, user.id);
  const callerWorker = await fetchAccountsCallerWorkerRow(admin, user);

  const metadataRole = extractRoleFromAuthMetadata(
    user.user_metadata as Record<string, unknown> | undefined
  );
  const profileRole = profile?.role ?? metadataRole ?? null;
  const profileRoleNormalized = normalizeProfileRole(profileRole);

  const securityRole = resolveCallerSecurityRole(
    callerWorker,
    profileRole,
    metadataRole
  );

  const accountsAccessRole = callerWorker?.accounts_access_role
    ? normalizeAccountsAccessRole(callerWorker.accounts_access_role)
    : profileRoleToAccountsAccessRole(profileRoleNormalized);

  const rawSecurityRole =
    callerWorker?.security_role ?? profileRole ?? metadataRole ?? null;

  const canManage =
    ROLE_PERMISSIONS[profileRoleNormalized]?.manageAccounts === true ||
    canManageAccountsActions(accountsAccessRole, {
      securityRole: rawSecurityRole,
      canAccessAccounts: callerWorker?.can_access_accounts === true ? true : null,
    });

  const approverName = callerWorker
    ? getWorkerDisplayName(
        callerWorker as Parameters<typeof getWorkerDisplayName>[0]
      )
    : user.email?.trim() || user.id;

  return {
    canManage,
    approverName,
    callerWorkerId: callerWorker?.id ?? profile?.worker_id ?? null,
    securityRole,
    accountsAccessRole,
  };
}
