import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

export async function GET(request: Request) {
  const requestUrl = new URL(request.url);
  const code = requestUrl.searchParams.get("code");
  const next = requestUrl.searchParams.get("next") ?? "/";
  const safeNext = next.startsWith("/") ? next : "/";
  const origin = requestUrl.origin;

  if (!code) {
    return NextResponse.redirect(`${origin}${safeNext}`);
  }

  const cookieStore = await cookies();
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

  const { error } = await supabase.auth.exchangeCodeForSession(code);

  if (error) {
    const fallbackPath = safeNext.startsWith("/auth/") ? safeNext : "/auth/confirm-invite";
    const redirectUrl = new URL(fallbackPath, origin);
    redirectUrl.searchParams.set("error", error.message);
    const errorResponse = NextResponse.redirect(redirectUrl);
    copyCookies(sessionResponse, errorResponse);
    return errorResponse;
  }

  const redirectResponse = NextResponse.redirect(`${origin}${safeNext}`);
  copyCookies(sessionResponse, redirectResponse);
  return redirectResponse;
}
