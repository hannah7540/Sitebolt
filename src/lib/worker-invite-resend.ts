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

function formatUnknownError(err: unknown): string {
  if (!err) return "unknown error";
  if (err instanceof Error && err.message) return err.message;
  if (typeof err === "string" && err.trim()) return err.trim();
  if (typeof err === "object" && "message" in err) {
    const message = (err as { message?: unknown }).message;
    if (typeof message === "string" && message.trim()) return message.trim();
  }
  try {
    return JSON.stringify(err);
  } catch {
    return String(err);
  }
}

function readGeneratedLinkParts(data: GenerateLinkCallResult["data"]): {
  actionLink: string | null;
  tokenHash: string | null;
  userId: string | null;
} {
  const props = data?.properties;
  return {
    actionLink: props?.action_link?.trim() || null,
    tokenHash:
      props?.hashed_token?.trim() || props?.token_hash?.trim() || null,
    userId: data?.user?.id ?? null,
  };
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
    const properties = result.data?.properties as
      | {
          action_link?: string | null;
          hashed_token?: string | null;
          token_hash?: string | null;
        }
      | null
      | undefined;
    console.log("[DEBUG] generateLink", type, {
      error: result.error?.message ?? null,
      hasProperties: Boolean(properties),
      hasHashedToken: Boolean(properties?.hashed_token || properties?.token_hash),
      hasActionLink: Boolean(properties?.action_link),
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
  const workerEmail = email.trim().toLowerCase();
  console.log("[DEBUG] Worker email:", workerEmail);
  console.log(
    "[DEBUG] Supabase URL present:",
    Boolean(process.env.NEXT_PUBLIC_SUPABASE_URL || process.env.SUPABASE_URL)
  );
  console.log(
    "[DEBUG] Service role key present:",
    Boolean(
      process.env.SUPABASE_SERVICE_ROLE_KEY || process.env.SUPABASE_SERVICE_KEY
    )
  );

  if (!workerEmail || !workerEmail.includes("@")) {
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

  try {
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
      workerEmail,
      targetUrl
    );
    const recoveryParts = readGeneratedLinkParts(recoveryRes.data);
    actionLink = recoveryParts.actionLink;
    tokenHash = recoveryParts.tokenHash;
    authUserId = recoveryParts.userId;

    if (!actionLink && !tokenHash) {
      const inviteRes = await generateAuthLink(
        admin,
        "invite",
        workerEmail,
        targetUrl
      );
      const inviteParts = readGeneratedLinkParts(inviteRes.data);
      actionLink = inviteParts.actionLink;
      tokenHash = inviteParts.tokenHash;
      authUserId = inviteParts.userId ?? authUserId;

      if (!actionLink && !tokenHash) {
        const { data: created, error: createError } =
          await admin.auth.admin.createUser({
            email: workerEmail,
            email_confirm: true,
          });

        if (!createError || isExistingAuthUserError(createError)) {
          const retryRes = await generateAuthLink(
            admin,
            "recovery",
            workerEmail,
            targetUrl
          );
          const retryParts = readGeneratedLinkParts(retryRes.data);
          actionLink = retryParts.actionLink;
          tokenHash = retryParts.tokenHash;
          authUserId =
            retryParts.userId ?? created.user?.id ?? authUserId;
        }

        if (!actionLink && !tokenHash) {
          const detail = formatUnknownError(
            recoveryRes.error ||
              inviteRes.error ||
              createError ||
              "missing hashed_token and action_link"
          );
          console.error("[Auth Admin Failure]:", {
            recoveryError: recoveryRes.error,
            inviteError: inviteRes.error,
            createError,
          });
          return {
            inviteLink: null,
            authUserId,
            error: `Unable to generate SiteBolt auth link: ${detail}`,
          };
        }
      }
    }

    const finalLink = tokenHash
      ? `${appUrl.startsWith("http") ? appUrl : "https://www.site-bolt.com.au"}/setyourpassword?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`
      : actionLink;

    console.log("[DEBUG] has hashed_token:", Boolean(tokenHash));
    console.log("[DEBUG] has action_link:", Boolean(actionLink));
    console.log("[DEBUG] finalLink valid:", isValidGeneratedAuthLink(finalLink));

    if (!finalLink) {
      return {
        inviteLink: null,
        authUserId,
        error:
          "Unable to generate SiteBolt auth link: missing hashed_token and action_link",
      };
    }

    if (!isValidGeneratedAuthLink(finalLink) && tokenHash) {
      const fallback = `https://www.site-bolt.com.au/setyourpassword?token_hash=${encodeURIComponent(tokenHash)}&type=recovery`;
      console.log("[Generated Action Link]:", fallback);
      return { inviteLink: fallback, authUserId, error: null };
    }

    if (!isValidGeneratedAuthLink(finalLink)) {
      return {
        inviteLink: null,
        authUserId,
        error: `Unable to generate SiteBolt auth link: constructed URL was rejected`,
      };
    }

    console.log("[Generated Action Link]:", finalLink);
    console.log("[Password setup redirectTo]:", targetUrl);
    return {
      inviteLink: finalLink,
      authUserId,
      error: null,
    };
  } catch (err: unknown) {
    console.error("[Generate Link Error]:", err);
    return {
      inviteLink: null,
      authUserId: null,
      error: `Unable to generate SiteBolt auth link: ${formatUnknownError(err)}`,
    };
  }
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
      error:
        linkError ??
        "Unable to generate SiteBolt auth link: missing hashed_token and action_link",
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
