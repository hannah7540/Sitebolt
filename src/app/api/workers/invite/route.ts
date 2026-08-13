import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const FROM_ADDRESS = "Site Bolt <hannah@site-bolt.com.au>";

function parseEmail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email.trim() : "";
}

function getInviteRedirectUrl(): string {
  const siteUrl = getSiteUrl().replace(/\/$/, "");
  return `${siteUrl}/auth/callback?next=${encodeURIComponent("/auth/confirm-invite")}`;
}

export async function POST(request: Request) {
  try {
    const apiKey = process.env.RESEND_API_KEY?.trim();
    if (!apiKey) {
      console.error("[/api/workers/invite] RESEND_API_KEY is not configured.");
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured." },
        { status: 400 }
      );
    }

    const resend = new Resend(apiKey);

    let body: unknown;
    try {
      body = await request.json();
    } catch (error) {
      console.error("[/api/workers/invite] Invalid JSON body:", error);
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const email = parseEmail(body);
    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured()) {
      console.error("[/api/workers/invite] SUPABASE_SERVICE_ROLE_KEY is not configured.");
      return NextResponse.json(
        { error: "Supabase service role is not configured." },
        { status: 400 }
      );
    }

    const supabaseAdmin = createSupabaseAdminClient();
    const redirectTo = getInviteRedirectUrl();

    let actionLink: string | null = null;

    const linkAttempts = [
      { type: "magiclink" as const },
      { type: "recovery" as const },
      { type: "invite" as const },
    ];

    for (const attempt of linkAttempts) {
      const { data, error } = await supabaseAdmin.auth.admin.generateLink({
        type: attempt.type,
        email,
        options: { redirectTo },
      });

      if (error) {
        console.warn(
          `[/api/workers/invite] generateLink(${attempt.type}) failed:`,
          error.message
        );
        continue;
      }

      if (data?.properties?.action_link) {
        actionLink = data.properties.action_link;
        break;
      }
    }

    if (!actionLink) {
      console.error("[/api/workers/invite] Unable to generate auth link for:", email);
      return NextResponse.json(
        { error: "Unable to generate auth link for this worker." },
        { status: 400 }
      );
    }

    const resendResult = await resend.emails.send({
      from: FROM_ADDRESS,
      to: [email],
      subject: "Set up your Site Bolt account",
      html: `<p>Click here to complete setup: <a href="${actionLink}">Set Up Account</a></p>`,
      text: `Set up your Site Bolt account: ${actionLink}`,
    });

    console.log("Resend response:", resendResult.data);

    if (resendResult.error) {
      console.error("[/api/workers/invite] Resend error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 400 });
    }

    return NextResponse.json({ success: true }, { status: 200 });
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);
    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send worker invite.",
      },
      { status: 400 }
    );
  }
}
