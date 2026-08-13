export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";

const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
const INVITE_REDIRECT_TO = `${PRODUCTION_SITE_URL}/auth/callback?next=/auth/confirm-invite`;

const INVITE_LINK_TYPES = ["invite", "recovery"] as const;

export async function POST(req: Request) {
  const apiKey =
    process.env.RESEND_API_KEY || process.env.NEXT_PUBLIC_RESEND_API_KEY;

  if (!apiKey) {
    console.error("DEBUG: Environment variables available:", Object.keys(process.env));
    return NextResponse.json(
      { error: "Server error: RESEND_API_KEY is not loaded in Node runtime." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const { email } = body;

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    let actionLink: string | null = null;
    let lastLinkError: string | null = null;

    for (const linkType of INVITE_LINK_TYPES) {
      const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: linkType,
        email: email,
        options: { redirectTo: INVITE_REDIRECT_TO },
      });

      if (linkError) {
        lastLinkError = linkError.message;
        console.warn(`[/api/workers/invite] generateLink(${linkType}) failed:`, linkError.message);
        continue;
      }

      if (data?.properties?.action_link) {
        actionLink = data.properties.action_link;
        break;
      }
    }

    if (!actionLink) {
      return NextResponse.json(
        { error: lastLinkError || "Failed to generate link" },
        { status: 500 }
      );
    }

    const resend = new Resend(apiKey);
    await resend.emails.send({
      from: "Site Bolt <hannah@site-bolt.com.au>",
      to: [email],
      subject: "Set up your Site Bolt account",
      html: `
        <div style="font-family: Arial, sans-serif; max-width: 560px; margin: 0 auto; padding: 24px; color: #1e293b;">
          <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px;">Welcome to Site Bolt</h1>
          <p style="font-size: 16px; line-height: 1.5; margin: 0 0 24px;">
            You've been invited to join Site Bolt. Click the button below to set up your password and activate your account.
          </p>
          <p style="margin: 0 0 32px;">
            <a href="${actionLink}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
              Create Your Account
            </a>
          </p>
          <p style="font-size: 14px; color: #64748b; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="${actionLink}" style="color: #ea580c; word-break: break-all;">${actionLink}</a>
          </p>
        </div>
      `.trim(),
      text: `Welcome to Site Bolt\n\nYou've been invited to join Site Bolt. Click the link below to set up your password and activate your account.\n\n${actionLink}`,
    });

    return NextResponse.json(
      { success: true, message: "Invite sent successfully" },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
