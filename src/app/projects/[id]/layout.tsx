import type { ReactNode } from "react";

/** Project routes share the main admin console; no redirect between sub-routes. */
export default function ProjectRouteLayout({ children }: { children: ReactNode }) {
  return children;
}
