"use client";

import { useState, type ReactNode } from "react";
import Link from "next/link";
import { usePathname } from "next/navigation";
import {
  Briefcase,
  LayoutDashboard,
  Menu,
  Truck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";

const NAV_ITEMS = [
  { href: "/subcontractor", label: "Overview", icon: LayoutDashboard },
  { href: "/subcontractor/workers", label: "Workers", icon: Users },
  { href: "/subcontractor/plant", label: "Plant", icon: Truck },
  { href: "/subcontractor/projects", label: "Projects", icon: Briefcase },
] as const;

function isNavActive(href: string, pathname: string): boolean {
  if (href === "/subcontractor") {
    return pathname === "/subcontractor" || pathname === "/subcontractor/dashboard";
  }
  return pathname === href || pathname.startsWith(`${href}/`);
}

export default function SubcontractorPortalShell({
  children,
}: {
  children: ReactNode;
}) {
  const pathname = usePathname() ?? "/subcontractor";
  const [mobileNavOpen, setMobileNavOpen] = useState(false);
  const activeItem = NAV_ITEMS.find((item) => isNavActive(item.href, pathname));

  return (
    <div className="flex min-h-screen bg-slate-50 text-slate-900">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            SiteBolt
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">Subcontractor Portal</p>
          <p className="mt-1 text-sm text-slate-500">Workers, plant, and projects</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Subcontractor sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = isNavActive(item.href, pathname);
            return (
              <Link
                key={item.href}
                href={item.href}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-sm font-semibold transition-colors",
                  active
                    ? "bg-orange-500 text-white"
                    : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </Link>
            );
          })}
        </nav>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center gap-3">
            <button
              type="button"
              className="rounded-lg border border-slate-200 p-2 text-slate-600 lg:hidden"
              onClick={() => setMobileNavOpen((open) => !open)}
              aria-label="Toggle navigation"
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
            <div>
              <h1 className="text-xl font-bold text-slate-900 sm:text-2xl">
                Subcontractor{" "}
                <span className="text-orange-500">{activeItem?.label ?? "Overview"}</span>
              </h1>
              <p className="mt-0.5 text-sm text-slate-500">
                Manage your company details, people, and plant.
              </p>
            </div>
          </div>

          {mobileNavOpen ? (
            <nav className="mt-4 grid gap-2 lg:hidden" aria-label="Subcontractor sections">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = isNavActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    onClick={() => setMobileNavOpen(false)}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                      active
                        ? "bg-orange-500 text-white"
                        : "border border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </Link>
                );
              })}
            </nav>
          ) : (
            <div className="mt-4 flex flex-wrap gap-2 lg:hidden">
              {NAV_ITEMS.map((item) => {
                const active = isNavActive(item.href, pathname);
                return (
                  <Link
                    key={item.href}
                    href={item.href}
                    className={cn(
                      "rounded-full px-3 py-1.5 text-sm font-semibold",
                      active
                        ? "bg-orange-500 text-white"
                        : "border border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    {item.label}
                  </Link>
                );
              })}
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6">{children}</main>
      </div>
    </div>
  );
}
