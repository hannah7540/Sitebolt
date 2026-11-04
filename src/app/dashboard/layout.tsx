import type { ReactNode } from "react";
import DashboardLayoutClient from "./DashboardLayoutClient";

/** Authenticated dashboard — never statically cache session-bound UI. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function DashboardLayout({ children }: { children: ReactNode }) {
  return <DashboardLayoutClient>{children}</DashboardLayoutClient>;
}
