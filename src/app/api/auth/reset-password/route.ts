export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { buildPasswordResetOtpPageUrl } from "@/lib/worker-invite-link";

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
    });

    if (linkError) {
      console.error("[/api/auth/reset-password] generateLink failed:", linkError.message);
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const otpCode = data?.properties?.email_otp;
    if (!otpCode) {
      console.error("[/api/auth/reset-password] generateLink missing email_otp");
      return NextResponse.json({ success: true }, { status: 200 });
    }

    const enterCodeUrl = buildPasswordResetOtpPageUrl(email);

    const resend = new Resend(apiKey);
    const resendResult = await resend.emails.send({
      from: "Site Bolt <hannah@site-bolt.com.au>",
      to: [email],
      subject: "Your Site Bolt Password Reset Code",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px;">Password Reset Code</h1>
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
            Your password reset code is: <strong style="font-size: 28px; letter-spacing: 0.2em; color: #ea580c;">${otpCode}</strong>.
            Click the button below to enter your code and set a new password.
          </p>
          <p style="font-size: 36px; font-weight: 700; letter-spacing: 0.3em; margin: 0 0 32px; text-align: center; color: #ea580c;">
            ${otpCode}
          </p>
          <p style="margin: 0 0 32px; text-align: center;">
            <a href="${enterCodeUrl}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
              Enter Reset Code
            </a>
          </p>
          <p style="font-size: 14px; color: #64748b; margin: 0;">
            This code expires in 1 hour. If you did not request a password reset, you can ignore this email.
          </p>
        </div>
      `.trim(),
      text: `Your password reset code is: ${otpCode}. Click the link below to enter your code and set a new password.\n\n${enterCodeUrl}`,
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
