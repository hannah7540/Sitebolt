"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Bell,
  Briefcase,
  Building2,
  HardHat,
  LayoutDashboard,
  Menu,
  Phone,
  Truck,
  Users,
  X,
} from "lucide-react";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

type PrototypeTab = "overview" | "workers" | "plant" | "contacts";

const NAV_ITEMS: { id: PrototypeTab; label: string; icon: typeof LayoutDashboard }[] = [
  { id: "overview", label: "Overview", icon: LayoutDashboard },
  { id: "workers", label: "My Workers", icon: Users },
  { id: "plant", label: "My Plant & Equipment", icon: Truck },
  { id: "contacts", label: "Project Contacts", icon: Phone },
];

const ALERTS = [
  {
    id: "pl-insurance",
    severity: "warning" as const,
    title: "Public Liability Insurance expires in 12 days",
    detail: "Policy APL-PL-88421 is due 2 November 2026. Upload the renewal to stay compliant.",
  },
  {
    id: "competencies",
    severity: "warning" as const,
    title: "2 workers have expiring competencies",
    detail: "James Nguyen (White Card) and Priya Shah (Confined Space) expire within 30 days.",
  },
  {
    id: "generator-service",
    severity: "danger" as const,
    title: "Generator GEN-22 service is overdue",
    detail: "Last service was due 1 October 2026 on Marsden Park. Remove from site until serviced.",
  },
];

const WORKERS = [
  {
    name: "James Nguyen",
    trade: "Plumber",
    project: "Marsden Park",
    swms: "Signed",
  },
  {
    name: "Liam O’Connor",
    trade: "Labourer",
    project: "Marsden Park",
    swms: "Outstanding",
  },
  {
    name: "Priya Shah",
    trade: "Pipe Layer",
    project: "Gungahlin Town Centre",
    swms: "Signed",
  },
  {
    name: "Tom Walsh",
    trade: "Plant Operator",
    project: "Marsden Park",
    swms: "Signed",
  },
];

const PLANT = [
  {
    name: "Scissor Lift SL-14",
    type: "EWP",
    project: "Marsden Park",
    nextService: "12 Nov 2026",
    status: "Scheduled",
  },
  {
    name: "3T Excavator EX-03",
    type: "Excavator",
    project: "Gungahlin Town Centre",
    nextService: "4 Dec 2026",
    status: "Scheduled",
  },
  {
    name: "Generator GEN-22",
    type: "Generator",
    project: "Marsden Park",
    nextService: "1 Oct 2026",
    status: "Overdue",
  },
];

const CONTACTS = [
  {
    name: "David Chen",
    role: "Site Manager",
    project: "Marsden Park",
    phone: "0412 880 114",
    company: "A Plus Plumbing (ACT) PTY LTD",
  },
  {
    name: "Sarah Mitchell",
    role: "Project Supervisor",
    project: "Gungahlin Town Centre",
    phone: "0418 662 309",
    company: "A Plus Plumbing (ACT) PTY LTD",
  },
  {
    name: "Mark Ellis",
    role: "Safety Advisor",
    project: "All assigned projects",
    phone: "0400 551 278",
    company: "A Plus Plumbing (ACT) PTY LTD",
  },
];

function statusBadge(value: string) {
  const tone =
    value === "Signed" || value === "Scheduled"
      ? "bg-emerald-50 text-emerald-700"
      : value === "Outstanding"
        ? "bg-amber-50 text-amber-800"
        : "bg-red-50 text-red-700";
  return (
    <span className={cn("inline-flex rounded-full px-2 py-0.5 text-xs font-semibold", tone)}>
      {value}
    </span>
  );
}

export default function SubcontractorDashboardPrototype() {
  const [tab, setTab] = useState<PrototypeTab>("overview");
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  const title = NAV_ITEMS.find((item) => item.id === tab)?.label ?? "Overview";

  return (
    <div className="flex min-h-screen">
      <aside className="hidden w-72 shrink-0 border-r border-slate-200 bg-white lg:flex lg:flex-col">
        <div className="border-b border-slate-200 px-5 py-5">
          <p className="text-xs font-semibold uppercase tracking-wide text-orange-500">
            SiteBolt Prototype
          </p>
          <p className="mt-1 text-lg font-bold text-slate-900">Apex Civil Hire</p>
          <p className="mt-1 text-sm text-slate-500">Subcontractor Portal</p>
        </div>
        <nav className="flex flex-1 flex-col gap-1 p-3" aria-label="Subcontractor sections">
          {NAV_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                onClick={() => setTab(item.id)}
                className={cn(
                  "flex items-center gap-3 rounded-lg px-3 py-2.5 text-left text-sm font-semibold transition-colors",
                  active
                    ? "bg-orange-500 text-white"
                    : "text-slate-600 hover:bg-orange-50 hover:text-orange-700"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </nav>
        <div className="border-t border-slate-200 p-4 text-xs text-slate-500">
          Assigned to A Plus Plumbing projects. Mock data only — not connected to live records.
        </div>
      </aside>

      <div className="flex min-w-0 flex-1 flex-col">
        <header className="border-b border-slate-200 bg-white px-4 py-4 sm:px-6">
          <div className="flex items-center justify-between gap-3">
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
                  Subcontractor <span className="text-orange-500">{title}</span>
                </h1>
                <p className="mt-0.5 text-sm text-slate-500">
                  Static preview for Apex Civil Hire on A Plus Plumbing sites.
                </p>
              </div>
            </div>
            <span className="hidden rounded-full bg-orange-50 px-3 py-1 text-xs font-semibold text-orange-700 sm:inline-flex">
              Prototype
            </span>
          </div>

          {mobileNavOpen ? (
            <nav className="mt-4 grid gap-2 lg:hidden" aria-label="Subcontractor sections">
              {NAV_ITEMS.map((item) => {
                const Icon = item.icon;
                const active = tab === item.id;
                return (
                  <button
                    key={item.id}
                    type="button"
                    onClick={() => {
                      setTab(item.id);
                      setMobileNavOpen(false);
                    }}
                    className={cn(
                      "flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold",
                      active
                        ? "bg-orange-500 text-white"
                        : "border border-slate-200 bg-white text-slate-600"
                    )}
                  >
                    <Icon className="h-4 w-4" />
                    {item.label}
                  </button>
                );
              })}
            </nav>
          ) : (
            <div
              role="tablist"
              aria-label="Subcontractor dashboard tabs"
              className="mt-4 flex flex-wrap gap-2 lg:hidden"
            >
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  role="tab"
                  aria-selected={tab === item.id}
                  onClick={() => setTab(item.id)}
                  className={cn(
                    "rounded-full px-3 py-1.5 text-sm font-semibold",
                    tab === item.id
                      ? "bg-orange-500 text-white"
                      : "border border-slate-200 bg-white text-slate-600"
                  )}
                >
                  {item.label}
                </button>
              ))}
            </div>
          )}
        </header>

        <main className="flex-1 p-4 sm:p-6">
          {tab === "overview" ? <OverviewSection /> : null}
          {tab === "workers" ? <WorkersSection /> : null}
          {tab === "plant" ? <PlantSection /> : null}
          {tab === "contacts" ? <ContactsSection /> : null}
        </main>
      </div>
    </div>
  );
}

function OverviewSection() {
  return (
    <div className="space-y-6">
      <div className="grid gap-4 sm:grid-cols-3">
        <StatCard icon={Bell} label="Open alerts" value="3" />
        <StatCard icon={HardHat} label="Active workers" value="4" />
        <StatCard icon={Truck} label="Plant on hire" value="3" />
      </div>

      <section className={cn(cardClass, "p-5")}>
        <div className="mb-4 flex items-center gap-2">
          <AlertTriangle className="h-5 w-5 text-orange-500" />
          <h2 className="text-lg font-bold text-slate-900">Compliance alerts</h2>
        </div>
        <ul className="space-y-3">
          {ALERTS.map((alert) => (
            <li
              key={alert.id}
              className={cn(
                "rounded-lg border p-4",
                alert.severity === "danger"
                  ? "border-red-200 bg-red-50"
                  : "border-amber-200 bg-amber-50"
              )}
            >
              <p className="font-semibold text-slate-900">{alert.title}</p>
              <p className="mt-1 text-sm text-slate-600">{alert.detail}</p>
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

function WorkersSection() {
  return (
    <section className={cn(cardClass, "overflow-x-auto")}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Name</th>
            <th className="px-4 py-3">Trade</th>
            <th className="px-4 py-3">Assigned project</th>
            <th className="px-4 py-3">SWMS status</th>
          </tr>
        </thead>
        <tbody>
          {WORKERS.map((worker) => (
            <tr key={worker.name} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{worker.name}</td>
              <td className="px-4 py-3 text-slate-600">{worker.trade}</td>
              <td className="px-4 py-3 text-slate-600">{worker.project}</td>
              <td className="px-4 py-3">{statusBadge(worker.swms)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function PlantSection() {
  return (
    <section className={cn(cardClass, "overflow-x-auto")}>
      <table className="w-full text-left text-sm">
        <thead className="border-b border-slate-200 bg-slate-50 text-xs uppercase tracking-wide text-slate-500">
          <tr>
            <th className="px-4 py-3">Equipment</th>
            <th className="px-4 py-3">Type</th>
            <th className="px-4 py-3">Assigned project</th>
            <th className="px-4 py-3">Next service</th>
            <th className="px-4 py-3">Status</th>
          </tr>
        </thead>
        <tbody>
          {PLANT.map((item) => (
            <tr key={item.name} className="border-b border-slate-100 last:border-0">
              <td className="px-4 py-3 font-medium text-slate-900">{item.name}</td>
              <td className="px-4 py-3 text-slate-600">{item.type}</td>
              <td className="px-4 py-3 text-slate-600">{item.project}</td>
              <td className="px-4 py-3 text-slate-600">{item.nextService}</td>
              <td className="px-4 py-3">{statusBadge(item.status)}</td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}

function ContactsSection() {
  return (
    <div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
      {CONTACTS.map((contact) => (
        <article key={contact.name} className={cn(cardClass, "p-5")}>
          <div className="mb-3 flex h-10 w-10 items-center justify-center rounded-full bg-orange-50 text-orange-600">
            <Building2 className="h-5 w-5" />
          </div>
          <h2 className="text-lg font-bold text-slate-900">{contact.name}</h2>
          <p className="mt-1 text-sm font-semibold text-orange-600">{contact.role}</p>
          <p className="mt-3 flex items-center gap-2 text-sm text-slate-600">
            <Briefcase className="h-4 w-4" />
            {contact.project}
          </p>
          <p className="mt-2 flex items-center gap-2 text-sm text-slate-600">
            <Phone className="h-4 w-4" />
            {contact.phone}
          </p>
          <p className="mt-3 text-xs text-slate-500">{contact.company}</p>
        </article>
      ))}
    </div>
  );
}

function StatCard({
  icon: Icon,
  label,
  value,
}: {
  icon: typeof Bell;
  label: string;
  value: string;
}) {
  return (
    <div className={cn(cardClass, "p-5")}>
      <div className="flex items-center justify-between">
        <p className="text-sm font-medium text-slate-500">{label}</p>
        <Icon className="h-4 w-4 text-orange-500" />
      </div>
      <p className="mt-2 text-3xl font-bold text-slate-900">{value}</p>
    </div>
  );
}
