import {
  Building2,
  Check,
  ClipboardCheck,
  FolderKanban,
  HardHat,
  Lightbulb,
  Timer,
  Tractor,
} from "lucide-react";

const PILLARS = [
  {
    title: "Project Operations & Site Tracking",
    icon: FolderKanban,
    points: [
      "Real-time project dashboard & status stages",
      "Subcontractor management & portal access",
      "Site communication & worker broadcast alerts",
      "Centralized project drawing & document register",
    ],
  },
  {
    title: "Plant, Fleet & QR Asset Management",
    icon: Tractor,
    points: [
      "Machinery & vehicle registry (heavy plant, utes, tools)",
      "One-touch mobile QR code digital pre-start checks",
      "Maintenance logs & automated service interval countdowns",
      "Plant calendar & live job site allocations",
    ],
  },
  {
    title: "Safety, SWMS & Site Compliance",
    icon: HardHat,
    points: [
      "Automated 31-day rolling SWMS review cycles",
      "Digital worker sign-offs with on-site signature capture",
      "Daily digital site pre-starts & safety checklists",
      "Incident & hazard reporting with photo uploads",
    ],
  },
  {
    title: "Timesheets, Rostering & Award Automation",
    icon: Timer,
    points: [
      "Live mobile shift logging with supervisor approval workflows",
      "State-specific award & pay rule interpretations (NSW, ACT, WA, NZ)",
      "One-click export ready for MYOB & major payroll accounting systems",
      "Worker shift calendars & daily crew allocations",
    ],
  },
  {
    title: "Quality Assurance (ITP / ITC / Defect Tracking)",
    icon: ClipboardCheck,
    points: [
      "Full Inspection & Test Plans (ITP) & Checklists (ITC)",
      "Drawing pin locations & geo-tagged inspection points",
      "Real-time photo evidence capture & engineering sign-off records",
      "Non-conformance reporting (NCR) & defect close-outs",
    ],
  },
  {
    title: "Organisation, Compliance & Document Vault",
    icon: Building2,
    points: [
      "Company & subcontractor insurance tracking with automated expiry alerts",
      "Driver's licence, White Card, and high-risk ticket compliance monitoring",
      "Master document packs & exportable compliance records",
      "Custom role-based security & administrative permissions",
    ],
  },
] as const;

const pillarCardClass =
  "rounded-2xl border border-white/[0.08] bg-[#1F2429] p-6 transition duration-200 hover:-translate-y-0.5 hover:border-[#FF6B00]/45 hover:shadow-[0_0_32px_rgba(255,107,0,0.16)]";

export default function EverythingIncluded({
  onStartReady,
  onOpenCustomBuild,
}: {
  onStartReady: () => void;
  onOpenCustomBuild: () => void;
}) {
  return (
    <section id="included" className="border-t border-white/10 bg-[#13171B] px-4 py-16">
      <div className="mx-auto max-w-6xl">
        <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
          Uncompromising Value
        </p>
        <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
          <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
            Everything Included. Turn On What You Need.
          </span>
        </h2>
        <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
          No locked modules, no surprise paywalls, and no hidden add-ons. SiteBolt is priced as a
          single, all-inclusive platform. Whether you only need digital plant pre-starts today or
          run all six operational modules across your entire fleet, your price remains the same.
          Pick and choose what fits your workflow now, and activate the rest whenever you&apos;re
          ready.
        </p>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#FF6B00]/35 bg-[#FF6B00]/10 px-4 py-4 sm:px-5">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[#FF6B00]" />
          <p className="text-sm font-medium leading-relaxed text-zinc-100">
            One Transparent License: Use 2 modules or use all 20+ features—you get full platform
            access from day one.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <article key={pillar.title} className={pillarCardClass}>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF6B00]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-white">{pillar.title}</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-zinc-300">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className="mt-10 rounded-2xl border border-white/[0.08] bg-[#1F2429] px-5 py-8 text-center sm:px-8">
          <p className="text-xl font-extrabold text-white sm:text-2xl">
            Ready to streamline your field operations?
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartReady}
              className="rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF8533] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,107,0,0.45)] transition hover:from-[#FF8533] hover:to-[#FF6B00]"
            >
              Start with Ready Modules
            </button>
            <button
              type="button"
              onClick={onOpenCustomBuild}
              className="inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:border-[#FF6B00] hover:text-[#FF8533]"
            >
              Need Custom Software Instead?
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
