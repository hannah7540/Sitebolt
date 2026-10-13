import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

const INVITE_TYPES = new Set(["invite", "signup", "magiclink"]);

function isInviteAuthType(type: string | null, next: string | null): boolean {
  if (INVITE_TYPES.has((type ?? "").toLowerCase())) return true;
  return Boolean(next?.includes("/accept-invite"));
}

/**
 * GET must never call exchangeCodeForSession / verifyOtp / getUser / getSession.
 * Email scanners prefetch this URL and would consume the one-time recovery code.
 * Password-reset codes are parsed and handed to the client reset page only.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const targetUrl = new URL("/reset-password", origin);

  if (code && !isInviteAuthType(type, next)) {
    targetUrl.searchParams.set("code", code);
    targetUrl.searchParams.set("type", type || "recovery");
    if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
    return NextResponse.redirect(targetUrl);
  }

  if (token_hash && (type || "recovery") === "recovery") {
    targetUrl.searchParams.set("token_hash", token_hash);
    targetUrl.searchParams.set("type", type || "recovery");
    if (code) targetUrl.searchParams.set("code", code);
    return NextResponse.redirect(targetUrl);
  }

  if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) {
    const inviteTarget = new URL(next.split("?")[0] || "/setyourpassword", origin);
    if (token_hash) inviteTarget.searchParams.set("token_hash", token_hash);
    if (type) inviteTarget.searchParams.set("type", type);
    if (code) inviteTarget.searchParams.set("code", code);
    return NextResponse.redirect(inviteTarget);
  }

  if (code) targetUrl.searchParams.set("code", code);
  if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
  targetUrl.searchParams.set("type", type || "recovery");
  return NextResponse.redirect(targetUrl);
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
