import type { ReactNode } from "react";

/**
 * Project routes share the main admin console. Never redirect /reset-password,
 * /set-password, /auth/callback, or /onboarding from this layout.
 */
export default function ProjectRouteLayout({ children }: { children: ReactNode }) {
  return children;
}
