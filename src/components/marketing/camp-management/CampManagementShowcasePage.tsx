"use client";

import { useState } from "react";
import Link from "next/link";
import { ArrowRight, Check, ChevronDown } from "lucide-react";
import SiteFooter from "@/components/layout/SiteFooter";
import CampMapPreview from "@/components/marketing/camp-management/CampMapPreview";
import CampRoleExplorer from "@/components/marketing/camp-management/CampRoleExplorer";
import CustomBuildModal from "@/components/marketing/CustomBuildModal";
import EnquireNowModal from "@/components/marketing/EnquireNowModal";
import SiteBoltMark from "@/components/marketing/SiteBoltMark";
import TechAmbientBackdrop from "@/components/marketing/TechAmbientBackdrop";

const primaryButtonClass =
  "rounded-lg bg-[#FF6B00] px-5 py-3 text-sm font-semibold text-white transition hover:bg-[#E66000]";

const ghostButtonClass =
  "inline-flex items-center gap-2 rounded-lg border border-slate-200 bg-white px-5 py-3 text-sm font-semibold text-slate-900 shadow-sm transition hover:border-[#FF6B00] hover:text-[#FF6B00]";

const WORKFLOW_STEPS = [
  { step: "01", title: "Room Request & Approval" },
  { step: "02", title: "Auto Email & SMS Invite" },
  { step: "03", title: "Pre-Arrival Mobile Check-In" },
  { step: "04", title: "Live Gatehouse, Kitchen & Cleaners Sync" },
  { step: "05", title: "One-Click Progress Claims" },
] as const;

const CUSTOMISATION_POINTS = [
  "Custom workflows tailored to your exact site operations — not rigid off-the-shelf modules",
  "No per-module lock-in: extend Site-Bolt around how your teams already work",
  "Runs on the PCs, iPads, and phones you already have on site",
  "Continuous updates as your project scales from 50 to 500+ rooms",
] as const;

export default function CampManagementShowcasePage() {
  const [enquireOpen, setEnquireOpen] = useState(false);
  const [customBuildOpen, setCustomBuildOpen] = useState(false);

  const scrollToPreview = () => {
    document.getElementById("interactive-preview")?.scrollIntoView({
      behavior: "smooth",
      block: "start",
    });
  };

  return (
    <div className="min-h-screen bg-white text-slate-900">
      <header className="sticky top-0 z-40 border-b border-slate-200 bg-white/80 backdrop-blur-md">
        <div className="mx-auto flex max-w-6xl items-center justify-between gap-4 px-4 py-3">
          <Link href="/" className="flex items-center gap-3">
            <SiteBoltMark />
            <div>
              <p className="text-[15px] font-extrabold tracking-[0.18em] text-slate-900">
                SITEBOLT
              </p>
              <p className="text-[10px] font-semibold uppercase tracking-[0.16em] text-[#FF6B00]">
                Site Management Software
              </p>
            </div>
          </Link>
          <nav className="hidden items-center gap-4 lg:flex">
            <Link
              href="/#custom-build"
              className="text-sm font-semibold text-slate-500 transition hover:text-[#FF6B00]"
            >
              Custom Software
            </Link>
            <Link
              href="/modules/camp-management"
              className="text-sm font-semibold text-[#FF6B00]"
            >
              Camp Management
            </Link>
          </nav>
          <div className="flex items-center gap-2">
            <Link href="/login" className={ghostButtonClass + " !px-3 !py-2"}>
              Existing Log In
            </Link>
            <button
              type="button"
              onClick={() => setEnquireOpen(true)}
              className={primaryButtonClass + " !px-3 !py-2"}
            >
              Enquire Now
            </button>
          </div>
        </div>
      </header>

      <main>
        <TechAmbientBackdrop>
          <section className="relative">
            <div className="mx-auto max-w-6xl px-4 py-16 md:py-24">
              <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
                Custom Module Showcase{" "}
                <span className="mx-2 text-[#FF6B00]/50">//</span> Built To Fit Your Site
              </p>
              <h1 className="mt-5 max-w-4xl text-4xl font-extrabold leading-tight text-slate-900 sm:text-5xl">
                Workforce Camp &amp; Accommodation Management
              </h1>
              <p className="mt-5 max-w-3xl text-base leading-relaxed text-slate-500 sm:text-lg">
                From 50 to 500+ modular rooms—see how Site-Bolt adapts to run bookings, automated
                resident check-ins, interactive site mapping, gatehouse security, catering,
                housekeeping, and progress claims in one live system.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={() => setEnquireOpen(true)}
                  className={primaryButtonClass}
                >
                  Book a Live Demo
                </button>
                <button type="button" onClick={scrollToPreview} className={ghostButtonClass}>
                  Explore Interactive Preview
                  <ChevronDown className="h-4 w-4" />
                </button>
              </div>
              <p className="mt-6 max-w-2xl text-sm leading-relaxed text-slate-500">
                A live example of how deeply Site-Bolt can be tailored to fit a client&apos;s exact
                site operations — bespoke workflows built around how their teams actually work.
              </p>
            </div>
          </section>
        </TechAmbientBackdrop>

        <section
          id="interactive-preview"
          className="border-t border-slate-200 bg-slate-50 px-4 py-16"
        >
          <div className="mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Interactive Preview
            </p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Modular camp grid — coded, clickable, fictional
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-500">
              Explore a schematic site map with colour-coded pods. Production systems are mapped
              to your real numbering and zone layout.
            </p>
            <div className="mt-8">
              <CampMapPreview />
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-white px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Role Portals
            </p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Six roles. One connected camp system.
            </h2>
            <p className="mt-3 max-w-3xl text-base leading-relaxed text-slate-500">
              Switch between Camp Manager, On-Site Admin, Residents, Gatehouse, Kitchen, and
              Housekeeping to see how each portal is shaped for the work they do.
            </p>
            <div className="mt-8">
              <CampRoleExplorer />
            </div>
          </div>
        </section>

        <section className="border-t border-slate-200 bg-slate-50 px-4 py-16">
          <div className="mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              End-to-End Workflow
            </p>
            <h2 className="mt-4 text-3xl font-extrabold text-slate-900 sm:text-4xl">
              From room request to progress claim
            </h2>
            <div className="mt-8 grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
              {WORKFLOW_STEPS.map((item, index) => (
                <div key={item.step} className="relative">
                  <article className="h-full rounded-2xl border border-slate-200 bg-white p-4 shadow-sm">
                    <p className="text-[11px] font-extrabold tracking-[0.16em] text-[#FF6B00]">
                      {item.step}
                    </p>
                    <p className="mt-2 text-sm font-bold leading-snug text-slate-900">
                      {item.title}
                    </p>
                  </article>
                  {index < WORKFLOW_STEPS.length - 1 ? (
                    <ArrowRight
                      className="pointer-events-none absolute -right-2 top-1/2 hidden h-4 w-4 -translate-y-1/2 text-[#FF6B00] lg:block"
                      aria-hidden
                    />
                  ) : null}
                </div>
              ))}
            </div>
          </div>
        </section>

        <section className="relative overflow-hidden border-t border-slate-200 bg-white px-4 py-16">
          <div
            aria-hidden
            className="pointer-events-none absolute right-0 top-0 h-72 w-72 rounded-full bg-[#FF6B00]/12 blur-[100px]"
          />
          <div className="relative mx-auto max-w-6xl">
            <p className="inline-flex rounded-full border border-[#FF6B00]/40 bg-[#FF6B00]/10 px-3 py-1 text-[11px] font-extrabold uppercase tracking-[0.18em] text-[#FF6B00]">
              Built Around Your Business
            </p>
            <h2 className="mt-4 max-w-3xl text-3xl font-extrabold text-slate-900 sm:text-4xl">
              Not rigid software. Workflows shaped to your site.
            </h2>
            <p className="mt-4 max-w-3xl text-base leading-relaxed text-slate-500">
              This camp module is a showcase of Site-Bolt&apos;s customisation depth — proof that
              we engineer around how your crews, contractors, and support teams actually operate.
            </p>
            <ul className="mt-8 grid gap-3 md:grid-cols-2">
              {CUSTOMISATION_POINTS.map((point) => (
                <li
                  key={point}
                  className="flex items-start gap-2 rounded-2xl border border-slate-200 bg-white p-4 text-sm text-slate-700 shadow-sm"
                >
                  <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                  {point}
                </li>
              ))}
            </ul>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={() => setCustomBuildOpen(true)}
                className={primaryButtonClass}
              >
                Request a Custom Build
              </button>
              <button
                type="button"
                onClick={() => setEnquireOpen(true)}
                className={ghostButtonClass}
              >
                Book a Demo
              </button>
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
