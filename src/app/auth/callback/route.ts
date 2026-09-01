import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType, User } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import {
  PASSWORD_SETUP_PATH,
  WORKER_INVITE_NEXT_PATH,
  buildPasswordSetupPath,
} from "@/lib/worker-invite-link";
import {
  isPasswordSetupPath,
  resolvePostInvitePasswordPath,
} from "@/lib/worker-invite-redirect";
import { isSupabaseAdminConfigured, supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";

export const dynamic = "force-dynamic";

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function resolveSafeNext(next: string | null, otpType: string | null): string {
  if (next && next.startsWith("/")) {
    return next;
  }

  if (otpType === "recovery" || otpType === "invite") {
    return PASSWORD_SETUP_PATH;
  }

  return WORKER_INVITE_NEXT_PATH;
}

async function readWorkerInviteState(user: User | null): Promise<{
  onboardingCompleted: boolean;
  workerId: string | null;
}> {
  if (!user || !isSupabaseAdminConfigured()) {
    return { onboardingCompleted: false, workerId: null };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { data: byAuth } = await admin
      .from("workers")
      .select("id, onboarding_completed")
      .eq("auth_user_id", user.id)
      .maybeSingle();
    if (byAuth?.id) {
      return {
        onboardingCompleted: byAuth.onboarding_completed === true,
        workerId: byAuth.id as string,
      };
    }

    const email = user.email?.trim();
    if (email) {
      const { data: byEmail } = await admin
        .from("workers")
        .select("id, onboarding_completed")
        .ilike("email", email)
        .maybeSingle();
      if (byEmail?.id) {
        return {
          onboardingCompleted: byEmail.onboarding_completed === true,
          workerId: byEmail.id as string,
        };
      }
    }
  } catch (error) {
    console.warn("[auth/callback] onboarding_completed lookup failed:", error);
  }

  return { onboardingCompleted: false, workerId: null };
}

async function resolveCallbackDestination(
  nextPath: string,
  user: User | null,
  otpType: string | null
): Promise<string> {
  const pathOnly = nextPath.split("?")[0] || nextPath;

  if (
    isPasswordSetupPath(pathOnly) ||
    otpType === "invite" ||
    otpType === "recovery"
  ) {
    const setupPath = isPasswordSetupPath(pathOnly) ? pathOnly : PASSWORD_SETUP_PATH;
    if (setupPath === PASSWORD_SETUP_PATH) {
      return buildPasswordSetupPath(user?.email ?? null);
    }
    return nextPath.startsWith("/") ? nextPath : PASSWORD_SETUP_PATH;
  }

  const { onboardingCompleted, workerId } = await readWorkerInviteState(user);
  return resolvePostInvitePasswordPath({
    onboardingCompleted,
    workerId,
    role: "general_worker",
  });
}

function createSupabaseWithCookieBridge(cookieStore: Awaited<ReturnType<typeof cookies>>) {
  let sessionResponse = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          cookieStore.set(name, value, options);
        });
        sessionResponse = NextResponse.next();
        cookiesToSet.forEach(({ name, value, options }) => {
          sessionResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  return { supabase, getSessionResponse: () => sessionResponse };
}

function redirectWithSession(
  origin: string,
  nextPath: string,
  sessionResponse: NextResponse
): NextResponse {
  const redirectResponse = NextResponse.redirect(`${origin}${nextPath}`);
  copyCookies(sessionResponse, redirectResponse);
  return redirectResponse;
}

function redirectWithError(
  origin: string,
  nextPath: string,
  message: string,
  sessionResponse: NextResponse
): NextResponse {
  const redirectUrl = new URL(nextPath, origin);
  redirectUrl.searchParams.set("error", message);
  const errorResponse = NextResponse.redirect(redirectUrl);
  copyCookies(sessionResponse, errorResponse);
  return errorResponse;
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpTypeParam = requestUrl.searchParams.get("type");
  const safeNext = resolveSafeNext(requestUrl.searchParams.get("next"), otpTypeParam);
  const origin = requestUrl.origin;

  const cookieStore = await cookies();
  const { supabase, getSessionResponse } = createSupabaseWithCookieBridge(cookieStore);

  if (tokenHash && otpTypeParam && VALID_OTP_TYPES.has(otpTypeParam as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpTypeParam as EmailOtpType,
    });

    if (error) {
      return redirectWithError(origin, safeNext, error.message, getSessionResponse());
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return redirectWithError(
        origin,
        safeNext,
        "Unable to establish password reset session.",
        getSessionResponse()
      );
    }

    const destination = await resolveCallbackDestination(safeNext, user, otpTypeParam);
    return redirectWithSession(origin, destination, getSessionResponse());
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      return redirectWithError(origin, safeNext, error.message, getSessionResponse());
    }

    const {
      data: { user },
    } = await supabase.auth.getUser();

    if (!user) {
      return redirectWithError(
        origin,
        safeNext,
        "Unable to establish password reset session.",
        getSessionResponse()
      );
    }

    const destination = await resolveCallbackDestination(safeNext, user, otpTypeParam);
    const redirectResponse = NextResponse.redirect(new URL(destination, request.url));
    copyCookies(getSessionResponse(), redirectResponse);
    return redirectResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    const destination = await resolveCallbackDestination(safeNext, user, otpTypeParam);
    return redirectWithSession(origin, destination, getSessionResponse());
  }

  return redirectWithError(
    origin,
    safeNext,
    "Auth link is invalid or has expired.",
    getSessionResponse()
  );
}
