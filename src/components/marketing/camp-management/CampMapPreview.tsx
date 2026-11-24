"use client";

import { useMemo, useState } from "react";
import { X } from "lucide-react";
import {
  CAMP_PODS,
  CAMP_ZONES,
  POD_STATUS_STYLES,
  type CampPod,
  type PodStatus,
} from "@/components/marketing/camp-management/camp-demo-data";
import { cn } from "@/lib/utils";

type FilterId = "all" | PodStatus;

const FILTERS: { id: FilterId; label: string }[] = [
  { id: "all", label: "All" },
  { id: "vacant", label: "Vacant" },
  { id: "occupied", label: "Occupied" },
  { id: "needs_clean", label: "Needs Clean" },
];

export default function CampMapPreview() {
  const [filter, setFilter] = useState<FilterId>("all");
  const [selected, setSelected] = useState<CampPod | null>(null);

  const visiblePods = useMemo(
    () => CAMP_PODS.filter((pod) => filter === "all" || pod.status === filter),
    [filter]
  );

  return (
    <div className="rounded-2xl border border-[rgba(148,163,184,0.16)] bg-[#1E293B]/60 p-4 shadow-sm backdrop-blur-md sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#38BDF8]">
            Modular Camp Grid Preview
          </p>
          <h3 className="mt-1 text-lg font-bold text-[#F8FAFC]">Interactive site schematic</h3>
        </div>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map((item) => (
            <button
              key={item.id}
              type="button"
              onClick={() => setFilter(item.id)}
              className={cn(
                "rounded-full px-3 py-1.5 text-xs font-semibold transition",
                filter === item.id
                  ? "bg-[#F97316] text-white"
                  : "border border-[rgba(148,163,184,0.28)] bg-[#0F172A]/70 text-[#CBD5E1] hover:border-sky-400/50 hover:text-[#38BDF8]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-[#94A3B8]">
        {(Object.keys(POD_STATUS_STYLES) as PodStatus[]).map((status) => (
          <span key={status} className="inline-flex items-center gap-1.5">
            <span
              className="h-2.5 w-2.5 rounded-sm"
              style={{ backgroundColor: POD_STATUS_STYLES[status].fill }}
            />
            {POD_STATUS_STYLES[status].label}
          </span>
        ))}
      </div>

      <div className="relative mt-5 grid gap-4 lg:grid-cols-[1fr_280px]">
        <div className="overflow-hidden rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0B1120]/80 p-4">
          <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Camp zone grid">
            <rect x="0" y="0" width="640" height="360" fill="#0B1120" />
            {CAMP_ZONES.map((zone, zoneIndex) => {
              const zonePods = visiblePods.filter((pod) => pod.zone === zone);
              const x0 = 24 + zoneIndex * 210;
              return (
                <g key={zone}>
                  <rect
                    x={x0}
                    y="28"
                    width="196"
                    height="304"
                    rx="14"
                    fill="#1E293B"
                    stroke="rgba(148,163,184,0.24)"
                    strokeWidth="2"
                  />
                  <text
                    x={x0 + 98}
                    y="54"
                    textAnchor="middle"
                    fill="#F8FAFC"
                    fontSize="14"
                    fontWeight="700"
                  >
                    {zone}
                  </text>
                  {zonePods.map((pod, index) => {
                    const col = index % 2;
                    const row = Math.floor(index / 2);
                    const x = x0 + 28 + col * 80;
                    const y = 78 + row * 72;
                    const style = POD_STATUS_STYLES[pod.status];
                    const isSelected = selected?.id === pod.id;
                    return (
                      <g
                        key={pod.id}
                        role="button"
                        tabIndex={0}
                        className="cursor-pointer"
                        onClick={() => setSelected(pod)}
                        onKeyDown={(event) => {
                          if (event.key === "Enter" || event.key === " ") {
                            event.preventDefault();
                            setSelected(pod);
                          }
                        }}
                      >
                        <rect
                          x={x}
                          y={y}
                          width="64"
                          height="52"
                          rx="8"
                          fill={style.fill}
                          opacity={isSelected ? 1 : 0.92}
                          stroke={isSelected ? "#F8FAFC" : "transparent"}
                          strokeWidth={isSelected ? 2.5 : 0}
                        />
                        <text
                          x={x + 32}
                          y={y + 30}
                          textAnchor="middle"
                          fill="#FFFFFF"
                          fontSize="13"
                          fontWeight="700"
                        >
                          {pod.label}
                        </text>
                      </g>
                    );
                  })}
                </g>
              );
            })}
          </svg>
        </div>

        <aside className="rounded-xl border border-[rgba(148,163,184,0.16)] bg-[#0F172A]/80 p-4">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#38BDF8]">
                    Suite details
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-[#F8FAFC]">{selected.label}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md p-1 text-[#94A3B8] hover:bg-[#1E293B] hover:text-[#F8FAFC]"
                  aria-label="Close suite details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">Status</dt>
                  <dd className="mt-0.5 font-semibold text-[#F8FAFC]">
                    {POD_STATUS_STYLES[selected.status].label}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">Occupancy</dt>
                  <dd className="mt-0.5 text-[#CBD5E1]">
                    {selected.resident
                      ? `${selected.resident} · ${selected.company}`
                      : "No current resident"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">
                    Gender separation
                  </dt>
                  <dd className="mt-0.5 text-[#CBD5E1]">{selected.genderWing} wing</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">
                    Cleaning status
                  </dt>
                  <dd className="mt-0.5 text-[#CBD5E1]">{selected.cleaningStatus}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">
                    Emergency contact
                  </dt>
                  <dd className="mt-0.5 text-[#CBD5E1]">{selected.emergencyContact}</dd>
                </div>
                {selected.vehicleRego ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-[#94A3B8]">
                      Vehicle rego
                    </dt>
                    <dd className="mt-0.5 font-mono text-[#F8FAFC]">{selected.vehicleRego}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : (
            <div className="flex h-full min-h-[220px] flex-col justify-center text-sm text-[#94A3B8]">
              <p className="font-semibold text-[#F8FAFC]">Select a pod</p>
              <p className="mt-2 leading-relaxed">
                Click any suite on the schematic to preview occupancy, cleaning status, and
                emergency contact details from sample data.
              </p>
            </div>
          )}
        </aside>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-[#94A3B8]">
        Interactive schematic demo using sample data. Production deployments are mapped directly
        to your exact site plan and numbering.
      </p>
    </div>
  );
}
