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
    <div className="rounded-2xl border border-slate-200 bg-white p-4 shadow-sm sm:p-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <p className="text-xs font-bold uppercase tracking-wider text-[#FF6B00]">
            Modular Camp Grid Preview
          </p>
          <h3 className="mt-1 text-lg font-bold text-slate-900">Interactive site schematic</h3>
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
                  ? "bg-[#FF6B00] text-white"
                  : "border border-slate-200 bg-white text-slate-600 hover:border-[#FF6B00] hover:text-[#FF6B00]"
              )}
            >
              {item.label}
            </button>
          ))}
        </div>
      </div>

      <div className="mt-4 flex flex-wrap gap-3 text-xs text-slate-600">
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
        <div className="overflow-hidden rounded-xl border border-slate-200 bg-slate-50 p-4">
          <svg viewBox="0 0 640 360" className="h-auto w-full" role="img" aria-label="Camp zone grid">
            <rect x="0" y="0" width="640" height="360" fill="#F8FAFC" />
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
                    fill="#FFFFFF"
                    stroke="#E2E8F0"
                    strokeWidth="2"
                  />
                  <text
                    x={x0 + 98}
                    y="54"
                    textAnchor="middle"
                    fill="#0F172A"
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
                          stroke={isSelected ? "#0F172A" : "transparent"}
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

        <aside className="rounded-xl border border-slate-200 bg-white p-4 shadow-sm">
          {selected ? (
            <div>
              <div className="flex items-start justify-between gap-2">
                <div>
                  <p className="text-[11px] font-bold uppercase tracking-wider text-[#FF6B00]">
                    Suite details
                  </p>
                  <h4 className="mt-1 text-lg font-bold text-slate-900">{selected.label}</h4>
                </div>
                <button
                  type="button"
                  onClick={() => setSelected(null)}
                  className="rounded-md p-1 text-slate-400 hover:bg-slate-100 hover:text-slate-700"
                  aria-label="Close suite details"
                >
                  <X className="h-4 w-4" />
                </button>
              </div>
              <dl className="mt-4 space-y-3 text-sm">
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">Status</dt>
                  <dd className="mt-0.5 font-semibold text-slate-900">
                    {POD_STATUS_STYLES[selected.status].label}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">Occupancy</dt>
                  <dd className="mt-0.5 text-slate-700">
                    {selected.resident
                      ? `${selected.resident} · ${selected.company}`
                      : "No current resident"}
                  </dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">
                    Gender separation
                  </dt>
                  <dd className="mt-0.5 text-slate-700">{selected.genderWing} wing</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">
                    Cleaning status
                  </dt>
                  <dd className="mt-0.5 text-slate-700">{selected.cleaningStatus}</dd>
                </div>
                <div>
                  <dt className="text-[11px] font-semibold uppercase text-slate-500">
                    Emergency contact
                  </dt>
                  <dd className="mt-0.5 text-slate-700">{selected.emergencyContact}</dd>
                </div>
                {selected.vehicleRego ? (
                  <div>
                    <dt className="text-[11px] font-semibold uppercase text-slate-500">
                      Vehicle rego
                    </dt>
                    <dd className="mt-0.5 font-mono text-slate-900">{selected.vehicleRego}</dd>
                  </div>
                ) : null}
              </dl>
            </div>
          ) : (
            <div className="flex h-full min-h-[220px] flex-col justify-center text-sm text-slate-500">
              <p className="font-semibold text-slate-900">Select a pod</p>
              <p className="mt-2 leading-relaxed">
                Click any suite on the schematic to preview occupancy, cleaning status, and
                emergency contact details from sample data.
              </p>
            </div>
          )}
        </aside>
      </div>

      <p className="mt-4 text-xs leading-relaxed text-slate-500">
        Interactive schematic demo using sample data. Production deployments are mapped directly
        to your exact site plan and numbering.
      </p>
    </div>
  );
}
