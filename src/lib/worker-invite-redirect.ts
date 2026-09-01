import { resolveDefaultLandingPathForRole } from "./user-session";

export const WORKER_ONBOARDING_PATH = "/onboarding";

const PASSWORD_SETUP_PATHS = new Set([
  "/setyourpassword",
  "/reset-password",
  "/update-password",
  "/accept-invite",
  "/set-password",
  "/account/update-password",
]);

export function isPasswordSetupPath(pathname: string): boolean {
  const path = pathname.split("?")[0] || pathname;
  return PASSWORD_SETUP_PATHS.has(path);
}

/** After password setup: incomplete workers go to the wizard; completed workers go to the dashboard. */
export function resolvePostInvitePasswordPath(options: {
  onboardingCompleted: boolean;
  workerId?: string | null;
  role?: string | null;
}): string {
  if (!options.onboardingCompleted) {
    return WORKER_ONBOARDING_PATH;
  }

  return resolveDefaultLandingPathForRole(options.role, options.workerId);
}
