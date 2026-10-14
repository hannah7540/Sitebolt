import { NextResponse, type NextRequest } from "next/server";
import { runAuthProxy } from "@/lib/auth-proxy";
import { isPlantPrestartPath } from "@/lib/plant-prestart-url";
import {
  isMarketingPublicPath,
  isOperationalAppPath,
  resolveAppOriginFromRequest,
} from "@/lib/site-domains";

const PUBLIC_AUTH_PROXY_PATHS = [
  "/reset-password",
  "/auth/reset-password",
  "/auth/callback",
  "/auth/confirm",
  "/setyourpassword",
  "/update-password",
  "/set-password",
] as const;

function isPasswordResetBypassPath(pathname: string): boolean {
  return PUBLIC_AUTH_PROXY_PATHS.some(
    (path) => pathname === path || pathname.startsWith(`${path}/`)
  );
}

/**
 * Next.js 16 Proxy entry (replaces middleware.ts).
 * Password-reset and auth-callback paths must never call getUser / getSession /
 * exchangeCodeForSession — scanners prefetch those URLs and would burn the code.
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

  if (isPasswordResetBypassPath(pathname)) {
    return NextResponse.next();
  }
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

  const alreadyOnTokenPage = [
    "/auth/callback",
    "/auth/confirm",
    "/reset-password",
    "/setyourpassword",
    "/update-password",
    "/accept-invite",
    "/set-password",
  ].some((prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`));

  if (hasAuthPayload && !alreadyOnTokenPage) {
    const dest = request.nextUrl.clone();
    const type = (request.nextUrl.searchParams.get("type") || "").toLowerCase();
    const next = request.nextUrl.searchParams.get("next") || "";
    const isInvite =
      type === "invite" || type === "signup" || type === "magiclink" || next.includes("/accept-invite");
    const isRecovery =
      type === "recovery" ||
      (!isInvite && request.nextUrl.searchParams.has("code")) ||
      (!type && request.nextUrl.searchParams.has("token_hash"));
    dest.pathname = isRecovery
      ? "/reset-password"
      : request.nextUrl.searchParams.has("token_hash")
        ? "/auth/confirm"
        : "/auth/callback";
    if (!dest.searchParams.get("next")) {
      dest.searchParams.set("next", isRecovery ? "/reset-password" : "/setyourpassword");
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
