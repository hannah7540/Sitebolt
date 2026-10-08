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
  "rounded-2xl border border-slate-200 bg-white p-6 shadow-sm transition duration-200 hover:-translate-y-0.5 hover:border-[#FF6B00]/50";

const primaryButtonClass =
  "rounded-lg bg-[#FF6B00] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#E66000]";

const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-[#FF6B00] hover:text-[#FF6B00]";

export { SiteBoltMark };

function SiteBoltWordmark() {
  return (
    <div className="flex items-center gap-3">
      <SiteBoltMark />
      <div>
        <p className="text-[15px] font-extrabold tracking-[0.18em] text-slate-900">SITEBOLT</p>
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
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="#top" className="flex items-center gap-3">
            <SiteBoltMark />
            <div>
              <p className="text-[15px] font-extrabold tracking-[0.18em] text-slate-900">SITEBOLT</p>
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
                className="text-sm font-semibold text-slate-500 transition hover:text-[#FF6B00]"
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
                <h1 className="mt-3 text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
                  Field Operations. Simplified &amp; Compliant.
                </h1>
                <p className="mt-5 text-base leading-relaxed text-slate-500 sm:text-lg">
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
                <ul className="mt-4 space-y-3 text-sm text-slate-600">
                  <li>QR plant pre-starts that operators actually complete</li>
                  <li>SWMS consultation and 31-day review evidence</li>
                  <li>ITP / ITC drawings with pin-accurate photos</li>
                  <li>Timesheets that map cleanly into payroll / MYOB</li>
                </ul>
              </div>
            </div>
          </section>
        </TechAmbientBackdrop>

        <section id="industries" className="border-t border-slate-200 bg-slate-50 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Across Every Industry
            </p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Engineered for Field Operations. Built to Fit Your Sector.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-500">
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
                    <h3 className="mt-3 font-bold text-slate-900">{industry.title}</h3>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className="border-t border-slate-200 bg-white px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <h2 className="text-3xl font-extrabold text-slate-900">One platform for site control</h2>
            <p className="mt-3 max-w-2xl text-slate-500">
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
                  <h3 className="font-bold text-slate-900">{item.title}</h3>
                  <p className="mt-2 text-sm leading-relaxed text-slate-500">{item.body}</p>
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

        <section id="custom-build" className="relative overflow-hidden bg-white px-4 pb-16 pt-8">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#FF6B00]/12 blur-[100px]"
          />
          <div className="relative mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Flexible Software Solutions
            </p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Use Our Proven Platform. Or Let Us Build Yours From Scratch.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-500">
              Choose our ready-to-run construction modules, or commission a completely custom
              software solution built exclusively for your company&apos;s operational blueprint —
              at a fraction of traditional enterprise development costs.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className={`${glassCardClass} flex flex-col`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-slate-100 text-[#FF6B00]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-slate-200 bg-slate-50 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-slate-600">
                    Turnkey &amp; Immediate
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">SiteBolt Standard Suite</h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Deploy our field-proven modules instantly. Complete with rolling 31-day SWMS,
                  instant QR plant verification, live digital timesheets, and ITP/ITC quality
                  control registers.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
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
              <article className="flex flex-col rounded-2xl border-2 border-[#FF6B00] bg-white p-6 shadow-sm">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#FF6B00]/15 text-[#FF6B00]">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-[#FF6B00] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Full Creative Control
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-slate-900">
                  100% Custom Built For Your Business
                </h3>
                <p className="mt-3 text-sm leading-relaxed text-slate-500">
                  Tell us exactly how you want your business to run. We engineer bespoke web and
                  mobile tools built to your exact specifications — giving you proprietary software
                  advantages at a fraction of typical agency costs.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-slate-700">
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
            <p className="mt-6 max-w-3xl text-sm text-slate-500">
              Built by trade tech specialists who understand civil, mechanical, hydraulic, and
              commercial contracting in Australia and New Zealand.
            </p>
          </div>
        </section>

        <section id="compliance" className="border-t border-slate-200 bg-slate-50 px-4 py-16">
          <div className="mx-auto max-w-6xl">
          <h2 className="text-3xl font-extrabold text-slate-900">Compliant across states</h2>
          <p className="mt-3 text-sm text-slate-500">ACT, NSW, WA, and NZ.</p>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Fair Work timesheets with state-by-state pay rules",
              "31-day SWMS review evidence with consulted worker signatures",
              "Plant pre-start and tag-out history retained with the asset",
              "ITP / ITC photo and drawing records ready for principal contractor audits",
            ].map((item) => (
              <p key={item} className={`${glassCardClass} px-4 py-4 text-sm text-slate-700`}>
                {item}
              </p>
            ))}
          </div>
          </div>
        </section>

        <section
          id="about"
          className="border-t border-slate-200 bg-white px-4 py-16 text-slate-900"
        >
          <div className="mx-auto max-w-6xl">
            <SiteBoltWordmark />
            <h2 className="mt-6 text-3xl font-extrabold text-slate-900">About SITEBOLT</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-slate-500">
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

      <SiteFooter />

      {enquireOpen ? <EnquireNowModal onClose={() => setEnquireOpen(false)} /> : null}
      {customBuildOpen ? (
        <CustomBuildModal onClose={() => setCustomBuildOpen(false)} />
      ) : null}
    </div>
  );
}
