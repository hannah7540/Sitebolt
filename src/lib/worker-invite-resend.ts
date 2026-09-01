import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { buildEmailCtaButtonHtml } from "@/lib/email-cta-button";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "@/lib/email-team-footer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  PASSWORD_SETUP_PATH,
  buildAuthCallbackUrl,
  getAuthPasswordSetupRedirectTo,
  isValidGeneratedAuthLink,
  resolveInviteSiteOrigin,
  type AuthLinkType,
} from "@/lib/worker-invite-link";

type GenerateLinkType = "invite" | "recovery" | "magiclink";

export interface WorkerInviteEmailResult {
  success: boolean;
  error: string | null;
  messageId: string | null;
  actionLink: string | null;
  authUserId?: string | null;
}

function getResendClient(): Resend | null {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

function getInviteOrigin(): string {
  return resolveInviteSiteOrigin(
    process.env.NEXT_PUBLIC_APP_URL?.trim() || getSiteUrl()
  );
}

export async function generateWorkerInviteSetupLink(
  email: string,
  origin = getInviteOrigin()
): Promise<{
  inviteLink: string | null;
  authUserId: string | null;
  error: string | null;
}> {
  if (!isSupabaseAdminConfigured()) {
    return {
      inviteLink: null,
      authUserId: null,
      error: "Supabase service role is not configured.",
    };
  }

  const admin = createSupabaseAdminClient();
  const redirectTo = getAuthPasswordSetupRedirectTo(origin);
  const attempts: GenerateLinkType[] = ["invite", "recovery", "magiclink"];
  let lastError: string | null = null;
  let authUserId: string | null = null;

  for (const type of attempts) {
    const { data, error } = await admin.auth.admin.generateLink({
      type,
      email: email.trim(),
      options: { redirectTo },
    });

    if (error) {
      lastError = error.message;
      console.warn(`[worker-invite] generateLink(${type}) failed:`, error.message);
      continue;
    }

    authUserId = data.user?.id ?? authUserId;
    const actionLink = data.properties?.action_link ?? null;
    if (isValidGeneratedAuthLink(actionLink)) {
      console.log("[Generated Action Link]:", actionLink);
      return { inviteLink: actionLink, authUserId, error: null };
    }

    const hashedToken = data.properties?.hashed_token ?? null;
    const verificationType = (data.properties?.verification_type ?? type) as AuthLinkType;
    if (hashedToken) {
      const callbackLink = buildAuthCallbackUrl(
        hashedToken,
        verificationType,
        PASSWORD_SETUP_PATH,
        origin
      );
      if (isValidGeneratedAuthLink(callbackLink)) {
        console.log("[Generated Action Link]:", callbackLink);
        return { inviteLink: callbackLink, authUserId, error: null };
      }
    }
  }

  return {
    inviteLink: null,
    authUserId,
    error: lastError ?? "Unable to generate a secure password setup link.",
  };
}

/** @deprecated Use generateWorkerInviteSetupLink */
export async function generateWorkerAuthActionLink(
  email: string
): Promise<{ actionLink: string | null; error: string | null }> {
  const result = await generateWorkerInviteSetupLink(email);
  return { actionLink: result.inviteLink, error: result.error };
}

export async function sendWorkerInviteEmailViaResend(
  email: string
): Promise<WorkerInviteEmailResult> {
  const trimmedEmail = email.trim();
  if (!trimmedEmail) {
    return {
      success: false,
      error: "email is required.",
      messageId: null,
      actionLink: null,
      authUserId: null,
    };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      success: false,
      error: "RESEND_API_KEY is not configured.",
      messageId: null,
      actionLink: null,
      authUserId: null,
    };
  }

  const { inviteLink, authUserId, error: linkError } =
    await generateWorkerInviteSetupLink(trimmedEmail);

  if (!inviteLink || !isValidGeneratedAuthLink(inviteLink)) {
    return {
      success: false,
      error: linkError ?? "Unable to generate a valid SiteBolt auth link.",
      messageId: null,
      actionLink: null,
      authUserId,
    };
  }

  console.log("[Generated Action Link]:", inviteLink);

  const inviteHtml = appendTeamEmailFooter(`
<table role="presentation" border="0" cellpadding="0" cellspacing="0" width="100%" style="max-width: 560px; margin: 0 auto; background-color: #ffffff; border-collapse: collapse;">
  <tr>
    <td style="padding: 24px; font-family: Arial, Helvetica, sans-serif; color: #1e293b;">
      <h1 style="font-size: 24px; font-weight: 700; margin: 0 0 16px 0; color: #0F172A; font-family: Arial, Helvetica, sans-serif;">
        Welcome to Site-Bolt
      </h1>
      <p style="font-size: 16px; line-height: 1.5; margin: 0; color: #334155; font-family: Arial, Helvetica, sans-serif;">
        You've been added to Site-Bolt. Please click the button below to set your password and access your account.
      </p>
      ${buildEmailCtaButtonHtml(inviteLink, "Set your password")}
    </td>
  </tr>
</table>
      `.trim());
  const inviteText = appendTeamEmailFooterText(
    `You've been added to Site-Bolt. Please use the "Set your password" button in this email to access your account.`
  );

  const resendResult = await resend.emails.send({
    from: DEFAULT_SYSTEM_FROM_EMAIL,
    to: [trimmedEmail],
    subject: "You have been added to Site-Bolt",
    html: inviteHtml,
    text: inviteText,
  });

  if (resendResult.error) {
    console.error("[worker-invite] Resend error:", resendResult.error);
    return {
      success: false,
      error: resendResult.error.message,
      messageId: null,
      actionLink: inviteLink,
      authUserId,
    };
  }

  return {
    success: true,
    error: null,
    messageId: resendResult.data?.id ?? null,
    actionLink: inviteLink,
    authUserId,
  };
}
