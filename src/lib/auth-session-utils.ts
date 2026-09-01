import type { Session } from "@supabase/supabase-js";

type AmrEntry = { method?: string; timestamp?: number };

function decodeJwtPayload(token: string): Record<string, unknown> | null {
  try {
    const payload = token.split(".")[1];
    if (!payload) return null;
    const json = Buffer.from(payload, "base64url").toString("utf8");
    return JSON.parse(json) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function readAmrFromSession(session: Session): AmrEntry[] {
  const amr = decodeJwtPayload(session.access_token)?.amr;
  return Array.isArray(amr) ? (amr as AmrEntry[]) : [];
}

/** True only when the active auth method is a password-recovery link (not a normal login). */
export function isPasswordRecoverySession(
  session: Session | null | undefined
): boolean {
  if (!session?.access_token) return false;

  const amr = readAmrFromSession(session);
  if (amr.length === 0) return false;

  const latest = amr[amr.length - 1];
  const latestMethod = latest?.method?.toLowerCase();
  if (!latestMethod) return false;

  if (
    latestMethod === "password" ||
    latestMethod === "otp" ||
    latestMethod === "oauth" ||
    latestMethod === "sso" ||
    latestMethod === "magiclink"
  ) {
    return false;
  }

  return latestMethod === "recovery" || latestMethod === "invite";
}
