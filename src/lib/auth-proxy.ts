import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { SupabaseClient, User } from "@supabase/supabase-js";
import { isPasswordRecoverySession } from "@/lib/auth-session-utils";
import {
  canAccessAdminConsole,
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import {
  canAccessAccountsPath,
  canAccessOrganisationPath,
  isAccountsPath,
  isGeneralWorkerAllowedPath,
  isOrganisationPath,
  isProjectTeamAllowedPath,
  isWorkerSwmsPath,
  resolveProjectTeamFallbackPath,
} from "@/lib/rbac-guards";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  MASTER_PROJECT_DASHBOARD_PATH,
  SUBCONTRACTOR_PORTAL_HOME_PATH,
  isGeneralWorkerRole,
  resolveDefaultLandingPathForRole,
} from "@/lib/user-session";
import {
  NATIVE_APP_COOKIE,
  resolveNativeWorkerDashboardPath,
  shouldRedirectNativePath,
} from "@/lib/native-app-paths";
import {
  WORKER_REVOKED_LOGIN_ERROR_PARAM,
  fetchWorkerAccessRevokedForAuthUser,
} from "@/lib/worker-revocation";
import {
  isPublicAuthFlowPath,
  isSubcontractorOnboardPath,
} from "@/lib/public-auth-paths";
import { isPlantPrestartPath } from "@/lib/plant-prestart-url";
import { toRelativeAppPath } from "@/lib/relative-app-path";
import {
  isAppHostname,
  requestHostHeader,
} from "@/lib/site-domains";
import { ACTIVE_ORG_COOKIE } from "@/lib/active-organisation";
import { isSuperAdminAccount } from "@/lib/super-admin";
import { matchWorkerForAuthUser } from "@/lib/worker-auth-lookup";
import { linkWorkerProfile } from "@/lib/link-worker-profile";
import { lookupSubcontractorIdForAuthUser } from "@/lib/subcontractor-auth";
import { resolveHiredLabourAccessStatus } from "@/lib/hired-labour-status";

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/privacy",
  "/terms",
  "/download",
  "/support",
  "/marketing",
  "/enquire",
  "/auth/",
  "/auth/callback",
  "/auth/confirm",
  "/accept-invite",
  "/update-password",
  "/setyourpassword",
  "/reset-password",
  "/set-password",
  "/onboarding",
  "/subcontractor/onboard",
  "/portal/",
  "/swms/sign/",
  "/guest",
  "/scan/",
  "/prestart/",
  "/pre-start/",
] as const;

const AUTH_REQUIRED_PREFIXES = [
  "/organisation",
  "/projects",
  "/worker-dashboard",
  "/accounts",
  "/admin",
  "/settings",
  "/account",
  "/emails",
  "/sms",
  "/select-company",
  "/dashboard",
  "/subcontractor",
  "/swms",
] as const;

/** Admin console roles land on the Master Project Dashboard, not a specific project. */
const PROJECTS_HOME_PATH = MASTER_PROJECT_DASHBOARD_PATH;

const GENERAL_WORKER_HOME_PATH = "/worker-dashboard";

export { isPublicAuthFlowPath, PUBLIC_AUTH_FLOW_PATHS } from "@/lib/public-auth-paths";

export const AUTH_PROXY_MATCHER = [
  "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
];

function isPublicPath(pathname: string): boolean {
  if (isPublicAuthFlowPath(pathname)) return true;
  if (isPlantPrestartPath(pathname)) return true;
  return PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix));
}

function requiresAuthentication(pathname: string, request: NextRequest): boolean {
  if (isPublicPath(pathname)) return false;
  if (pathname === "/") return isAppHostname(requestHostHeader(request));
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isWorkerHomePath(pathname: string): boolean {
  return (
    isGeneralWorkerAllowedPath(pathname) ||
    isWorkerSwmsPath(pathname) ||
    isPlantPrestartPath(pathname)
  );
}

function isWorkerDashboardPath(pathname: string): boolean {
  return (
    pathname === GENERAL_WORKER_HOME_PATH ||
    pathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`)
  );
}

/** Workers in public.workers keep dashboard + SWMS even with subcontractor_id / hired_labour. */
function isGrantedWorkerAppPath(pathname: string): boolean {
  return (
    isWorkerDashboardPath(pathname) ||
    isWorkerSwmsPath(pathname) ||
    isPlantPrestartPath(pathname) ||
    pathname.startsWith("/scan/")
  );
}

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function redirectWithCookies(
  request: NextRequest,
  path: string,
  sessionResponse: NextResponse
): NextResponse {
  const dest = request.nextUrl.clone();
  const relative = toRelativeAppPath(path, GENERAL_WORKER_HOME_PATH);
  const [pathnameAndSearch] = relative.split("#");
  const [pathname, search] = (pathnameAndSearch || GENERAL_WORKER_HOME_PATH).split("?");
  dest.pathname = pathname || GENERAL_WORKER_HOME_PATH;
  dest.search = search ? `?${search}` : "";
  dest.hash = "";
  const redirect = NextResponse.redirect(dest);
  copyCookies(sessionResponse, redirect);
  return redirect;
}

interface AuthContext {
  user: User | null;
  role: SecurityRole;
  workerId: string | null;
  onboardingCompleted: boolean;
  accessRevoked: boolean;
  workerCategory: string | null;
  hiredLabourStatus: string | null;
  subcontractorId: string | null;
}

async function resolveWorkerAccess(
  supabase: SupabaseClient,
  workerId: string | null
): Promise<{ category: string | null; hiredLabourStatus: string | null }> {
  if (!workerId) return { category: null, hiredLabourStatus: null };
  let { data, error } = await supabase
    .from("workers")
    .select("worker_category, hired_labour_status, onboarding_completed")
    .eq("id", workerId)
    .maybeSingle();
  if (error && /hired_labour_status/i.test(error.message)) {
    ({ data, error } = await supabase
      .from("workers")
      .select("worker_category, onboarding_completed")
      .eq("id", workerId)
      .maybeSingle());
  }
  if (error || !data) return { category: null, hiredLabourStatus: null };
  const row = data as {
    worker_category?: string | null;
    hired_labour_status?: string | null;
    onboarding_completed?: boolean | null;
  };
  const category = String(row.worker_category ?? "").trim() || null;
  const isHired = category?.toLowerCase() === "hired_labour";
  return {
    category,
    hiredLabourStatus: isHired
      ? resolveHiredLabourAccessStatus(row.hired_labour_status, row.onboarding_completed)
      : null,
  };
}

async function linkWorkerForSession(
  user: User
): Promise<{ workerId: string | null; securityRole: string | null }> {
  if (!user.email) return { workerId: null, securityRole: null };
  try {
    const linked = await linkWorkerProfile(user.email, user.id);
    return { workerId: linked.workerId, securityRole: linked.securityRole };
  } catch (error) {
    console.warn("[auth-proxy] worker profile link failed", error);
    return { workerId: null, securityRole: null };
  }
}

async function resolveWorkerOnboardingCompleted(
  supabase: SupabaseClient,
  workerId: string
): Promise<boolean> {
  const selectVariants = [
    "onboarding_completed",
    "status, induction_completed_at",
  ] as const;

  for (const select of selectVariants) {
    const { data, error } = await supabase
      .from("workers")
      .select(select)
      .eq("id", workerId)
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes("onboarding_completed")) continue;
      return false;
    }

    if (!data) return false;

    const row = data as {
      onboarding_completed?: boolean | null;
      status?: string | null;
      induction_completed_at?: string | null;
    };

    if (typeof row.onboarding_completed === "boolean") {
      return row.onboarding_completed;
    }

    return row.status === "active" || Boolean(row.induction_completed_at);
  }

  return false;
}

async function resolveAuthContext(
  supabase: ReturnType<typeof createServerClient>,
  user: User | null
): Promise<AuthContext> {
  if (!user) {
    return {
      user: null,
      role: "general_worker",
      workerId: null,
      onboardingCompleted: true,
      accessRevoked: false,
      workerCategory: null,
      hiredLabourStatus: null,
      subcontractorId: null,
    };
  }

  const accessRevoked = await fetchWorkerAccessRevokedForAuthUser(supabase, user);
  const privilegedClient = isSupabaseAdminConfigured()
    ? createSupabaseAdminClient()
    : supabase;
  const subcontractorId = await lookupSubcontractorIdForAuthUser(
    privilegedClient,
    user
  );

  const { data: profile } = await privilegedClient
    .from("profiles")
    .select("role, worker_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role) {
    let workerId = profile.worker_id ?? null;
    if (!workerId && !accessRevoked) {
      workerId = (await linkWorkerForSession(user)).workerId;
    }
    if (!workerId) {
      workerId =
        (await matchWorkerForAuthUser(privilegedClient, user))?.workerId ?? null;
    }
    const access = await resolveWorkerAccess(privilegedClient, workerId);
    const onboardingCompleted = workerId
      ? await resolveWorkerOnboardingCompleted(privilegedClient, workerId)
      : true;

    return {
      user,
      role: normalizeSecurityRole(profile.role),
      workerId,
      onboardingCompleted,
      accessRevoked,
      workerCategory: access.category,
      hiredLabourStatus: access.hiredLabourStatus,
      subcontractorId,
    };
  }

  const match = await matchWorkerForAuthUser(privilegedClient, user);
  if (match?.workerId) {
    const onboardingCompleted = await resolveWorkerOnboardingCompleted(
      privilegedClient,
      match.workerId
    );

    const access = await resolveWorkerAccess(privilegedClient, match.workerId);
    return {
      user,
      role: normalizeSecurityRole(match.securityRole),
      workerId: match.workerId,
      onboardingCompleted,
      accessRevoked,
      workerCategory: access.category,
      hiredLabourStatus: access.hiredLabourStatus,
      subcontractorId,
    };
  }

  if (!accessRevoked) {
    const linked = await linkWorkerForSession(user);
    if (linked.workerId) {
      const onboardingCompleted = await resolveWorkerOnboardingCompleted(
        privilegedClient,
        linked.workerId
      );
      const access = await resolveWorkerAccess(privilegedClient, linked.workerId);
      return {
        user,
        role: normalizeSecurityRole(linked.securityRole),
        workerId: linked.workerId,
        onboardingCompleted,
        accessRevoked,
        workerCategory: access.category,
        hiredLabourStatus: access.hiredLabourStatus,
        subcontractorId,
      };
    }
  }

  const metadata = user.user_metadata as Record<string, unknown> | undefined;
  const rawRole = metadata?.role ?? metadata?.security_role ?? metadata?.profile_role;

  return {
    user,
    role: normalizeSecurityRole(typeof rawRole === "string" ? rawRole : null),
    workerId: null,
    onboardingCompleted: true,
    accessRevoked,
    workerCategory: null,
    hiredLabourStatus: null,
    subcontractorId,
  };
}

function isNativeAppRequest(request: NextRequest): boolean {
  return request.cookies.get(NATIVE_APP_COOKIE)?.value === "1";
}

function resolveAuthenticatedHomePath(
  context: AuthContext,
  request: NextRequest
): string {
  if (
    isSuperAdminAccount({
      email: context.user?.email,
      metadata: (context.user?.user_metadata ?? null) as Record<string, unknown> | null,
    }) &&
    !request.cookies.get(ACTIVE_ORG_COOKIE)?.value?.trim()
  ) {
    return "/select-company";
  }
  if (canAccessAdminConsole(context.role)) {
    return resolveDefaultLandingPathForRole(
      context.role,
      context.workerId,
      context.subcontractorId
    );
  }
  if (context.workerId && isWorkerRole(context.role)) {
    return resolveGeneralWorkerHomePath(context);
  }
  if (
    String(context.workerCategory ?? "").toLowerCase() === "hired_labour" &&
    context.hiredLabourStatus !== "approved"
  ) {
    return "/onboarding/hired-labour";
  }
  if (isNativeAppRequest(request) && isWorkerRole(context.role) && !context.subcontractorId) {
    return resolveNativeWorkerDashboardPath(context.workerId);
  }
  return resolveDefaultLandingPathForRole(
    context.role,
    context.workerId,
    context.subcontractorId
  );
}

function resolveGeneralWorkerHomePath(context: AuthContext): string {
  if (context.workerId) {
    const params = new URLSearchParams({ worker_id: context.workerId });
    return `${GENERAL_WORKER_HOME_PATH}?${params.toString()}`;
  }
  return GENERAL_WORKER_HOME_PATH;
}

function isWorkerRole(role: SecurityRole | string | null | undefined): boolean {
  return role === "general_worker" || isGeneralWorkerRole(role);
}

function workerSafeLoginDestination(
  context: AuthContext,
  request: NextRequest,
  nextPath: string
): string {
  const relativeNext = toRelativeAppPath(nextPath, "");
  const nextPathname = relativeNext.split("?")[0] ?? "";
  if (
    context.subcontractorId &&
    !context.workerId &&
    (nextPathname === GENERAL_WORKER_HOME_PATH ||
      nextPathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`))
  ) {
    return SUBCONTRACTOR_PORTAL_HOME_PATH;
  }
  if (isWorkerRole(context.role)) {
    if (relativeNext.startsWith("/") && isGeneralWorkerAllowedPath(nextPathname)) {
      return relativeNext;
    }
    return resolveAuthenticatedHomePath(context, request);
  }
  if (
    relativeNext.startsWith("/") &&
    nextPathname !== "/" &&
    nextPathname !== GENERAL_WORKER_HOME_PATH &&
    !nextPathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`)
  ) {
    return relativeNext;
  }
  return resolveAuthenticatedHomePath(context, request);
}

/**
 * Supabase session refresh + RBAC redirects for Next.js Proxy / Middleware.
 */
export async function runAuthProxy(request: NextRequest): Promise<NextResponse> {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/auth/callback") ||
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/auth/reset-password") ||
    pathname.includes("/setyourpassword") ||
    pathname.includes("/reset-password") ||
    pathname.startsWith("/update-password") ||
    pathname.startsWith("/set-password") ||
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token_hash") ||
    (isPublicAuthFlowPath(pathname) &&
      !pathname.startsWith("/onboarding") &&
      !isSubcontractorOnboardPath(pathname))
  ) {
    return NextResponse.next({ request });
  }

  let sessionResponse = NextResponse.next({ request });

  if (!isSupabaseConfigured()) {
    return sessionResponse;
  }

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value }) => {
          request.cookies.set(name, value);
        });
        sessionResponse = NextResponse.next({ request });
        cookiesToSet.forEach(({ name, value, options }) => {
          sessionResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const {
    data: { user },
  } = await supabase.auth.getUser();

  const {
    data: { session },
  } = await supabase.auth.getSession();

  const context = await resolveAuthContext(supabase, user);

  async function redirectRevokedToLogin(): Promise<NextResponse> {
    await supabase.auth.signOut();
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("error", WORKER_REVOKED_LOGIN_ERROR_PARAM);
    return redirectWithCookies(
      request,
      `${loginUrl.pathname}${loginUrl.search}`,
      sessionResponse
    );
  }

  if (context.user && context.accessRevoked) {
    if (pathname.startsWith("/login")) {
      if (request.nextUrl.searchParams.get("error") !== WORKER_REVOKED_LOGIN_ERROR_PARAM) {
        return redirectRevokedToLogin();
      }
      return sessionResponse;
    }
    return redirectRevokedToLogin();
  }

  if (
    session &&
    isPasswordRecoverySession(session) &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/update-password") &&
    !pathname.startsWith("/setyourpassword") &&
    !pathname.startsWith("/reset-password") &&
    !pathname.startsWith("/set-password") &&
    !pathname.startsWith("/accept-invite") &&
    !pathname.startsWith("/account/update-password")
  ) {
    return redirectWithCookies(
      request,
      "/setyourpassword",
      sessionResponse
    );
  }

  if (pathname.startsWith("/login")) {
    if (context.user) {
      const nextParam =
        request.nextUrl.searchParams.get("next") ??
        request.nextUrl.searchParams.get("returnTo") ??
        request.nextUrl.searchParams.get("redirect") ??
        request.nextUrl.searchParams.get("redirect_to");
      let nextPath = "";
      if (nextParam?.startsWith("/")) {
        nextPath = nextParam;
      } else if (nextParam) {
        try {
          const parsed = new URL(nextParam);
          nextPath = `${parsed.pathname}${parsed.search}`;
        } catch {
          nextPath = "";
        }
      }
      let destination = workerSafeLoginDestination(context, request, nextPath);
      if (
        isNativeAppRequest(request) &&
        isWorkerRole(context.role) &&
        !context.subcontractorId &&
        shouldRedirectNativePath(destination)
      ) {
        destination = resolveNativeWorkerDashboardPath(context.workerId);
      }
      return redirectWithCookies(request, destination, sessionResponse);
    }
    return sessionResponse;
  }

  if (pathname === "/" && context.user) {
    const hasConsoleView = Boolean(request.nextUrl.searchParams.get("view")?.trim());
    const hasAuthPayload =
      request.nextUrl.searchParams.has("code") ||
      request.nextUrl.searchParams.has("token_hash");
    if (!hasAuthPayload && isWorkerRole(context.role)) {
      return redirectWithCookies(
        request,
        resolveAuthenticatedHomePath(context, request),
        sessionResponse
      );
    }
    if (
      !hasAuthPayload &&
      !hasConsoleView &&
      isAppHostname(requestHostHeader(request))
    ) {
      return redirectWithCookies(
        request,
        resolveAuthenticatedHomePath(context, request),
        sessionResponse
      );
    }
  }

  const isHiredLabour =
    String(context.workerCategory ?? "").toLowerCase() === "hired_labour";
  const hiredLabourBlocked = isHiredLabour && context.hiredLabourStatus !== "approved";
  const hiredLabourOnboardingPath = "/onboarding/hired-labour";
  if (
    hiredLabourBlocked &&
    !isGrantedWorkerAppPath(pathname) &&
    !pathname.startsWith(hiredLabourOnboardingPath) &&
    !pathname.startsWith("/setyourpassword") &&
    !pathname.startsWith("/reset-password") &&
    !pathname.startsWith("/set-password") &&
    !pathname.startsWith("/update-password") &&
    !pathname.startsWith("/accept-invite") &&
    !pathname.startsWith("/auth/") &&
    !pathname.startsWith("/guest") &&
    !isSubcontractorOnboardPath(pathname)
  ) {
    return redirectWithCookies(request, hiredLabourOnboardingPath, sessionResponse);
  }

  if (
    context.user &&
    canAccessAdminConsole(context.role) &&
    isSubcontractorOnboardPath(pathname) &&
    !request.nextUrl.searchParams.get("token")?.trim()
  ) {
    return redirectWithCookies(request, "/dashboard/subcontractors", sessionResponse);
  }

  if (isPublicPath(pathname)) {
    return sessionResponse;
  }

  if (
    context.user &&
    isNativeAppRequest(request) &&
    shouldRedirectNativePath(pathname)
  ) {
    if (canAccessAdminConsole(context.role)) {
      return sessionResponse;
    }
    if (context.subcontractorId && !context.workerId) {
      return redirectWithCookies(request, SUBCONTRACTOR_PORTAL_HOME_PATH, sessionResponse);
    }
    if (isWorkerRole(context.role)) {
      return redirectWithCookies(
        request,
        resolveNativeWorkerDashboardPath(context.workerId),
        sessionResponse
      );
    }
  }

  if (context.user) {
    const superAdmin = isSuperAdminAccount({
      email: context.user.email,
      metadata: (context.user.user_metadata ?? null) as Record<string, unknown> | null,
    });
    if (superAdmin) {
      const hasOrg = Boolean(request.cookies.get(ACTIVE_ORG_COOKIE)?.value?.trim());
      if (!hasOrg && pathname !== "/select-company") {
        return redirectWithCookies(request, "/select-company", sessionResponse);
      }
    } else if (pathname === "/select-company" || pathname.startsWith("/select-company/")) {
      return redirectWithCookies(
        request,
        resolveDefaultLandingPathForRole(
          context.role,
          context.workerId,
          context.subcontractorId
        ),
        sessionResponse
      );
    }
  }

  if (requiresAuthentication(pathname, request) && !context.user) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${request.nextUrl.search}`;
    if (nextPath !== "/" && !nextPath.startsWith("/login")) {
      loginUrl.searchParams.set("returnTo", nextPath);
      loginUrl.searchParams.set("next", nextPath);
    }
    return redirectWithCookies(
      request,
      `${loginUrl.pathname}${loginUrl.search}`,
      sessionResponse
    );
  }

  const superAdminUser = Boolean(
    context.user &&
      isSuperAdminAccount({
        email: context.user.email,
        metadata: (context.user.user_metadata ?? null) as Record<string, unknown> | null,
      })
  );

  if (context.user && !superAdminUser && context.role === "general_worker") {
    if (
      context.subcontractorId &&
      !context.workerId &&
      isWorkerDashboardPath(pathname)
    ) {
      return redirectWithCookies(request, SUBCONTRACTOR_PORTAL_HOME_PATH, sessionResponse);
    }

    const incompleteOnboardingPath = isHiredLabour
      ? hiredLabourOnboardingPath
      : "/onboarding";

    if (
      hiredLabourBlocked &&
      !isGrantedWorkerAppPath(pathname) &&
      !pathname.startsWith(hiredLabourOnboardingPath)
    ) {
      return redirectWithCookies(request, hiredLabourOnboardingPath, sessionResponse);
    }

    if (
      !isHiredLabour &&
      !context.onboardingCompleted &&
      (pathname === GENERAL_WORKER_HOME_PATH ||
        pathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`) ||
        pathname === "/dashboard")
    ) {
      return redirectWithCookies(request, incompleteOnboardingPath, sessionResponse);
    }

    if (
      ((isHiredLabour && !hiredLabourBlocked) || (!isHiredLabour && context.onboardingCompleted)) &&
      pathname.startsWith("/onboarding")
    ) {
      return redirectWithCookies(
        request,
        resolveGeneralWorkerHomePath(context),
        sessionResponse
      );
    }

    if (!isWorkerHomePath(pathname)) {
      return redirectWithCookies(
        request,
        isHiredLabour
          ? hiredLabourBlocked
            ? hiredLabourOnboardingPath
            : resolveGeneralWorkerHomePath(context)
          : context.onboardingCompleted
            ? resolveGeneralWorkerHomePath(context)
            : incompleteOnboardingPath,
        sessionResponse
      );
    }
    return sessionResponse;
  }

  if (context.user && !superAdminUser && context.role === "project_team") {
    if (
      (isOrganisationPath(pathname) && !canAccessOrganisationPath(context.role, pathname)) ||
      (isAccountsPath(pathname) && !canAccessAccountsPath(context.role, pathname)) ||
      !isProjectTeamAllowedPath(pathname)
    ) {
      return redirectWithCookies(
        request,
        resolveProjectTeamFallbackPath(pathname),
        sessionResponse
      );
    }
    return sessionResponse;
  }

  if (
    context.user &&
    !superAdminUser &&
    context.role !== "full_access" &&
    context.role !== "master_admin"
  ) {
    if (isOrganisationPath(pathname) || isAccountsPath(pathname)) {
      return redirectWithCookies(request, PROJECTS_HOME_PATH, sessionResponse);
    }
  }

  return sessionResponse;
}
