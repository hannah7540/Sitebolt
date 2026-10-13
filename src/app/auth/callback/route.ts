import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const INVITE_TYPES = new Set(["invite", "signup", "magiclink"]);

function isInviteAuthType(type: string | null, next: string | null): boolean {
  if (INVITE_TYPES.has((type ?? "").toLowerCase())) return true;
  return Boolean(next?.includes("/accept-invite"));
}

function resolvePasswordSetupPath(next: string | null, type: string): string {
  if (type === "recovery") {
    return "/reset-password";
  }

  if (
    next?.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/login") &&
    !next.startsWith("/admin") &&
    (next.includes("/setyourpassword") ||
      next.includes("/reset-password") ||
      next.includes("/set-password") ||
      next.includes("/update-password") ||
      next.includes("/accept-invite"))
  ) {
    return next.split("?")[0] || "/setyourpassword";
  }
  return "/setyourpassword";
}

/**
 * ConfirmationURL / PKCE recovery links arrive here as GET ?code=.
 * Never call exchangeCodeForSession on GET — email scanners prefetch this
 * URL and would burn the one-time code before the user submits a password.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const code = searchParams.get("code");
  const next = searchParams.get("next");

  if (code && !isInviteAuthType(type, next)) {
    const targetUrl = new URL("/reset-password", origin);
    targetUrl.searchParams.set("code", code);
    targetUrl.searchParams.set("type", type || "recovery");
    if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
    return NextResponse.redirect(targetUrl);
  }

  const normalizedType = type || "recovery";
  const targetUrl = new URL(
    resolvePasswordSetupPath(next, normalizedType),
    origin
  );
  if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
  if (normalizedType) targetUrl.searchParams.set("type", normalizedType);
  if (code) targetUrl.searchParams.set("code", code);

  return NextResponse.redirect(targetUrl);
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
