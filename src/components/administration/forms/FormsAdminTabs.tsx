"use client";

import Link from "next/link";
import { cn } from "@/lib/utils";
import { useIncidentUnreadCount } from "@/hooks/useIncidentUnreadCount";

export type FormsAdminTab =
  | "inductions"
  | "rfi"
  | "competencies"
  | "requests"
  | "incidents";

interface FormsAdminTabsProps {
  active: FormsAdminTab;
  unreadIncidents?: number;
}

const TABS: { id: FormsAdminTab; label: string; href: string }[] = [
  { id: "inductions", label: "Inductions", href: "/admin/forms/inductions" },
  { id: "rfi", label: "RFI", href: "/admin/forms/rfi" },
  { id: "requests", label: "Requests", href: "/admin/forms/requests" },
  { id: "incidents", label: "Incidents", href: "/admin/forms/incidents" },
  { id: "competencies", label: "Competencies", href: "/admin/forms/competencies" },
];

export default function FormsAdminTabs({
  active,
  unreadIncidents,
}: FormsAdminTabsProps) {
  const liveUnread = useIncidentUnreadCount(unreadIncidents === undefined);
  const badgeCount =
    typeof unreadIncidents === "number" ? unreadIncidents : liveUnread;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-2xl font-bold text-slate-900">Forms & Registers</h1>
        <p className="mt-1 text-sm text-slate-500">
          Manage induction forms, RFI registers, worker requests, incidents, competency
          matrices, and worker form workflows.
        </p>
      </div>

      <nav className="flex flex-wrap gap-2 border-b border-slate-200 pb-3">
        {TABS.map((tab) => (
          <Link
            key={tab.id}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
              active === tab.id
                ? "bg-orange-600 text-white shadow-sm"
                : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
            )}
          >
            {tab.label}
            {tab.id === "incidents" && badgeCount > 0 ? (
              <span
                className={cn(
                  "rounded-full px-2 py-0.5 text-xs font-bold",
                  active === tab.id
                    ? "bg-white text-red-600"
                    : "bg-red-500 text-white"
                )}
              >
                {badgeCount > 99 ? "99+" : badgeCount}
              </span>
            ) : null}
          </Link>
        ))}
      </nav>
    </div>
  );
}
