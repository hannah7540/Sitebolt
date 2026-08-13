import { Resend } from "resend";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import { getSiteUrl, isSupabaseAdminConfigured } from "@/lib/supabase/env";

type GenerateLinkType = "magiclink" | "recovery" | "invite";

function getAuthCallbackUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

function getConfirmInviteRedirectUrl(): string {
  return getAuthCallbackUrl("/auth/confirm-invite");
}

function getResetPasswordRedirectUrl(): string {
  return getAuthCallbackUrl("/auth/reset-password");
}

export interface WorkerInviteEmailResult {
  success: boolean;
  error: string | null;
  messageId: string | null;
  actionLink: string | null;
}

function getResendClient(): Resend | null {
  const apiKey = process.env.RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export async function generateWorkerAuthActionLink(
  email: string
): Promise<{ actionLink: string | null; error: string | null }> {
  if (!isSupabaseAdminConfigured()) {
    return {
      actionLink: null,
      error: "Supabase service role is not configured.",
    };
  }

  const admin = createSupabaseAdminClient();
  const attempts: Array<{ type: GenerateLinkType; redirectTo: string }> = [
    { type: "magiclink", redirectTo: getConfirmInviteRedirectUrl() },
    { type: "recovery", redirectTo: getResetPasswordRedirectUrl() },
    { type: "invite", redirectTo: getConfirmInviteRedirectUrl() },
  ];

  for (const attempt of attempts) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: attempt.type,
      email: email.trim(),
      options: { redirectTo: attempt.redirectTo },
    });

    if (error) {
      console.warn(
        `[worker-invite-resend] generateLink(${attempt.type}) failed:`,
        error.message
      );
      continue;
    }

    const actionLink = data.properties?.action_link ?? null;
    if (actionLink) {
      return { actionLink, error: null };
    }
  }

  return {
    actionLink: null,
    error: "Unable to generate Supabase auth link for this worker.",
  };
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
    };
  }

  const resend = getResendClient();
  if (!resend) {
    return {
      success: false,
      error: "RESEND_API_KEY is not configured.",
      messageId: null,
      actionLink: null,
    };
  }

  const { actionLink, error: linkError } =
    await generateWorkerAuthActionLink(trimmedEmail);

  if (!actionLink) {
    return {
      success: false,
      error: linkError ?? "Unable to generate auth link.",
      messageId: null,
      actionLink: null,
    };
  }

  const resendResult = await resend.emails.send({
    from: DEFAULT_SYSTEM_FROM_EMAIL,
    to: [trimmedEmail],
    subject: "Set up your Site Bolt account",
    html: `<p>Welcome to Site Bolt! Click the link below to sign in and complete your setup:</p><p><a href="${actionLink}">Set Up Account</a></p>`,
    text: `Welcome to Site Bolt! Set up your account: ${actionLink}`,
  });

  console.log("Resend response:", resendResult.data);

  if (resendResult.error) {
    console.error("[worker-invite-resend] Resend error:", resendResult.error);
    return {
      success: false,
      error: resendResult.error.message,
      messageId: null,
      actionLink,
    };
  }

  return {
    success: true,
    error: null,
    messageId: resendResult.data?.id ?? null,
    actionLink,
  };
}
