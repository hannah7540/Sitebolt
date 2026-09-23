export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createHmac, randomUUID, timingSafeEqual } from "crypto";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

const TOKEN_TTL_MS = 60 * 60 * 1000;

type ResetTokenPayload = {
  sub: string;
  email: string;
  exp: number;
};

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL?.trim().replace(/\/$/, "") ||
    process.env.NEXT_PUBLIC_APP_URL?.trim().replace(/\/$/, "") ||
    "https://www.site-bolt.com.au"
  );
}

function tokenSecret(): string {
  return (
    process.env.PASSWORD_RESET_TOKEN_SECRET?.trim() ||
    process.env.SUPABASE_SERVICE_ROLE_KEY?.trim() ||
    ""
  );
}

export function signPasswordResetToken(userId: string, email: string): string {
  const payload = Buffer.from(
    JSON.stringify({
      sub: userId,
      email,
      exp: Date.now() + TOKEN_TTL_MS,
    } satisfies ResetTokenPayload),
    "utf8"
  ).toString("base64url");
  const signature = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  return `${payload}.${signature}`;
}

export function readPasswordResetToken(token: string): ResetTokenPayload | null {
  const [payload, signature] = token.split(".");
  if (!payload || !signature) return null;

  const expected = createHmac("sha256", tokenSecret()).update(payload).digest("base64url");
  const left = Buffer.from(signature);
  const right = Buffer.from(expected);
  if (left.length !== right.length || !timingSafeEqual(left, right)) {
    return null;
  }

  try {
    const data = JSON.parse(Buffer.from(payload, "base64url").toString("utf8")) as ResetTokenPayload;
    if (!data.sub || !data.email || typeof data.exp !== "number") return null;
    if (data.exp < Date.now()) return null;
    return data;
  } catch {
    return null;
  }
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function resetEmailHtml(resetLink: string): string {
  const href = escapeHtml(resetLink);
  return `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <title>Reset your SiteBolt password</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Helvetica,Arial,sans-serif;">
    <table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width:560px;margin:0 auto;background-color:#ffffff;border:1px solid #e2e8f0;border-radius:8px;">
      <tr>
        <td align="center" style="background-color:#1e242b;padding:24px;">
          <span style="color:#ffffff;font-size:22px;font-weight:800;letter-spacing:1.5px;">SITEBOLT</span>
        </td>
      </tr>
      <tr>
        <td style="padding:32px 28px;color:#334155;">
          <h2 style="margin:0 0 16px 0;color:#0f172a;font-size:20px;">Reset your password</h2>
          <p style="margin:0 0 24px 0;font-size:15px;line-height:1.6;color:#475569;">
            We received a request to reset your password for your SiteBolt account. Tap the button below to set a new password:
          </p>
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 24px auto;">
            <tr>
              <td align="center" bgcolor="#F97316" style="border-radius: 6px;">
                <a href="${href}"
                   target="_blank"
                   style="display: inline-block; padding: 14px 28px; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; font-size: 16px; font-weight: bold; color: #FFFFFF !important; text-decoration: none; border-radius: 6px; background-color: #F97316;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>
          <p style="text-align: center; font-size: 12px; margin-top: 16px; word-break: break-all;">
            If the button above does not work, copy and paste this link into your browser:<br />
            <a href="${href}" style="color: #f97316; text-decoration: underline;">${href}</a>
          </p>
        </td>
      </tr>
      <tr>
        <td align="center" style="padding:16px;background-color:#f8fafc;border-top:1px solid #f1f5f9;font-size:12px;color:#94a3b8;">
          If you didn't request this email, you can safely ignore it.<br />
          &copy; 2026 SiteBolt Management Software. All rights reserved.
        </td>
      </tr>
    </table>
  </body>
</html>`;
}

export async function sendPasswordResetEmail(normalizedEmail: string): Promise<{ error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY;
  if (!apiKey) {
    return { error: "Server error: RESEND_API_KEY is not configured." };
  }
  if (!isSupabaseAdminConfigured()) {
    return { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." };
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data: worker, error: workerError } = await supabaseAdmin
      .from("workers")
      .select("id, email, invite_token")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (workerError) {
      console.error("[/api/auth/forgot-password] worker lookup failed:", workerError.message);
      return { error: null };
    }

    if (!worker?.id) {
      return { error: null };
    }

    const existingToken =
      typeof worker.invite_token === "string" ? worker.invite_token.trim() : "";
    const token = existingToken || randomUUID();

    if (!existingToken) {
      const { error: tokenError } = await supabaseAdmin
        .from("workers")
        .update({ invite_token: token })
        .eq("id", worker.id);
      if (tokenError) {
        console.error("[/api/auth/forgot-password] token persist failed:", tokenError.message);
        return { error: null };
      }
    }

    const resetLink = `${siteOrigin()}/setyourpassword?token=${token}`;

    const resend = new Resend(apiKey);
    const resendResult = await resend.emails.send({
      from: "SiteBolt <admin@site-bolt.com.au>",
      to: [normalizedEmail],
      subject: "Reset your SiteBolt password",
      html: resetEmailHtml(resetLink),
      text: `Reset your SiteBolt password\n\nClick the link below to set a new password:\n\n${resetLink}\n\nIf you did not request this, you can ignore this email.`,
    });

    if (resendResult.error) {
      console.error("[/api/auth/forgot-password] Resend delivery error:", resendResult.error);
      return { error: resendResult.error.message };
    }

    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[/api/auth/forgot-password] unexpected error:", message);
    return { error: null };
  }
}

export async function POST(req: Request) {
  try {
    const body = await req.json().catch(() => null);
    const normalizedEmail =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const result = await sendPasswordResetEmail(normalizedEmail);
    if (result.error?.includes("not configured")) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch {
    return NextResponse.json({ success: true }, { status: 200 });
  }
}
