import { createClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { sendEmail } from "@/lib/email-service";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getConfirmInviteRedirectUrl,
  getResetPasswordRedirectUrl,
  linkWorkerAuthAccount,
} from "@/lib/worker-auth-email";
import {
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export const dynamic = "force-dynamic";

const SUCCESS_MESSAGE = "Invite email sent successfully";
const INVITE_REDIRECT = "https://www.site-bolt.com.au";

type InviteRequestBody = {
  email?: string;
  workerId?: string;
  fullName?: string;
  securityRole?: string;
};

function parseBody(body: unknown): InviteRequestBody {
  if (!body || typeof body !== "object") return {};
  const record = body as Record<string, unknown>;
  return {
    email: typeof record.email === "string" ? record.email.trim() : undefined,
    workerId: typeof record.workerId === "string" ? record.workerId.trim() : undefined,
    fullName: typeof record.fullName === "string" ? record.fullName.trim() : undefined,
    securityRole:
      typeof record.securityRole === "string" ? record.securityRole.trim() : undefined,
  };
}

function okResponse(extra?: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, message: SUCCESS_MESSAGE, ...extra },
    { status: 200 }
  );
}

function failResponse(message: string, status = 400) {
  return NextResponse.json({ error: message }, { status });
}

async function sendLinkViaResend(
  email: string,
  actionLink: string,
  fullName: string
): Promise<boolean> {
  try {
    const result = await sendEmail({
      to: [email],
      subject: "Set up your Site Bolt account",
      html: `
        <p>Hi ${fullName},</p>
        <p>You have been invited to join Site Bolt. Use the link below to continue:</p>
        <p><a href="${actionLink}">Open Site Bolt</a></p>
      `,
      text: `Hi ${fullName},\n\nOpen Site Bolt: ${actionLink}`,
    });
    return result.sent;
  } catch (error) {
    console.error("[/api/workers/invite] Resend send failed:", error);
    return false;
  }
}

async function sendPasswordResetEmail(email: string): Promise<boolean> {
  if (!isSupabaseConfigured()) return false;

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(email, {
      redirectTo: getResetPasswordRedirectUrl(),
    });

    if (error) {
      console.warn("[/api/workers/invite] resetPasswordForEmail failed:", error.message);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[/api/workers/invite] resetPasswordForEmail threw:", error);
    return false;
  }
}

async function tryMagicLinkFallback(
  email: string,
  fullName: string
): Promise<{ sent: boolean; authUserId: string | null }> {
  if (!isSupabaseAdminConfigured()) {
    return { sent: false, authUserId: null };
  }

  try {
    const admin = createSupabaseAdminClient();
    const redirectTo = getConfirmInviteRedirectUrl() || INVITE_REDIRECT;

    for (const type of ["magiclink", "recovery"] as const) {
      const { data, error } = await admin.auth.admin.generateLink({
        type,
        email,
        options: {
          redirectTo: type === "recovery" ? getResetPasswordRedirectUrl() : redirectTo,
        },
      });

      if (error) {
        console.warn(`[/api/workers/invite] generateLink (${type}) failed:`, error.message);
        continue;
      }

      const actionLink = data.properties?.action_link;
      if (!actionLink) continue;

      const sent = await sendLinkViaResend(email, actionLink, fullName);
      if (sent) {
        return { sent: true, authUserId: data.user?.id ?? null };
      }
    }
  } catch (error) {
    console.error("[/api/workers/invite] Magic link fallback threw:", error);
  }

  return { sent: false, authUserId: null };
}

async function linkWorkerSafely(options: {
  workerId?: string;
  authUserId?: string | null;
  email: string;
  fullName: string;
  securityRole: string;
}): Promise<void> {
  if (!options.workerId || !options.authUserId || !isSupabaseAdminConfigured()) return;

  try {
    const admin = createSupabaseAdminClient();
    await linkWorkerAuthAccount(admin, {
      workerId: options.workerId,
      authUserId: options.authUserId,
      email: options.email,
      fullName: options.fullName,
      securityRole: options.securityRole,
    });
  } catch (error) {
    console.warn("[/api/workers/invite] Worker auth link skipped:", error);
  }
}

export async function POST(request: Request) {
  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch {
      return failResponse("Invalid JSON body.");
    }

    const { email, workerId, fullName, securityRole } = parseBody(body);

    if (!email) {
      return failResponse("email is required.");
    }

    const resolvedFullName = fullName || email;
    const resolvedSecurityRole = securityRole || DEFAULT_WORKER_SECURITY_ROLE;
    const redirectTo = getConfirmInviteRedirectUrl() || INVITE_REDIRECT;

    if (!isSupabaseAdminConfigured()) {
      const resetSent = await sendPasswordResetEmail(email);
      if (resetSent) {
        return okResponse({ workerId: workerId ?? null, fallback: "resetPasswordForEmail" });
      }
      return failResponse(
        "Supabase service role is not configured and password reset fallback failed."
      );
    }

    const admin = createSupabaseAdminClient();

    const inviteResult = await admin.auth.admin.inviteUserByEmail(email, {
      redirectTo,
      data: {
        role: resolvedSecurityRole,
        security_role: resolvedSecurityRole,
        full_name: resolvedFullName,
      },
    });

    if (!inviteResult.error) {
      const authUserId = inviteResult.data.user?.id ?? null;
      await linkWorkerSafely({
        workerId,
        authUserId,
        email,
        fullName: resolvedFullName,
        securityRole: resolvedSecurityRole,
      });
      return okResponse({ workerId: workerId ?? null, authUserId, method: "inviteUserByEmail" });
    }

    console.warn("[/api/workers/invite] inviteUserByEmail failed, using fallback:", {
      email,
      message: inviteResult.error.message,
      status: inviteResult.error.status,
    });

    const magicLink = await tryMagicLinkFallback(email, resolvedFullName);
    if (magicLink.sent) {
      await linkWorkerSafely({
        workerId,
        authUserId: magicLink.authUserId,
        email,
        fullName: resolvedFullName,
        securityRole: resolvedSecurityRole,
      });
      return okResponse({
        workerId: workerId ?? null,
        authUserId: magicLink.authUserId,
        fallback: "generateLink",
      });
    }

    const resetSent = await sendPasswordResetEmail(email);
    if (resetSent) {
      return okResponse({ workerId: workerId ?? null, fallback: "resetPasswordForEmail" });
    }

    return failResponse(
      inviteResult.error.message || "Unable to send worker invite email."
    );
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);
    return failResponse(
      error instanceof Error ? error.message : "Failed to send worker invite."
    );
  }
}
