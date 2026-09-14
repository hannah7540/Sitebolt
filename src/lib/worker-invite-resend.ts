import { randomBytes } from "crypto";
import { Resend } from "resend";
import type { User } from "@supabase/supabase-js";
import { DEFAULT_SYSTEM_FROM_EMAIL } from "@/lib/email-config";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  assertActionUrl,
  buildWorkerInviteEmailContent,
} from "@/lib/worker-invite-email-template";
import { isSupabaseAdminConfigured } from "@/lib/supabase/env";

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

function getResendClient(): Resend | null {
  const apiKey =
    process.env.RESEND_API_KEY?.trim() ||
    process.env.NEXT_PUBLIC_RESEND_API_KEY?.trim();
  if (!apiKey) return null;
  return new Resend(apiKey);
}

export const PERSISTENT_INVITE_ORIGIN = "https://www.site-bolt.com.au";

export function buildPersistentInviteActionUrl(token: string): string {
  return assertActionUrl(
    `${PERSISTENT_INVITE_ORIGIN}/setyourpassword?token=${token}`
  );
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

export async function findWorkerIdForInvite(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  options: { workerId?: string | null; email: string }
): Promise<string | null> {
  const workerId = options.workerId?.trim();
  if (workerId) {
    const { data } = await admin
      .from("workers")
      .select("id")
      .eq("id", workerId)
      .maybeSingle();
    if (data?.id) return String(data.id);
  }

  const email = options.email.trim().toLowerCase();
  if (!email) return null;
  const { data } = await admin
    .from("workers")
    .select("id")
    .ilike("email", email)
    .maybeSingle();
  return data?.id ? String(data.id) : null;
}

export async function issuePersistentInviteToken(
  admin: ReturnType<typeof createSupabaseAdminClient>,
  workerId: string
): Promise<{ token: string | null; error: string | null }> {
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const persistentToken = randomBytes(32).toString("hex");
    const { error } = await admin
      .from("workers")
      .update({ invite_token: persistentToken })
      .eq("id", workerId);

    if (!error) return { token: persistentToken, error: null };

    const message = error.message.toLowerCase();
    if (message.includes("unique") || message.includes("duplicate")) {
      continue;
    }
    return { token: null, error: error.message };
  }

  return { token: null, error: "Failed to issue a unique invite token." };
}

// LOCKED: Critical worker invite functionality - do not delete or replace
export async function sendWorkerInviteEmailViaResend(
  email: string,
  options?: {
    userAlreadyExists?: boolean;
    workerId?: string | null;
    actionUrl?: string | null;
  }
): Promise<WorkerInviteEmailResult> {
  const trimmedEmail = email.trim();
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

  if (!isSupabaseAdminConfigured()) {
    return {
      success: false,
      error: "Supabase service role is not configured.",
      message: null,
      messageId: null,
      actionLink: null,
      authUserId: null,
    };
  }

  const admin = createSupabaseAdminClient();
  let actionUrl = options?.actionUrl?.trim() || "";

  if (!actionUrl) {
    const workerId = await findWorkerIdForInvite(admin, {
      workerId: options?.workerId,
      email: trimmedEmail,
    });

    if (!workerId) {
      return {
        success: false,
        error: "Worker record not found for this email.",
        message: null,
        messageId: null,
        actionLink: null,
        authUserId: null,
      };
    }

    const issued = await issuePersistentInviteToken(admin, workerId);
    if (!issued.token) {
      return {
        success: false,
        error: issued.error ?? "Failed to generate invite token.",
        message: null,
        messageId: null,
        actionLink: null,
        authUserId: null,
      };
    }

    actionUrl = buildPersistentInviteActionUrl(issued.token);
  }
  const { subject, html, text } = buildWorkerInviteEmailContent(actionUrl);

  const resendResult = await resend.emails.send({
    from: DEFAULT_SYSTEM_FROM_EMAIL,
    to: [trimmedEmail],
    subject,
    html,
    text,
  });

  if (resendResult.error) {
    console.error("[worker-invite] Resend error:", resendResult.error);
    return {
      success: false,
      error: resendResult.error.message,
      message: null,
      messageId: null,
      actionLink: actionUrl,
      authUserId: null,
    };
  }

  return {
    success: true,
    error: null,
    message: PASSWORD_SETUP_LINK_SENT_MESSAGE,
    messageId: resendResult.data?.id ?? null,
    actionLink: actionUrl,
    authUserId: null,
  };
}
