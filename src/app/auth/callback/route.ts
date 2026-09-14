import { createServerClient, type CookieOptions } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { NextRequest, NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function resolvePasswordSetupPath(next: string | null): string {
  if (
    next?.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/login") &&
    !next.startsWith("/admin") &&
    (next.includes("/setyourpassword") ||
      next.includes("/reset-password") ||
      next.includes("/set-password"))
  ) {
    return next.split("?")[0] || "/setyourpassword";
  }
  return "/setyourpassword";
}

function applyAuthCookies(
  response: NextResponse,
  request: NextRequest,
  name: string,
  value: string,
  options: CookieOptions
): void {
  request.cookies.set({ name, value, ...options });
  response.cookies.set({
    name,
    value,
    ...options,
    path: options.path ?? "/",
  });
}

export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") as EmailOtpType | null;
  const next = searchParams.get("next") || "/setyourpassword";
  const code = searchParams.get("code");

  const destination = resolvePasswordSetupPath(next);
  const targetUrl = new URL(
    destination.startsWith("/") ? destination : `/${destination}`,
    origin
  );
  if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
  if (type) targetUrl.searchParams.set("type", type);
  if (code) targetUrl.searchParams.set("code", code);

  const response = NextResponse.redirect(targetUrl);

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return request.cookies.getAll();
      },
      setAll(cookiesToSet, headers) {
        cookiesToSet.forEach(({ name, value, options }) => {
          applyAuthCookies(response, request, name, value, options);
        });
        Object.entries(headers).forEach(([key, value]) => {
          response.headers.set(key, value);
        });
      },
    },
  });

  // Do not consume token_hash here. Forward it so /setyourpassword can
  // verifyOtp on the client if cookies are dropped. Cookie writes still
  // run for PKCE `code` exchanges below.

  if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) {
      console.warn("[auth/callback] exchangeCodeForSession failed:", error.message);
    }
  }

  return response;
}
