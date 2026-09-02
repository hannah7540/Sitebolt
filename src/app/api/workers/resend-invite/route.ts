export const runtime = "nodejs";
export const dynamic = "force-dynamic";
export const revalidate = 0;

import { NextResponse } from "next/server";
import type { User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  ensureWorkerInviteRecord,
  markWorkerInviteSent,
} from "@/lib/ensure-worker-profile";
import {
  PASSWORD_SETUP_LINK_SENT_MESSAGE,
  findAuthUserByEmail,
  sendWorkerInviteEmailViaResend,
} from "@/lib/worker-invite-resend";
import { isWorkerAccessRevoked } from "@/lib/worker-revocation";

export async function POST(req: Request) {
  if (!isSupabaseAdminConfigured()) {
    return NextResponse.json(
      { error: "Server error: SUPABASE_SERVICE_ROLE_KEY is not configured." },
      { status: 500 }
    );
  }

  try {
    const body = await req.json();
    const workerId = typeof body?.workerId === "string" ? body.workerId.trim() : "";
    const emailOverride = typeof body?.email === "string" ? body.email.trim() : "";

    if (!workerId) {
      return NextResponse.json({ error: "Worker ID is required." }, { status: 400 });
    }

    const admin = createSupabaseAdminClient();
    const { data: worker, error: workerError } = await admin
      .from("workers")
      .select(
        "id, email, first_name, last_name, full_name, auth_user_id, invite_status, status, is_revoked, is_archived"
      )
      .eq("id", workerId)
      .maybeSingle();

    if (workerError || !worker) {
      return NextResponse.json(
        { error: workerError?.message ?? "Worker not found." },
        { status: 404 }
      );
    }

    if (isWorkerAccessRevoked(worker)) {
      return NextResponse.json(
        { error: "Cannot resend an invite to a revoked worker." },
        { status: 400 }
      );
    }

    const email = (emailOverride || (typeof worker.email === "string" ? worker.email : "")).trim().toLowerCase();
    if (!email || !email.includes("@")) {
      return NextResponse.json(
        { error: "This worker does not have a valid email address." },
        { status: 400 }
      );
    }

    let authUser: User | null = null;
    const authUserId =
      typeof worker.auth_user_id === "string" ? worker.auth_user_id.trim() : "";
    if (authUserId) {
      const { data } = await admin.auth.admin.getUserById(authUserId);
      authUser = data.user ?? null;
    }
    if (!authUser) {
      authUser = await findAuthUserByEmail(admin, email);
    }

    const prepared = await ensureWorkerInviteRecord(admin, {
      email,
      workerId,
      firstName: typeof worker.first_name === "string" ? worker.first_name : null,
      lastName: typeof worker.last_name === "string" ? worker.last_name : null,
      fullName: typeof worker.full_name === "string" ? worker.full_name : null,
      authUserId: authUser?.id ?? authUserId ?? null,
    });

    if (prepared.error || !prepared.workerId) {
      return NextResponse.json(
        { error: prepared.error ?? "Failed to prepare worker profile." },
        { status: 400 }
      );
    }

    const sent = await sendWorkerInviteEmailViaResend(email, {
      userAlreadyExists: Boolean(authUser),
    });
    console.log("[Generated Action Link]:", sent.actionLink);
    if (!sent.success) {
      return NextResponse.json(
        {
          error: `Unable to generate SiteBolt auth link: ${sent.error || "unknown"}`,
        },
        { status: 500 }
      );
    }

    const stamped = await markWorkerInviteSent(admin, prepared.workerId);

    if (sent.authUserId) {
      await ensureWorkerInviteRecord(admin, {
        email,
        workerId: prepared.workerId,
        firstName: typeof worker.first_name === "string" ? worker.first_name : null,
        lastName: typeof worker.last_name === "string" ? worker.last_name : null,
        fullName: typeof worker.full_name === "string" ? worker.full_name : null,
        authUserId: sent.authUserId,
      });
    }

    return NextResponse.json({
      success: true,
      inviteSent: true,
      inviteSentAt: stamped.inviteSentAt,
      message: sent.message ?? PASSWORD_SETUP_LINK_SENT_MESSAGE,
      workerId: prepared.workerId,
      authUserId: sent.authUserId ?? authUser?.id ?? null,
    });
  } catch (err: unknown) {
    const message =
      err instanceof Error ? err.message : JSON.stringify(err) || "unknown";
    console.error("[/api/workers/resend-invite]", err);
    return NextResponse.json(
      { error: `Unable to generate SiteBolt auth link: ${message}` },
      { status: 500 }
    );
  }
}
