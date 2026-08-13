import { createClient } from "@supabase/supabase-js";
import { createSupabaseAdminClient } from "@/lib/supabase/admin";
import {
  getSiteUrl,
  isSupabaseAdminConfigured,
  isSupabaseConfigured,
  supabaseAnonKey,
  supabaseUrl,
} from "@/lib/supabase/env";

export function getAuthCallbackUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${getSiteUrl()}/auth/callback?next=${encodeURIComponent(next)}`;
}

export function getConfirmInviteRedirectUrl(): string {
  return getAuthCallbackUrl("/auth/confirm-invite");
}

export function getResetPasswordRedirectUrl(): string {
  return getAuthCallbackUrl("/auth/reset-password");
}

export async function inviteWorkerByEmail(
  email: string
): Promise<{ error: string | null }> {
  if (!isSupabaseAdminConfigured()) {
    return {
      error:
        "Supabase service role is not configured. Add SUPABASE_SERVICE_ROLE_KEY to .env.local.",
    };
  }

  try {
    const admin = createSupabaseAdminClient();
    const { error } = await admin.auth.admin.inviteUserByEmail(email.trim(), {
      redirectTo: getConfirmInviteRedirectUrl(),
      data: {
        role: "general_worker",
        security_role: "general_worker",
      },
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to send worker invite.",
    };
  }
}

export async function sendWorkerPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  if (!isSupabaseConfigured()) {
    return { error: "Supabase is not configured." };
  }

  try {
    const supabase = createClient(supabaseUrl, supabaseAnonKey, {
      auth: { persistSession: false, autoRefreshToken: false },
    });

    const { error } = await supabase.auth.resetPasswordForEmail(email.trim(), {
      redirectTo: getResetPasswordRedirectUrl(),
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error:
        error instanceof Error ? error.message : "Failed to send password reset email.",
    };
  }
}
