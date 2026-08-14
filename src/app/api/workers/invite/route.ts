export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { Resend } from "resend";
import { createClient } from "@supabase/supabase-js";
import { ensureWorkerInviteRecord } from "@/lib/ensure-worker-profile";
import {
  buildWorkerInviteCallbackUrl,
  AUTH_CALLBACK_PATH,
  WORKER_INVITE_NEXT_PATH,
  type WorkerInviteLinkType,
} from "@/lib/worker-invite-link";

const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
const INVITE_LINK_TYPES: WorkerInviteLinkType[] = ["invite", "recovery"];

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
    const workerId = typeof body?.workerId === "string" ? body.workerId.trim() : "";
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";

    if (!email) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createClient(
      process.env.NEXT_PUBLIC_SUPABASE_URL!,
      process.env.SUPABASE_SERVICE_ROLE_KEY!
    );

    const preInviteWorker = await ensureWorkerInviteRecord(supabaseAdmin, {
      email,
      workerId: workerId || null,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: fullName || null,
    });

    if (preInviteWorker.error || !preInviteWorker.workerId) {
      return NextResponse.json(
        { error: preInviteWorker.error ?? "Failed to prepare worker profile." },
        { status: 400 }
      );
    }

    let inviteLink: string | null = null;
    let lastLinkError: string | null = null;
    let authUserId: string | null = null;

    for (const linkType of INVITE_LINK_TYPES) {
      const { data, error: linkError } = await supabaseAdmin.auth.admin.generateLink({
        type: linkType,
        email,
        options: {
          redirectTo: `${PRODUCTION_SITE_URL}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(WORKER_INVITE_NEXT_PATH)}`,
        },
      });

      if (linkError) {
        lastLinkError = linkError.message;
        console.warn(`[/api/workers/invite] generateLink(${linkType}) failed:`, linkError.message);
        continue;
      }

      authUserId = data?.user?.id ?? null;

      const hashedToken = data?.properties?.hashed_token;
      if (hashedToken) {
        inviteLink = buildWorkerInviteCallbackUrl(hashedToken, linkType);
        break;
      }

      lastLinkError = "generateLink did not return hashed_token";
    }

    if (!inviteLink) {
      return NextResponse.json(
        { error: lastLinkError || "Failed to generate link" },
        { status: 500 }
      );
    }

    await ensureWorkerInviteRecord(supabaseAdmin, {
      email,
      workerId: preInviteWorker.workerId,
      firstName: firstName || null,
      lastName: lastName || null,
      fullName: fullName || null,
      authUserId,
    });

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
            <a href="${inviteLink}" style="display: inline-block; background-color: #ea580c; color: #ffffff; text-decoration: none; font-size: 16px; font-weight: 600; padding: 12px 24px; border-radius: 8px;">
              Create Your Account
            </a>
          </p>
          <p style="font-size: 14px; color: #64748b; margin: 0;">
            If the button doesn't work, copy and paste this link into your browser:<br />
            <a href="${inviteLink}" style="color: #ea580c; word-break: break-all;">${inviteLink}</a>
          </p>
        </div>
      `.trim(),
      text: `Welcome to Site Bolt\n\nYou've been invited to join Site Bolt. Click the link below to set up your password and activate your account.\n\n${inviteLink}`,
    });

    return NextResponse.json(
      {
        success: true,
        message: "Invite sent successfully",
        workerId: preInviteWorker.workerId,
        authUserId,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
