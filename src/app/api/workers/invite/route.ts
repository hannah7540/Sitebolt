export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import { createClient } from "@supabase/supabase-js";
import {
  ensureWorkerInviteRecord,
  markWorkerInviteSent,
} from "@/lib/ensure-worker-profile";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";

export async function POST(req: Request) {
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

    const sent = await sendWorkerInviteEmailViaResend(email);
    console.log("[Generated Action Link]:", sent.actionLink);

    if (!sent.success) {
      return NextResponse.json(
        { error: sent.error ?? "Failed to send invitation email." },
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
        message: `Invitation email sent successfully to ${email}`,
        workerId: preInviteWorker.workerId,
        authUserId: sent.authUserId ?? null,
      },
      { status: 200 }
    );
  } catch (err: unknown) {
    const message = err instanceof Error ? err.message : "Internal server error";
    return NextResponse.json({ error: message }, { status: 500 });
  }
}
