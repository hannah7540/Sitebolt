import { NextRequest, NextResponse } from "next/server";

export const dynamic = "force-dynamic";

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
 * Pass token_hash / code through to the frontend. Never exchange or verify here —
 * a GET from an email scanner would consume the single-use recovery token.
 */
export async function GET(request: NextRequest) {
  const { searchParams, origin } = new URL(request.url);
  const token_hash = searchParams.get("token_hash");
  const type = searchParams.get("type") || "recovery";
  const code = searchParams.get("code");
  const next = searchParams.get("next") || "/setyourpassword";

  const targetUrl = new URL(resolvePasswordSetupPath(next, type), origin);
  if (token_hash) targetUrl.searchParams.set("token_hash", token_hash);
  if (type) targetUrl.searchParams.set("type", type);
  if (code) targetUrl.searchParams.set("code", code);

  return NextResponse.redirect(targetUrl);
}

export async function HEAD() {
  return new Response(null, {
    status: 200,
    headers: { "Cache-Control": "no-store" },
  });
}
