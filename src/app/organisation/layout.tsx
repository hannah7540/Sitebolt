import type { ReactNode } from "react";
import OrganisationLayoutClient from "./OrganisationLayoutClient";

/** Authenticated organisation console — never statically cache session-bound UI. */
export const dynamic = "force-dynamic";
export const revalidate = 0;

export default function OrganisationLayout({
  children,
}: {
  children: ReactNode;
}) {
  return <OrganisationLayoutClient>{children}</OrganisationLayoutClient>;
}
