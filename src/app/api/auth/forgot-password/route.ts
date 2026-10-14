/**
 * Forgot-password recovery: never call resetPasswordForEmail().
 * generateLink() issues a hashed_token; Resend delivers a frontend-only URL.
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getServiceRoleKey, isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

function getResendClient(): Resend | null {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRecoveryEmail(resetUrl: string): { html: string; text: string } {
  const href = escapeHtml(resetUrl);
  const html = `<!DOCTYPE html>
<html lang="en">
  <head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <meta http-equiv="x-ua-compatible" content="ie=edge">
    <title>Reset your SiteBolt password</title>
  </head>
  <body style="margin:0;padding:24px;background-color:#f4f5f7;font-family:Arial,Helvetica,sans-serif;">
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
            Tap the button below to choose a new password. This link is not used until you submit the form.
          </p>
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px auto;">
            <tr>
              <td align="center" bgcolor="#f97316" style="border-radius: 6px; background-color: #f97316;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="background-color: #f97316; color: #ffffff !important; display: inline-block; font-family: Arial, Helvetica, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 220px; border-radius: 6px;">
                  Reset Password
                </a>
              </td>
            </tr>
          </table>
          <p style="text-align: center; font-size: 12px; margin-top: 16px; color: #64748b;">
            If the button does not work, copy this link into your browser:
          </p>
          <p style="text-align: center; font-size: 12px; margin-top: 8px; word-break: break-all;">
            <a href="${href}" target="_blank" rel="noopener noreferrer" style="color: #f97316; text-decoration: underline;">${href}</a>
          </p>
          <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
            If you did not request this, you can ignore this email.
          </p>
        </td>
      </tr>
    </table>
  </body>
</html>`;

  const text = `Reset your SiteBolt password\n\nOpen this link to set a new password:\n${resetUrl}\n\nIf you did not request this, you can ignore this email.`;

  return { html, text };
}

function readHashedToken(payload: unknown): string {
  if (!payload || typeof payload !== "object") return "";
  const record = payload as {
    properties?: { hashed_token?: unknown };
    hashed_token?: unknown;
  };
  const fromProperties = record.properties?.hashed_token;
  const fromRoot = record.hashed_token;
  if (typeof fromProperties === "string" && fromProperties.trim()) {
    return fromProperties.trim();
  }
  if (typeof fromRoot === "string" && fromRoot.trim()) {
    return fromRoot.trim();
  }
  return "";
}

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = body?.email ? String(body.email).trim().toLowerCase() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured() || !getServiceRoleKey()) {
      console.error("[forgot-password] SUPABASE_SERVICE_ROLE_KEY is missing");
      return NextResponse.json(
        { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
        { status: 500 }
      );
    }

    const resend = getResendClient();
    if (!resend) {
      console.error("[forgot-password] RESEND_API_KEY is missing");
      return NextResponse.json({ error: "Resend API key missing on server" }, { status: 500 });
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
    });

    const token_hash = readHashedToken(data);
    if (linkError || !token_hash) {
      console.warn("[forgot-password] No recovery link for:", email, linkError?.message);
      return NextResponse.json(
        { error: "No account found matching this email address" },
        { status: 404 }
      );
    }

    const resetUrl = `${String(process.env.NEXT_PUBLIC_SITE_URL || "https://www.site-bolt.com.au").replace(/\/$/, "")}/reset-password?token_hash=${token_hash}`;
    const { html, text } = buildRecoveryEmail(resetUrl);

    console.log(`[forgot-password] Attempting Resend dispatch to ${email} from ${DEFAULT_SYSTEM_FROM_EMAIL}`);

    const resendResult = await resend.emails.send({
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      to: [email],
      subject: "Reset your SiteBolt password",
      html,
      text,
    });

    if (resendResult.error) {
      console.error("[forgot-password] Resend returned API error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 400 });
    }

    console.log("[forgot-password] Dispatch successful, Resend ID:", resendResult.data?.id);
    return NextResponse.json({ success: true });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    console.error("[forgot-password] Unhandled exception:", err);
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
