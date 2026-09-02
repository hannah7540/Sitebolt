export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "@/lib/email-team-footer";

const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";

function getPasswordResetRedirectTo(): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_SITE_URL
  ).replace(/\/$/, "");
  return `${appUrl}/setyourpassword`;
}

export async function POST(req: Request) {
  const apiKey =
    process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Server error: RESEND_API_KEY is not loaded in Node runtime." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const normalizedEmail =
      typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";

    if (!normalizedEmail) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email: normalizedEmail,
      options: {
        redirectTo: getPasswordResetRedirectTo(),
      },
    });

    if (linkError) {
      console.error("[/api/auth/reset-password] generateLink failed:", linkError.message);
      return NextResponse.json(
        { error: `Supabase link error: ${linkError.message}` },
        { status: 400 }
      );
    }

    const tokenHash = data?.properties?.hashed_token;
    const actionLink = data?.properties?.action_link;
    const appUrl = (
      process.env.NEXT_PUBLIC_APP_URL || PRODUCTION_SITE_URL
    ).replace(/\/$/, "");

    // Direct URL on our domain so Supabase cannot strip the path or bounce to /
    const directLink = tokenHash
      ? `${appUrl}/setyourpassword?token_hash=${tokenHash}&type=recovery`
      : actionLink;

    if (!directLink) {
      console.error(
        "[/api/auth/reset-password] Neither token_hash nor action_link returned"
      );
      return NextResponse.json({ error: "Failed to generate link" }, { status: 500 });
    }

    const resend = new Resend(apiKey);
    const resetHtml = appendTeamEmailFooter(`
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px;">Password Reset Request</h1>
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 32px;">
            Click the button below to reset your password for your Site Bolt account.
          </p>
          <p style="margin: 0 0 32px; text-align: center;">
            <a href="${directLink}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
              Reset Your Password
            </a>
          </p>
          <p style="font-size: 14px; color: #64748b; margin: 0;">
            If you did not request a password reset, you can ignore this email.
          </p>
        </div>
      `.trim());
    const resetText = appendTeamEmailFooterText(
      `Password Reset Request\n\nClick the link below to reset your password for your Site Bolt account:\n\n${directLink}`
    );

    const resendResult = await resend.emails.send({
      from: "Site Bolt <hannah@site-bolt.com.au>",
      to: [normalizedEmail],
      subject: "Reset your Site Bolt password",
      html: resetHtml,
      text: resetText,
    });

    if (resendResult.error) {
      console.error("[/api/auth/reset-password] Resend error:", resendResult.error);
      const message =
        typeof resendResult.error.message === "string"
          ? resendResult.error.message
          : "Failed to send reset email.";
      return NextResponse.json({ error: message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
