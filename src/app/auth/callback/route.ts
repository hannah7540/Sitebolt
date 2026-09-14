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

  const nextPath = resolvePasswordSetupPath(next);
  const destination = new URL(
    nextPath.startsWith("/") ? nextPath : `/${nextPath}`,
    origin
  );
  if (token_hash) destination.searchParams.set("token_hash", token_hash);
  if (type) destination.searchParams.set("type", type);
  if (code) destination.searchParams.set("code", code);

  const response = NextResponse.redirect(destination);

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

  if (token_hash) {
    await supabase.auth.verifyOtp({
      type: (type ?? "recovery") as EmailOtpType,
      token_hash,
    });
  } else if (code) {
    await supabase.auth.exchangeCodeForSession(code);
  }

  return response;
}
