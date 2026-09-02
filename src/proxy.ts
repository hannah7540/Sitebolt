import { NextResponse, type NextRequest } from "next/server";
import { runAuthProxy } from "@/lib/auth-proxy";

/**
 * Next.js 16 Proxy entry — refreshes Supabase sessions and enforces RBAC redirects.
 * @see https://nextjs.org/docs/app/getting-started/proxy
 */
export async function proxy(request: NextRequest) {
  const pathname = request.nextUrl.pathname;

  if (
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/setyourpassword") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login")
  ) {
    return NextResponse.next();
  }

  if (
    pathname.startsWith("/reset-password") ||
    pathname.startsWith("/set-password") ||
    pathname.startsWith("/auth")
  ) {
    return NextResponse.next();
  }

  const hasAuthPayload =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token_hash");

  if (hasAuthPayload) {
    const dest = request.nextUrl.clone();
    dest.pathname = request.nextUrl.searchParams.has("token_hash")
      ? "/auth/confirm"
      : "/auth/callback";
    if (!dest.searchParams.get("next")) {
      dest.searchParams.set("next", "/setyourpassword");
    }
    return NextResponse.redirect(dest);
  }

  return runAuthProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
