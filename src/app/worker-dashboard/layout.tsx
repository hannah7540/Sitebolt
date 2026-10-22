import type { ReactNode } from "react";

/**
 * Worker dashboard stays in its own full-screen shell.
 * Do not wrap this route in the admin console, marketing header, or other
 * navigation that would let a worker leave the dashboard (iOS PWA standalone).
 */
export default function WorkerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  return children;
}
