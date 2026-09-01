export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { buildEmailCtaButtonHtml } from "@/lib/email-cta-button";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "@/lib/email-team-footer";
import {
  isValidGeneratedAuthLink,
} from "@/lib/worker-invite-link";

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
    const email = typeof body?.email === "string" ? body.email.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
      type: "recovery",
      email,
      options: {
        redirectTo: "https://site-bolt.com.au/setyourpassword",
      },
    });

    if (linkError) {
      console.error("[/api/auth/reset-password] generateLink failed:", linkError.message);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const actionLink = data?.properties?.action_link;
    if (!isValidGeneratedAuthLink(actionLink)) {
      console.error("[/api/auth/reset-password] generateLink missing action_link");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    console.log("[Generated Action Link]:", actionLink);

    const resend = new Resend(apiKey);
    const resetHtml = appendTeamEmailFooter(`
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-collapse: collapse;">
  <tr>
    <td style="padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #1e293b;">
      <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px 0; color: #0F172A; font-family: Arial, Helvetica, sans-serif;">
        Password Reset Request
      </h1>
      <p style="font-size: 16px; line-height: 1.5; margin: 0; color: #334155; font-family: Arial, Helvetica, sans-serif;">
        Click the button below to reset your password for your Site Bolt account.
      </p>
      ${buildEmailCtaButtonHtml(actionLink ?? "", "Set your password")}
      <p style="font-size: 14px; color: #64748b; margin: 16px 0 0 0; font-family: Arial, Helvetica, sans-serif;">
        If you did not request a password reset, you can ignore this email.
      </p>
    </td>
  </tr>
</table>
      `.trim());
    const resetText = appendTeamEmailFooterText(
      `Password Reset Request\n\nPlease use the "Set your password" button in this email to reset your Site Bolt account password.`
    );

    const resendResult = await resend.emails.send({
      from: "Site Bolt <hannah@site-bolt.com.au>",
      to: [email],
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
