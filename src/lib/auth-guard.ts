import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { signOutSupabase } from "@/lib/supabase/auth";
import {
  hasAuthHashFragment,
  isPublicAuthFlowPath,
  resetPasswordLocationWithHash,
  hasAuthCodeQuery,
  isExemptFromAuthRedirect,
} from "@/lib/public-auth-paths";

/** Build a login URL preserving the post-auth return path. */
export function buildLoginRedirectPath(nextPath?: string | null): string {
  const trimmed = nextPath?.trim();
  if (!trimmed || trimmed === "/" || trimmed.startsWith("/login")) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(trimmed)}`;
}

/** Alias for callers that prefer redirect_to naming. */
export function buildLoginRedirectPathWithLegacyParam(
  nextPath?: string | null
): string {
  const trimmed = nextPath?.trim();
  if (!trimmed || trimmed === "/" || trimmed.startsWith("/login")) {
    return "/login";
  }
  return `/login?redirect_to=${encodeURIComponent(trimmed)}`;
}

/** Redirect unauthenticated users to the login page. */
export function redirectToLogin(
  router: AppRouterInstance,
  nextPath?: string | null
): void {
  if (typeof window !== "undefined") {
    const pathname = window.location.pathname;
    if (
      pathname.startsWith("/setyourpassword") ||
      pathname.startsWith("/reset-password") ||
      pathname.startsWith("/set-password") ||
      pathname.startsWith("/onboarding")
    ) {
      return;
    }
    if (isPublicAuthFlowPath(pathname) || isExemptFromAuthRedirect(pathname)) {
      return;
    }
    if (hasAuthHashFragment() || hasAuthCodeQuery()) {
      window.location.replace(
        hasAuthCodeQuery()
          ? `/auth/callback${window.location.search}${window.location.hash}`
          : resetPasswordLocationWithHash()
      );
      return;
    }
  }

  if (isPublicAuthFlowPath(nextPath ?? "") || isExemptFromAuthRedirect(nextPath)) {
    return;
  }

  router.replace(buildLoginRedirectPath(nextPath));
}

/** Sign out, clear legacy worker storage, and return to login. */
export async function signOutAndRedirect(nextPath?: string | null): Promise<void> {
  await signOutSupabase();
  if (typeof window !== "undefined") {
    window.location.href = buildLoginRedirectPath(nextPath);
  }
}
