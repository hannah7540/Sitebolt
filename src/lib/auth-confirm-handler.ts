import { createServerClient } from "@supabase/ssr";
import type { EmailOtpType } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { NextResponse } from "next/server";
import { supabaseAnonKey, supabaseUrl } from "@/lib/supabase/env";

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

const EXPIRED_REDIRECT = "/setyourpassword?error=expired";

function copyCookies(from: NextResponse, to: NextResponse): void {
  from.cookies.getAll().forEach((cookie) => {
    to.cookies.set(cookie);
  });
}

function resolveSafeNext(next: string | null): string {
  if (
    next &&
    next.startsWith("/") &&
    !next.startsWith("//") &&
    !next.startsWith("/login") &&
    !next.startsWith("/admin")
  ) {
    return next.split("?")[0] || "/setyourpassword";
  }
  return "/setyourpassword";
}

function resolveOrigin(request: Request): string {
  const configured = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    ""
  ).replace(/\/$/, "");
  if (configured.startsWith("http") && !configured.includes("localhost")) {
    return configured;
  }
  return new URL(request.url).origin;
}

function isPrefetchOrScannerRequest(request: Request): boolean {
  if (request.method === "HEAD") return true;

  const purpose =
    request.headers.get("purpose") ||
    request.headers.get("sec-purpose") ||
    request.headers.get("x-purpose") ||
    "";
  if (/prefetch|preview|prerender/i.test(purpose)) return true;

  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  if (dest === "empty" || dest === "image" || dest === "iframe") return true;

  const mode = (request.headers.get("sec-fetch-mode") || "").toLowerCase();
  if (mode === "no-cors" || mode === "cors") return true;

  const ua = request.headers.get("user-agent") || "";
  return /SafeLinks|Proofpoint|Barracuda|mimecast|GoogleImageProxy|YahooMailProxy|Superhuman|SaneBox|Microsoft Office|Outlook-iOS|prefetch/i.test(
    ua
  );
}

function looksLikeUserNavigation(request: Request): boolean {
  const dest = (request.headers.get("sec-fetch-dest") || "").toLowerCase();
  const user = request.headers.get("sec-fetch-user") || "";
  return dest === "document" && user === "?1";
}

function continueHtml(tokenHash: string, type: string, next: string): string {
  const escapedHash = tokenHash
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/</g, "&lt;");
  const escapedType = type.replace(/"/g, "&quot;");
  const escapedNext = next.replace(/"/g, "&quot;");
  return `<!doctype html>
<html lang="en">
  <head>
    <meta charset="utf-8" />
    <meta name="viewport" content="width=device-width, initial-scale=1" />
    <title>Continue to SiteBolt</title>
  </head>
  <body style="margin:0;min-height:100vh;display:flex;align-items:center;justify-content:center;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
    <form method="POST" action="/auth/confirm" style="width:100%;max-width:28rem;background:#fff;border:1px solid #e2e8f0;border-radius:1rem;padding:2rem;box-shadow:0 1px 2px rgba(15,23,42,0.06);">
      <p style="margin:0 0 0.35rem;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">SiteBolt</p>
      <h1 style="margin:0 0 0.75rem;font-size:1.35rem;color:#0f172a;">Set your password</h1>
      <p style="margin:0 0 1.25rem;color:#475569;font-size:14px;line-height:1.5;">
        Click continue to open the password setup page. This extra step keeps email scanners from using your one-time link.
      </p>
      <input type="hidden" name="token_hash" value="${escapedHash}" />
      <input type="hidden" name="type" value="${escapedType}" />
      <input type="hidden" name="next" value="${escapedNext}" />
      <button type="submit" style="width:100%;border:0;border-radius:0.75rem;background:#f97316;color:#fff;font-weight:700;padding:0.85rem 1rem;cursor:pointer;">
        Continue
      </button>
    </form>
  </body>
</html>`;
}

async function exchangeTokenHash(input: {
  request: Request;
  tokenHash: string;
  type: EmailOtpType;
  next: string;
}): Promise<NextResponse> {
  const origin = resolveOrigin(input.request);
  const cookieStore = await cookies();
  let sessionResponse = NextResponse.next();

  const supabase = createServerClient(supabaseUrl, supabaseAnonKey, {
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        cookiesToSet.forEach(({ name, value, options }) => {
          try {
            cookieStore.set(name, value, options);
          } catch {
            // Cookies must be written onto the returned redirect response.
          }
          sessionResponse.cookies.set(name, value, options);
        });
      },
    },
  });

  const { error } = await supabase.auth.verifyOtp({
    type: input.type,
    token_hash: input.tokenHash,
  });

  if (error) {
    console.error("Server verifyOtp error:", error.message);
    const errorResponse = NextResponse.redirect(new URL(EXPIRED_REDIRECT, origin));
    copyCookies(sessionResponse, errorResponse);
    return errorResponse;
  }

  const successResponse = NextResponse.redirect(new URL(input.next, origin));
  copyCookies(sessionResponse, successResponse);
  return successResponse;
}

async function readConfirmParams(
  request: Request
): Promise<{ tokenHash: string | null; type: string | null; next: string }> {
  const url = new URL(request.url);
  let tokenHash = url.searchParams.get("token_hash");
  let type = url.searchParams.get("type");
  let next = resolveSafeNext(url.searchParams.get("next"));

  if ((!tokenHash || !type) && request.method === "POST") {
    const form = await request.formData().catch(() => null);
    tokenHash = tokenHash || (form?.get("token_hash") as string | null);
    type = type || (form?.get("type") as string | null);
    next = resolveSafeNext((form?.get("next") as string | null) || next);
  }

  return { tokenHash, type, next };
}

export async function handleAuthConfirmRequest(request: Request): Promise<NextResponse> {
  const origin = resolveOrigin(request);
  const { tokenHash, type, next } = await readConfirmParams(request);

  if (!tokenHash || !type || !VALID_OTP_TYPES.has(type as EmailOtpType)) {
    return NextResponse.redirect(new URL(EXPIRED_REDIRECT, origin));
  }

  const otpType = type as EmailOtpType;

  if (request.method === "POST") {
    return exchangeTokenHash({ request, tokenHash, type: otpType, next });
  }

  if (isPrefetchOrScannerRequest(request) || !looksLikeUserNavigation(request)) {
    return new NextResponse(continueHtml(tokenHash, otpType, next), {
      status: 200,
      headers: {
        "Content-Type": "text/html; charset=utf-8",
        "Cache-Control": "no-store",
      },
    });
  }

  return exchangeTokenHash({ request, tokenHash, type: otpType, next });
}
