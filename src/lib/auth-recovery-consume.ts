import type { EmailOtpType, SupabaseClient } from "@supabase/supabase-js";

const VALID_OTP_TYPES = new Set<EmailOtpType>([
  "signup",
  "invite",
  "magiclink",
  "recovery",
  "email",
  "email_change",
]);

export function resolveEmailOtpType(type: string | null | undefined): EmailOtpType {
  const normalized = (type ?? "").trim().toLowerCase();
  if (VALID_OTP_TYPES.has(normalized as EmailOtpType)) {
    return normalized as EmailOtpType;
  }
  return "recovery";
}

function readHashAuthParams(): {
  accessToken: string | null;
  refreshToken: string | null;
} {
  if (typeof window === "undefined") {
    return { accessToken: null, refreshToken: null };
  }
  const params = new URLSearchParams(window.location.hash.replace(/^#/, ""));
  return {
    accessToken: params.get("access_token"),
    refreshToken: params.get("refresh_token"),
  };
}

/**
 * Consume a recovery/invite token only after a real user action, then set the
 * new password. Never call this from a GET handler or a page-load effect.
 */
export async function consumeAuthTokenAndUpdatePassword(
  supabase: SupabaseClient,
  input: {
    password: string;
    tokenHash?: string | null;
    code?: string | null;
    otpToken?: string | null;
    email?: string | null;
    otpType?: string | null;
  }
): Promise<{ error: string | null }> {
  const otpType = resolveEmailOtpType(input.otpType);
  const tokenHash = input.tokenHash?.trim() || "";
  const code = input.code?.trim() || "";
  const otpToken = input.otpToken?.trim() || "";
  const email = input.email?.trim().toLowerCase() || "";
  const hash = readHashAuthParams();

  if (tokenHash) {
    const { error } = await supabase.auth.verifyOtp({
      token_hash: tokenHash,
      type: otpType,
    });
    if (error) return { error: error.message };
  } else if (code) {
    const { error } = await supabase.auth.exchangeCodeForSession(code);
    if (error) return { error: error.message };
  } else if (otpToken && email) {
    const { error } = await supabase.auth.verifyOtp({
      email,
      token: otpToken,
      type: "recovery",
    });
    if (error) return { error: error.message };
  } else if (hash.accessToken && hash.refreshToken) {
    const { error } = await supabase.auth.setSession({
      access_token: hash.accessToken,
      refresh_token: hash.refreshToken,
    });
    if (error) return { error: error.message };
  } else {
    const { data } = await supabase.auth.getSession();
    if (!data.session) {
      return {
        error:
          "This reset link is missing a valid token. Request a new one, or enter the 6-digit code from your email.",
      };
    }
  }

  const { error: updateError } = await supabase.auth.updateUser({
    password: input.password,
  });
  if (updateError) return { error: updateError.message };

  return { error: null };
}
