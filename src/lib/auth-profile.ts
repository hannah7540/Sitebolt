import type { User } from "@supabase/supabase-js";
import { createSupabaseBrowserClient } from "@/lib/supabase/client";
import {
  ROLE_PERMISSIONS,
  extractRoleFromAuthMetadata,
  normalizeProfileRole,
  type ProfileRole,
} from "@/lib/platform-roles";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
} from "@/lib/security-roles";
import {
  isGeneralWorkerRole,
  setAdminWorkerId,
  setStoredWorkerId,
  resolveDefaultLandingPathForRole,
} from "@/lib/user-session";
import { fetchWorkerOnboardingCompleted } from "@/lib/worker-onboarding";
import { resolvePostInvitePasswordPath } from "@/lib/worker-invite-redirect";
import {
  WORKER_REVOKED_LOGIN_MESSAGE,
  fetchWorkerAccessRevokedForAuthUser,
} from "@/lib/worker-revocation";

export interface UserProfileRow {
  role: string;
  worker_id: string | null;
}

/** Owner/admin gate for login; uses permission matrix for admin-console roles. */
export function profileRoleAllowsAdminLogin(
  role: string | null | undefined
): boolean {
  const normalized = normalizeProfileRole(role);
  return ROLE_PERMISSIONS[normalized].accessAdminConsole;
}

export async function fetchUserProfile(
  userId: string
): Promise<UserProfileRow | null> {
  const supabase = createSupabaseBrowserClient();
  const { data, error } = await supabase
    .from("profiles")
    .select("role, worker_id")
    .eq("id", userId)
    .maybeSingle();

  if (error) {
    if (
      error.message.includes("profiles") &&
      (error.message.includes("schema cache") ||
        error.message.includes("does not exist"))
    ) {
      return null;
    }
    console.warn("fetchUserProfile:", error.message);
    return null;
  }

  return data as UserProfileRow | null;
}

export async function fetchWorkerIdForAuthUser(
  userId: string,
  email: string | null | undefined
): Promise<{ workerId: string | null; securityRole: string | null }> {
  const supabase = createSupabaseBrowserClient();

  const authLookup = await supabase
    .from("workers")
    .select("id, security_role")
    .eq("auth_user_id", userId)
    .maybeSingle();

  if (!authLookup.error && authLookup.data?.id) {
    return {
      workerId: authLookup.data.id as string,
      securityRole: (authLookup.data.security_role as string) ?? null,
    };
  }

  const trimmedEmail = email?.trim();
  if (trimmedEmail) {
    const emailLookup = await supabase
      .from("workers")
      .select("id, security_role")
      .ilike("email", trimmedEmail)
      .maybeSingle();

    if (!emailLookup.error && emailLookup.data?.id) {
      return {
        workerId: emailLookup.data.id as string,
        securityRole: (emailLookup.data.security_role as string) ?? null,
      };
    }
  }

  return { workerId: null, securityRole: null };
}

export async function resolveRoleForAuthUser(user: User): Promise<ProfileRole> {
  const profile = await fetchUserProfile(user.id);
  if (profile?.role) return normalizeProfileRole(profile.role);

  const worker = await fetchWorkerIdForAuthUser(user.id, user.email);
  if (worker.securityRole) return normalizeProfileRole(worker.securityRole);

  return extractRoleFromAuthMetadata(
    user.user_metadata as Record<string, unknown> | undefined
  );
}

export async function bindAdminSessionForUser(user: User): Promise<{
  ok: boolean;
  error?: string;
  workerId?: string;
}> {
  const accessRevoked = await fetchWorkerAccessRevokedForAuthUser(
    createSupabaseBrowserClient(),
    user
  );
  if (accessRevoked) {
    return { ok: false, error: WORKER_REVOKED_LOGIN_MESSAGE };
  }

  const role = await resolveRoleForAuthUser(user);

  if (!profileRoleAllowsAdminLogin(role)) {
    return {
      ok: false,
      error: "You do not have permission to access the admin console.",
    };
  }

  const workerId = await resolveWorkerIdForAuthUser(user);
  if (!workerId) {
    return {
      ok: false,
      error:
        "No worker profile is linked to this account. Contact your administrator.",
    };
  }

  setAdminWorkerId(workerId);
  setStoredWorkerId(workerId);
  return { ok: true, workerId };
}

export async function bindAuthSessionForUser(user: User): Promise<{
  ok: boolean;
  error?: string;
  workerId?: string | null;
  role: ProfileRole;
}> {
  const accessRevoked = await fetchWorkerAccessRevokedForAuthUser(
    createSupabaseBrowserClient(),
    user
  );
  if (accessRevoked) {
    return {
      ok: false,
      error: WORKER_REVOKED_LOGIN_MESSAGE,
      workerId: null,
      role: "general_worker",
    };
  }

  const role = await resolveRoleForAuthUser(user);
  const workerId = await resolveWorkerIdForAuthUser(user);

  if (workerId) {
    setStoredWorkerId(workerId);
    if (canAccessAdminConsole(normalizeSecurityRole(role))) {
      setAdminWorkerId(workerId);
    }
  }

  return { ok: true, workerId, role };
}

export async function resolvePostAuthPathForUser(user: User): Promise<string> {
  const bound = await bindAuthSessionForUser(user);
  if (bound.ok && bound.workerId && isGeneralWorkerRole(bound.role)) {
    const completed = await fetchWorkerOnboardingCompleted(bound.workerId);
    return resolvePostInvitePasswordPath({
      onboardingCompleted: completed,
      workerId: bound.workerId,
      role: bound.role,
    });
  }
  return resolveDefaultLandingPathForRole(bound.role, bound.workerId);
}

async function resolveWorkerIdForAuthUser(user: User): Promise<string | null> {
  const profile = await fetchUserProfile(user.id);
  if (profile?.worker_id) return profile.worker_id;

  const worker = await fetchWorkerIdForAuthUser(user.id, user.email);
  return worker.workerId;
}

export async function resolveAuthWorkerFromSession(): Promise<{
  hasSession: boolean;
  workerId: string | null;
  role: ProfileRole | null;
}> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { hasSession: false, workerId: null, role: null };

  const bound = await bindAuthSessionForUser(user);
  return {
    hasSession: true,
    workerId: bound.workerId ?? null,
    role: bound.role,
  };
}

export async function resolveAdminWorkerFromAuthSession(): Promise<{
  hasSession: boolean;
  workerId: string | null;
}> {
  const supabase = createSupabaseBrowserClient();
  const { data } = await supabase.auth.getUser();
  const user = data.user;
  if (!user) return { hasSession: false, workerId: null };

  const bound = await bindAdminSessionForUser(user);
  if (!bound.ok) return { hasSession: true, workerId: null };
  return { hasSession: true, workerId: bound.workerId ?? null };
}
