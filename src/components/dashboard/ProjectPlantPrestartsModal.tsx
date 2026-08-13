"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import type { PlantAsset, PlantPrestart, Worker } from "@/lib/supabase";
import { getPlantPrestartUnitLabel } from "@/lib/dashboard-form-utils";
import {
  formatPlantPrestartDisplayDateTime,
  getPlantPrestartDashboardStatus,
  getPlantPrestartStatusLabel,
  getPlantPrestartSubmittedIsoDate,
  sortPlantPrestartsNewestFirst,
  type PlantPrestartDashboardStatus,
} from "@/lib/plant-prestart-utils";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

type StatusFilter = "all" | PlantPrestartDashboardStatus;

interface ProjectPlantPrestartsModalProps {
  prestarts: PlantPrestart[];
  plant: PlantAsset[];
  workers?: Worker[];
  projectName: string;
  onClose: () => void;
  onSelectPrestart: (prestart: PlantPrestart) => void;
}

const STATUS_TABS: { id: StatusFilter; label: string }[] = [
  { id: "all", label: "All" },
  { id: "passed", label: "Passed" },
  { id: "defect", label: "Defect" },
  { id: "failed", label: "Failed" },
];

function resolveOperatorName(prestart: PlantPrestart, workers: Worker[]): string {
  if (prestart.operator_name?.trim()) return prestart.operator_name.trim();
  if (prestart.operator_worker_id) {
    const worker = workers.find((row) => row.id === prestart.operator_worker_id);
    if (worker?.full_name?.trim()) return worker.full_name.trim();
  }
  return "Unknown operator";
}

function matchesStatusFilter(prestart: PlantPrestart, filter: StatusFilter): boolean {
  if (filter === "all") return true;
  return getPlantPrestartDashboardStatus(prestart) === filter;
}

function matchesDateRange(
  prestart: PlantPrestart,
  rangeStart: string,
  rangeEnd: string
): boolean {
  if (!rangeStart && !rangeEnd) return true;
  const submittedDate = getPlantPrestartSubmittedIsoDate(prestart);
  const start = rangeStart || "0000-01-01";
  const end = rangeEnd || "9999-12-31";
  return submittedDate >= start && submittedDate <= end;
}

function statusBadgeClass(label: ReturnType<typeof getPlantPrestartStatusLabel>): string {
  if (label === "Passed") return "bg-emerald-100 text-emerald-800";
  if (label === "Failed") return "bg-red-100 text-red-800";
  return "bg-amber-100 text-amber-900";
}

export default function ProjectPlantPrestartsModal({
  prestarts,
  plant,
  workers = [],
  projectName,
  onClose,
  onSelectPrestart,
}: ProjectPlantPrestartsModalProps) {
  const [statusFilter, setStatusFilter] = useState<StatusFilter>("all");
  const [rangeStart, setRangeStart] = useState("");
  const [rangeEnd, setRangeEnd] = useState("");
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPrestarts = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();

    return sortPlantPrestartsNewestFirst(
      prestarts
        .filter((prestart) => matchesStatusFilter(prestart, statusFilter))
        .filter((prestart) => matchesDateRange(prestart, rangeStart, rangeEnd))
        .filter((prestart) => {
          if (!query) return true;
          const unit = getPlantPrestartUnitLabel(prestart, plant).toLowerCase();
          const operator = resolveOperatorName(prestart, workers).toLowerCase();
          return unit.includes(query) || operator.includes(query);
        })
    );
  }, [prestarts, statusFilter, rangeStart, rangeEnd, searchQuery, plant, workers]);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-6xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Plant Pre-Starts</h2>
            <p className="text-sm text-slate-500">{projectName}</p>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="rounded-lg p-1.5 text-slate-400 hover:bg-slate-100 hover:text-slate-600"
            aria-label="Close"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        <div className="mb-4 flex flex-wrap gap-2">
          {STATUS_TABS.map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={cn(
                "rounded-lg px-3 py-1.5 text-sm font-semibold transition",
                statusFilter === tab.id
                  ? "bg-orange-500 text-white"
                  : "bg-slate-100 text-slate-700 hover:bg-slate-200"
              )}
            >
              {tab.label}
            </button>
          ))}
        </div>

        <div className="mb-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-[1fr_auto_auto]">
          <label className="block">
            <span className={labelClass}>Search unit or operator</span>
            <div className="relative mt-1">
              <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
              <input
                type="search"
                value={searchQuery}
                onChange={(event) => setSearchQuery(event.target.value)}
                placeholder="Unit number or worker name…"
                className={cn(inputClass, "pl-9")}
              />
            </div>
          </label>
          <label className="block">
            <span className={labelClass}>From date</span>
            <input
              type="date"
              value={rangeStart}
              onChange={(event) => setRangeStart(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
          <label className="block">
            <span className={labelClass}>To date</span>
            <input
              type="date"
              value={rangeEnd}
              onChange={(event) => setRangeEnd(event.target.value)}
              className={cn(inputClass, "mt-1")}
            />
          </label>
        </div>

        {filteredPrestarts.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No plant pre-starts match your filters.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Date &amp; time
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Operator
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Reading
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Status
                  </th>
                  <th className="px-4 py-3 text-right text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Actions
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredPrestarts.map((prestart) => {
                  const statusLabel = getPlantPrestartStatusLabel(prestart);
                  const submittedAt = prestart.submitted_at ?? prestart.created_at;

                  return (
                    <tr key={prestart.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {formatPlantPrestartDisplayDateTime(submittedAt)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 font-bold text-slate-900">
                        {getPlantPrestartUnitLabel(prestart, plant)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {resolveOperatorName(prestart, workers)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {prestart.current_reading != null
                          ? `${prestart.current_reading} hrs`
                          : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            statusBadgeClass(statusLabel)
                          )}
                        >
                          {statusLabel}
                        </span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-right">
                        <button
                          type="button"
                          onClick={() => onSelectPrestart(prestart)}
                          className="text-xs font-semibold text-orange-600 hover:text-orange-700"
                        >
                          Open
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          Showing {filteredPrestarts.length} of {prestarts.length} pre-start
          {prestarts.length === 1 ? "" : "s"}
        </p>
      </div>
    </div>
  );
}
