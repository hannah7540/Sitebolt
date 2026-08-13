import type { AppRouterInstance } from "next/dist/shared/lib/app-router-context.shared-runtime";
import { signOutSupabase } from "@/lib/supabase/auth";

/** Build a login URL preserving the post-auth return path. */
export function buildLoginRedirectPath(nextPath?: string | null): string {
  const trimmed = nextPath?.trim();
  if (!trimmed || trimmed === "/" || trimmed.startsWith("/login")) {
    return "/login";
  }
  return `/login?next=${encodeURIComponent(trimmed)}`;
}

/** Redirect unauthenticated users to the login page. */
export function redirectToLogin(
  router: AppRouterInstance,
  nextPath?: string | null
): void {
  router.replace(buildLoginRedirectPath(nextPath));
}

/** Sign out, clear legacy worker storage, and return to login. */
export async function signOutAndRedirect(nextPath?: string | null): Promise<void> {
  await signOutSupabase();
  if (typeof window !== "undefined") {
    window.location.href = buildLoginRedirectPath(nextPath);
  }
}
