"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { useAdminConsole } from "@/contexts/AdminConsoleContext";
import {
  isOrganisationNavActive,
  ORGANISATION_NAV_ITEMS,
} from "@/lib/organisation-nav-routes";
import { canManageSecuritySettings } from "@/lib/security-roles";
import { cn } from "@/lib/utils";

export default function OrganisationSubNav() {
  const pathname = usePathname();
  const { sessionRole } = useAdminConsole();
  const showSecurity = canManageSecuritySettings(sessionRole);

  const items = ORGANISATION_NAV_ITEMS.filter(
    (item) => item.href !== "/organisation/security" || showSecurity
  );

  return (
    <nav
      aria-label="Organisation sections"
      className="relative z-30 -mx-6 mb-6 border-b border-slate-200 bg-white px-6 lg:-mx-8 lg:px-8"
    >
      <div className="pointer-events-auto flex gap-1 overflow-x-auto pb-px">
        {items.map((item) => {
          const active = isOrganisationNavActive(pathname, item.href);
          return (
            <Link
              key={item.href}
              href={item.href}
              className={cn(
                "shrink-0 rounded-t-md px-3 py-2.5 text-sm font-semibold transition-colors",
                active
                  ? "border-b-2 border-orange-500 text-orange-600"
                  : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
              )}
            >
              {item.label}
            </Link>
          );
        })}
      </div>
    </nav>
  );
}
