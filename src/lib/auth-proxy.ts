import { createServerClient } from "@supabase/ssr";
import { NextResponse, type NextRequest } from "next/server";
import type { User } from "@supabase/supabase-js";
import { isPasswordRecoverySession } from "@/lib/auth-session-utils";
import {
  canManageOrganisation,
  normalizeSecurityRole,
  type SecurityRole,
} from "@/lib/security-roles";
import { isAccountsPath, isOrganisationPath } from "@/lib/rbac-guards";
import { isSupabaseConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import {
  PROJECT_DASHBOARD_HOME_PATH,
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

const PUBLIC_PATH_PREFIXES = [
  "/login",
  "/privacy",
  "/auth/",
  "/accept-invite",
  "/update-password",
  "/reset-password",
  "/set-password",
  "/portal/",
  "/swms/sign/",
  "/scan/",
  "/prestart/",
] as const;

const AUTH_REQUIRED_PREFIXES = [
  "/organisation",
  "/projects",
  "/worker-dashboard",
  "/onboarding",
  "/accounts",
  "/admin",
  "/settings",
  "/account",
  "/emails",
  "/sms",
] as const;

/** Project-scoped admin roles land on the main project console. */
const PROJECTS_HOME_PATH = PROJECT_DASHBOARD_HOME_PATH;

const GENERAL_WORKER_HOME_PATH = "/worker-dashboard";

export const AUTH_PROXY_MATCHER = [
  "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
];

function isPublicPath(pathname: string): boolean {
  if (PUBLIC_PATH_PREFIXES.some((prefix) => pathname.startsWith(prefix))) {
    return true;
  }
  return false;
}

function requiresAuthentication(pathname: string): boolean {
  if (isPublicPath(pathname)) return false;
  if (pathname === "/") return true;
  return AUTH_REQUIRED_PREFIXES.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`)
  );
}

function isGeneralWorkerAllowedPath(pathname: string): boolean {
  return (
    pathname === GENERAL_WORKER_HOME_PATH ||
    pathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`) ||
    pathname.startsWith("/account/") ||
    pathname.startsWith("/settings/account") ||
    pathname.startsWith("/auth/") ||
    pathname.startsWith("/accept-invite") ||
    pathname.startsWith("/update-password") ||
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/portal/")
  );
}

function isProjectRoleBlockedPath(pathname: string): boolean {
  return isOrganisationPath(pathname) || isAccountsPath(pathname);
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
  const redirect = NextResponse.redirect(new URL(path, request.url));
  copyCookies(sessionResponse, redirect);
  return redirect;
}

interface AuthContext {
  user: User | null;
  role: SecurityRole;
  workerId: string | null;
  onboardingCompleted: boolean;
  accessRevoked: boolean;
}

async function resolveWorkerOnboardingCompleted(
  supabase: ReturnType<typeof createServerClient>,
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
    };
  }

  const accessRevoked = await fetchWorkerAccessRevokedForAuthUser(supabase, user);

  const { data: profile } = await supabase
    .from("profiles")
    .select("role, worker_id")
    .eq("id", user.id)
    .maybeSingle();

  if (profile?.role) {
    const workerId = profile.worker_id ?? null;
    const onboardingCompleted = workerId
      ? await resolveWorkerOnboardingCompleted(supabase, workerId)
      : true;

    return {
      user,
      role: normalizeSecurityRole(profile.role),
      workerId,
      onboardingCompleted,
      accessRevoked,
    };
  }

  const { data: workerByAuth } = await supabase
    .from("workers")
    .select("id, security_role")
    .eq("auth_user_id", user.id)
    .maybeSingle();

  if (workerByAuth?.id) {
    const onboardingCompleted = await resolveWorkerOnboardingCompleted(
      supabase,
      workerByAuth.id
    );

    return {
      user,
      role: normalizeSecurityRole(workerByAuth.security_role),
      workerId: workerByAuth.id,
      onboardingCompleted,
      accessRevoked,
    };
  }

  const email = user.email?.trim();
  if (email) {
    const { data: workerByEmail } = await supabase
      .from("workers")
      .select("id, security_role")
      .ilike("email", email)
      .maybeSingle();

    if (workerByEmail?.id) {
      const onboardingCompleted = await resolveWorkerOnboardingCompleted(
        supabase,
        workerByEmail.id
      );

      return {
        user,
        role: normalizeSecurityRole(workerByEmail.security_role),
        workerId: workerByEmail.id,
        onboardingCompleted,
        accessRevoked,
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
  };
}

function isNativeAppRequest(request: NextRequest): boolean {
  return request.cookies.get(NATIVE_APP_COOKIE)?.value === "1";
}

function resolveAuthenticatedHomePath(
  context: AuthContext,
  request: NextRequest
): string {
  if (isNativeAppRequest(request)) {
    return resolveNativeWorkerDashboardPath(context.workerId);
  }
  return resolveDefaultLandingPathForRole(context.role, context.workerId);
}

function resolveGeneralWorkerHomePath(context: AuthContext): string {
  if (context.workerId) {
    const params = new URLSearchParams({ worker_id: context.workerId });
    return `${GENERAL_WORKER_HOME_PATH}?${params.toString()}`;
  }
  return GENERAL_WORKER_HOME_PATH;
}

/**
 * Supabase session refresh + RBAC redirects for Next.js Proxy / Middleware.
 */
export async function runAuthProxy(request: NextRequest): Promise<NextResponse> {
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

  const pathname = request.nextUrl.pathname;
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
    !pathname.startsWith("/reset-password") &&
    !pathname.startsWith("/set-password") &&
    !pathname.startsWith("/accept-invite") &&
    !pathname.startsWith("/account/update-password")
  ) {
    return redirectWithCookies(
      request,
      "/reset-password",
      sessionResponse
    );
  }

  if (pathname.startsWith("/login")) {
    if (context.user) {
      const nextParam =
        request.nextUrl.searchParams.get("next") ??
        request.nextUrl.searchParams.get("redirect_to");
      let destination =
        nextParam?.startsWith("/")
          ? nextParam
          : resolveAuthenticatedHomePath(context, request);
      if (isNativeAppRequest(request) && shouldRedirectNativePath(destination)) {
        destination = resolveNativeWorkerDashboardPath(context.workerId);
      }
      return redirectWithCookies(request, destination, sessionResponse);
    }
    return sessionResponse;
  }

  if (isPublicPath(pathname)) {
    return sessionResponse;
  }

  if (
    context.user &&
    isNativeAppRequest(request) &&
    shouldRedirectNativePath(pathname)
  ) {
    return redirectWithCookies(
      request,
      resolveNativeWorkerDashboardPath(context.workerId),
      sessionResponse
    );
  }

  if (requiresAuthentication(pathname) && !context.user) {
    const loginUrl = new URL("/login", request.url);
    const nextPath = `${pathname}${request.nextUrl.search}`;
    if (nextPath !== "/" && !nextPath.startsWith("/login")) {
      loginUrl.searchParams.set("next", nextPath);
    }
    return redirectWithCookies(
      request,
      `${loginUrl.pathname}${loginUrl.search}`,
      sessionResponse
    );
  }

  if (context.user && context.role === "general_worker") {
    if (
      !context.onboardingCompleted &&
      (pathname === GENERAL_WORKER_HOME_PATH ||
        pathname.startsWith(`${GENERAL_WORKER_HOME_PATH}/`))
    ) {
      return redirectWithCookies(request, "/onboarding", sessionResponse);
    }

    if (context.onboardingCompleted && pathname.startsWith("/onboarding")) {
      return redirectWithCookies(
        request,
        resolveGeneralWorkerHomePath(context),
        sessionResponse
      );
    }

    if (!isGeneralWorkerAllowedPath(pathname)) {
      return redirectWithCookies(
        request,
        context.onboardingCompleted
          ? resolveGeneralWorkerHomePath(context)
          : "/onboarding",
        sessionResponse
      );
    }
    return sessionResponse;
  }

  if (
    context.user &&
    (context.role === "project_admin" || context.role === "project_super_admin") &&
    isProjectRoleBlockedPath(pathname)
  ) {
    return redirectWithCookies(request, PROJECTS_HOME_PATH, sessionResponse);
  }

  if (
    context.user &&
    context.role === "super_admin" &&
    isAccountsPath(pathname) &&
    (pathname.startsWith("/accounts/pay-rules") ||
      pathname.startsWith("/accounts/add-timesheets"))
  ) {
    return redirectWithCookies(request, "/accounts/timesheets", sessionResponse);
  }

  if (context.user && !canManageOrganisation(context.role) && isOrganisationPath(pathname)) {
    return redirectWithCookies(request, PROJECTS_HOME_PATH, sessionResponse);
  }

  return sessionResponse;
}
