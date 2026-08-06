"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Clock, Scale } from "lucide-react";
import { cn } from "@/lib/utils";

const ACCOUNTS_TABS = [
  {
    label: "Timesheets",
    href: "/accounts/timesheets",
    icon: Clock,
  },
  {
    label: "Pay Rules",
    href: "/accounts/pay-rules",
    icon: Scale,
  },
] as const;

export default function AccountsNav() {
  const pathname = usePathname();

  return (
    <nav className="mb-6 flex flex-wrap gap-2 border-b border-slate-200 pb-3">
      {ACCOUNTS_TABS.map((tab) => {
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
