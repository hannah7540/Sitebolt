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
import { isSuperAdminAccount } from "@/lib/super-admin";
import {
  getActiveOrganisationId,
  setActiveOrganisationId,
} from "@/lib/active-organisation";
import {
  WORKER_REVOKED_LOGIN_MESSAGE,
  fetchWorkerAccessRevokedForAuthUser,
} from "@/lib/worker-revocation";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import { lookupSubcontractorIdForAuthUser } from "@/lib/subcontractor-auth";
import { fetchSessionHome } from "@/lib/auth-session-home";

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
): Promise<{
  workerId: string | null;
  securityRole: string | null;
  organisationId: string | null;
  needsAuthLink: boolean;
}> {
  const supabase = createSupabaseBrowserClient();
  const match = await matchWorkerForAuthUser(
    supabase,
    { id: userId, email },
    { skipEmailLookup: true }
  );
  if (!match) {
    return {
      workerId: null,
      securityRole: null,
      organisationId: null,
      needsAuthLink: false,
    };
  }

  return {
    workerId: match.workerId,
    securityRole: match.securityRole,
    organisationId: match.organisationId,
    needsAuthLink: match.needsAuthLink,
  };
}

async function linkWorkerProfileViaAdminApi(user: User): Promise<{
  workerId: string | null;
  organisationId: string | null;
  securityRole: string | null;
} | null> {
  if (typeof window === "undefined") return null;
  try {
    const { browserAuthHeaders } = await import("@/lib/browser-auth-headers");
    const headers = await browserAuthHeaders();

    const response = await fetch("/api/workers/link-profile", {
      method: "POST",
      cache: "no-store",
      headers,
      credentials: "same-origin",
      body: JSON.stringify({}),
    });
    if (!response.ok) {
      const payload = (await response.json().catch(() => null)) as {
        error?: string;
      } | null;
      console.warn("[auth-profile] service-role profile auto-link failed", {
        status: response.status,
        error: payload?.error ?? null,
        userId: user.id,
      });
      return null;
    }
    const json = (await response.json()) as {
      workerId?: string | null;
      organisationId?: string | null;
      securityRole?: string | null;
    };
    return {
      workerId: json.workerId ?? null,
      organisationId: json.organisationId ?? null,
      securityRole: json.securityRole ?? null,
    };
  } catch (error) {
    console.warn("[auth-profile] service-role profile auto-link failed", error);
    return null;
  }
}

async function resolveLinkedWorkerForAuthUser(user: User): Promise<{
  workerId: string | null;
  securityRole: string | null;
  organisationId: string | null;
}> {
  let worker = await fetchWorkerIdForAuthUser(user.id, user.email);
  if (!worker.workerId || worker.needsAuthLink) {
    const linked = await linkWorkerProfileViaAdminApi(user);
    if (linked?.workerId) {
      const refreshed = await fetchWorkerIdForAuthUser(user.id, user.email);
      return {
        workerId: refreshed.workerId ?? linked.workerId,
        securityRole: refreshed.securityRole ?? linked.securityRole ?? worker.securityRole,
        organisationId: refreshed.organisationId ?? linked.organisationId,
      };
    }
  }
  return worker;
}

async function persistSessionOrganisationId(organisationId: string): Promise<void> {
  setActiveOrganisationId(organisationId);
  if (typeof window === "undefined") return;
  try {
    await fetch("/api/set-active-company", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisation_id: organisationId }),
      credentials: "same-origin",
    });
  } catch {
    // Client cookie/localStorage still carry the workspace.
  }
}

/** Bind non-super-admin sessions from the worker row — never query-default to A Plus. */
async function bindHomeOrganisationForUser(
  user: User,
  organisationId: string | null,
  workerId: string | null
): Promise<void> {
  if (
    isSuperAdminAccount({
      email: user.email,
      metadata: (user.user_metadata ?? null) as Record<string, unknown> | null,
    })
  ) {
    return;
  }

  const homeOrg = organisationId?.trim();
  if (homeOrg) {
    await persistSessionOrganisationId(homeOrg);
    return;
  }

  if (workerId && !getActiveOrganisationId()) {
    console.warn(
      "[auth-profile] worker has no organisation_id and no active workspace cookie",
      { workerId }
    );
  }
}

export async function resolveRoleForAuthUser(user: User): Promise<ProfileRole> {
  const profile = await fetchUserProfile(user.id);
  if (profile?.role) return normalizeProfileRole(profile.role);

  const worker = await resolveLinkedWorkerForAuthUser(user);
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

  const profile = await fetchUserProfile(user.id);
  const worker = await resolveLinkedWorkerForAuthUser(user);
  const workerId = profile?.worker_id ?? worker.workerId;
  if (!workerId) {
    return {
      ok: false,
      error:
        "No worker profile is linked to this account. Contact your administrator.",
    };
  }

  setAdminWorkerId(workerId);
  setStoredWorkerId(workerId);
  await bindHomeOrganisationForUser(user, worker.organisationId, workerId);
  return { ok: true, workerId };
}

export async function bindAuthSessionForUser(user: User): Promise<{
  ok: boolean;
  error?: string;
  workerId?: string | null;
  role: ProfileRole;
  subcontractorId?: string | null;
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
      subcontractorId: null,
    };
  }

  const role = await resolveRoleForAuthUser(user);
  const profile = await fetchUserProfile(user.id);
  const worker = await resolveLinkedWorkerForAuthUser(user);
  let workerId = profile?.worker_id ?? worker.workerId;
  let subcontractorId = await lookupSubcontractorIdForAuthUser(
    createSupabaseBrowserClient(),
    user
  );

  if (!workerId && !subcontractorId) {
    const sessionHome = await fetchSessionHome();
    if (sessionHome?.workerId) workerId = sessionHome.workerId;
    if (sessionHome?.subcontractorId) subcontractorId = sessionHome.subcontractorId;
  }

  if (workerId) {
    setStoredWorkerId(workerId);
    if (canAccessAdminConsole(normalizeSecurityRole(role))) {
      setAdminWorkerId(workerId);
    }
  }

  await bindHomeOrganisationForUser(user, worker.organisationId, workerId);

  return { ok: true, workerId, role, subcontractorId };
}

export async function resolvePostAuthPathForUser(user: User): Promise<string> {
  if (
    isSuperAdminAccount({
      email: user.email,
      metadata: (user.user_metadata ?? null) as Record<string, unknown> | null,
    })
  ) {
    return "/select-company";
  }

  const bound = await bindAuthSessionForUser(user);
  if (bound.ok && bound.workerId && isGeneralWorkerRole(bound.role)) {
    const completed = await fetchWorkerOnboardingCompleted(bound.workerId);
    const { createSupabaseBrowserClient } = await import("@/lib/supabase/client");
    const supabase = createSupabaseBrowserClient();
    const { data: categoryRow } = await supabase
      .from("workers")
      .select("worker_category")
      .eq("id", bound.workerId)
      .maybeSingle();
    return resolvePostInvitePasswordPath({
      onboardingCompleted: completed,
      workerId: bound.workerId,
      role: bound.role,
      workerCategory:
        categoryRow && typeof (categoryRow as { worker_category?: string }).worker_category === "string"
          ? (categoryRow as { worker_category?: string }).worker_category
          : null,
    });
  }
  return resolveDefaultLandingPathForRole(
    bound.role,
    bound.workerId,
    bound.subcontractorId
  );
}

async function resolveWorkerIdForAuthUser(user: User): Promise<string | null> {
  const profile = await fetchUserProfile(user.id);
  if (profile?.worker_id) return profile.worker_id;

  const worker = await resolveLinkedWorkerForAuthUser(user);
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
