const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const WORKER_INVITE_NEXT_PATH = "/accept-invite";
export const PASSWORD_RESET_NEXT_PATH = "/reset-password";

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

export function buildPasswordResetCallbackUrl(hashedToken: string): string {
  return buildAuthCallbackUrl(hashedToken, "recovery", PASSWORD_RESET_NEXT_PATH);
}

export function getPasswordResetRedirectTo(): string {
  return `${PRODUCTION_SITE_URL}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(PASSWORD_RESET_NEXT_PATH)}`;
}
