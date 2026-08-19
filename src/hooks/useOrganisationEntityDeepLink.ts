"use client";

import { useCallback, useMemo } from "react";
import { usePathname, useRouter, useSearchParams } from "next/navigation";
import {
  ORG_DEEP_LINK_PARAMS,
  readOrganisationDeepLink,
  type OrganisationDeepLinkTarget,
} from "@/lib/organisation-alert-navigation";

export function useOrganisationEntityDeepLink() {
  const searchParams = useSearchParams();
  const router = useRouter();
  const pathname = usePathname();

  const target = useMemo(
    () => readOrganisationDeepLink(searchParams),
    [searchParams]
  );

  const hasDeepLink = Boolean(target.id);

  const clearDeepLink = useCallback(() => {
    if (!hasDeepLink) return;
    router.replace(pathname, { scroll: false });
  }, [hasDeepLink, pathname, router]);

  return { target, hasDeepLink, clearDeepLink };
}

export function shouldOpenDeepLinkModal(
  target: OrganisationDeepLinkTarget
): boolean {
  return target.action === "edit" || target.action === "view" || Boolean(target.id);
}

export function scrollToOrganisationRow(rowId: string): void {
  requestAnimationFrame(() => {
    document.getElementById(rowId)?.scrollIntoView({
      behavior: "smooth",
      block: "center",
    });
  });
}

export function organisationRowDomId(prefix: string, entityId: string): string {
  return `${prefix}-row-${entityId}`;
}

export { ORG_DEEP_LINK_PARAMS, type OrganisationDeepLinkTarget };
