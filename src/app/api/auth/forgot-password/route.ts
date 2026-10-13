/**
 * Forgot-password recovery: never call resetPasswordForEmail().
 * That hits /auth/v1/verify and enterprise scanners consume the one-time token.
 * generateLink() issues a hashed_token; Resend delivers a frontend-only URL.
 */
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "@/lib/email-team-footer";
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

function resolveSiteOrigin(): string {
  const configured = (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.site-bolt.com.au"
  ).trim();
  return configured.replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function buildRecoveryEmail(actionUrl: string): { html: string; text: string } {
  const safeUrl = escapeHtml(actionUrl);
  const html = appendTeamEmailFooter(`<!doctype html>
<html lang="en">
  <body style="margin:0;background:#f8fafc;font-family:Arial,Helvetica,sans-serif;">
    <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f8fafc;padding:24px 12px;">
      <tr>
        <td align="center">
          <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:480px;background:#ffffff;border:1px solid #e2e8f0;border-radius:16px;padding:32px;">
            <tr>
              <td>
                <p style="margin:0 0 6px;font-size:11px;font-weight:700;letter-spacing:0.08em;text-transform:uppercase;color:#ea580c;">SiteBolt</p>
                <h1 style="margin:0 0 12px;font-size:22px;color:#0f172a;">Reset your password</h1>
                <p style="margin:0 0 20px;font-size:14px;line-height:1.5;color:#475569;">
                  Tap the button below to choose a new password. This link is not used until you submit the form.
                </p>
                <a href="${safeUrl}" style="display:inline-block;background:#f97316;color:#ffffff;font-weight:700;text-decoration:none;padding:12px 20px;border-radius:12px;">
                  Reset Password
                </a>
                <p style="margin:20px 0 0;font-size:12px;line-height:1.5;color:#64748b;">
                  If the button does not work, copy this link into your browser:<br />
                  ${safeUrl}
                </p>
                <p style="margin:16px 0 0;font-size:12px;color:#94a3b8;">
                  If you did not request this, you can ignore this email.
                </p>
              </td>
            </tr>
          </table>
        </td>
      </tr>
    </table>
  </body>
</html>`);

  const text = appendTeamEmailFooterText(
    `Reset your SiteBolt password\n\nOpen this link to set a new password:\n${actionUrl}\n\nIf you did not request this, you can ignore this email.`
  );

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

    const origin = resolveSiteOrigin();
    const supabaseAdmin = createSupabaseAdminClient();
    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: `${origin}/reset-password`,
      },
    });

    const hashedToken = readHashedToken(data);
    if (linkError || !hashedToken) {
      console.warn("[forgot-password] No recovery link for:", email, linkError?.message);
      return NextResponse.json(
        { error: "No account found matching this email address" },
        { status: 404 }
      );
    }

    const actionUrl = `${origin}/reset-password?token_hash=${encodeURIComponent(hashedToken)}&type=recovery`;
    const { html, text } = buildRecoveryEmail(actionUrl);

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
