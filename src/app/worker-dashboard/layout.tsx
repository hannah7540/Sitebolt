"use client";

import type { ReactNode } from "react";
import AdminConsoleShell from "@/components/layout/AdminConsoleShell";
import { useWebDashboardProfileShell } from "./profile-shell";

/**
 * Profile / worker-dashboard routing wrapper.
 * Web browsers render inside the shared dashboard shell (persistent left sidebar).
 * Native app wrappers and standalone PWAs keep the existing full-screen layout.
 */
export default function WorkerDashboardLayout({
  children,
}: {
  children: ReactNode;
}) {
  const useDashboardShell = useWebDashboardProfileShell();

  if (!useDashboardShell) {
    return children;
  }

  return <AdminConsoleShell>{children}</AdminConsoleShell>;
}
