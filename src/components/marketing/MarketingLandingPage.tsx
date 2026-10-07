"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  ClipboardCheck,
  FileSpreadsheet,
  MapPinned,
  PlayCircle,
  QrCode,
  ShieldCheck,
  Sparkles,
  Wrench,
} from "lucide-react";
import EnquireNowModal from "@/components/marketing/EnquireNowModal";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import TechAmbientBackdrop from "@/components/marketing/TechAmbientBackdrop";
import { getAppLoginUrl } from "@/lib/site-domains";

const NAV_ITEMS = [
  { id: "features", label: "Features" },
  { id: "custom-build", label: "Custom Build" },
  { id: "demos", label: "Demo Videos" },
  { id: "compliance", label: "Compliance" },
  { id: "about", label: "About" },
] as const;

const HERO_BADGES = ["ACT · NSW · WA · NZ", "31-Day SWMS", "Plant QR", "ITP / ITC"] as const;

const DEMO_TABS = [
  {
    id: "plant",
    label: "Plant & QR Pre-Starts",
    title: "Scan. Inspect. Tag out.",
    body: "Every machine carries a cab sticker QR. Operators complete daily pre-starts on their phone, and tagged-out plant is blocked until a defect is cleared.",
    points: ["2-per-page A4 QR cab stickers", "Photo-backed defect capture", "State-scoped plant registers"],
    icon: QrCode,
  },
  {
    id: "swms",
    label: "31-Day SWMS Cycle",
    title: "Sign-off that never goes stale.",
    body: "Site-specific SWMS stay on a 31-day review cycle with worker consultation, manager signatures, and automatic due reminders.",
    points: ["Company and site-specific SWMS", "Consulted worker sign-off", "Review due tracking"],
    icon: ClipboardCheck,
  },
  {
    id: "timesheets",
    label: "Timesheet & MYOB",
    title: "Audit-ready Fair Work hours.",
    body: "Supervisors approve field timesheets, then accounts export pay-ready files with state-by-state rule mapping.",
    points: ["Batch signatures on submissions", "State pay-rule assignment", "MYOB-ready export"],
    icon: FileSpreadsheet,
  },
  {
    id: "itp",
    label: "ITP / ITC Drawings",
    title: "High-resolution drawings. Pin-accurate ITCs.",
    body: "Inspectors zoom drawings, drop pins, attach photos, and close ITCs against the live ITP — ready for the next audit.",
    points: ["Nested ITP / ITC views", "Deep drawing zoom", "Individual PDF exports"],
    icon: MapPinned,
  },
] as const;

const glassCardClass =
  "rounded-2xl border border-white/[0.08] bg-white/[0.04] p-6 backdrop-blur-md transition duration-200 hover:-translate-y-0.5 hover:border-[#FF6B00]/45 hover:shadow-[0_0_32px_rgba(255,107,0,0.16)]";

const primaryButtonClass =
  "rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF8533] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_24px_rgba(255,107,0,0.45)] transition hover:from-[#FF8533] hover:to-[#FF6B00]";

const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-lg border border-white/15 bg-white/[0.04] px-5 py-3 text-sm font-semibold text-white backdrop-blur-md transition hover:border-[#FF6B00] hover:text-[#FF8533]";

export { SiteBoltMark };

function SiteBoltWordmark() {
  return (
    <div className="flex items-center gap-3">
      <SiteBoltMark />
      <div>
        <p className="text-[15px] font-extrabold tracking-[0.18em] text-white">SITEBOLT</p>
        <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FF6B00]">
          Site Management Software
        </p>
      </div>
    </div>
  );
}

export default function MarketingLandingPage() {
  const searchParams = useSearchParams();
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [activeDemo, setActiveDemo] = useState<(typeof DEMO_TABS)[number]["id"]>("plant");
  const [loginUrl, setLoginUrl] = useState("/login");
  const demo = DEMO_TABS.find((tab) => tab.id === activeDemo) ?? DEMO_TABS[0];
  const DemoIcon = demo.icon;

  useEffect(() => {
    setLoginUrl(getAppLoginUrl());
  }, []);

  useEffect(() => {
    if (searchParams.get("enquire") === "1") {
      setEnquireOpen(true);
    }
  }, [searchParams]);

  const openEnquire = () => setEnquireOpen(true);
  const scrollTo = (id: string) => {
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className="min-h-screen bg-[#13171B] text-white">
      <header className="sticky top-0 z-40 border-b border-white/10 bg-[#13171B]/90 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="#top" className="flex items-center gap-3">
            <SiteBoltMark />
            <div>
              <p className="text-[15px] font-extrabold tracking-[0.18em] text-white">SITEBOLT</p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FF6B00]">
                Site Management Software
              </p>
            </div>
          </a>
          <nav className="hidden items-center gap-5 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className="text-sm font-semibold text-zinc-300 transition hover:text-[#FF8533]"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a href={loginUrl} className={ghostButtonClass + " !px-3 !py-2"}>
              Existing Log In
            </a>
            <button type="button" onClick={openEnquire} className={primaryButtonClass + " !px-3 !py-2"}>
              Enquire Now
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <TechAmbientBackdrop>
          <section className="relative">
            <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-24">
              <div>
                <div className="flex flex-wrap gap-2">
                  {HERO_BADGES.map((badge) => (
                    <span
                      key={badge}
                      className="rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#FF8533]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#38BDF8]">
                  Multi-state operations
                </p>
                <h1 className="mt-3 text-4xl font-extrabold leading-tight sm:text-5xl">
                  <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
                    Civil &amp; Construction Field Operations. Simplified &amp; Compliant.
                  </span>
                </h1>
                <p className="mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg">
                  Purpose-built for civil contractors. End-to-end plant QR verification, 31-day SWMS
                  sign-offs, high-resolution ITP drawings, and audit-ready Fair Work timesheets.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button type="button" onClick={openEnquire} className={primaryButtonClass}>
                    Enquire Now
                  </button>
                  <button type="button" onClick={() => scrollTo("demos")} className={ghostButtonClass}>
                    <PlayCircle className="h-4 w-4" />
                    Watch Platform Demos
                  </button>
                </div>
              </div>
              <div className={glassCardClass}>
                <p className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">
                  Built for the field
                </p>
                <ul className="mt-4 space-y-3 text-sm text-zinc-200">
                  <li>QR plant pre-starts that operators actually complete</li>
                  <li>SWMS consultation and 31-day review evidence</li>
                  <li>ITP / ITC drawings with pin-accurate photos</li>
                  <li>Timesheets that map cleanly into payroll / MYOB</li>
                </ul>
              </div>
            </div>
          </section>
        </TechAmbientBackdrop>

        <section id="features" className="border-t border-white/10 bg-[#1F2429] px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-extrabold text-white">One platform for site control</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              SiteBolt replaces spreadsheets, paper SWMS, and lost plant books with a single
              operational register for plant, people, quality, and hours.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Plant that cannot hide",
                  body: "Assign machines by state and print only the labels you need.",
                },
                {
                  title: "Workers who stay current",
                  body: "Inductions, competencies, and SWMS sign-offs stay attached to the person — not a shared folder.",
                },
                {
                  title: "Audits without the scramble",
                  body: "Timesheet signatures, ITP photos, and SWMS reviews are already filed when the auditor arrives.",
                },
              ].map((item) => (
                <article key={item.title} className={glassCardClass}>
                  <h3 className="font-bold text-white">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-zinc-400">{item.body}</p>
                </article>
              ))}
            </div>
          </div>
        </section>

        <section id="custom-build" className="relative overflow-hidden border-t border-white/10 bg-[#13171B] px-4 py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-64 w-64 rounded-full bg-[#38BDF8]/10 blur-[90px]"
          />
          <div className="relative mx-auto max-w-6xl">
            <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6B00]">
              Built your way
            </p>
            <h2 className="mt-3 text-3xl font-extrabold sm:text-4xl">
              <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
                Turnkey Power. Bespoke Flexibility.
              </span>
            </h2>
            <p className="mt-3 max-w-3xl text-zinc-400">
              Use our field-proven trade modules out of the box, or let us tailor SiteBolt directly
              to your operational blueprint.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className={glassCardClass}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF8533]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-[#FF6B00]/35 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#FF8533]">
                    Instant Setup
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Ready-to-Deploy Modules</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Instant compliance right out of the box. 31-day rolling SWMS, instant QR-scanned
                  plant &amp; asset verification, live digital timesheets, and comprehensive ITP/ITC
                  quality registers.
                </p>
              </article>
              <article className={glassCardClass}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#38BDF8]/15 text-[#38BDF8]">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-[#38BDF8]/35 bg-[#38BDF8]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#38BDF8]">
                    Tailored to Fit
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">Custom Built for Your Operations</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Every contractor runs differently. We engineer custom inspection forms, specialized
                  pay-rule calculators, client-specific sign-off workflows, and custom ERP/accounting
                  integrations built specifically for your team.
                </p>
                <button
                  type="button"
                  onClick={openEnquire}
                  className={`${primaryButtonClass} mt-6`}
                >
                  Request a Custom Build
                </button>
              </article>
            </div>
          </div>
        </section>

        <section id="demos" className="border-y border-white/10 bg-[#1F2429] py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-white">Platform demos</h2>
            <p className="mt-3 max-w-2xl text-zinc-400">
              Switch modules to see how SiteBolt presents in the field and in the office.
            </p>
            <div className="mt-6 flex flex-wrap gap-2">
              {DEMO_TABS.map((tab) => (
                <button
                  key={tab.id}
                  type="button"
                  onClick={() => setActiveDemo(tab.id)}
                  className={
                    activeDemo === tab.id
                      ? "rounded-lg bg-gradient-to-r from-[#FF6B00] to-[#FF8533] px-3 py-2 text-sm font-semibold text-white shadow-[0_0_16px_rgba(255,107,0,0.35)]"
                      : "rounded-lg border border-white/10 bg-white/[0.04] px-3 py-2 text-sm font-semibold text-zinc-200 backdrop-blur-md hover:border-[#FF6B00] hover:text-[#FF8533]"
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <article className={`${glassCardClass} mt-6 grid gap-6 md:grid-cols-[1.1fr_0.9fr] md:items-center`}>
              <div>
                <h3 className="text-2xl font-bold text-white">{demo.title}</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">{demo.body}</p>
                <ul className="mt-4 space-y-2 text-sm text-zinc-200">
                  {demo.points.map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                      {point}
                    </li>
                  ))}
                </ul>
              </div>
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-white/[0.08] bg-[#13171B]/80 p-6 text-center">
                <DemoIcon className="h-12 w-12 text-[#FF6B00]" />
                <p className="mt-3 text-sm font-semibold">{demo.label}</p>
                <p className="mt-1 text-xs text-zinc-400">
                  Interface preview · compliance-ready workflow
                </p>
              </div>
            </article>
          </div>
        </section>

        <section id="compliance" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold text-white">Compliant across states</h2>
          <p className="mt-3 text-sm text-zinc-400">ACT, NSW, WA, and NZ.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Fair Work timesheets with state-by-state pay rules",
              "31-day SWMS review evidence with consulted worker signatures",
              "Plant pre-start and tag-out history retained with the asset",
              "ITP / ITC photo and drawing records ready for principal contractor audits",
            ].map((item) => (
              <p key={item} className={`${glassCardClass} px-4 py-4 text-sm text-zinc-200`}>
                {item}
              </p>
            ))}
          </div>
        </section>

        <section
          id="about"
          className="border-t border-white/10 bg-[#1F2429] px-4 py-16 text-white"
        >
          <div className="mx-auto max-w-6xl">
            <SiteBoltWordmark />
            <h2 className="mt-6 text-3xl font-extrabold">About SITEBOLT</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300">
              SiteBolt is an operational system for civil and construction contractors who need
              plant, SWMS, quality, and payroll evidence in one place — not five apps and a shared
              drive. Built for multi-state operations.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={openEnquire} className={primaryButtonClass}>
                Enquire Now
              </button>
              <a href={loginUrl} className={ghostButtonClass}>
                Existing Log In
              </a>
            </div>
          </div>
        </section>
      </main>

      {enquireOpen ? <EnquireNowModal onClose={() => setEnquireOpen(false)} /> : null}
    </div>
  );
}
