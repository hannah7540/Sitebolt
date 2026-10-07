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
} from "lucide-react";
import EnquireNowModal from "@/components/marketing/EnquireNowModal";
import { getAppLoginUrl } from "@/lib/site-domains";

const NAV_ITEMS = [
  { id: "features", label: "Features" },
  { id: "demos", label: "Demo Videos" },
  { id: "compliance", label: "Compliance" },
  { id: "about", label: "About" },
] as const;

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

export function SiteBoltMark({ className = "h-10 w-10" }: { className?: string }) {
  return (
    <svg
      viewBox="0 0 48 48"
      className={className}
      aria-hidden
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
    >
      <polygon
        points="24,3 43,13.5 43,34.5 24,45 5,34.5 5,13.5"
        fill="#1F2429"
        stroke="#FF6B00"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <path
        d="M27.8 12.2 15.6 26.2h8.1l-4.2 9.6 13.4-15.2h-8.2l3.1-8.4Z"
        fill="#FF6B00"
      />
    </svg>
  );
}

function SiteBoltWordmark() {
  return (
    <div className="flex items-center gap-3">
      <SiteBoltMark />
      <div>
        <p className="text-[15px] font-extrabold tracking-[0.18em] text-[#1F2429]">
          SITEBOLT
        </p>
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
  const loginUrl = getAppLoginUrl();
  const demo = DEMO_TABS.find((tab) => tab.id === activeDemo) ?? DEMO_TABS[0];
  const DemoIcon = demo.icon;

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
    <div className="min-h-screen bg-[#F8FAFC] text-[#1F2429]">
      <header className="sticky top-0 z-40 border-b border-[#FF6B00]/20 bg-[#121417]/95 backdrop-blur">
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
          <nav className="hidden items-center gap-5 md:flex">
            {NAV_ITEMS.map((item) => (
              <button
                key={item.id}
                type="button"
                onClick={() => scrollTo(item.id)}
                className="text-sm font-semibold text-zinc-300 hover:text-[#FF6B00]"
              >
                {item.label}
              </button>
            ))}
          </nav>
          <div className="flex items-center gap-2">
            <a
              href={loginUrl}
              className="rounded-lg border border-white/15 px-3 py-2 text-sm font-semibold text-white hover:border-[#FF6B00] hover:text-[#FF6B00]"
            >
              Existing Log In
            </a>
            <button
              type="button"
              onClick={openEnquire}
              className="rounded-lg bg-[#FF6B00] px-3 py-2 text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,107,0,0.35)] hover:bg-[#E65100]"
            >
              Enquire Now
            </button>
          </div>
        </div>
      </header>

      <main id="top">
        <section
          className="relative overflow-hidden bg-[#121417]"
          style={{
            backgroundImage:
              "linear-gradient(rgba(18,20,23,0.92), rgba(18,20,23,0.94)), linear-gradient(#1F2429 1px, transparent 1px), linear-gradient(90deg, #1F2429 1px, transparent 1px)",
            backgroundSize: "auto, 28px 28px, 28px 28px",
          }}
        >
          <div className="mx-auto grid max-w-6xl gap-10 px-4 py-16 md:grid-cols-2 md:items-center md:py-20">
            <div>
              <p className="text-xs font-bold uppercase tracking-[0.18em] text-[#FF6B00]">
                Multi-state operations
              </p>
              <h1 className="mt-3 text-4xl font-extrabold leading-tight text-white sm:text-5xl">
                Civil &amp; Construction Field Operations. Simplified &amp; Compliant.
              </h1>
              <p className="mt-5 text-base leading-relaxed text-zinc-300 sm:text-lg">
                Purpose-built for civil contractors. End-to-end plant QR verification, 31-day SWMS
                sign-offs, high-resolution ITP drawings, and audit-ready Fair Work timesheets.
              </p>
              <div className="mt-8 flex flex-wrap gap-3">
                <button
                  type="button"
                  onClick={openEnquire}
                  className="rounded-lg bg-[#FF6B00] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_20px_rgba(255,107,0,0.4)] hover:bg-[#E65100]"
                >
                  Enquire Now
                </button>
                <button
                  type="button"
                  onClick={() => scrollTo("demos")}
                  className="inline-flex items-center gap-2 rounded-lg border border-[#FF6B00]/40 bg-transparent px-5 py-3 text-sm font-semibold text-white hover:border-[#FF6B00] hover:text-[#FF6B00]"
                >
                  <PlayCircle className="h-4 w-4" />
                  Watch Platform Demos
                </button>
              </div>
            </div>
            <div className="rounded-2xl border border-[#FF6B00]/20 bg-[#1F2429] p-6">
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

        <section id="features" className="mx-auto max-w-6xl px-4 py-16">
          <h2 className="text-3xl font-extrabold text-[#1F2429]">One platform for site control</h2>
          <p className="mt-3 max-w-2xl text-zinc-600">
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
              <article
                key={item.title}
                className="rounded-2xl border border-[#FF6B00]/20 bg-white p-5"
              >
                <h3 className="font-bold text-[#1F2429]">{item.title}</h3>
                <p className="mt-2 text-sm leading-relaxed text-zinc-600">{item.body}</p>
              </article>
            ))}
          </div>
        </section>

        <section id="demos" className="border-y border-[#FF6B00]/20 bg-white py-16">
          <div className="mx-auto max-w-6xl px-4">
            <h2 className="text-3xl font-extrabold text-[#1F2429]">Platform demos</h2>
            <p className="mt-3 max-w-2xl text-zinc-600">
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
                      ? "rounded-lg bg-[#FF6B00] px-3 py-2 text-sm font-semibold text-white"
                      : "rounded-lg border border-[#1F2429]/10 bg-[#F8FAFC] px-3 py-2 text-sm font-semibold text-[#1F2429] hover:border-[#FF6B00] hover:text-[#FF6B00]"
                  }
                >
                  {tab.label}
                </button>
              ))}
            </div>
            <article className="mt-6 grid gap-6 rounded-2xl border border-[#FF6B00]/20 bg-[#121417] p-6 text-white md:grid-cols-[1.1fr_0.9fr] md:items-center">
              <div>
                <h3 className="text-2xl font-bold">{demo.title}</h3>
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
              <div className="flex min-h-[220px] flex-col items-center justify-center rounded-xl border border-[#FF6B00]/20 bg-[#1F2429] p-6 text-center">
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
          <h2 className="text-3xl font-extrabold text-[#1F2429]">
            Compliant across states
          </h2>
          <div className="mt-8 grid gap-4 md:grid-cols-2">
            {[
              "Fair Work timesheets with state-by-state pay rules",
              "31-day SWMS review evidence with consulted worker signatures",
              "Plant pre-start and tag-out history retained with the asset",
              "ITP / ITC photo and drawing records ready for principal contractor audits",
            ].map((item) => (
              <p
                key={item}
                className="rounded-xl border border-[#FF6B00]/20 bg-white px-4 py-4 text-sm text-[#1F2429]"
              >
                {item}
              </p>
            ))}
          </div>
        </section>

        <section id="about" className="border-t border-[#FF6B00]/20 bg-[#121417] px-4 py-16 text-white">
          <div className="mx-auto max-w-6xl">
            <SiteBoltWordmark />
            <h2 className="mt-6 text-3xl font-extrabold">About SITEBOLT</h2>
            <p className="mt-4 max-w-3xl text-sm leading-relaxed text-zinc-300">
              SiteBolt is an operational system for civil and construction contractors who need
              plant, SWMS, quality, and payroll evidence in one place — not five apps and a shared
              drive. Built for multi-state operations.
            </p>
            <div className="mt-8 flex flex-wrap gap-3">
              <button
                type="button"
                onClick={openEnquire}
                className="rounded-lg bg-[#FF6B00] px-5 py-3 text-sm font-semibold text-white shadow-[0_0_18px_rgba(255,107,0,0.35)] hover:bg-[#E65100]"
              >
                Enquire Now
              </button>
              <a
                href={loginUrl}
                className="rounded-lg border border-white/20 px-5 py-3 text-sm font-semibold text-white hover:border-[#FF6B00] hover:text-[#FF6B00]"
              >
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
