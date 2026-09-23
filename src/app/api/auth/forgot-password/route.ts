export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { createHmac, timingSafeEqual } from "crypto";
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

function resetEmailHtml(resetLink: string): string {
  return `
      <!DOCTYPE html>
      <html>
        <head>
          <meta charset="utf-8">
          <meta name="viewport" content="width=device-width, initial-scale=1.0">
        </head>
        <body style="margin: 0; padding: 0; background-color: #f8fafc; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif;">
          <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="background-color: #f8fafc; padding: 40px 16px;">
            <tr>
              <td align="center">
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden;">
                  <tr>
                    <td style="padding: 32px 32px 20px 32px; text-align: left;">
                      <h1 style="margin: 0; font-size: 22px; font-weight: 700; color: #0f172a;">Reset your password</h1>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 32px 28px 32px; font-size: 15px; line-height: 24px; color: #475569;">
                      <p style="margin: 0 0 20px 0;">We received a request to reset your password for your SiteBolt account. Click the button below to set a new password.</p>
                      <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 28px 0;">
                        <tr>
                          <td align="center" style="border-radius: 8px; background-color: #f97316;">
                            <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #f97316;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b;">If the button above does not work, copy and paste this link into your browser:</p>
                      <p style="margin: 0; word-break: break-all; font-size: 13px; color: #f97316;">
                        <a href="${resetLink}" target="_blank" rel="noopener noreferrer" style="color: #f97316; text-decoration: underline;">${resetLink}</a>
                      </p>
                    </td>
                  </tr>
                  <tr>
                    <td style="padding: 0 32px;"><div style="border-top: 1px solid #e2e8f0;"></div></td>
                  </tr>
                  <tr>
                    <td style="padding: 24px 32px 32px 32px; font-size: 12px; line-height: 18px; color: #94a3b8;">
                      <p style="margin: 0 0 8px 0;">If you didn't request this email, you can safely ignore it. Your account remains secure.</p>
                      <p style="margin: 0;">&copy; SiteBolt Australia &bull; support@site-bolt.com.au</p>
                    </td>
                  </tr>
                </table>
              </td>
            </tr>
          </table>
        </body>
      </html>
    `.trim();
}

export async function sendPasswordResetEmail(normalizedEmail: string): Promise<{ error: string | null }> {
  const apiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY;
  if (!apiKey) {
    return { error: "Server error: RESEND_API_KEY is not configured." };
  }
  if (!isSupabaseAdminConfigured() || !tokenSecret()) {
    return { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." };
  }

  try {
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
    });

    if (linkError || !data.user?.id) {
      if (linkError) {
        console.error("[/api/auth/forgot-password] user lookup failed:", linkError.message);
      }
      return { error: null };
    }

    const token = signPasswordResetToken(data.user.id, normalizedEmail);
    const resetLink = `${siteOrigin()}/reset-password?token=${encodeURIComponent(token)}`;

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
