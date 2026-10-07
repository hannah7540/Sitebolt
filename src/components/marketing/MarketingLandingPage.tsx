"use client";

import { useEffect, useState } from "react";
import { useSearchParams } from "next/navigation";
import {
  Check,
  Factory,
  HardHat,
  Sparkles,
  Tractor,
  Truck,
  Wrench,
  Zap,
} from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";
import CustomBuildModal from "@/components/marketing/CustomBuildModal";
import EnquireNowModal from "@/components/marketing/EnquireNowModal";
import EverythingIncluded from "@/components/marketing/EverythingIncluded";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import TakeALookAround from "@/components/marketing/TakeALookAround";
import TechAmbientBackdrop from "@/components/marketing/TechAmbientBackdrop";
import { getAppLoginUrl } from "@/lib/site-domains";

const NAV_ITEMS = [
  { id: "features", label: "Features" },
  { id: "preview", label: "Take a Look Around" },
  { id: "custom-build", label: "Custom Software" },
] as const;

const INDUSTRIES = [
  { title: "Civil & Construction", icon: HardHat },
  { title: "Transport, Logistics & Fleet", icon: Truck },
  { title: "Facility & Property Maintenance", icon: Wrench },
  { title: "Manufacturing & Warehousing", icon: Factory },
  { title: "Specialist Commercial Trades (Plumbing, Electrical, HVAC)", icon: Zap },
  { title: "Heavy Plant & Equipment Hire", icon: Tractor },
] as const;

const HERO_BADGES = ["ACT · NSW · WA · NZ", "31-Day SWMS", "Plant QR", "ITP / ITC"] as const;

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
  const [customBuildOpen, setCustomBuildOpen] = useState(false);
  const [loginUrl, setLoginUrl] = useState("/login");

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
          <nav className="hidden items-center gap-3 xl:gap-5 lg:flex">
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
                    Field Operations. Simplified &amp; Compliant.
                  </span>
                </h1>
                <p className="mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg">
                  Born on heavy commercial sites. SiteBolt now unifies plant, people, quality, and
                  hours for any business running field teams — construction, logistics, facilities,
                  manufacturing, and specialist trades.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button type="button" onClick={openEnquire} className={primaryButtonClass}>
                    Enquire Now
                  </button>
                  <button type="button" onClick={() => scrollTo("preview")} className={ghostButtonClass}>
                    Take a Look Around
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

        <section id="industries" className="border-t border-white/10 bg-[#1F2429] px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Across Every Industry
            </p>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
              <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
                Engineered for Field Operations. Built to Fit Your Sector.
              </span>
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
              While born on heavy commercial sites, SiteBolt&apos;s workflow engine adapts to any
              business managing mobile teams, physical assets, safety compliance, or custom job
              tracking.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon;
                return (
                  <article key={industry.title} className={glassCardClass}>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF6B00]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 font-bold text-white">{industry.title}</h3>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

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

        <TakeALookAround />

        <EverythingIncluded
          onStartReady={openEnquire}
          onOpenCustomBuild={() => setCustomBuildOpen(true)}
        />

        <section id="custom-build" className="relative overflow-hidden bg-[#13171B] px-4 pb-16 pt-8">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#FF6B00]/12 blur-[100px]"
          />
          <div className="relative mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Flexible Software Solutions
            </p>
            <h2 className="mt-4 text-3xl font-extrabold sm:text-4xl">
              <span className="bg-gradient-to-r from-white via-neutral-100 to-orange-400 bg-clip-text text-transparent">
                Use Our Proven Platform. Or Let Us Build Yours From Scratch.
              </span>
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-zinc-400">
              Choose our ready-to-run construction modules, or commission a completely custom
              software solution built exclusively for your company&apos;s operational blueprint —
              at a fraction of traditional enterprise development costs.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className={`${glassCardClass} flex flex-col`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-white/10 text-white">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-white/20 bg-white/[0.06] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-zinc-200">
                    Turnkey &amp; Immediate
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">SiteBolt Standard Suite</h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-400">
                  Deploy our field-proven modules instantly. Complete with rolling 31-day SWMS,
                  instant QR plant verification, live digital timesheets, and ITP/ITC quality
                  control registers.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-zinc-200">
                  {[
                    "Instant workspace onboarding",
                    "Pre-configured compliance & safety workflows",
                    "Built-in MYOB & payroll time tracking",
                    "Standard subscription pricing",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => scrollTo("preview")}
                    className={`${ghostButtonClass} w-full justify-center sm:w-auto`}
                  >
                    Explore Modules
                  </button>
                </div>
              </article>
              <article className="flex flex-col rounded-2xl border-2 border-[#FF6B00] bg-white/[0.04] p-6 backdrop-blur-md shadow-[0_0_42px_rgba(255,107,0,0.28)]">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF6B00]">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-[#FF6B00] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Full Creative Control
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-white">
                  100% Custom Built For Your Business
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-zinc-300">
                  Tell us exactly how you want your business to run. We engineer bespoke web and
                  mobile tools built to your exact specifications — giving you proprietary software
                  advantages at a fraction of typical agency costs.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-zinc-200">
                  {[
                    "Complete creative control over features, layouts & workflows",
                    "Custom forms, custom calculation engines & proprietary reporting",
                    "Direct integrations into your existing legacy tools & databases",
                    "Enterprise-grade architecture without the $100k+ agency price tag",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => setCustomBuildOpen(true)}
                    className={`${primaryButtonClass} w-full sm:w-auto`}
                  >
                    Tell Us What You Need
                  </button>
                </div>
              </article>
            </div>
            <p className="mt-6 max-w-3xl text-sm text-zinc-500">
              Built by trade tech specialists who understand civil, mechanical, hydraulic, and
              commercial contracting in Australia and New Zealand.
            </p>
          </div>
        </section>

        <section id="compliance" className="border-t border-white/10 px-4 py-16">
          <div className="mx-auto max-w-6xl">
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
              SiteBolt is an operational system for any organisation managing field teams, physical
              assets, safety compliance, and job tracking — not five apps and a shared drive. Born
              on civil sites. Built for multi-industry operations across Australia and New Zealand.
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

      <SiteFooter variant="dark" />

      {enquireOpen ? <EnquireNowModal onClose={() => setEnquireOpen(false)} /> : null}
      {customBuildOpen ? (
        <CustomBuildModal onClose={() => setCustomBuildOpen(false)} />
      ) : null}
    </div>
  );
}
