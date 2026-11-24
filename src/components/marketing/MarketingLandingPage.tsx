"use client";

import { useEffect, useState } from "react";
import Image from "next/image";
import Link from "next/link";
import { useSearchParams } from "next/navigation";
import {
  ArrowRight,
  Check,
  Factory,
  HardHat,
  Menu,
  Sparkles,
  Tractor,
  Truck,
  Wrench,
  X,
  Zap,
} from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";
import CampSpotlightPreview from "@/components/marketing/CampSpotlightPreview";
import CustomBuildModal from "@/components/marketing/CustomBuildModal";
import EnquireNowModal from "@/components/marketing/EnquireNowModal";
import EverythingIncluded from "@/components/marketing/EverythingIncluded";
import {
  marketingBadgeClass,
  marketingBodyClass,
  marketingBrandMarkClass,
  marketingBrandSubClass,
  marketingGhostButtonClass,
  marketingGlassCardClass,
  marketingHeaderClass,
  marketingHeadingClass,
  marketingMutedClass,
  marketingNavLinkClass,
  marketingOrangeBadgeClass,
  marketingPageClass,
  marketingPrimaryButtonClass,
  marketingSectionAltClass,
  marketingSectionClass,
} from "@/components/marketing/marketing-theme";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import TakeALookAround from "@/components/marketing/TakeALookAround";
import TechAmbientBackdrop from "@/components/marketing/TechAmbientBackdrop";

const NAV_ITEMS = [
  { id: "features", label: "Features" },
  { id: "preview", label: "Take a Look Around" },
  { id: "custom-build", label: "Custom Software" },
  { id: "download", label: "Get the App" },
] as const;

const APP_DOWNLOAD_QR_CODES = [
  {
    src: "/apple-qr.jpg",
    label: "iOS",
    alt: "QR code to download SiteBolt on iPhone and iPad",
  },
  {
    src: "/android-qr.jpg",
    label: "Android",
    alt: "QR code to download SiteBolt on Android",
  },
] as const;

const INDUSTRIES = [
  { title: "Civil & Construction", icon: HardHat },
  { title: "Transport, Logistics & Fleet", icon: Truck },
  { title: "Facility & Property Maintenance", icon: Wrench },
  { title: "Manufacturing & Warehousing", icon: Factory },
  { title: "Specialist Commercial Trades (Plumbing, Electrical, HVAC)", icon: Zap },
  { title: "Heavy Plant & Equipment Hire", icon: Tractor },
] as const;

const HERO_BADGES = ["31-Day SWMS", "Plant QR", "ITP / ITC"] as const;

export { SiteBoltMark };

function SiteBoltWordmark() {
  return (
    <div className="flex items-center gap-3">
      <SiteBoltMark />
      <div>
        <p className={marketingBrandMarkClass}>SITEBOLT</p>
        <p className={marketingBrandSubClass}>Site Management Software</p>
      </div>
    </div>
  );
}

export default function MarketingLandingPage() {
  const searchParams = useSearchParams();
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [customBuildOpen, setCustomBuildOpen] = useState(false);
  const [mobileNavOpen, setMobileNavOpen] = useState(false);

  useEffect(() => {
    if (searchParams.get("enquire") === "1") {
      setEnquireOpen(true);
    }
  }, [searchParams]);

  const openEnquire = () => setEnquireOpen(true);
  const scrollTo = (id: string) => {
    setMobileNavOpen(false);
    document.getElementById(id)?.scrollIntoView({ behavior: "smooth", block: "start" });
  };

  return (
    <div className={marketingPageClass}>
      <header className={marketingHeaderClass}>
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <a href="#top" className="flex items-center gap-3">
            <SiteBoltMark />
            <div>
              <p className={marketingBrandMarkClass}>SITEBOLT</p>
              <p className={marketingBrandSubClass}>Site Management Software</p>
            </div>
          </a>
          <nav className="hidden items-center gap-3 xl:gap-5 lg:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className={marketingNavLinkClass}
              >
                {item.label}
              </button>
            ))}
            <Link href="/modules/camp-management" className={marketingNavLinkClass}>
              Camp Management
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link
              href="/login"
              className={`${marketingGhostButtonClass} !px-3 !py-2 hidden sm:inline-flex`}
            >
              Existing Log In
            </Link>
            <button
              type="button"
              onClick={openEnquire}
              className={`${marketingPrimaryButtonClass} !px-3 !py-2`}
            >
              Enquire Now
            </button>
            <button
              type="button"
              className="inline-flex rounded-lg border border-[rgba(148,163,184,0.28)] p-2 text-[#CBD5E1] lg:hidden"
              aria-label={mobileNavOpen ? "Close menu" : "Open menu"}
              onClick={() => setMobileNavOpen((open) => !open)}
            >
              {mobileNavOpen ? <X className="h-5 w-5" /> : <Menu className="h-5 w-5" />}
            </button>
          </div>
        </div>
        {mobileNavOpen ? (
          <div className="border-t border-[rgba(148,163,184,0.16)] bg-[#0F172A]/95 px-4 py-4 backdrop-blur-md lg:hidden">
            <div className="mx-auto flex max-w-6xl flex-col gap-2">
              {NAV_ITEMS.map((item) => (
                <button
                  key={item.id}
                  type="button"
                  onClick={() => scrollTo(item.id)}
                  className="rounded-lg px-3 py-2 text-left text-sm font-semibold text-[#CBD5E1] hover:bg-[#1E293B] hover:text-[#38BDF8]"
                >
                  {item.label}
                </button>
              ))}
              <Link
                href="/modules/camp-management"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#CBD5E1] hover:bg-[#1E293B] hover:text-[#38BDF8]"
                onClick={() => setMobileNavOpen(false)}
              >
                Camp Management
              </Link>
              <Link
                href="/login"
                className="rounded-lg px-3 py-2 text-sm font-semibold text-[#CBD5E1] hover:bg-[#1E293B] hover:text-[#38BDF8] sm:hidden"
                onClick={() => setMobileNavOpen(false)}
              >
                Existing Log In
              </Link>
            </div>
          </div>
        ) : null}
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
                      className="rounded-full border border-[#F97316]/35 bg-[#F97316]/10 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#FB923C]"
                    >
                      {badge}
                    </span>
                  ))}
                </div>
                <p className="mt-5 text-xs font-bold uppercase tracking-[0.18em] text-[#38BDF8]">
                  Field operations software
                </p>
                <h1
                  className={`mt-3 text-4xl leading-tight sm:text-5xl ${marketingHeadingClass}`}
                >
                  Field Operations. Simplified &amp; Compliant.
                </h1>
                <p className={`mt-5 text-base sm:text-lg ${marketingBodyClass}`}>
                  Born on heavy commercial sites. SiteBolt now unifies plant, people, quality, and
                  hours for any business running field teams — construction, logistics, facilities,
                  manufacturing, and specialist trades.
                </p>
                <div className="mt-8 flex flex-wrap gap-3">
                  <button
                    type="button"
                    onClick={openEnquire}
                    className={marketingPrimaryButtonClass}
                  >
                    Enquire Now
                  </button>
                  <button
                    type="button"
                    onClick={() => scrollTo("preview")}
                    className={marketingGhostButtonClass}
                  >
                    Take a Look Around
                  </button>
                </div>
              </div>
              <div className={marketingGlassCardClass}>
                <p className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
                  Built for the field
                </p>
                <ul className={`mt-4 space-y-3 text-sm ${marketingBodyClass}`}>
                  <li>QR plant pre-starts that operators actually complete</li>
                  <li>SWMS consultation and 31-day review evidence</li>
                  <li>ITP / ITC drawings with pin-accurate photos</li>
                  <li>Timesheets that map cleanly into payroll / MYOB</li>
                </ul>
              </div>
            </div>
          </section>
        </TechAmbientBackdrop>

        <section id="camp-spotlight" className={marketingSectionAltClass}>
          <div className="mx-auto grid max-w-6xl gap-10 lg:grid-cols-2 lg:items-center">
            <div>
              <p className={marketingBadgeClass}>
                Custom Module Spotlight{" "}
                <span className="mx-2 text-[#38BDF8]/50">//</span> Built Around Your Operation
              </p>
              <h2
                className={`mt-4 text-3xl leading-tight sm:text-4xl ${marketingHeadingClass}`}
              >
                See How Far Site-Bolt Adapts: 50–500+ Room Camp Management
              </h2>
              <p className={`mt-4 text-base ${marketingBodyClass}`}>
                Site-Bolt isn&apos;t rigid off-the-shelf software. This complete multi-role
                accommodation module was built to run modular camps of{" "}
                <span className="font-semibold text-[#F8FAFC]">
                  50 to 500+ rooms — built for unlimited scale
                </span>
                , uniting bookings, automated mobile check-in, interactive site mapping, gatehouse
                security, catering, housekeeping, and progress claims in one live platform.
              </p>
              <div className="mt-8">
                <Link
                  href="/modules/camp-management"
                  className={`${marketingPrimaryButtonClass} inline-flex items-center gap-2`}
                >
                  Explore the Camp Module
                  <ArrowRight className="h-4 w-4" />
                </Link>
              </div>
            </div>
            <CampSpotlightPreview />
          </div>
        </section>

        <section id="industries" className={marketingSectionClass}>
          <div className="mx-auto max-w-6xl">
            <p className={marketingOrangeBadgeClass}>Across Every Industry</p>
            <h2 className={`mt-4 text-3xl sm:text-4xl ${marketingHeadingClass}`}>
              Engineered for Field Operations. Built to Fit Your Sector.
            </h2>
            <p className={`mt-4 max-w-3xl text-base ${marketingBodyClass}`}>
              While born on heavy commercial sites, SiteBolt&apos;s workflow engine adapts to any
              business managing mobile teams, physical assets, safety compliance, or custom job
              tracking.
            </p>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {INDUSTRIES.map((industry) => {
                const Icon = industry.icon;
                return (
                  <article key={industry.title} className={marketingGlassCardClass}>
                    <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316]/15 text-[#F97316]">
                      <Icon className="h-5 w-5" />
                    </span>
                    <h3 className="mt-3 font-bold text-[#F8FAFC]">{industry.title}</h3>
                  </article>
                );
              })}
            </div>
          </div>
        </section>

        <section id="features" className={marketingSectionAltClass}>
          <div className="mx-auto max-w-6xl">
            <h2 className={`text-3xl ${marketingHeadingClass}`}>One platform for site control</h2>
            <p className={`mt-3 max-w-2xl ${marketingBodyClass}`}>
              SiteBolt replaces spreadsheets, paper SWMS, and lost plant books with a single
              operational register for plant, people, quality, and hours.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-3">
              {[
                {
                  title: "Plant that cannot hide",
                  body: "Assign machines and print only the labels you need.",
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
                <article key={item.title} className={marketingGlassCardClass}>
                  <h3 className="font-bold text-[#F8FAFC]">{item.title}</h3>
                  <p className={`mt-2 text-sm ${marketingBodyClass}`}>{item.body}</p>
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

        <section id="custom-build" className={`relative overflow-hidden ${marketingSectionClass}`}>
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#F97316]/12 blur-[100px]"
          />
          <div className="relative mx-auto max-w-6xl">
            <p className={marketingOrangeBadgeClass}>Flexible Software Solutions</p>
            <h2 className={`mt-4 text-3xl sm:text-4xl ${marketingHeadingClass}`}>
              Use Our Proven Platform. Or Let Us Build Yours From Scratch.
            </h2>
            <p className={`mt-4 max-w-3xl text-base ${marketingBodyClass}`}>
              Choose our ready-to-run construction modules, or commission a completely custom
              software solution built exclusively for your company&apos;s operational blueprint —
              at a fraction of traditional enterprise development costs.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              <article className={`${marketingGlassCardClass} flex flex-col`}>
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#1E293B] text-[#F97316]">
                    <Sparkles className="h-5 w-5" />
                  </span>
                  <span className="rounded-full border border-[rgba(148,163,184,0.24)] bg-[#0F172A]/80 px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-[#94A3B8]">
                    Turnkey &amp; Immediate
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-[#F8FAFC]">SiteBolt Standard Suite</h3>
                <p className={`mt-3 text-sm ${marketingBodyClass}`}>
                  Deploy our field-proven modules instantly. Complete with rolling 31-day SWMS,
                  instant QR plant verification, live digital timesheets, and ITP/ITC quality
                  control registers.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-[#CBD5E1]">
                  {[
                    "Instant workspace onboarding",
                    "Pre-configured compliance & safety workflows",
                    "Built-in MYOB & payroll time tracking",
                    "Standard subscription pricing",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => scrollTo("preview")}
                    className={`${marketingGhostButtonClass} w-full justify-center sm:w-auto`}
                  >
                    Explore Modules
                  </button>
                </div>
              </article>
              <article className="flex flex-col rounded-2xl border-2 border-[#F97316] bg-[#1E293B]/70 p-6 shadow-sm backdrop-blur-md">
                <div className="flex items-center justify-between gap-3">
                  <span className="inline-flex h-10 w-10 items-center justify-center rounded-xl bg-[#F97316]/15 text-[#F97316]">
                    <Wrench className="h-5 w-5" />
                  </span>
                  <span className="rounded-full bg-[#F97316] px-3 py-1 text-[11px] font-semibold uppercase tracking-wider text-white">
                    Full Creative Control
                  </span>
                </div>
                <h3 className="mt-4 text-xl font-bold text-[#F8FAFC]">
                  100% Custom Built For Your Business
                </h3>
                <p className={`mt-3 text-sm ${marketingBodyClass}`}>
                  Tell us exactly how you want your business to run. We engineer bespoke web and
                  mobile tools built to your exact specifications — giving you proprietary software
                  advantages at a fraction of typical agency costs.
                </p>
                <ul className="mt-5 space-y-2.5 text-sm text-[#CBD5E1]">
                  {[
                    "Complete creative control over features, layouts & workflows",
                    "Custom forms, custom calculation engines & proprietary reporting",
                    "Direct integrations into your existing legacy tools & databases",
                    "Enterprise-grade architecture without the $100k+ agency price tag",
                  ].map((point) => (
                    <li key={point} className="flex items-start gap-2">
                      <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#F97316]" />
                      {point}
                    </li>
                  ))}
                </ul>
                <div className="mt-auto pt-6">
                  <button
                    type="button"
                    onClick={() => setCustomBuildOpen(true)}
                    className={`${marketingPrimaryButtonClass} w-full sm:w-auto`}
                  >
                    Tell Us What You Need
                  </button>
                </div>
              </article>
            </div>
            <p className={`mt-6 max-w-3xl text-sm ${marketingMutedClass}`}>
              Built by trade tech specialists who understand civil, mechanical, hydraulic, and
              commercial contracting.
            </p>

            <Link
              href="/modules/camp-management"
              className="mt-8 flex flex-col gap-4 rounded-2xl border border-sky-400/30 bg-gradient-to-br from-[#2563EB]/20 via-[#1E293B]/60 to-[#0F172A] p-6 backdrop-blur-md transition hover:-translate-y-0.5 hover:border-sky-400/50 sm:flex-row sm:items-center sm:justify-between"
            >
              <div className="max-w-3xl">
                <p className="text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#38BDF8]">
                  Custom Module Showcase
                </p>
                <h3 className="mt-2 text-xl font-bold text-[#F8FAFC]">
                  Workforce Accommodation &amp; Camp Management
                </h3>
                <p className={`mt-2 text-sm ${marketingBodyClass}`}>
                  Need something specific? See how we built a complete 50–500+ room Camp Management
                  Module inside Site-Bolt — bookings, check-ins, site mapping, gatehouse, catering,
                  housekeeping, and progress claims.
                </p>
              </div>
              <span className="inline-flex shrink-0 items-center gap-2 self-start rounded-lg bg-[#F97316] px-4 py-2.5 text-sm font-semibold text-white sm:self-center">
                View showcase
                <ArrowRight className="h-4 w-4" />
              </span>
            </Link>
          </div>
        </section>

        <section id="compliance" className={marketingSectionAltClass}>
          <div className="mx-auto max-w-6xl">
            <h2 className={`text-3xl ${marketingHeadingClass}`}>Audit-ready compliance</h2>
            <p className={`mt-3 text-sm ${marketingMutedClass}`}>
              Evidence that is already filed when the auditor arrives.
            </p>
            <div className="mt-8 grid gap-4 md:grid-cols-2">
              {[
                "Fair Work timesheets with automated pay rules",
                "31-day SWMS review evidence with consulted worker signatures",
                "Plant pre-start and tag-out history retained with the asset",
                "ITP / ITC photo and drawing records ready for principal contractor audits",
              ].map((item) => (
                <p
                  key={item}
                  className={`${marketingGlassCardClass} px-4 py-4 text-sm text-[#CBD5E1]`}
                >
                  {item}
                </p>
              ))}
            </div>
          </div>
        </section>

        <section id="about" className={marketingSectionClass}>
          <div className="mx-auto max-w-6xl">
            <SiteBoltWordmark />
            <h2 className={`mt-6 text-3xl ${marketingHeadingClass}`}>About SITEBOLT</h2>
            <p className={`mt-4 max-w-3xl text-sm ${marketingBodyClass}`}>
              SiteBolt is an operational system for any organisation managing field teams, physical
              assets, safety compliance, and job tracking — not five apps and a shared drive. Born
              on civil sites. Built for multi-industry field operations.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button type="button" onClick={openEnquire} className={marketingPrimaryButtonClass}>
                Enquire Now
              </button>
              <Link href="/login" className={marketingGhostButtonClass}>
                Existing Log In
              </Link>
            </div>
          </div>
        </section>

        <section id="download" className={marketingSectionAltClass}>
          <div className="mx-auto max-w-6xl">
            <p className={marketingOrangeBadgeClass}>Mobile App</p>
            <h2 className={`mt-4 text-3xl sm:text-4xl ${marketingHeadingClass}`}>
              Download Site-Bolt
            </h2>
            <p className={`mt-3 max-w-2xl text-base ${marketingBodyClass}`}>
              Scan to download on iOS or Android. Open the camera on your phone and point it at
              the code for your device.
            </p>
            <div className="mt-8 grid gap-4 sm:grid-cols-2">
              {APP_DOWNLOAD_QR_CODES.map((item) => (
                <article
                  key={item.src}
                  className={`${marketingGlassCardClass} flex flex-col items-center text-center`}
                >
                  <p className="text-xs font-bold uppercase tracking-wider text-[#F97316]">
                    {item.label}
                  </p>
                  <div className="mt-4 overflow-hidden rounded-xl border border-[rgba(148,163,184,0.16)] bg-white p-3">
                    <Image
                      src={item.src}
                      alt={item.alt}
                      width={220}
                      height={220}
                      className="h-auto w-44 max-w-full sm:w-52"
                    />
                  </div>
                  <p className="mt-4 text-sm font-semibold text-[#F8FAFC]">Scan to install</p>
                  <p className={`mt-1 text-xs ${marketingMutedClass}`}>
                    {item.label === "iOS"
                      ? "App Store for iPhone and iPad"
                      : "Google Play or Android install"}
                  </p>
                </article>
              ))}
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
