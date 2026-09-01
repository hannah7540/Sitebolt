import { Resend } from "resend";
import type { AuthError, User } from "@supabase/supabase-js";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { buildEmailCtaButtonHtml } from "@/lib/email-cta-button";
import {
  appendTeamEmailFooter,
  appendTeamEmailFooterText,
} from "@/lib/email-team-footer";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";
import {
  isValidGeneratedAuthLink,
  resolveInviteSiteOrigin,
} from "@/lib/worker-invite-link";

type GenerateLinkType = "invite" | "recovery" | "magiclink";

export const PASSWORD_SETUP_EMAIL_SUBJECT = "Set up your SiteBolt account password";
export const PASSWORD_SETUP_LINK_SENT_MESSAGE =
  "Password setup link sent successfully";

export interface WorkerInviteEmailResult {
  success: boolean;
  error: string | null;
  message: string | null;
  messageId: string | null;
  actionLink: string | null;
  authUserId?: string | null;
}

type GenerateLinkCallResult = {
  data: {
    user?: User | null;
    properties?: {
      action_link?: string | null;
      hashed_token?: string | null;
      token_hash?: string | null;
      verification_type?: string | null;
    } | null;
  } | null;
  error: AuthError | { message: string; status?: number; code?: string } | null;
};

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

function isExistingAuthUserError(
  error: GenerateLinkCallResult["error"]
): boolean {
  if (!error) return false;

  const status = "status" in error ? Number(error.status) : NaN;
  if (status === 422) return true;

  const code = ("code" in error ? String(error.code) : "").toLowerCase();
  if (
    code === "email_exists" ||
    code === "user_already_exists" ||
    code === "user_already_registered"
  ) {
    return true;
  }

  const message = error.message.toLowerCase();
  return (
    message.includes("already registered") ||
    message.includes("already been registered") ||
    message.includes("already exists") ||
    message.includes("already has an account") ||
    message.includes("email_exists")
  );
}

async function generateAuthLink(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  type: GenerateLinkType,
  email: string,
  redirectTo: string
): Promise<GenerateLinkCallResult> {
  try {
    const result = await admin.auth.admin.generateLink({
      type,
      email,
      options: { redirectTo },
    });
    return { data: result.data, error: result.error };
  } catch (cause) {
    const err = cause as { message?: string; status?: number; code?: string };
    console.error("[Generate Link Error]:", cause);
    return {
      data: null,
      error: {
        message: err?.message || "Failed to generate auth link.",
        status: err?.status,
        code: err?.code,
      },
    };
  }
}

export async function findAuthUserByEmail(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({
      page,
      perPage: 200,
    });
    if (error) {
      console.warn("[worker-invite] listUsers failed:", error.message);
      return null;
    }

    const match = data.users.find(
      (user) => user.email?.trim().toLowerCase() === target
    );
    if (match) return match;
    if (data.users.length < 200) break;
    page += 1;
  }

  return null;
}

export async function generateWorkerInviteSetupLink(
  email: string,
  _origin = getInviteOrigin(),
  _options?: { userAlreadyExists?: boolean }
): Promise<{
  inviteLink: string | null;
  authUserId: string | null;
  error: string | null;
}> {
  const normalizedEmail = email.trim().toLowerCase();
  if (!normalizedEmail || !normalizedEmail.includes("@")) {
    return {
      inviteLink: null,
      authUserId: null,
      error: "email is required.",
    };
  }

  if (!isSupabaseAdminConfigured()) {
    console.error(
      "[Supabase Admin Init Error]: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables."
    );
    return {
      inviteLink: null,
      authUserId: null,
      error: "Supabase service role is not configured.",
    };
  }

  const admin = createSupabaseAdminClient();
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || "https://www.site-bolt.com.au"
  ).replace(/\/$/, "");
  const targetUrl = `${appUrl}/setyourpassword`;

  let actionLink: string | null = null;
  let tokenHash: string | null = null;
  let authUserId: string | null = null;

  const recoveryRes = await generateAuthLink(
    admin,
    "recovery",
    normalizedEmail,
    targetUrl
  );

  if (recoveryRes.data?.properties) {
    actionLink = recoveryRes.data.properties.action_link || null;
    tokenHash =
      recoveryRes.data.properties.hashed_token ||
      recoveryRes.data.properties.token_hash ||
      null;
    authUserId = recoveryRes.data.user?.id ?? null;
  }

  if (!actionLink && !tokenHash) {
    const inviteRes = await generateAuthLink(
      admin,
      "invite",
      normalizedEmail,
      targetUrl
    );

    if (inviteRes.data?.properties) {
      actionLink = inviteRes.data.properties.action_link || null;
      tokenHash =
        inviteRes.data.properties.hashed_token ||
        inviteRes.data.properties.token_hash ||
        null;
      authUserId = inviteRes.data.user?.id ?? authUserId;
    }

    if (!actionLink && !tokenHash) {
      const { data: created, error: createError } = await admin.auth.admin.createUser({
        email: normalizedEmail,
        email_confirm: true,
      });

      if (!createError || isExistingAuthUserError(createError)) {
        const retryRes = await generateAuthLink(
          admin,
          "recovery",
          normalizedEmail,
          targetUrl
        );
        actionLink = retryRes.data?.properties?.action_link || null;
        tokenHash =
          retryRes.data?.properties?.hashed_token ||
          retryRes.data?.properties?.token_hash ||
          null;
        authUserId = retryRes.data?.user?.id ?? created.user?.id ?? authUserId;
      }

      if (!actionLink && !tokenHash) {
        console.error("[Auth Admin Failure]:", {
          recoveryError: recoveryRes.error,
          inviteError: inviteRes.error,
          createError,
        });
        return {
          inviteLink: null,
          authUserId,
          error: `Failed to generate auth link: ${
            recoveryRes.error?.message ||
            inviteRes.error?.message ||
            createError?.message ||
            "missing hashed_token and action_link"
          }`,
        };
      }
    }
  }

  const finalLink = tokenHash
    ? `${appUrl}/setyourpassword?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
    : actionLink;

  if (!finalLink || !isValidGeneratedAuthLink(finalLink)) {
    console.error("[Generate Link Error]:", "Unable to build a valid password setup URL", {
      hasTokenHash: Boolean(tokenHash),
      hasActionLink: Boolean(actionLink),
    });
    return {
      inviteLink: null,
      authUserId,
      error: "Unable to generate a valid SiteBolt auth link.",
    };
  }

  console.log("[Generated Action Link]:", finalLink);
  console.log("[Password setup redirectTo]:", targetUrl);
  return {
    inviteLink: finalLink,
    authUserId,
    error: null,
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
  email: string,
  options?: { userAlreadyExists?: boolean }
): Promise<WorkerInviteEmailResult> {
  const trimmedEmail = email.trim().toLowerCase();
  if (!trimmedEmail) {
    return {
      success: false,
      error: "email is required.",
      message: null,
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
      message: null,
      messageId: null,
      actionLink: null,
      authUserId: null,
    };
  }

  const { inviteLink: finalLink, authUserId, error: linkError } =
    await generateWorkerInviteSetupLink(trimmedEmail, getInviteOrigin(), options);

  if (!finalLink || !isValidGeneratedAuthLink(finalLink)) {
    return {
      success: false,
      error: linkError ?? "Unable to generate a valid SiteBolt auth link.",
      message: null,
      messageId: null,
      actionLink: null,
      authUserId,
    };
  }

  console.log("[Generated Action Link]:", finalLink);

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
      ${buildEmailCtaButtonHtml(finalLink, "Set your password")}
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
    subject: PASSWORD_SETUP_EMAIL_SUBJECT,
    html: inviteHtml,
    text: inviteText,
  });

  if (resendResult.error) {
    console.error("[worker-invite] Resend error:", resendResult.error);
    return {
      success: false,
      error: resendResult.error.message,
      message: null,
      messageId: null,
      actionLink: finalLink,
      authUserId,
    };
  }

  return {
    success: true,
    error: null,
    message: PASSWORD_SETUP_LINK_SENT_MESSAGE,
    messageId: resendResult.data?.id ?? null,
    actionLink: finalLink,
    authUserId,
  };
}
