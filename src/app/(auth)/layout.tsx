import type { ReactNode } from "react";

/**
 * Public auth routes — no AdminConsoleShell, no session redirect to /login or /admin.
 * Covers /reset-password, /set-password, /onboarding, and related pages in this group.
 */
export default function AuthGroupLayout({ children }: { children: ReactNode }) {
  return children;
}
