import { type SupabaseClient, type User } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getSiteUrl,
  isSupabaseAdminConfigured,
} from "@/lib/supabase/env";
import { DEFAULT_WORKER_SECURITY_ROLE } from "@/lib/security-roles";
import { sendEmail } from "@/lib/email-service";
import { buildEmailCtaButtonHtml } from "@/lib/email-cta-button";
import { sendWorkerInviteEmailViaResend } from "@/lib/worker-invite-resend";
import {
  getAuthPasswordSetupRedirectTo,
  isValidGeneratedAuthLink,
} from "@/lib/worker-invite-link";

export function getAuthCallbackUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function getConfirmInviteRedirectUrl(): string {
  return getAuthPasswordSetupRedirectTo();
}

export function getResetPasswordRedirectUrl(): string {
  return getAuthPasswordSetupRedirectTo();
}

export interface WorkerAuthInviteResult {
  error: string | null;
  authUserId: string | null;
  inviteSent: boolean;
  linkedWorkerId: string | null;
}

async function sendWorkerOnboardingLinkViaResend(
  email: string,
  actionLink: string,
  fullName: string
): Promise<{ error: string | null }> {
  const safeName = fullName.trim() || email;

  const result = await sendEmail({
    to: [email],
    subject: "Set up your Site Bolt account",
    html: `
      <p style="font-family: Arial, Helvetica, sans-serif; color: #334155;">Hi ${safeName},</p>
      <p style="font-family: Arial, Helvetica, sans-serif; color: #334155;">You have been invited to join Site Bolt. Use the button below to set up your account:</p>
      ${buildEmailCtaButtonHtml(actionLink, "Set your password")}
      <p style="font-family: Arial, Helvetica, sans-serif; color: #64748B; font-size: 14px;">If you did not expect this email, you can ignore it.</p>
    `,
    text: `Hi ${safeName},\n\nYou have been invited to join Site Bolt. Please use the "Set your password" button in this email to set up your account.`,
  });

  if (!result.sent) {
    return { error: result.error ?? "Failed to send invite email via Resend." };
  }

  return { error: null };
}

export async function sendExistingUserOnboardingEmail(
  admin: SupabaseClient,
  email: string,
  fullName: string
): Promise<{ authUserId: string | null; error: string | null }> {
  const trimmedEmail = email.trim();
  const linkAttempts: Array<{
    type: "recovery";
    redirectTo: string;
  }> = [{ type: "recovery", redirectTo: getResetPasswordRedirectUrl() }];

  for (const attempt of linkAttempts) {
    const { data, error } = await admin.auth.admin.generateLink({
      type: attempt.type,
      email: trimmedEmail,
      options: { redirectTo: attempt.redirectTo },
    });

    if (error) {
      console.warn(
        `[worker-auth-email] generateLink (${attempt.type}) failed for ${trimmedEmail}:`,
        error.message
      );
      continue;
    }

    const actionLink = data?.properties?.action_link ?? null;
    if (!isValidGeneratedAuthLink(actionLink)) continue;

    const sendResult = await sendWorkerOnboardingLinkViaResend(
      trimmedEmail,
      actionLink,
      fullName
    );

    if (!sendResult.error) {
      return { authUserId: data.user?.id ?? null, error: null };
    }

    console.warn(
      `[worker-auth-email] Resend failed for ${trimmedEmail}:`,
      sendResult.error
    );
  }

  const resetResult = await sendWorkerInviteEmailViaResend(trimmedEmail);
  if (resetResult.error) {
    return { authUserId: null, error: resetResult.error };
  }

  const authUser = await findAuthUserByEmail(admin, trimmedEmail);
  return { authUserId: authUser?.id ?? null, error: null };
}

async function findAuthUserByEmail(
  admin: SupabaseClient,
  email: string
): Promise<User | null> {
  const target = email.trim().toLowerCase();
  let page = 1;

  while (page <= 20) {
    const { data, error } = await admin.auth.admin.listUsers({ page, perPage: 200 });
    if (error) {
      throw new Error(`Failed to list auth users: ${error.message}`);
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

async function loadWorkerLinkContext(
  admin: SupabaseClient,
  workerId: string
): Promise<{
  email: string | null;
  fullName: string | null;
  securityRole: string | null;
} | null> {
  const selectVariants = [
    "email, full_name, security_role",
    "email, full_name",
    "email",
  ] as const;

  for (const select of selectVariants) {
    const { data, error } = await admin
      .from("workers")
      .select(select)
      .eq("id", workerId)
      .maybeSingle();

    if (error) {
      if (error.message.toLowerCase().includes("schema cache")) continue;
      return null;
    }

    if (!data) return null;

    const row = data as {
      email?: unknown;
      full_name?: unknown;
      security_role?: unknown;
    };

    return {
      email: row.email ? String(row.email) : null,
      fullName: row.full_name ? String(row.full_name) : null,
      securityRole: row.security_role ? String(row.security_role) : null,
    };
  }

  return null;
}

export async function linkWorkerAuthAccount(
  admin: SupabaseClient,
  options: {
    workerId: string;
    authUserId: string;
    email: string;
    fullName?: string | null;
    securityRole?: string | null;
  }
): Promise<{ error: string | null }> {
  const { error: workerError } = await admin
    .from("workers")
    .update({
      auth_user_id: options.authUserId,
      updated_at: new Date().toISOString(),
    })
    .eq("id", options.workerId);

  if (workerError) {
    const message = workerError.message.toLowerCase();
    if (!message.includes("auth_user_id") && !message.includes("schema cache")) {
      return { error: workerError.message };
    }
  }

  const profilePayload = {
    id: options.authUserId,
    email: options.email,
    full_name: options.fullName?.trim() || options.email,
    role: options.securityRole ?? DEFAULT_WORKER_SECURITY_ROLE,
    worker_id: options.workerId,
    updated_at: new Date().toISOString(),
  };

  const { error: profileError } = await admin
    .from("profiles")
    .upsert([profilePayload], { onConflict: "id" });

  if (profileError) {
    const message = profileError.message.toLowerCase();
    if (!message.includes("profiles") && !message.includes("schema cache")) {
      console.warn("linkWorkerAuthAccount profiles upsert:", profileError.message);
    }
  }

  return { error: null };
}

export async function ensureWorkerAuthUserAndInvite(
  email: string,
  options?: {
    workerId?: string;
    securityRole?: string;
    fullName?: string;
  }
): Promise<WorkerAuthInviteResult> {
  const trimmedEmail = email.trim();

  if (!trimmedEmail) {
    return {
      error: "email is required.",
      authUserId: null,
      inviteSent: false,
      linkedWorkerId: null,
    };
  }

  if (!isSupabaseAdminConfigured()) {
    return {
      error:
        "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
      authUserId: null,
      inviteSent: false,
      linkedWorkerId: null,
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const workerId = options?.workerId?.trim() || null;
    let workerContext: {
      email: string | null;
      fullName: string | null;
      securityRole: string | null;
    } | null = null;

    if (workerId) {
      workerContext = await loadWorkerLinkContext(admin, workerId);
    }

    const securityRole =
      options?.securityRole ??
      workerContext?.securityRole ??
      DEFAULT_WORKER_SECURITY_ROLE;
    const fullName = options?.fullName ?? workerContext?.fullName ?? trimmedEmail;

    const inviteResult = await sendWorkerInviteEmailViaResend(trimmedEmail);
    if (!inviteResult.success) {
      return {
        error: inviteResult.error ?? "Failed to send worker invite.",
        authUserId: null,
        inviteSent: false,
        linkedWorkerId: null,
      };
    }

    let authUser: User | null = await findAuthUserByEmail(admin, trimmedEmail);

    if (workerId && authUser) {
      const linkResult = await linkWorkerAuthAccount(admin, {
        workerId,
        authUserId: authUser.id,
        email: trimmedEmail,
        fullName,
        securityRole,
      });

      if (linkResult.error) {
        console.warn(
          `[worker-auth-email] Worker auth link failed for ${workerId}:`,
          linkResult.error
        );
      }
    }

    return {
      error: null,
      authUserId: authUser?.id ?? null,
      inviteSent: true,
      linkedWorkerId: workerId,
    };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to send worker invite.",
      authUserId: null,
      inviteSent: false,
      linkedWorkerId: null,
    };
  }
}

/** @deprecated Prefer ensureWorkerAuthUserAndInvite for worker onboarding flows. */
export async function inviteWorkerByEmail(
  email: string,
  options?: { workerId?: string; securityRole?: string; fullName?: string }
): Promise<{ error: string | null; authUserId?: string | null }> {
  const result = await ensureWorkerAuthUserAndInvite(email, options);
  return {
    error: result.error,
    authUserId: result.authUserId,
  };
}

export async function sendWorkerPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const result = await sendWorkerInviteEmailViaResend(email);
  return { error: result.error };
}
