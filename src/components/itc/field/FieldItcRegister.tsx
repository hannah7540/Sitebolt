"use client";

import { Search } from "lucide-react";
import {
  FIELD_ITC_STATUS_LABELS,
  fieldItcStatusChip,
  serviceChipColor,
  type FieldItcFilters,
  type FieldItcListResult,
  type FieldItcRecord,
  type FieldItcStatus,
} from "@/lib/api/itc";
import { cardClass, inputClass } from "@/lib/ui-classes";
import { cn } from "@/lib/utils";

interface FieldItcRegisterProps {
  data: FieldItcListResult;
  filters: FieldItcFilters;
  selectedId: string | null;
  onFiltersChange: (next: FieldItcFilters) => void;
  onSelect: (itc: FieldItcRecord) => void;
}

const STATUS_OPTIONS: Array<FieldItcStatus | "all"> = [
  "all",
  "issue",
  "ongoing",
  "complete",
  "not_started",
];

export default function FieldItcRegister({
  data,
  filters,
  selectedId,
  onFiltersChange,
  onSelect,
}: FieldItcRegisterProps) {
  return (
    <div className="space-y-4">
      <div className={`${cardClass} p-4`}>
        <div className="grid gap-3 lg:grid-cols-5">
          <label className="relative lg:col-span-2">
            <Search className="pointer-events-none absolute left-3 top-2.5 h-4 w-4 text-slate-400" />
            <input
              value={filters.search ?? ""}
              onChange={(event) =>
                onFiltersChange({ ...filters, search: event.target.value })
              }
              placeholder="Search ITC #, zone, building, service…"
              className={cn(inputClass, "pl-9")}
            />
          </label>
          <select
            value={filters.status ?? "all"}
            onChange={(event) =>
              onFiltersChange({
                ...filters,
                status: event.target.value as FieldItcFilters["status"],
              })
            }
            className={inputClass}
          >
            {STATUS_OPTIONS.map((status) => (
              <option key={status} value={status}>
                {status === "all" ? "All statuses" : FIELD_ITC_STATUS_LABELS[status]}
              </option>
            ))}
          </select>
          <select
            value={filters.zone ?? "all"}
            onChange={(event) => onFiltersChange({ ...filters, zone: event.target.value })}
            className={inputClass}
          >
            <option value="all">All zones</option>
            {data.zones.map((zone) => (
              <option key={zone.id} value={zone.code}>
                {zone.name}
              </option>
            ))}
          </select>
          <select
            value={filters.service ?? "all"}
            onChange={(event) =>
              onFiltersChange({ ...filters, service: event.target.value })
            }
            className={inputClass}
          >
            <option value="all">All services</option>
            {data.services.map((service) => (
              <option key={service.id} value={service.code}>
                {service.name}
              </option>
            ))}
          </select>
        </div>
        {data.buildings.length ? (
          <div className="mt-3 flex flex-wrap gap-2">
            <button
              type="button"
              onClick={() => onFiltersChange({ ...filters, building: "all" })}
              className={cn(
                "rounded-full px-3 py-1 text-xs font-semibold",
                !filters.building || filters.building === "all"
                  ? "bg-slate-900 text-white"
                  : "bg-slate-100 text-slate-600"
              )}
            >
              All buildings
            </button>
            {data.buildings.map((building) => (
              <button
                key={building}
                type="button"
                onClick={() => onFiltersChange({ ...filters, building })}
                className={cn(
                  "rounded-full px-3 py-1 text-xs font-semibold",
                  filters.building === building
                    ? "bg-orange-500 text-white"
                    : "bg-orange-50 text-orange-800"
                )}
              >
                {building}
              </button>
            ))}
          </div>
        ) : null}
      </div>

      <div className={`${cardClass} overflow-hidden`}>
        <div className="border-b border-slate-200 px-4 py-3">
          <h2 className="text-sm font-semibold text-slate-900">ITC Register</h2>
          <p className="text-xs text-slate-500">{data.itcs.length} certificate(s)</p>
        </div>
        <div className="overflow-x-auto">
          <table className="min-w-full text-sm">
            <thead className="bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-2">ITC #</th>
                <th className="px-4 py-2">Status</th>
                <th className="px-4 py-2">Zone</th>
                <th className="px-4 py-2">Building</th>
                <th className="px-4 py-2">Service</th>
                <th className="px-4 py-2">From → To</th>
                <th className="px-4 py-2">Length</th>
              </tr>
            </thead>
            <tbody>
              {data.itcs.length === 0 ? (
                <tr>
                  <td colSpan={7} className="px-4 py-10 text-center text-sm text-slate-500">
                    No ITCs match the current filters.
                  </td>
                </tr>
              ) : (
                data.itcs.map((itc) => {
                  const chip = fieldItcStatusChip(itc.status);
                  const serviceColor = serviceChipColor(itc.service_code ?? itc.service_name);
                  return (
                    <tr
                      key={itc.id}
                      className={cn(
                        "cursor-pointer border-t border-slate-100 hover:bg-orange-50/50",
                        selectedId === itc.id && "bg-orange-50"
                      )}
                      onClick={() => onSelect(itc)}
                    >
                      <td className="px-4 py-3 font-semibold text-orange-600">{itc.itc_number}</td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2 py-0.5 text-xs font-semibold",
                            chip.bg,
                            chip.text
                          )}
                        >
                          {chip.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        {itc.zone_code ? (
                          <span className="rounded-full bg-slate-100 px-2 py-0.5 text-xs font-semibold text-slate-700">
                            {itc.zone_code}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {itc.building ? (
                          <span className="rounded-full bg-sky-50 px-2 py-0.5 text-xs font-semibold text-sky-800">
                            {itc.building}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3">
                        {itc.service_name ? (
                          <span
                            className="rounded-full px-2 py-0.5 text-xs font-semibold text-white"
                            style={{ backgroundColor: serviceColor }}
                          >
                            {itc.service_name}
                          </span>
                        ) : (
                          "—"
                        )}
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {itc.start_location ?? "—"} → {itc.end_location ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        {itc.length_m != null ? `${itc.length_m} m` : "—"}
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      </div>
    </div>
  );
}
