import { NextResponse, type NextRequest } from "next/server";
import { runAuthProxy } from "@/lib/auth-proxy";

/**
 * Next.js 16 Proxy entry — refreshes Supabase sessions and enforces RBAC redirects.
 * @see https://nextjs.org/docs/app/getting-started/proxy
 */
export async function proxy(request: NextRequest) {
  const publicPaths = [
    "/reset-password",
    "/set-password",
    "/auth/callback",
    "/auth/confirm",
    "/onboarding",
    "/login",
  ];
  const pathname = request.nextUrl.pathname;
  const hasAuthPayload =
    request.nextUrl.searchParams.has("code") ||
    request.nextUrl.searchParams.has("token_hash");

  // Email invite/recovery codes can land on `/` or `/login`. Exchange them
  // at /auth/callback before any public-path passthrough or login bounce.
  if (
    hasAuthPayload &&
    !pathname.startsWith("/auth/callback") &&
    !pathname.startsWith("/auth/confirm")
  ) {
    const dest = request.nextUrl.clone();
    dest.pathname = "/auth/callback";
    if (!dest.searchParams.get("next")) {
      dest.searchParams.set("next", "/reset-password");
    }
    return NextResponse.redirect(dest);
  }

  if (publicPaths.some((path) => pathname.startsWith(path))) {
    return NextResponse.next();
  }

  return runAuthProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
