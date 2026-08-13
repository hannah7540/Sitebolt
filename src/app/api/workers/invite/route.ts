import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import { NextResponse } from "next/server";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { sendEmail } from "@/lib/email-service";
import { DEFAULT_WORKER_SECURITY_ROLE, type SecurityRole } from "@/lib/security-roles";
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

type InviteRequestBody = {
  email?: string;
  workerId?: string;
  fullName?: string;
  securityRole?: string;
};

type LinkType = "invite" | "magiclink" | "recovery";

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

function successResponse(extra?: Record<string, unknown>) {
  return NextResponse.json(
    { success: true, message: SUCCESS_MESSAGE, ...extra },
    { status: 200 }
  );
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
        <p>If you did not expect this email, you can ignore it.</p>
      `,
      text: `Hi ${fullName},\n\nOpen Site Bolt: ${actionLink}`,
    });

    if (!result.sent) {
      console.error("[/api/workers/invite] Resend failed:", result.error);
      return false;
    }

    return true;
  } catch (error) {
    console.error("[/api/workers/invite] Resend threw:", error);
    return false;
  }
}

async function tryGenerateLinkAndSend(
  admin: SupabaseClient,
  email: string,
  fullName: string,
  type: LinkType
): Promise<{ sent: boolean; authUserId: string | null; method: string | null }> {
  const redirectTo =
    type === "recovery" ? getResetPasswordRedirectUrl() : getConfirmInviteRedirectUrl();

  try {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    });

    if (error) {
      console.warn(`[/api/workers/invite] generateLink (${type}) failed:`, error.message);
      return { sent: false, authUserId: null, method: null };
    }

    const actionLink = data.properties?.action_link;
    if (!actionLink) {
      console.warn(`[/api/workers/invite] generateLink (${type}) returned no action_link`);
      return { sent: false, authUserId: data.user?.id ?? null, method: null };
    }

    const sent = await sendLinkViaResend(email, actionLink, fullName);
    if (!sent) {
      return { sent: false, authUserId: data.user?.id ?? null, method: null };
    }

    return {
      sent: true,
      authUserId: data.user?.id ?? null,
      method: `generateLink:${type}`,
    };
  } catch (error) {
    console.warn(`[/api/workers/invite] generateLink (${type}) threw:`, error);
    return { sent: false, authUserId: null, method: null };
  }
}

async function tryPasswordResetEmail(email: string): Promise<boolean> {
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
    console.warn("[/api/workers/invite] resetPasswordForEmail threw:", error);
    return false;
  }
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
  let email = "";
  let workerId: string | undefined;
  let resolvedFullName = "";
  let resolvedSecurityRole: SecurityRole = DEFAULT_WORKER_SECURITY_ROLE;

  try {
    let body: unknown = {};
    try {
      body = await request.json();
    } catch (parseError) {
      console.error("[/api/workers/invite] Invalid JSON body:", parseError);
      return successResponse();
    }

    const parsed = parseBody(body);
    email = parsed.email ?? "";
    workerId = parsed.workerId;
    resolvedFullName = parsed.fullName || email;
    resolvedSecurityRole =
      (parsed.securityRole as SecurityRole | undefined) || DEFAULT_WORKER_SECURITY_ROLE;

    if (!email) {
      console.error("[/api/workers/invite] Missing email in request body.");
      return successResponse();
    }

    console.info("[/api/workers/invite] Sending invite via generateLink/Resend:", {
      email,
      workerId: workerId ?? null,
      from: DEFAULT_SYSTEM_FROM_EMAIL,
    });

    if (!isSupabaseAdminConfigured()) {
      await tryPasswordResetEmail(email);
      return successResponse({ workerId: workerId ?? null, method: "resetPasswordForEmail" });
    }

    const admin = createSupabaseAdminClient();
    const linkTypes: LinkType[] = ["invite", "magiclink", "recovery"];

    for (const type of linkTypes) {
      const attempt = await tryGenerateLinkAndSend(admin, email, resolvedFullName, type);
      if (attempt.sent) {
        await linkWorkerSafely({
          workerId,
          authUserId: attempt.authUserId,
          email,
          fullName: resolvedFullName,
          securityRole: resolvedSecurityRole,
        });
        return successResponse({
          workerId: workerId ?? null,
          authUserId: attempt.authUserId,
          method: attempt.method,
        });
      }
    }

    const resetSent = await tryPasswordResetEmail(email);
    if (resetSent) {
      return successResponse({
        workerId: workerId ?? null,
        method: "resetPasswordForEmail",
      });
    }

    console.error("[/api/workers/invite] All invite delivery paths failed for:", email);
    return successResponse({ workerId: workerId ?? null, delivered: false });
  } catch (error) {
    console.error("[/api/workers/invite] Unexpected error:", error);

    if (email) {
      try {
        if (isSupabaseAdminConfigured()) {
          const admin = createSupabaseAdminClient();
          const recovery = await tryGenerateLinkAndSend(
            admin,
            email,
            resolvedFullName || email,
            "recovery"
          );
          if (recovery.sent) {
            return successResponse({
              workerId: workerId ?? null,
              authUserId: recovery.authUserId,
              method: recovery.method,
            });
          }
        }
        await tryPasswordResetEmail(email);
      } catch (fallbackError) {
        console.error("[/api/workers/invite] Emergency fallback failed:", fallbackError);
      }
    }

    return successResponse({ workerId: workerId ?? null });
  }
}
