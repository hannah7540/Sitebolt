import { NextRequest, NextResponse } from "next/server";
import { toRelativeAppPath } from "@/lib/relative-app-path";

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
  const searchParams = request.nextUrl.searchParams;
  const code = searchParams.get("code");
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type");
  const next = searchParams.get("next");

  const dest = request.nextUrl.clone();
  dest.pathname = "/reset-password";
  dest.search = "";
  dest.hash = "";

  if (code && !isInviteAuthType(type, next)) {
    dest.searchParams.set("code", code);
    dest.searchParams.set("type", type || "recovery");
    if (token_hash) dest.searchParams.set("token_hash", token_hash);
    return NextResponse.redirect(dest);
  }

  if (token_hash && (type || "recovery") === "recovery") {
    dest.searchParams.set("token_hash", token_hash);
    dest.searchParams.set("type", type || "recovery");
    if (code) dest.searchParams.set("code", code);
    return NextResponse.redirect(dest);
  }

  const profileError = searchParams.get("error");
  if (profileError === "worker_profile") {
    dest.pathname = "/login";
    dest.search = "";
    dest.searchParams.set("error", "worker_profile");
    return NextResponse.redirect(dest);
  }

  if (next?.startsWith("/") && !next.startsWith("//") && !next.startsWith("/login")) {
    const inviteTarget = request.nextUrl.clone();
    const fallback =
      next.startsWith("/worker-dashboard") || next.startsWith("/swms")
        ? "/worker-dashboard"
        : "/setyourpassword";
    const relative = toRelativeAppPath(next.split("?")[0] || fallback, fallback);
    inviteTarget.pathname = relative.split("?")[0] || fallback;
    inviteTarget.search = "";
    inviteTarget.hash = "";
    if (token_hash) inviteTarget.searchParams.set("token_hash", token_hash);
    if (type) inviteTarget.searchParams.set("type", type);
    if (code) inviteTarget.searchParams.set("code", code);
    return NextResponse.redirect(inviteTarget);
  }

  if (code) dest.searchParams.set("code", code);
  if (token_hash) dest.searchParams.set("token_hash", token_hash);
  dest.searchParams.set("type", type || "recovery");
  return NextResponse.redirect(dest);
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
