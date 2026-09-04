import type { ActiveView } from "@/components/Sidebar";

export interface OrganisationNavItem {
  label: string;
  href: string;
  view: ActiveView;
}

export const ORGANISATION_NAV_ITEMS: OrganisationNavItem[] = [
  { label: "Profile Dashboard", href: "/organisation/dashboard", view: "org-dashboard" },
  { label: "Company Information", href: "/organisation/company", view: "org-company" },
  { label: "Insurances", href: "/organisation/insurances", view: "org-insurances" },
  { label: "Projects", href: "/organisation/projects", view: "org-projects" },
  { label: "Workers", href: "/organisation/workers", view: "org-workers" },
  { label: "Inductions", href: "/admin/forms/inductions", view: "org-inductions" },
  { label: "Plant", href: "/organisation/plant", view: "org-plant" },
  { label: "Fleet", href: "/organisation/fleet", view: "org-fleet" },
  { label: "Alerts", href: "/organisation/alerts", view: "org-alerts" },
  { label: "Assets", href: "/organisation/assets", view: "org-assets" },
  { label: "Security Settings", href: "/organisation/security", view: "org-security" },
];

const ORGANISATION_PATH_TO_VIEW = new Map(
  ORGANISATION_NAV_ITEMS.map((item) => [item.href, item.view])
);

export function isInductionsPath(pathname: string | null | undefined): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/+$/, "") || pathname;
  return (
    normalized === "/admin/forms/inductions" ||
    normalized.startsWith("/admin/forms/inductions/")
  );
}

/** Resolve sidebar active view from Organisation nav paths, including Inductions. */
export function resolveOrganisationActiveView(
  pathname: string | null | undefined
): ActiveView | null {
  if (!pathname) return null;

  const normalized = pathname.replace(/\/+$/, "") || pathname;
  const exact = ORGANISATION_PATH_TO_VIEW.get(normalized);
  if (exact) return exact;

  for (const [href, view] of ORGANISATION_PATH_TO_VIEW.entries()) {
    if (normalized.startsWith(`${href}/`)) {
      return view;
    }
  }

  return null;
}

export function isOrganisationNavActive(
  pathname: string | null | undefined,
  href: string
): boolean {
  if (!pathname) return false;
  const normalized = pathname.replace(/\/+$/, "") || pathname;
  return normalized === href || normalized.startsWith(`${href}/`);
}
