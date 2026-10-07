import { NextResponse, type NextRequest } from "next/server";
import { runAuthProxy } from "@/lib/auth-proxy";
import { isPlantPrestartPath } from "@/lib/plant-prestart-url";
import {
  isMarketingPublicPath,
  isOperationalAppPath,
  resolveAppOriginFromRequest,
} from "@/lib/site-domains";

/**
 * Next.js 16 Proxy entry — domain-aware marketing/app split, then session/RBAC.
 * @see https://nextjs.org/docs/app/getting-started/proxy
 */
export async function proxy(request: NextRequest) {
  const cleanedPath = request.nextUrl.pathname.replace(/[)\].,]+$/, "");
  if (cleanedPath !== request.nextUrl.pathname) {
    const dest = request.nextUrl.clone();
    dest.pathname = cleanedPath;
    return NextResponse.redirect(dest);
  }

  const pathname = cleanedPath;
  const host = (
    request.headers.get("x-forwarded-host") ||
    request.headers.get("host") ||
    ""
  )
    .split(",")[0]
    .trim()
    .toLowerCase();
  const isAppSubdomain = host.startsWith("app.") || host.startsWith("app.localhost");

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

  if (!isAppSubdomain) {
    if (pathname === "/" || pathname === "/enquire" || pathname.startsWith("/enquire/")) {
      const dest = request.nextUrl.clone();
      dest.pathname = "/marketing";
      if (pathname === "/enquire" || pathname.startsWith("/enquire/")) {
        dest.searchParams.set("enquire", "1");
      }
      return NextResponse.rewrite(dest);
    }

    if (isMarketingPublicPath(pathname)) {
      return NextResponse.next();
    }

    if (isOperationalAppPath(pathname) || isPlantPrestartPath(pathname)) {
      const dest = new URL(
        `${pathname}${request.nextUrl.search}`,
        resolveAppOriginFromRequest(request)
      );
      return NextResponse.redirect(dest);
    }

    return NextResponse.next();
  }

  if (
    pathname.startsWith("/auth/confirm") ||
    pathname.startsWith("/setyourpassword") ||
    pathname.startsWith("/onboarding") ||
    pathname.startsWith("/login") ||
    pathname.startsWith("/privacy") ||
    pathname.startsWith("/terms") ||
    pathname.startsWith("/download") ||
    pathname.startsWith("/support") ||
    pathname.startsWith("/marketing") ||
    pathname.startsWith("/enquire") ||
    isPlantPrestartPath(pathname)
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

  return runAuthProxy(request);
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|api/|.*\\.(?:svg|png|jpg|jpeg|gif|webp)$).*)",
  ],
};
