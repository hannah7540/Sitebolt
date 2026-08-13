const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_CONFIRM_PATH = "/api/auth/confirm";
export const WORKER_INVITE_NEXT_PATH = "/accept-invite";
export const PASSWORD_RESET_NEXT_PATH = "/update-password";
export const PASSWORD_RESET_OTP_PATH = "/reset-password";

export function buildPasswordResetOtpPageUrl(email: string): string {
  return `${PRODUCTION_SITE_URL}${PASSWORD_RESET_OTP_PATH}?email=${encodeURIComponent(email.trim())}`;
}

/** @deprecated Use AUTH_CALLBACK_PATH */
export const WORKER_INVITE_CALLBACK_PATH = AUTH_CALLBACK_PATH;

export type AuthLinkType = "invite" | "recovery";

/** @deprecated Use AuthLinkType */
export type WorkerInviteLinkType = AuthLinkType;

export function buildAuthCallbackUrl(
  hashedToken: string,
  type: AuthLinkType,
  nextPath: string
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: nextPath,
  });

  return `${PRODUCTION_SITE_URL}${AUTH_CALLBACK_PATH}?${params.toString()}`;
}

export function buildWorkerInviteCallbackUrl(
  hashedToken: string,
  type: AuthLinkType,
  nextPath: string = WORKER_INVITE_NEXT_PATH
): string {
  return buildAuthCallbackUrl(hashedToken, type, nextPath);
}

export function buildPasswordResetConfirmUrl(hashedToken: string): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type: "recovery",
    next: PASSWORD_RESET_NEXT_PATH,
  });

  return `${PRODUCTION_SITE_URL}${AUTH_CONFIRM_PATH}?${params.toString()}`;
}

/** @deprecated Prefer buildPasswordResetConfirmUrl for recovery emails. */
export function buildPasswordResetCallbackUrl(hashedToken: string): string {
  return buildAuthCallbackUrl(hashedToken, "recovery", PASSWORD_RESET_NEXT_PATH);
}

export function getPasswordResetRedirectTo(): string {
  return `${PRODUCTION_SITE_URL}${AUTH_CONFIRM_PATH}?next=${encodeURIComponent(PASSWORD_RESET_NEXT_PATH)}`;
}
