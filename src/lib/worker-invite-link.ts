const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
export const AUTH_CALLBACK_PATH = "/auth/callback";
export const AUTH_CONFIRM_PATH = "/api/auth/confirm";
export const WORKER_INVITE_NEXT_PATH = "/accept-invite";
export const PASSWORD_RESET_NEXT_PATH = "/update-password";
export const PASSWORD_RESET_OTP_PATH = "/setyourpassword";
export const PASSWORD_SETUP_PATH = PASSWORD_RESET_OTP_PATH;

/** Absolute https origin for invite redirectTo and email links. Never localhost. */
export function resolveCleanSiteUrl(requestOrigin?: string | null): string {
  const vercelHost = process.env.VERCEL_URL?.trim().replace(/^https?:\/\//, "");
  const raw =
    process.env.NEXT_PUBLIC_SITE_URL?.trim() ||
    process.env.NEXT_PUBLIC_APP_URL?.trim() ||
    requestOrigin?.trim() ||
    (vercelHost ? `https://${vercelHost}` : "") ||
    PRODUCTION_SITE_URL;

  let value = raw.replace(/\/+$/, "").replace(/^\[(https?:\/\/[^\]]+)\]\([^)]+\)$/i, "$1");
  if (!/^https?:\/\//i.test(value)) {
    value = `https://${value}`;
  }

  try {
    const parsed = new URL(value);
    if (parsed.protocol !== "http:" && parsed.protocol !== "https:") {
      return PRODUCTION_SITE_URL;
    }
    if (parsed.hostname === "localhost" || parsed.hostname === "127.0.0.1") {
      return PRODUCTION_SITE_URL;
    }
    return `${parsed.protocol}//${parsed.host}`;
  } catch {
    return PRODUCTION_SITE_URL;
  }
}

export function resolveInviteSiteOrigin(requestOrigin?: string | null): string {
  return resolveCleanSiteUrl(requestOrigin);
}

export function getWorkerInviteRedirectTo(origin?: string | null): string {
  const cleanSiteUrl = resolveCleanSiteUrl(origin);
  return `${cleanSiteUrl}${AUTH_CALLBACK_PATH}?next=${PASSWORD_SETUP_PATH}`;
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

export function getAuthCallbackUrl(nextPath: string): string {
  const next = nextPath.startsWith("/") ? nextPath : `/${nextPath}`;
  return `${PRODUCTION_SITE_URL}${AUTH_CALLBACK_PATH}?next=${encodeURIComponent(next)}`;
}

export function getAuthPasswordSetupRedirectTo(_origin?: string | null): string {
  const appUrl = (
    process.env.NEXT_PUBLIC_APP_URL?.trim() || PRODUCTION_SITE_URL
  ).replace(/\/$/, "");
  return `${appUrl}${PASSWORD_SETUP_PATH}`;
}

export function isValidGeneratedAuthLink(link: string): boolean {
  return Boolean(link && typeof link === "string" && link.length > 0);
}

export function buildAuthConfirmLink(input: {
  tokenHash: string;
  type?: string | null;
  next?: string | null;
  origin?: string | null;
}): string | null {
  const tokenHash = input.tokenHash.trim();
  if (!tokenHash) return null;

  const appUrl = (input.origin?.trim() || PRODUCTION_SITE_URL).replace(/\/$/, "");
  const params = new URLSearchParams({
    token_hash: tokenHash,
    type: (input.type?.trim() || "recovery").toLowerCase(),
    next: input.next?.trim() || PASSWORD_SETUP_PATH,
  });

  return `${appUrl}${AUTH_CONFIRM_PATH}?${params.toString()}`;
}
