import { NextResponse } from "next/server";
import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getConfirmInviteRedirectUrl,
  getResetPasswordRedirectUrl,
} from "@/lib/worker-auth-email";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

type GenerateLinkType = "magiclink" | "recovery" | "invite";

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function parseEmail(body: unknown): string {
  if (!body || typeof body !== "object") return "";
  const email = (body as { email?: unknown }).email;
  return typeof email === "string" ? email.trim() : "";
}

async function generateAuthActionLink(email: string): Promise<{
  actionLink: string | null;
  error: string | null;
}> {
  if (!isSupabaseAdminConfigured()) {
    return {
      actionLink: null,
      error: "Supabase service role is not configured.",
    };
  }

  const admin = createSupabaseAdminClient();
  const attempts: Array<{ type: GenerateLinkType; redirectTo: string }> = [
    { type: "magiclink", redirectTo: getConfirmInviteRedirectUrl() },
    { type: "recovery", redirectTo: getResetPasswordRedirectUrl() },
    { type: "invite", redirectTo: getConfirmInviteRedirectUrl() },
  ];

  for (const attempt of attempts) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: attempt.type,
      email,
      options: { redirectTo: attempt.redirectTo },
    });

    if (error) {
      console.warn(
        `[/api/workers/invite] generateLink(${attempt.type}) failed:`,
        error.message
      );
      continue;
    }

    const actionLink = data.properties?.action_link ?? null;
    if (actionLink) {
      return { actionLink, error: null };
    }
  }

  return {
    actionLink: null,
    error: "Unable to generate Supabase auth link for this worker.",
  };
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

    const resend = getResendClient();
    if (!resend) {
      return NextResponse.json(
        { error: "RESEND_API_KEY is not configured." },
        { status: 400 }
      );
    }

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

    const { actionLink, error: linkError } = await generateAuthActionLink(email);
    if (!actionLink) {
      console.error("[/api/workers/invite] Auth link generation failed:", linkError);
      return NextResponse.json(
        { error: linkError ?? "Unable to generate auth link." },
        { status: 400 }
      );
    }

    const resendResult = await resend.emails.send({
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      to: [email],
      subject: "Your Site Bolt login link",
      html: `
        <p>Hello,</p>
        <p>You have been invited to access Site Bolt. Use the link below to continue:</p>
        <p><a href="${actionLink}">Open Site Bolt</a></p>
        <p>If you did not expect this email, you can ignore it.</p>
      `,
      text: `Open Site Bolt: ${actionLink}`,
    });

    console.log("Resend response:", resendResult.data);
    console.log("[/api/workers/invite] Sent invite email:", {
      email,
      from: DEFAULT_SYSTEM_FROM_EMAIL,
      messageId: resendResult.data?.id ?? null,
    });

    if (resendResult.error) {
      console.error("[/api/workers/invite] Resend error:", resendResult.error);
      return NextResponse.json({ error: resendResult.error.message }, { status: 400 });
    }

    return NextResponse.json(
      {
        success: true,
        message: "Invite sent successfully",
        email,
        messageId: resendResult.data?.id ?? null,
      },
      { status: 200 }
    );
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
