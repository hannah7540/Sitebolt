"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { CalendarSearch, Clock, Scale, UserPlus } from "lucide-react";
import { useAdminConsoleOptional } from "@/contexts/AdminConsoleContext";
import {
  canAccessAccountsArea,
  canAccessPayRules,
  canAddAccountsTimesheets,
  canViewAccountsTimesheets,
} from "@/lib/security-roles";
import { cn } from "@/lib/utils";

export default function AccountsNav() {
  const pathname = usePathname();
  const adminConsole = useAdminConsoleOptional();
  const sessionRole = adminConsole?.sessionRole ?? "general_worker";
  const sessionSecurityRoleRaw = adminConsole?.sessionSecurityRoleRaw ?? null;
  const accountsAccessRole = adminConsole?.accountsAccessRole ?? "disabled";
  const canAccessAccounts = adminConsole?.canAccessAccounts ?? false;

  const tabs = [
    canViewAccountsTimesheets(sessionRole)
      ? {
          label: "Timesheets",
          href: "/accounts/timesheets",
          icon: Clock,
        }
      : null,
    canViewAccountsTimesheets(sessionRole) ||
    canAccessAccountsArea({
      securityRole: sessionRole,
      accountsAccessRole,
      canAccessAccounts,
    })
      ? {
          label: "Missing Timesheet Search",
          href: "/accounts/missing-timesheets",
          icon: CalendarSearch,
        }
      : null,
    canAccessPayRules(sessionRole)
      ? {
          label: "Pay Rules",
          href: "/accounts/pay-rules",
          icon: Scale,
        }
      : null,
    canAddAccountsTimesheets(
      sessionSecurityRoleRaw ?? sessionRole,
      accountsAccessRole,
      canAccessAccounts
    )
      ? {
          label: "Add Timesheets",
          href: "/accounts/add-timesheets",
          icon: UserPlus,
        }
      : null,
  ].filter(Boolean) as Array<{
    label: string;
    href: string;
    icon: typeof Clock;
  }>;

  if (tabs.length === 0) return null;

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {tabs.map((tab) => {
        const isActive =
          pathname === tab.href || pathname?.startsWith(`${tab.href}/`);
        const Icon = tab.icon;

        return (
          <Link
            key={tab.href}
            href={tab.href}
            className={cn(
              "inline-flex items-center gap-2 rounded-lg px-4 py-2 text-sm font-semibold transition",
              isActive
                ? "bg-orange-500 text-white shadow-sm"
                : "bg-white text-slate-700 ring-1 ring-inset ring-slate-200 hover:bg-orange-50 hover:text-orange-700"
            )}
          >
            <Icon className="h-4 w-4" />
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}
