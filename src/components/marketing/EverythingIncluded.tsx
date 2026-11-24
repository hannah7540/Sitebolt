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
import {
  marketingBodyClass,
  marketingGhostButtonClass,
  marketingGlassCardClass,
  marketingHeadingClass,
  marketingOrangeBadgeClass,
  marketingPrimaryButtonClass,
  marketingSectionAltClass,
} from "@/components/marketing/marketing-theme";

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
      "Award and pay rule interpretations for field crews",
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

export default function EverythingIncluded({
  onStartReady,
  onOpenCustomBuild,
}: {
  onStartReady: () => void;
  onOpenCustomBuild: () => void;
}) {
  return (
    <section id="included" className={marketingSectionAltClass}>
      <div className="mx-auto max-w-6xl">
        <p className={marketingOrangeBadgeClass}>Uncompromising Value</p>
        <h2 className={`mt-4 text-3xl sm:text-4xl ${marketingHeadingClass}`}>
          Everything Included. Turn On What You Need.
        </h2>
        <p className={`mt-4 max-w-3xl text-base ${marketingBodyClass}`}>
          No locked modules, no surprise paywalls, and no hidden add-ons. SiteBolt is priced as a
          single, all-inclusive platform. Whether you only need digital plant pre-starts today or
          run all six operational modules across your entire fleet, your price remains the same.
          Pick and choose what fits your workflow now, and activate the rest whenever you&apos;re
          ready.
        </p>

        <div className="mt-8 flex items-start gap-3 rounded-2xl border border-[#F97316]/35 bg-[#F97316]/10 px-4 py-4 sm:px-5">
          <Lightbulb className="mt-0.5 h-5 w-5 shrink-0 text-[#F97316]" />
          <p className="text-sm font-medium leading-relaxed text-[#F8FAFC]">
            One Transparent License: Use 2 modules or use all 20+ features—you get full platform
            access from day one.
          </p>
        </div>

        <div className="mt-8 grid gap-4 md:grid-cols-2 xl:grid-cols-3">
          {PILLARS.map((pillar) => {
            const Icon = pillar.icon;
            return (
              <article key={pillar.title} className={marketingGlassCardClass}>
                <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316]/15 text-[#F97316]">
                  <Icon className="h-5 w-5" />
                </span>
                <h3 className="mt-4 text-lg font-bold text-[#F8FAFC]">{pillar.title}</h3>
                <ul className="mt-4 space-y-2.5 text-sm text-[#CBD5E1]">
                  {pillar.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                      <span>{point}</span>
                    </li>
                  ))}
                </ul>
              </article>
            );
          })}
        </div>

        <div className={`${marketingGlassCardClass} mt-10 px-5 py-8 text-center sm:px-8`}>
          <p className="text-xl font-extrabold text-[#F8FAFC] sm:text-2xl">
            Ready to streamline your field operations?
          </p>
          <div className="mt-6 flex flex-wrap items-center justify-center gap-3">
            <button
              type="button"
              onClick={onStartReady}
              className={marketingPrimaryButtonClass}
            >
              Start with Ready Modules
            </button>
            <button
              type="button"
              onClick={onOpenCustomBuild}
              className={marketingGhostButtonClass}
            >
              Need Custom Software Instead?
            </button>
          </div>
        </div>
      </div>
    </section>
  );
}
