export const runtime = "nodejs";
export const dynamic = "force-dynamic";

import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

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

function resolveSafeNext(next: string | null): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/login") &&
    !next.startsWith("/admin")
  ) {
    return next;
  }
  return "/setyourpassword";
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

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpTypeParam = requestUrl.searchParams.get("type");
  const safeNext = resolveSafeNext(requestUrl.searchParams.get("next"));

  if (!tokenHash || !otpTypeParam || !VALID_OTP_TYPES.has(otpTypeParam as EmailOtpType)) {
    const errorUrl = new URL(safeNext, requestUrl.origin);
    errorUrl.searchParams.set("error", "Auth link is invalid or has expired.");
    return NextResponse.redirect(errorUrl);
  }

  const cookieStore = await cookies();
  const { supabase, getSessionResponse } = createSupabaseWithCookieBridge(cookieStore);

  const { error } = await supabase.auth.verifyOtp({
    token_hash: tokenHash,
    type: otpTypeParam as EmailOtpType,
  });

  if (error) {
    const errorUrl = new URL(safeNext, requestUrl.origin);
    errorUrl.searchParams.set("error", error.message);
    const errorResponse = NextResponse.redirect(errorUrl);
    copyCookies(getSessionResponse(), errorResponse);
    return errorResponse;
  }

  const {
    data: { user },
  } = await supabase.auth.getUser();

  if (!user) {
    const errorUrl = new URL(safeNext, requestUrl.origin);
    errorUrl.searchParams.set("error", "Unable to establish password reset session.");
    const errorResponse = NextResponse.redirect(errorUrl);
    copyCookies(getSessionResponse(), errorResponse);
    return errorResponse;
  }

  const redirectResponse = NextResponse.redirect(new URL(safeNext, request.url));
  copyCookies(getSessionResponse(), redirectResponse);
  return redirectResponse;
}
