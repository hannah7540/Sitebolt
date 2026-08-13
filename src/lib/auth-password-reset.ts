import { createSupabaseBrowserClient } from "./supabase/client";
import { getResetPasswordRedirectUrl } from "./worker-auth-email";

/** Request a password reset email; redirect lands on /auth/reset-password via auth callback. */
export async function requestPasswordResetEmail(
  email: string
): Promise<{ error: string | null }> {
  const trimmed = email.trim();
  if (!trimmed) {
    return { error: "Enter your email address." };
  }

  try {
    const supabase = createSupabaseBrowserClient();
    const { error } = await supabase.auth.resetPasswordForEmail(trimmed, {
      redirectTo: getResetPasswordRedirectUrl(),
    });

    if (error) return { error: error.message };
    return { error: null };
  } catch (cause) {
    return {
      error: cause instanceof Error ? cause.message : "Failed to send reset email.",
    };
  }
}
