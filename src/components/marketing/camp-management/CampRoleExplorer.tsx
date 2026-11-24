"use client";

import { useState } from "react";
import { Check } from "lucide-react";
import { cn } from "@/lib/utils";

type RoleId =
  | "camp_manager"
  | "onsite_admin"
  | "residents"
  | "gatehouse"
  | "kitchen"
  | "housekeeping";

type FrameKind = "desktop" | "ipad" | "mobile";

interface RoleTab {
  id: RoleId;
  label: string;
  frame: FrameKind;
  bullets: string[];
}

const ROLES: RoleTab[] = [
  {
    id: "camp_manager",
    label: "Camp Manager",
    frame: "desktop",
    bullets: [
      "Live KPI board for occupancy, turnovers, and pending approvals",
      "Gender-separated booking approvals with map-based allocation",
      "One-click monthly Progress Claim exports — Excel plus per-company PDFs",
      "Full oversight of gatehouse, catering, and housekeeping queues",
    ],
  },
  {
    id: "onsite_admin",
    label: "On-Site Admin",
    frame: "desktop",
    bullets: [
      "Live occupancy snapshot across every zone and wing",
      "Fast room request entry without leaving the floor",
      "Approved Visitors & Staff pre-approval lists",
      "Protected view-only operational monitoring for supervisors",
    ],
  },
  {
    id: "residents",
    label: "Residents (Mobile)",
    frame: "mobile",
    bullets: [
      "Automated Email & SMS pre-arrival check-in",
      "Capture vehicle rego, dietary needs, and emergency contact",
      "Unlock suite number once check-in is complete",
      "Turn-by-turn camp wayfinder — no app download required",
    ],
  },
  {
    id: "gatehouse",
    label: "Gatehouse Security",
    frame: "ipad",
    bullets: [
      "Instant name & vehicle rego lookup",
      "Search across Residents, Staff, and Approved Visitors",
      "Check-in status enforcement at the gate",
      "One-tap check-in SMS resend when details are incomplete",
    ],
  },
  {
    id: "kitchen",
    label: "Kitchen & Catering",
    frame: "ipad",
    bullets: [
      "Live daily headcounts: Standard vs Special Dietary",
      "Auto-tallied allergies — Dairy Free, Gluten Free, Vegetarian, Halal, Nut Allergy",
      "Weekly menu publishing for the mess hall",
      "Synced from resident check-in dietary responses",
    ],
  },
  {
    id: "housekeeping",
    label: "Housekeeping",
    frame: "ipad",
    bullets: [
      "Smart priority turnaround queue",
      "Same-day check-out / check-in rooms pinned to the top",
      "Mark rooms clean and sync straight back to the site map",
      "iPad-ready for cleaners moving between pods",
    ],
  },
];

function DeviceChrome({
  frame,
  children,
}: {
  frame: FrameKind;
  children: React.ReactNode;
}) {
  if (frame === "mobile") {
    return (
      <div className="mx-auto w-full max-w-[280px]">
        <div className="rounded-[2rem] border-[6px] border-slate-900 bg-slate-900 p-2 shadow-xl">
          <div className="mb-2 flex justify-center">
            <div className="h-1.5 w-16 rounded-full bg-slate-700" />
          </div>
          <div className="overflow-hidden rounded-[1.4rem] bg-white">{children}</div>
        </div>
      </div>
    );
  }

  if (frame === "ipad") {
    return (
      <div className="mx-auto w-full max-w-md">
        <div className="rounded-2xl border-[5px] border-slate-800 bg-slate-800 p-2.5 shadow-xl">
          <div className="overflow-hidden rounded-xl bg-white">{children}</div>
        </div>
      </div>
    );
  }

  return (
    <div className="w-full overflow-hidden rounded-xl border border-slate-200 bg-slate-100 shadow-sm">
      <div className="flex items-center gap-1.5 border-b border-slate-200 bg-slate-50 px-3 py-2">
        <span className="h-2.5 w-2.5 rounded-full bg-rose-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-amber-400" />
        <span className="h-2.5 w-2.5 rounded-full bg-emerald-400" />
        <span className="ml-2 truncate rounded bg-white px-2 py-0.5 text-[10px] text-slate-500">
          camp.sitebolt.app / dashboard
        </span>
      </div>
      <div className="bg-white">{children}</div>
    </div>
  );
}

function MockPanel({ role }: { role: RoleId }) {
  switch (role) {
    case "camp_manager":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Camp Manager · KPI Board
          </p>
          <div className="grid grid-cols-3 gap-2">
            {[
              { label: "Occupied", value: "412" },
              { label: "Vacant", value: "68" },
              { label: "Turnovers", value: "14" },
            ].map((kpi) => (
              <div key={kpi.label} className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
                <p className="text-[10px] text-slate-500">{kpi.label}</p>
                <p className="mt-1 text-lg font-bold text-slate-900">{kpi.value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">Pending approvals</p>
            <p className="mt-1 text-slate-600">3 male · 2 female · Apex Civil / Southern Grid</p>
            <div className="mt-2 flex gap-2">
              <span className="rounded bg-emerald-100 px-2 py-1 text-[10px] font-semibold text-emerald-700">
                Approve
              </span>
              <span className="rounded bg-slate-100 px-2 py-1 text-[10px] font-semibold text-slate-600">
                Export claims
              </span>
            </div>
          </div>
        </div>
      );
    case "onsite_admin":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            On-Site Admin
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 p-3">
            <p className="font-semibold text-slate-900">Occupancy snapshot</p>
            <p className="mt-1 text-slate-600">Zone A 92% · Zone B 88% · Zone C 76%</p>
          </div>
          <div className="rounded-lg border border-dashed border-[#FF6B00]/40 bg-[#FF6B00]/5 p-3">
            <p className="font-semibold text-slate-900">New room request</p>
            <p className="mt-1 text-slate-600">Jordan Reid · Southern Grid · Male wing</p>
          </div>
          <div className="rounded-lg border border-slate-200 p-3">
            <p className="font-semibold text-slate-900">Pre-approved visitors</p>
            <p className="mt-1 text-slate-600">Sam Taylor · Vehicle ABC123 · Gate OK</p>
          </div>
        </div>
      );
    case "residents":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Pre-arrival check-in
          </p>
          <div className="space-y-2">
            {[
              ["Vehicle rego", "ABC123"],
              ["Dietary", "Gluten Free"],
              ["Emergency contact", "Casey Morgan"],
            ].map(([label, value]) => (
              <div key={label} className="rounded-lg border border-slate-200 px-3 py-2">
                <p className="text-[10px] text-slate-500">{label}</p>
                <p className="font-semibold text-slate-900">{value}</p>
              </div>
            ))}
          </div>
          <div className="rounded-lg bg-[#FF6B00] px-3 py-2.5 text-center font-semibold text-white">
            Unlock suite A-01
          </div>
          <p className="text-center text-[10px] text-slate-500">Wayfinder ready · no app needed</p>
        </div>
      );
    case "gatehouse":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Gatehouse lookup
          </p>
          <div className="rounded-lg border border-slate-200 bg-slate-50 px-3 py-2 font-mono text-slate-700">
            Search: ABC123
          </div>
          <div className="rounded-lg border border-emerald-200 bg-emerald-50 p-3">
            <p className="font-semibold text-emerald-800">Sam Taylor · Resident</p>
            <p className="mt-1 text-emerald-700">Suite A-01 · Check-in complete</p>
          </div>
          <div className="flex gap-2">
            <span className="rounded bg-slate-900 px-2.5 py-1.5 text-[10px] font-semibold text-white">
              Admit
            </span>
            <span className="rounded border border-slate-200 px-2.5 py-1.5 text-[10px] font-semibold text-slate-600">
              Resend SMS
            </span>
          </div>
        </div>
      );
    case "kitchen":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Kitchen headcount
          </p>
          <div className="grid grid-cols-2 gap-2">
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[10px] text-slate-500">Standard</p>
              <p className="text-xl font-bold text-slate-900">318</p>
            </div>
            <div className="rounded-lg border border-slate-200 bg-slate-50 p-2.5">
              <p className="text-[10px] text-slate-500">Special dietary</p>
              <p className="text-xl font-bold text-slate-900">94</p>
            </div>
          </div>
          <div className="flex flex-wrap gap-1.5">
            {["Dairy Free 22", "GF 31", "Vegetarian 18", "Halal 14", "Nut 9"].map((tag) => (
              <span
                key={tag}
                className="rounded-full border border-slate-200 bg-white px-2 py-0.5 text-[10px] font-semibold text-slate-600"
              >
                {tag}
              </span>
            ))}
          </div>
          <p className="rounded-lg border border-dashed border-slate-200 px-3 py-2 text-slate-600">
            Weekly menu published · Dinner service 18:00
          </p>
        </div>
      );
    case "housekeeping":
      return (
        <div className="space-y-3 p-4 text-xs">
          <p className="text-[10px] font-bold uppercase tracking-wider text-[#FF6B00]">
            Priority turnaround
          </p>
          {[
            { room: "A-03", note: "Same-day arrival · pinned", priority: true },
            { room: "B-03", note: "Priority clean", priority: true },
            { room: "C-04", note: "Evening arrival", priority: false },
          ].map((row) => (
            <div
              key={row.room}
              className={cn(
                "flex items-center justify-between rounded-lg border px-3 py-2",
                row.priority
                  ? "border-amber-200 bg-amber-50"
                  : "border-slate-200 bg-white"
              )}
            >
              <div>
                <p className="font-bold text-slate-900">{row.room}</p>
                <p className="text-slate-600">{row.note}</p>
              </div>
              <span className="rounded bg-emerald-600 px-2 py-1 text-[10px] font-semibold text-white">
                Mark clean
              </span>
            </div>
          ))}
        </div>
      );
    default:
      return null;
  }
}

export default function CampRoleExplorer() {
  const [active, setActive] = useState<RoleId>("camp_manager");
  const role = ROLES.find((item) => item.id === active) ?? ROLES[0];

  return (
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="mb-5">
        <p className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">
          Six-role portal explorer
        </p>
        <h3 className="mt-1 text-lg font-bold text-slate-900">
          Every team sees the workflow that fits their job
        </h3>
      </div>

      <div className="flex flex-wrap gap-2" role="tablist" aria-label="Camp portal roles">
        {ROLES.map((item) => (
          <button
            key={item.id}
            type="button"
            role="tab"
            aria-selected={active === item.id}
            onClick={() => setActive(item.id)}
            className={cn(
              "rounded-full px-3 py-1.5 text-xs font-semibold transition",
              active === item.id
                ? "bg-[#FF6B00] text-white"
                : "border border-slate-200 bg-white text-slate-600 hover:border-[#FF6B00] hover:text-[#FF6B00]"
            )}
          >
            {item.label}
          </button>
        ))}
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-2 lg:items-start">
        <DeviceChrome frame={role.frame}>
          <MockPanel role={role.id} />
        </DeviceChrome>

        <div>
          <p className="text-[11px] font-bold uppercase tracking-wider text-slate-500">
            {role.frame === "mobile"
              ? "Mobile web"
              : role.frame === "ipad"
                ? "iPad console"
                : "Desktop dashboard"}
          </p>
          <h4 className="mt-1 text-xl font-bold text-slate-900">{role.label}</h4>
          <ul className="mt-4 space-y-3">
            {role.bullets.map((bullet) => (
              <li key={bullet} className="flex items-start gap-2 text-sm text-slate-700">
                <Check className="mt-0.5 h-4 w-4 shrink-0 text-[#FF6B00]" />
                {bullet}
              </li>
            ))}
          </ul>
        </div>
      </div>
    </div>
  );
}
