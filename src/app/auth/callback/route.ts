import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
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

function resolvePasswordSetupPath(next: string | null): string {
  if (
    next?.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/login") &&
    !next.startsWith("/admin") &&
    (next.includes("/reset-password") || next.includes("/set-password"))
  ) {
    return next.split("?")[0] || "/reset-password";
  }
  // Invite/recovery emails always land on the public password form.
  return "/reset-password";
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const tokenHash = requestUrl.searchParams.get("token_hash");
  const type = requestUrl.searchParams.get("type");
  const next = requestUrl.searchParams.get("next");
  const origin = requestUrl.origin;
  const destination = resolvePasswordSetupPath(next);

  if (!code && !tokenHash) {
    return NextResponse.redirect(new URL(destination, origin), 303);
  }

  const cookieStore = await cookies();
  const response = NextResponse.redirect(new URL(destination, origin), 303);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Cookies must be written onto the returned redirect response.
          }
          response.cookies.set(name, value, options);
        });
      },
    },
  });

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      const errorUrl = new URL(destination, origin);
      errorUrl.searchParams.set("error", error.message);
      const errorResponse = NextResponse.redirect(errorUrl, 303);
      copyCookies(response, errorResponse);
      return errorResponse;
    }
    return response;
  }

  if (tokenHash && type && VALID_OTP_TYPES.has(type as EmailOtpType)) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: type as EmailOtpType,
    });
    if (error) {
      const errorUrl = new URL(destination, origin);
      errorUrl.searchParams.set("error", error.message);
      const errorResponse = NextResponse.redirect(errorUrl, 303);
      copyCookies(response, errorResponse);
      return errorResponse;
    }
  }

  return response;
}
