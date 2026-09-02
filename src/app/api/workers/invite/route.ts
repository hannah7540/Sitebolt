export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  ensureWorkerInviteRecord,
  markWorkerInviteSent,
} from "@/lib/ensure-worker-profile";
import {
  PASSWORD_SETUP_LINK_SENT_MESSAGE,
  sendWorkerInviteEmailViaResend,
} from "@/lib/worker-invite-resend";

export async function POST(req: Request) {
  try {
    const body = await req.json();
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const workerId = typeof body?.workerId === "string" ? body.workerId.trim() : "";
    const firstName = typeof body?.firstName === "string" ? body.firstName.trim() : "";
    const lastName = typeof body?.lastName === "string" ? body.lastName.trim() : "";
    const fullName = typeof body?.fullName === "string" ? body.fullName.trim() : "";

    if (!email || !email.includes("@")) {
      return NextResponse.json({ error: "Email is required" }, { status: 400 });
    }

    const supabaseAdmin = createSupabaseAdminClient();

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

    const sent = await sendWorkerInviteEmailViaResend(email);
    console.log("[Generated Action Link]:", sent.actionLink);

    if (!sent.success) {
      return NextResponse.json(
        {
          error: `Unable to generate SiteBolt auth link: ${sent.error || "unknown"}`,
        },
        { status: 500 }
      );
    }

    const stamped = await markWorkerInviteSent(
      supabaseAdmin,
      preInviteWorker.workerId
    );

    if (sent.authUserId) {
      await ensureWorkerInviteRecord(supabaseAdmin, {
        email,
        workerId: preInviteWorker.workerId,
        firstName: firstName || null,
        lastName: lastName || null,
        fullName: fullName || null,
        authUserId: sent.authUserId,
      });
    }

    return NextResponse.json(
      {
        success: true,
        inviteSent: true,
        inviteSentAt: stamped.inviteSentAt,
        message: sent.message ?? PASSWORD_SETUP_LINK_SENT_MESSAGE,
        workerId: preInviteWorker.workerId,
        authUserId: sent.authUserId ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : JSON.stringify(err) || "unknown";
    console.error("[/api/workers/invite]", err);
    return NextResponse.json(
      { error: `Unable to generate SiteBolt auth link: ${message}` },
      { status: 500 }
    );
  }
}
