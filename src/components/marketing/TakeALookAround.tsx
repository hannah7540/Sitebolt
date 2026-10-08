"use client";

import { useState } from "react";
import {
  AlertTriangle,
  Building2,
  CalendarDays,
  Check,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  HardHat,
  MapPin,
  MessageSquareText,
  QrCode,
  ReceiptText,
  Shield,
  ShieldCheck,
  Truck,
  Users,
} from "lucide-react";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "projects", label: "Projects & Command Center", icon: FolderKanban },
  { id: "plant", label: "Plant, Fleet & QR Assets", icon: Truck },
  { id: "calendars", label: "Worker & Plant Calendars", icon: CalendarDays },
  { id: "swms", label: "SWMS & Safety Compliance", icon: HardHat },
  { id: "itp", label: "ITP & ITC Quality Assurance", icon: ClipboardCheck },
  { id: "timesheets", label: "Timesheets & Payroll", icon: Clock },
  { id: "organisation", label: "Insurances & Organisation", icon: Building2 },
] as const;

type PreviewTab = (typeof TABS)[number]["id"];

const SIDEBAR_ITEMS = [
  { id: "projects", label: "Projects", icon: FolderKanban },
  { id: "administration", label: "Administration", icon: Shield },
  { id: "subcontractors", label: "Subcontractors", icon: Truck },
  { id: "accounts", label: "Accounts", icon: ReceiptText },
  { id: "communication", label: "Communication", icon: MessageSquareText },
  { id: "organisation", label: "Organisation", icon: Building2 },
] as const;

const CALLOUTS: Partial<Record<PreviewTab, { label: string; className: string }>> = {
  projects: { label: "Live Stage Tracking", className: "right-3 top-16 sm:right-8 sm:top-20" },
  plant: { label: "Mobile QR Instant Scan", className: "right-3 top-16 sm:right-8 sm:top-20" },
  calendars: { label: "Cross-Team Roster", className: "right-3 top-16 sm:right-8 sm:top-20" },
  swms: { label: "Zero Paperwork", className: "bottom-8 right-3 sm:bottom-10 sm:right-10" },
  itp: { label: "Photo Evidence Pins", className: "right-3 top-20 sm:right-10 sm:top-24" },
  timesheets: {
    label: "Award Pay Rules Built-in",
    className: "bottom-8 right-3 sm:bottom-12 sm:right-10",
  },
  organisation: {
    label: "Automated Expiry Warnings",
    className: "right-3 top-16 sm:right-8 sm:top-20",
  },
};

function sidebarActiveFor(tab: PreviewTab): (typeof SIDEBAR_ITEMS)[number]["id"] {
  if (tab === "timesheets") return "accounts";
  if (tab === "organisation") return "organisation";
  if (tab === "projects") return "projects";
  return "administration";
}

export default function TakeALookAround() {
  const [tab, setTab] = useState<PreviewTab>("projects");
  const callout = CALLOUTS[tab];

  return (
    <section id="preview" className="border-t border-slate-200 bg-white px-4 pb-8 pt-16">
      <div className="mx-auto max-w-6xl">
        <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
          Interactive Preview
        </p>
        <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
          Take a Look Around
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-500">
          Explore how SiteBolt unifies field data, compliance, and asset management in one
          intuitive command center.
        </p>

        <div
          className="mt-8 flex snap-x snap-mandatory gap-2 overflow-x-auto pb-2 [-ms-overflow-style:none] [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
          role="tablist"
          aria-label="Platform preview modules"
        >
          {TABS.map((item) => {
            const Icon = item.icon;
            const selected = tab === item.id;
            return (
              <button
                key={item.id}
                type="button"
                role="tab"
                aria-selected={selected}
                onClick={() => setTab(item.id)}
                className={cn(
                  "inline-flex shrink-0 snap-start items-center gap-2 rounded-full px-3 py-2 text-sm font-semibold transition",
                  selected
                    ? "bg-[#FF6B00] text-white hover:bg-[#E66000]"
                    : "border border-slate-200 bg-white text-slate-600 shadow-sm hover:border-[#FF6B00] hover:text-[#FF6B00]"
                )}
              >
                <Icon className="h-4 w-4" />
                {item.label}
              </button>
            );
          })}
        </div>

        <div className="relative mt-8">
          <MockAppFrame tab={tab} />
          {callout ? <Callout className={callout.className}>{callout.label}</Callout> : null}
        </div>
      </div>
    </section>
  );
}

function Callout({
  children,
  className,
}: {
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <div
      className={cn(
        "pointer-events-none absolute z-20 rounded-full border border-[#FF6B00]/50 bg-[#1F2429]/95 px-3 py-1.5 text-[11px] font-bold uppercase tracking-wider text-[#FF6B00] shadow-[0_0_24px_rgba(255,107,0,0.45)]",
        className
      )}
    >
      {children}
    </div>
  );
}

function MockAppFrame({ tab }: { tab: PreviewTab }) {
  const activeNav = sidebarActiveFor(tab);

  return (
    <div className="overflow-hidden rounded-2xl border border-white/10 bg-[#161B20] shadow-[0_0_48px_rgba(255,107,0,0.12)]">
      <div className="flex items-center gap-3 border-b border-white/10 bg-[#13171B] px-4 py-2.5">
        <div className="flex items-center gap-1.5">
          <span className="h-2.5 w-2.5 rounded-full bg-[#FF5F57]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#FEBC2E]" />
          <span className="h-2.5 w-2.5 rounded-full bg-[#28C840]" />
        </div>
        <div className="mx-auto flex min-w-0 max-w-md flex-1 items-center justify-center rounded-full border border-white/10 bg-white/[0.04] px-3 py-1">
          <p className="truncate text-[11px] font-medium tracking-wide text-zinc-400">
            app.site-bolt.com.au/workspace
          </p>
        </div>
      </div>

      <div className="flex min-h-[440px] flex-col md:min-h-[500px] md:flex-row">
        <aside className="flex shrink-0 gap-1 overflow-x-auto border-b border-white/10 bg-[#13171B] px-2 py-2 md:w-[72px] md:flex-col md:items-center md:gap-2 md:overflow-visible md:border-b-0 md:border-r md:py-4">
          <SiteBoltMark className="mb-1 hidden h-8 w-8 md:block" />
          {SIDEBAR_ITEMS.map((item) => {
            const Icon = item.icon;
            const active = item.id === activeNav;
            return (
              <span
                key={item.id}
                title={item.label}
                className={cn(
                  "inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-lg",
                  active
                    ? "bg-[#FF6B00]/20 text-[#FF6B00] shadow-[0_0_12px_rgba(255,107,0,0.35)]"
                    : "text-zinc-500"
                )}
              >
                <Icon className="h-4 w-4" />
                <span className="sr-only">{item.label}</span>
              </span>
            );
          })}
        </aside>

        <div className="min-w-0 flex-1 bg-[#161B20] p-4 sm:p-5">
          {tab === "projects" ? <ProjectsPreview /> : null}
          {tab === "plant" ? <PlantPreview /> : null}
          {tab === "calendars" ? <CalendarsPreview /> : null}
          {tab === "swms" ? <SwmsPreview /> : null}
          {tab === "itp" ? <ItpPreview /> : null}
          {tab === "timesheets" ? <TimesheetsPreview /> : null}
          {tab === "organisation" ? <OrganisationPreview /> : null}
        </div>
      </div>
    </div>
  );
}

function ProjectsPreview() {
  const projects = [
    {
      name: "Pacific Highway Upgrade",
      location: "Sydney",
      stage: "Earthworks",
      progress: 72,
      workers: 18,
      budget: "On budget",
      schedule: "2 days ahead",
      status: "In Progress",
    },
    {
      name: "Civic Centre Fit-Out",
      location: "Canberra",
      stage: "Services rough-in",
      progress: 41,
      workers: 9,
      budget: "3% contingency",
      schedule: "On programme",
      status: "Mobilising",
    },
    {
      name: "Quay Street Drainage",
      location: "Auckland",
      stage: "Commissioning",
      progress: 88,
      workers: 12,
      budget: "Under budget",
      schedule: "Handover Fri",
      status: "On Track",
    },
  ];

  return (
    <div>
      <HeaderRow title="Command center" meta="Active site breakdown" />
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {projects.map((project) => (
          <article
            key={project.name}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-white">{project.name}</h3>
              <span className="shrink-0 rounded-full bg-[#FF6B00]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FF8533]">
                {project.status}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
              <MapPin className="h-3 w-3 text-[#FF6B00]" />
              {project.location} · {project.stage}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533]"
                style={{ width: `${project.progress}%` }}
              />
            </div>
            <div className="mt-3 grid grid-cols-2 gap-2 text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.workers} on site
              </span>
              <span className="text-right font-semibold text-white">{project.progress}%</span>
              <span>{project.budget}</span>
              <span className="text-right text-emerald-400">{project.schedule}</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PlantPreview() {
  const fleet = [
    { name: "5.5T Excavator", code: "EX-104", service: "14 days", last: "Pre-start 06:12" },
    { name: "12T Tipper", code: "TP-09", service: "9 days", last: "Pre-start 06:18" },
    { name: "Dual-cab Ute", code: "UT-31", service: "21 days", last: "Pre-start 05:58" },
  ];

  return (
    <div>
      <HeaderRow title="Plant, fleet & QR assets" meta="Live equipment register" />
      <div className="mt-4 grid gap-3 lg:grid-cols-3">
        {fleet.map((item) => (
          <article
            key={item.code}
            className="rounded-xl border border-white/10 bg-white/[0.04] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <div>
                <h3 className="text-sm font-bold text-white">{item.name}</h3>
                <p className="mt-1 text-[11px] text-zinc-500">{item.code}</p>
              </div>
              <span className="rounded-full bg-emerald-500/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-emerald-400">
                Operational
              </span>
            </div>
            <p className="mt-3 text-[11px] text-zinc-400">{item.last}</p>
            <div className="mt-3 flex items-center justify-between">
              <p className="text-[11px] text-zinc-400">
                Next service <span className="font-semibold text-white">{item.service}</span>
              </p>
              <span className="inline-flex items-center gap-1 rounded-md border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#FF6B00]">
                <QrCode className="h-3 w-3" />
                Scan
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function CalendarsPreview() {
  const days = ["Mon", "Tue", "Wed", "Thu", "Fri"];
  const rows = [
    {
      name: "J. Patel",
      kind: "Worker",
      slots: ["Pacific Hwy", "Pacific Hwy", "Civic Centre", "Civic Centre", "Standby"],
    },
    {
      name: "EX-104",
      kind: "Plant",
      slots: ["Pacific Hwy", "Pacific Hwy", "Yard service", "Quay St", "Quay St"],
    },
    {
      name: "North crew",
      kind: "Team",
      slots: ["Civic Centre", "Civic Centre", "Civic Centre", "RDO", "Civic Centre"],
    },
  ];

  return (
    <div>
      <HeaderRow title="Operational calendar" meta="Worker & plant allocations" />
      <div className="mt-4 overflow-x-auto rounded-xl border border-white/10">
        <table className="w-full min-w-[520px] text-left text-[11px]">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Resource</th>
              {days.map((day) => (
                <th key={day} className="px-3 py-2 font-semibold">
                  {day}
                </th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06]">
            {rows.map((row) => (
              <tr key={row.name}>
                <td className="px-3 py-2.5">
                  <p className="font-semibold text-white">{row.name}</p>
                  <p className="text-zinc-500">{row.kind}</p>
                </td>
                {row.slots.map((slot, index) => (
                  <td key={`${row.name}-${index}`} className="px-2 py-2">
                    <span
                      className={cn(
                        "block rounded-md px-2 py-1 text-center font-medium",
                        slot === "RDO" || slot === "Standby" || slot === "Yard service"
                          ? "bg-white/[0.06] text-zinc-400"
                          : "bg-[#FF6B00]/15 text-[#FF8533]"
                      )}
                    >
                      {slot}
                    </span>
                  </td>
                ))}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function SwmsPreview() {
  const items = [
    { title: "Excavation & trenching", due: "Day 8 / 31", status: "Current" },
    { title: "Working at heights", due: "Day 22 / 31", status: "Due soon" },
    { title: "Hot works — welding", due: "Signed today", status: "Current" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-start justify-between gap-3">
        <HeaderRow title="SWMS & field safety" meta="31-day rolling review" />
        <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-semibold text-emerald-300">
          14 pre-starts complete
        </span>
      </div>
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          {items.map((item) => (
            <article
              key={item.title}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
            >
              <div>
                <h3 className="text-sm font-bold text-white">{item.title}</h3>
                <p className="mt-1 text-[11px] text-zinc-400">{item.due} · 12 worker signatures</p>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  item.status === "Due soon"
                    ? "bg-[#FF6B00]/15 text-[#FF8533]"
                    : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                {item.status}
              </span>
            </article>
          ))}
        </div>
        <article className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="inline-flex items-center gap-1 text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
            <AlertTriangle className="h-3.5 w-3.5" />
            Incident log
          </p>
          <p className="mt-3 text-sm font-semibold text-white">Near miss — reversing plant</p>
          <p className="mt-1 text-xs text-zinc-400">Pacific Hwy · logged 06:41 · photos attached</p>
          <p className="mt-4 text-[11px] text-zinc-500">Zero lost-time injuries this period.</p>
        </article>
      </div>
    </div>
  );
}

function ItpPreview() {
  const checks = [
    { label: "Hold point signed", done: true },
    { label: "Photo evidence pinned", done: true },
    { label: "Spec verification closed", done: true },
  ];

  return (
    <div>
      <HeaderRow title="ITP & ITC quality assurance" meta="Inspection pack" />
      <article className="mt-4 rounded-xl border border-white/10 bg-white/[0.04] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Stormwater pit inspection — ITC 14</h3>
            <p className="mt-1 text-xs text-zinc-400">Civic Centre Fit-Out · ITP 03 — Drainage</p>
          </div>
          <span className="rounded-full bg-emerald-500/15 px-3 py-1 text-[11px] font-bold uppercase tracking-wide text-emerald-400">
            100% compliant
          </span>
        </div>
        <ul className="mt-4 space-y-2">
          {checks.map((item) => (
            <li key={item.label} className="flex items-center gap-2 text-sm text-zinc-200">
              <span className="inline-flex h-5 w-5 items-center justify-center rounded-full bg-emerald-500/20 text-emerald-400">
                <Check className="h-3 w-3" />
              </span>
              {item.label}
            </li>
          ))}
        </ul>
        <div className="mt-5 flex flex-wrap items-center gap-4">
          <div className="flex gap-2">
            {["#FF6B00", "#38BDF8", "#22C55E"].map((color) => (
              <span
                key={color}
                className="relative h-12 w-12 rounded-lg border border-white/10"
                style={{ background: `linear-gradient(145deg, ${color}55, #13171B)` }}
              >
                <span className="absolute -right-1 -top-1 h-3 w-3 rounded-full bg-[#FF6B00] ring-2 ring-[#161B20]" />
              </span>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="inline-flex h-10 w-10 items-center justify-center rounded-full border-2 border-emerald-400/60 text-[9px] font-extrabold uppercase leading-tight text-emerald-300">
              Sign
              <br />
              OK
            </span>
            <p className="text-xs text-zinc-400">
              Supervisor stamp
              <br />
              <span className="text-zinc-300">Verified 07:42</span>
            </p>
          </div>
        </div>
      </article>
    </div>
  );
}

function TimesheetsPreview() {
  const rows = [
    { crew: "North crew", hours: "42.5", award: "Building CI", status: "Approved" },
    { crew: "Plant operators", hours: "38.0", award: "Plant award", status: "Approved" },
    { crew: "Night shift", hours: "21.0", award: "Overtime", status: "In review" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HeaderRow title="Timesheets & payroll" meta="Supervisor approvals" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          Export-ready tally
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/10">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Shift card</th>
              <th className="px-3 py-2 font-semibold">Hours</th>
              <th className="hidden px-3 py-2 font-semibold sm:table-cell">Award rule</th>
              <th className="px-3 py-2 font-semibold">Approval</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-zinc-200">
            {rows.map((row) => (
              <tr key={row.crew}>
                <td className="px-3 py-2.5 font-medium text-white">{row.crew}</td>
                <td className="px-3 py-2.5">{row.hours}</td>
                <td className="hidden px-3 py-2.5 sm:table-cell">{row.award}</td>
                <td className="px-3 py-2.5">
                  <span
                    className={cn(
                      "rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                      row.status === "Approved"
                        ? "bg-emerald-500/15 text-emerald-400"
                        : "bg-[#FF6B00]/15 text-[#FF8533]"
                    )}
                  >
                    {row.status}
                  </span>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function OrganisationPreview() {
  const policies = [
    { name: "Public liability $20m", expires: "18 days", tone: "warn" },
    { name: "Workers compensation", expires: "74 days", tone: "ok" },
    { name: "Plant & motor fleet", expires: "41 days", tone: "ok" },
  ];

  return (
    <div>
      <HeaderRow title="Insurances & organisation" meta="Compliance register" />
      <div className="mt-4 grid gap-3 lg:grid-cols-[1.2fr_0.8fr]">
        <div className="space-y-2">
          {policies.map((policy) => (
            <article
              key={policy.name}
              className="flex items-center justify-between gap-3 rounded-xl border border-white/10 bg-white/[0.04] px-4 py-3"
            >
              <div className="flex items-center gap-2">
                <ShieldCheck className="h-4 w-4 text-[#FF6B00]" />
                <div>
                  <h3 className="text-sm font-bold text-white">{policy.name}</h3>
                  <p className="text-[11px] text-zinc-400">Document vault · PDF attached</p>
                </div>
              </div>
              <span
                className={cn(
                  "shrink-0 rounded-full px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide",
                  policy.tone === "warn"
                    ? "bg-[#FF6B00]/15 text-[#FF8533]"
                    : "bg-emerald-500/15 text-emerald-400"
                )}
              >
                {policy.expires}
              </span>
            </article>
          ))}
        </div>
        <article className="rounded-xl border border-white/10 bg-white/[0.04] p-4">
          <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Subcontractor pack
          </p>
          <p className="mt-3 text-sm font-semibold text-white">6 of 6 current</p>
          <p className="mt-1 text-xs text-zinc-400">
            SWMS, insurance, and induction evidence filed against each company.
          </p>
          <div className="mt-4 h-1.5 overflow-hidden rounded-full bg-white/10">
            <div className="h-full w-full rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533]" />
          </div>
        </article>
      </div>
    </div>
  );
}

function HeaderRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">{meta}</p>
      <h3 className="mt-1 text-lg font-bold text-white">{title}</h3>
    </div>
  );
}
