const PRODUCTION_SITE_URL = "https://www.site-bolt.com.au";
export const WORKER_INVITE_NEXT_PATH = "/accept-invite";
export const WORKER_INVITE_CALLBACK_PATH = "/auth/callback";

export type WorkerInviteLinkType = "invite" | "recovery";

export function buildWorkerInviteCallbackUrl(
  hashedToken: string,
  type: WorkerInviteLinkType,
  nextPath: string = WORKER_INVITE_NEXT_PATH
): string {
  const params = new URLSearchParams({
    token_hash: hashedToken,
    type,
    next: nextPath,
  });

  return `${PRODUCTION_SITE_URL}${WORKER_INVITE_CALLBACK_PATH}?${params.toString()}`;
}
