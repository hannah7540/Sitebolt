import type { ReactNode } from "react";

/** Authenticated admin console — never statically cache session-bound UI. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function AdminLayout({ children }: { children: ReactNode }) {
  return children;
}
