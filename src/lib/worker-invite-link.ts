const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_CONFIRM_PATH = "/api/auth/confirm";
export const WORKER_INVITE_NEXT_PATH = "/accept-invite";
export const PASSWORD_RESET_NEXT_PATH = "/update-password";
export const PASSWORD_RESET_OTP_PATH = "/reset-password";
export const PASSWORD_SETUP_PATH = PASSWORD_RESET_OTP_PATH;

export function resolveInviteSiteOrigin(requestOrigin?: string | null): string {
  const configured =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim();
  if (configured) return configured.replace(/\/$/, "");

  const origin = requestOrigin?.trim();
  if (origin && !origin.includes("localhost")) return origin.replace(/\/$/, "");

  return PRODUCTION_SITE_URL;
}

export function buildPasswordSetupPath(email?: string | null): string {
  if (!email?.trim()) return PASSWORD_SETUP_PATH;
  return `${PASSWORD_SETUP_PATH}?email=${encodeURIComponent(email.trim())}`;
}

export function buildPasswordResetOtpPageUrl(email: string): string {
  return `${PRODUCTION_SITE_URL}${buildPasswordSetupPath(email)}`;
}

/** @deprecated Use AUTH_CALLBACK_PATH */
export const WORKER_INVITE_CALLBACK_PATH = AUTH_CALLBACK_PATH;

export type AuthLinkType = "invite" | "recovery" | "magiclink" | "signup";

/** @deprecated Use AuthLinkType */
export type WorkerInviteLinkType = AuthLinkType;

export function buildAuthCallbackUrl(
  hashedToken: string,
  type: AuthLinkType,
  nextPath: string,
  origin: string = PRODUCTION_SITE_URL
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: nextPath,
  });

  return `${origin.replace(/\/$/, "")}${AUTH_CALLBACK_PATH}?${params.toString()}`;
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
