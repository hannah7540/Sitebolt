import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { WORKER_INVITE_NEXT_PATH } from "@/lib/worker-invite-link";
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

function resolveSafeNext(next: string | null): string {
  if (!next || !next.startsWith("/")) {
    return WORKER_INVITE_NEXT_PATH;
  }
  return next;
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
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const otpTypeParam = requestUrl.searchParams.get("type");
  const safeNext = resolveSafeNext(requestUrl.searchParams.get("next"));
  const origin = requestUrl.origin;

  const cookieStore = await cookies();
  const { supabase, getSessionResponse } = createSupabaseWithCookieBridge(cookieStore);

  if (tokenHash && otpTypeParam && VALID_OTP_TYPES.has(otpTypeParam as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpTypeParam as EmailOtpType,
    });

    if (error) {
      const redirectUrl = new URL(safeNext, origin);
      redirectUrl.searchParams.set("error", error.message);
      const errorResponse = NextResponse.redirect(redirectUrl);
      copyCookies(getSessionResponse(), errorResponse);
      return errorResponse;
    }

    const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);
    copyCookies(getSessionResponse(), redirectResponse);
    return redirectResponse;
  }

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);

    if (error) {
      const redirectUrl = new URL(safeNext, origin);
      redirectUrl.searchParams.set("error", error.message);
      const errorResponse = NextResponse.redirect(redirectUrl);
      copyCookies(getSessionResponse(), errorResponse);
      return errorResponse;
    }

    const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);
    copyCookies(getSessionResponse(), redirectResponse);
    return redirectResponse;
  }

  return NextResponse.redirect(`${origin}${safeNext}`);
}
