"use client";

import { useState } from "react";
import {
  Building2,
  Check,
  ClipboardCheck,
  Clock,
  FileSpreadsheet,
  FolderKanban,
  MapPin,
  MessageSquareText,
  QrCode,
  ReceiptText,
  Shield,
  Truck,
  Users,
} from "lucide-react";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import { cn } from "@/lib/utils";

const TABS = [
  { id: "projects", label: "Live Projects & Jobs", icon: FolderKanban },
  { id: "plant", label: "Plant & Equipment QR", icon: Truck },
  { id: "timesheets", label: "Digital Timesheets & Roster", icon: Clock },
  { id: "compliance", label: "ITP & Safety Compliance", icon: ClipboardCheck },
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

function sidebarActiveFor(tab: PreviewTab): (typeof SIDEBAR_ITEMS)[number]["id"] {
  if (tab === "timesheets") return "accounts";
  if (tab === "plant" || tab === "compliance") return "administration";
  return "projects";
}

export default function TakeALookAround() {
  const [tab, setTab] = useState<PreviewTab>("projects");

  return (
    <section id="preview" className="border-t border-white/10 bg-[#13171B] px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
          Interactive Preview
        </p>
        <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
          <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
            Take a Look Around
          </span>
        </h2>
        <p className="mt-3 max-w-3xl text-base leading-relaxed text-zinc-400">
          Explore how SiteBolt unifies field data, compliance, and asset management in one
          intuitive command center.
        </p>

        <div
          className="mt-8 flex flex-wrap gap-2"
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
                  "inline-flex items-center gap-2 rounded-lg px-3 py-2 text-sm font-semibold transition",
                  selected
                    ? "bg-gradient-to-r from-[#FF6B00] to-[#FF8533] text-white shadow-[0_0_16px_rgba(255,107,0,0.35)]"
                    : "border border-white/10 bg-white/[0.04] text-zinc-200 hover:border-[#FF6B00] hover:text-[#FF8533]"
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
          {tab === "plant" ? (
            <Callout className="right-3 top-16 sm:right-8 sm:top-20">Instant QR Scan</Callout>
          ) : null}
          {tab === "timesheets" ? (
            <Callout className="bottom-8 right-3 sm:bottom-12 sm:right-10">
              One-Click Export
            </Callout>
          ) : null}
          {tab === "compliance" ? (
            <Callout className="right-3 top-24 sm:right-10 sm:top-28">
              Custom Forms Supported
            </Callout>
          ) : null}
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
    <div className="overflow-hidden rounded-2xl border border-white/[0.1] bg-[#1F2429] shadow-[0_0_48px_rgba(255,107,0,0.12)]">
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

      <div className="flex min-h-[420px] flex-col md:min-h-[460px] md:flex-row">
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

        <div className="min-w-0 flex-1 bg-[#1F2429] p-4 sm:p-5">
          {tab === "projects" ? <ProjectsPreview /> : null}
          {tab === "plant" ? <PlantPreview /> : null}
          {tab === "timesheets" ? <TimesheetsPreview /> : null}
          {tab === "compliance" ? <CompliancePreview /> : null}
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
      progress: 72,
      workers: 18,
      status: "In Progress",
    },
    {
      name: "Civic Centre Fit-Out",
      location: "Canberra",
      progress: 41,
      workers: 9,
      status: "Mobilising",
    },
    {
      name: "Quay Street Drainage",
      location: "Auckland",
      progress: 88,
      workers: 12,
      status: "On Track",
    },
  ];

  return (
    <div>
      <HeaderRow title="Live projects" meta="3 active workspaces" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {projects.map((project) => (
          <article
            key={project.name}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4"
          >
            <div className="flex items-start justify-between gap-2">
              <h3 className="text-sm font-bold text-white">{project.name}</h3>
              <span className="shrink-0 rounded-full bg-[#FF6B00]/15 px-2 py-0.5 text-[10px] font-semibold uppercase tracking-wide text-[#FF8533]">
                {project.status}
              </span>
            </div>
            <p className="mt-2 flex items-center gap-1 text-xs text-zinc-400">
              <MapPin className="h-3 w-3 text-[#FF6B00]" />
              {project.location}
            </p>
            <div className="mt-3 h-1.5 overflow-hidden rounded-full bg-white/10">
              <div
                className="h-full rounded-full bg-gradient-to-r from-[#FF6B00] to-[#FF8533]"
                style={{ width: `${project.progress}%` }}
              />
            </div>
            <div className="mt-2 flex items-center justify-between text-[11px] text-zinc-400">
              <span className="inline-flex items-center gap-1">
                <Users className="h-3 w-3" />
                {project.workers} on site
              </span>
              <span className="font-semibold text-white">{project.progress}%</span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function PlantPreview() {
  const fleet = [
    { name: "5.5T Excavator", code: "EX-104", service: "14 days" },
    { name: "Service Truck", code: "ST-22", service: "6 days" },
    { name: "8T Smooth Drum Roller", code: "RL-08", service: "21 days" },
  ];

  return (
    <div>
      <HeaderRow title="Plant & equipment" meta="QR-verified fleet" />
      <div className="mt-4 grid gap-3 sm:grid-cols-3">
        {fleet.map((item) => (
          <article
            key={item.code}
            className="rounded-xl border border-white/[0.08] bg-white/[0.04] p-4"
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
            <div className="mt-4 flex items-center justify-between">
              <p className="text-[11px] text-zinc-400">
                Next service <span className="font-semibold text-white">{item.service}</span>
              </p>
              <span className="inline-flex items-center gap-1 rounded-md border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-2 py-1 text-[10px] font-bold uppercase tracking-wide text-[#FF6B00]">
                <QrCode className="h-3 w-3" />
                QR
              </span>
            </div>
          </article>
        ))}
      </div>
    </div>
  );
}

function TimesheetsPreview() {
  const rows = [
    { crew: "North crew", hours: "42.5", signoff: "Signed", status: "Approved" },
    { crew: "Plant operators", hours: "38.0", signoff: "Signed", status: "Approved" },
    { crew: "Night shift", hours: "21.0", signoff: "Pending", status: "In review" },
  ];

  return (
    <div>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <HeaderRow title="Digital timesheets" meta="Week ending 3 Oct" />
        <span className="inline-flex items-center gap-1.5 rounded-full border border-emerald-400/30 bg-emerald-500/10 px-3 py-1 text-[11px] font-semibold text-emerald-300">
          <FileSpreadsheet className="h-3.5 w-3.5" />
          MYOB export ready
        </span>
      </div>
      <div className="mt-4 overflow-hidden rounded-xl border border-white/[0.08]">
        <table className="w-full text-left text-xs">
          <thead className="bg-white/[0.04] text-[10px] uppercase tracking-wider text-zinc-500">
            <tr>
              <th className="px-3 py-2 font-semibold">Crew</th>
              <th className="px-3 py-2 font-semibold">Hours</th>
              <th className="hidden px-3 py-2 font-semibold sm:table-cell">Daily sign-off</th>
              <th className="px-3 py-2 font-semibold">Status</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-white/[0.06] text-zinc-200">
            {rows.map((row) => (
              <tr key={row.crew}>
                <td className="px-3 py-2.5 font-medium text-white">{row.crew}</td>
                <td className="px-3 py-2.5">{row.hours}</td>
                <td className="hidden px-3 py-2.5 sm:table-cell">{row.signoff}</td>
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

function CompliancePreview() {
  const checks = [
    { label: "Hold point signed", done: true },
    { label: "Photo evidence attached", done: true },
    { label: "ITP item closed", done: true },
  ];

  return (
    <div>
      <HeaderRow title="ITP & safety compliance" meta="Inspection pack" />
      <article className="mt-4 rounded-xl border border-white/[0.08] bg-white/[0.04] p-4 sm:p-5">
        <div className="flex flex-wrap items-start justify-between gap-3">
          <div>
            <h3 className="text-sm font-bold text-white">Stormwater pit inspection — ITC 14</h3>
            <p className="mt-1 text-xs text-zinc-400">Civic Centre Fit-Out · Canberra</p>
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
                className="h-12 w-12 rounded-lg border border-white/10"
                style={{
                  background: `linear-gradient(145deg, ${color}55, #13171B)`,
                }}
              />
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

function HeaderRow({ title, meta }: { title: string; meta: string }) {
  return (
    <div>
      <p className="text-[11px] font-bold uppercase tracking-[0.16em] text-[#FF6B00]">{meta}</p>
      <h3 className="mt-1 text-lg font-bold text-white">{title}</h3>
    </div>
  );
}
