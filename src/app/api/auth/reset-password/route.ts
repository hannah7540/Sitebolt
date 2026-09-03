export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

export async function POST(req: Request) {
  const apiKey = process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY;

  if (!apiKey) {
    return NextResponse.json(
      { error: "Server error: RESEND_API_KEY is not configured." },
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
        redirectTo: "https://www.site-bolt.com.au/setyourpassword",
      },
    });

    if (linkError) {
      console.error("[/api/auth/reset-password] generateLink error:", linkError.message);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const tokenHash = data?.properties?.hashed_token;
    const actionLink = data?.properties?.action_link;
    const directLink = tokenHash
      ? `https://www.site-bolt.com.au/setyourpassword?token_hash=${tokenHash}&type=recovery`
      : actionLink;

    if (!directLink) {
      console.error("[/api/auth/reset-password] No direct link or action link produced");
      return NextResponse.json({ error: "Failed to generate reset link" }, { status: 500 });
    }

    const resetHtml = `
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
                <table role="presentation" width="100%" cellspacing="0" cellpadding="0" border="0" style="max-width: 560px; background-color: #ffffff; border-radius: 12px; border: 1px solid #e2e8f0; overflow: hidden; box-shadow: 0 1px 3px rgba(0,0,0,0.05);">
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
                          <td align="center" style="border-radius: 8px; background-color: #ea580c;">
                            <a href="${directLink}" target="_blank" rel="noopener noreferrer" style="display: inline-block; padding: 14px 28px; font-size: 15px; font-weight: 600; color: #ffffff; text-decoration: none; border-radius: 8px; background-color: #ea580c;">
                              Reset Password
                            </a>
                          </td>
                        </tr>
                      </table>
                      <p style="margin: 0 0 12px 0; font-size: 13px; color: #64748b;">If the button above does not work, copy and paste this link into your browser:</p>
                      <p style="margin: 0; word-break: break-all; font-size: 13px; color: #ea580c;">
                        <a href="${directLink}" target="_blank" rel="noopener noreferrer" style="color: #ea580c; text-decoration: underline;">${directLink}</a>
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

    const resetText = `Reset your SiteBolt password\n\nClick the link below to set a new password:\n\n${directLink}\n\nIf you did not request this, you can ignore this email.`;

    const resend = new Resend(apiKey);
    const resendResult = await resend.emails.send({
      from: "SiteBolt <admin@site-bolt.com.au>",
      to: [normalizedEmail],
      subject: "Reset your SiteBolt password",
      html: resetHtml,
      text: resetText,
    });

    if (resendResult.error) {
      console.error("[/api/auth/reset-password] Resend delivery error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 500 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
