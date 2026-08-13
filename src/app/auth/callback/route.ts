import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { PASSWORD_RESET_NEXT_PATH, WORKER_INVITE_NEXT_PATH } from "@/lib/worker-invite-link";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

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

  if (otpType === "recovery") {
    return PASSWORD_RESET_NEXT_PATH;
  }

  return WORKER_INVITE_NEXT_PATH;
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

    return redirectWithSession(origin, safeNext, getSessionResponse());
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

    return redirectWithSession(origin, safeNext, getSessionResponse());
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (user) {
    return redirectWithSession(origin, safeNext, getSessionResponse());
  }

  return redirectWithError(
    origin,
    safeNext,
    "Auth link is invalid or has expired.",
    getSessionResponse()
  );
}
