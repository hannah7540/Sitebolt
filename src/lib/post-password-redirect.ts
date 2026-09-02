export type WorkerPostPasswordStatus = {
  id: string;
  onboarding_completed: boolean | null;
  status: string | null;
  invite_status: string | null;
};

export const COMPLETED_PASSWORD_SETUP_LOGIN_HREF =
  "/login?message=Password set successfully. Please sign in to access your dashboard.";

export const FALLBACK_PASSWORD_SETUP_LOGIN_HREF =
  "/login?message=Password set successfully.";

/**
 * After password setup:
 * - Full onboarding (`onboarding_completed === true`) → login
 * - Quick invite (`onboarding_completed === false`) → /onboarding
 *
 * `onboarding_completed` is the source of truth. `status === "active"` is only
 * used when that flag is missing — activation can set status active without
 * completing the worker onboarding wizard.
 */
export function resolvePostPasswordSetupHref(
  worker: WorkerPostPasswordStatus | null | undefined
): string {
  if (!worker) {
    return FALLBACK_PASSWORD_SETUP_LOGIN_HREF;
  }

  const status = (worker.status ?? "").trim().toLowerCase();

  if (worker.onboarding_completed === true) {
    return COMPLETED_PASSWORD_SETUP_LOGIN_HREF;
  }

  if (worker.onboarding_completed === false) {
    return "/onboarding";
  }

  if (status === "active") {
    return COMPLETED_PASSWORD_SETUP_LOGIN_HREF;
  }

  if (status === "pending_onboarding" || status === "pending_induction") {
    return "/onboarding";
  }

  return FALLBACK_PASSWORD_SETUP_LOGIN_HREF;
}
