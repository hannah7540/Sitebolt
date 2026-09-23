export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import type { User } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

const RESET_FROM_EMAIL = "SiteBolt <admin@site-bolt.com.au>";

function siteOrigin(): string {
  return (
    process.env.NEXT_PUBLIC_SITE_URL ||
    process.env.NEXT_PUBLIC_APP_URL ||
    "https://www.site-bolt.com.au"
  ).replace(/\/$/, "");
}

function escapeHtml(value: string): string {
  return value
    .replace(/&/g, "&amp;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&#39;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;");
}

function assertResetLink(resetLink: string): string {
  const actionUrl = resetLink.trim();
  if (!actionUrl) {
    throw new Error("Reset link is empty or undefined; refusing to send a text-only email.");
  }

  let parsed: URL;
  try {
    parsed = new URL(actionUrl);
  } catch {
    throw new Error(`Reset link is invalid: ${actionUrl}`);
  }

  if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
    throw new Error(`Reset link must be an absolute http(s) URL: ${actionUrl}`);
  }

  return actionUrl;
}

function resetEmailHtml(resetLink: string): string {
  const safeUrl = assertResetLink(resetLink);
  const href = escapeHtml(safeUrl);
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
          <table border="0" cellpadding="0" cellspacing="0" role="presentation" style="margin: 28px auto;">
            <tr>
              <td align="center" style="border-radius: 6px; background-color: #f97316;">
                <a href="${href}" target="_blank" rel="noopener noreferrer" style="background-color: #f97316; color: #ffffff !important; display: inline-block; font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; font-size: 16px; font-weight: bold; line-height: 48px; text-align: center; text-decoration: none; width: 220px; border-radius: 6px;">Reset Password</a>
              </td>
            </tr>
          </table>
          <p style="text-align: center; font-size: 12px; margin-top: 16px;">
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

async function findAuthUserByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;

    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
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
      .select("id, email")
      .ilike("email", normalizedEmail)
      .limit(1)
      .maybeSingle();

    if (workerError) {
      console.error("[/api/auth/forgot-password] worker lookup failed:", workerError.message);
    }

    const workerFound = Boolean(worker?.id);
    const authUser = workerFound ? null : await findAuthUserByEmail(supabaseAdmin, normalizedEmail);

    if (!workerFound && !authUser) {
      return { error: "No account found matching this email." };
    }

    const base = siteOrigin();
    const resetLink = `${base}/reset-password?email=${encodeURIComponent(normalizedEmail)}`;
    const safeUrl = assertResetLink(resetLink);

    const resend = new Resend(apiKey);
    const resendResult = await resend.emails.send({
      from: RESET_FROM_EMAIL,
      to: [normalizedEmail],
      subject: "Reset your SiteBolt password",
      html: resetEmailHtml(safeUrl),
      text: `Reset your SiteBolt password\n\nPlease click the link below to set a new password:\n${safeUrl}\n\nIf you did not request this, you can ignore this email.`,
    });

    if (resendResult.error) {
      console.error("[/api/auth/forgot-password] Resend delivery error:", resendResult.error);
      return { error: resendResult.error.message };
    }

    return { error: null };
  } catch (error) {
    const message = error instanceof Error ? error.message : "Internal server error";
    console.error("[/api/auth/forgot-password] unexpected error:", message);
    return { error: message };
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
    if (result.error === "No account found matching this email.") {
      return NextResponse.json({ error: result.error }, { status: 404 });
    }
    if (result.error) {
      return NextResponse.json({ error: result.error }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    const message = error instanceof Error ? error.message : "Failed to send reset email.";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
