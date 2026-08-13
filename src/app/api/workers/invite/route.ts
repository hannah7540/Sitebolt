import { NextResponse } from "next/server";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import {
  getConfirmInviteRedirectUrl,
  linkWorkerAuthAccount,
  sendExistingUserOnboardingEmail,
  sendWorkerPasswordResetEmail,
} from "@/lib/worker-auth-email";

function parseInviteRequestBody(body: unknown): {
  email: string;
  workerId?: string;
  fullName?: string;
  securityRole?: string;
} {
  if (!body || typeof body !== "object") {
    return { email: "" };
  }

  const record = body as Record<string, unknown>;

  return {
    email: typeof record.email === "string" ? record.email.trim() : "",
    workerId: typeof record.workerId === "string" ? record.workerId.trim() : undefined,
    fullName: typeof record.fullName === "string" ? record.fullName.trim() : undefined,
    securityRole:
      typeof record.securityRole === "string" ? record.securityRole.trim() : undefined,
  };
}

function successResponse(extra?: Record<string, unknown>) {
  return NextResponse.json(
    {
      success: true,
      message: "Invite sent successfully",
      ...extra,
    },
    { status: 200 }
  );
}

async function forceExistingUserInviteFallback(options: {
  email: string;
  workerId?: string;
  fullName?: string;
  securityRole?: string;
}): Promise<{ ok: boolean; authUserId: string | null }> {
  const email = options.email.trim();
  const fullName = options.fullName?.trim() || email;
  const securityRole = options.securityRole ?? DEFAULT_WORKER_SECURITY_ROLE;

  if (!isSupabaseAdminConfigured()) {
    const resetOnly = await sendWorkerPasswordResetEmail(email);
    return { ok: !resetOnly.error, authUserId: null };
  }

  const admin = createSupabaseAdminClient();

  const fallback = await sendExistingUserOnboardingEmail(admin, email, fullName);
  if (!fallback.error) {
    if (options.workerId && fallback.authUserId) {
      await linkWorkerAuthAccount(admin, {
        workerId: options.workerId,
        authUserId: fallback.authUserId,
        email,
        fullName,
        securityRole,
      });
    }
    return { ok: true, authUserId: fallback.authUserId };
  }

  console.warn("[/api/workers/invite] generateLink/Resend fallback failed:", fallback.error);

  const resetResult = await sendWorkerPasswordResetEmail(email);
  if (!resetResult.error) {
    return { ok: true, authUserId: fallback.authUserId };
  }

  console.error("[/api/workers/invite] resetPasswordForEmail fallback failed:", resetResult.error);
  return { ok: false, authUserId: fallback.authUserId };
}

export async function POST(request: Request) {
  let parsedEmail = "";

  try {
    let body: unknown;
    try {
      body = await request.json();
    } catch {
      return NextResponse.json({ error: "Invalid JSON body." }, { status: 400 });
    }

    const { email, workerId, fullName, securityRole } = parseInviteRequestBody(body);
    parsedEmail = email;

    if (!email) {
      return NextResponse.json({ error: "email is required." }, { status: 400 });
    }

    if (!isSupabaseAdminConfigured()) {
      console.error("[/api/workers/invite] SUPABASE_SERVICE_ROLE_KEY is not configured.");
      const resetOnly = await sendWorkerPasswordResetEmail(email);
      if (!resetOnly.error) {
        return successResponse({ workerId: workerId ?? null, inviteSent: true });
      }
      return NextResponse.json(
        { error: "Supabase admin credentials are not configured." },
        { status: 503 }
      );
    }

    const admin = createSupabaseAdminClient();
    const resolvedFullName = fullName || email;
    const resolvedSecurityRole = securityRole ?? DEFAULT_WORKER_SECURITY_ROLE;

    const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo: getConfirmInviteRedirectUrl(),
      data: {
        role: resolvedSecurityRole,
        security_role: resolvedSecurityRole,
        full_name: resolvedFullName,
      },
    });

    if (!inviteResult.error && inviteResult.data.user) {
      if (workerId) {
        await linkWorkerAuthAccount(admin, {
          workerId,
          authUserId: inviteResult.data.user.id,
          email,
          fullName: resolvedFullName,
          securityRole: resolvedSecurityRole,
        });
      }

      return successResponse({
        workerId: workerId ?? null,
        authUserId: inviteResult.data.user.id,
        inviteSent: true,
      });
    }

    if (inviteResult.error) {
      console.warn("[/api/workers/invite] inviteUserByEmail failed, using fallback:", {
        email,
        workerId: workerId ?? null,
        status: inviteResult.error.status,
        message: inviteResult.error.message,
      });
    }

    const forcedFallback = await forceExistingUserInviteFallback({
      email,
      workerId,
      fullName: resolvedFullName,
      securityRole: resolvedSecurityRole,
    });

    if (forcedFallback.ok) {
      return successResponse({
        workerId: workerId ?? null,
        authUserId: forcedFallback.authUserId,
        inviteSent: true,
        fallback: true,
      });
    }

    console.error("[/api/workers/invite] All invite paths failed:", {
      email,
      workerId: workerId ?? null,
      inviteError: inviteResult.error?.message ?? null,
    });

    return NextResponse.json(
      {
        error:
          inviteResult.error?.message ?? "Unable to send worker invite email.",
      },
      { status: 500 }
    );
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);

    if (parsedEmail) {
      try {
        const resetResult = await sendWorkerPasswordResetEmail(parsedEmail);
        if (!resetResult.error) {
          return successResponse({ inviteSent: true, fallback: true });
        }
      } catch (fallbackError) {
        console.error("[/api/workers/invite] Emergency fallback failed:", fallbackError);
      }
    }

    return NextResponse.json(
      {
        error: error instanceof Error ? error.message : "Failed to send worker invite.",
      },
      { status: 500 }
    );
  }
}

export const dynamic = "force-dynamic";
