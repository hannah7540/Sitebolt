"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import type { PlantAsset, Worker } from "@/lib/supabase";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getPlantComplianceStatusLabel } from "@/lib/dashboard-form-utils";
import { getServiceMetrics } from "@/lib/plant-utils";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface ProjectPlantAssetsModalProps {
  plant: PlantAsset[];
  workers: Worker[];
  projectName: string;
  onClose: () => void;
}

function resolveAssignedWorkerName(plant: PlantAsset, workers: Worker[]): string {
  if (plant.assigned_worker_name?.trim()) return plant.assigned_worker_name.trim();
  if (plant.assigned_worker_id) {
    const worker = workers.find((row) => row.id === plant.assigned_worker_id);
    if (worker) return getWorkerDisplayName(worker);
  }
  return "Unassigned";
}

export default function ProjectPlantAssetsModal({
  plant,
  workers,
  projectName,
  onClose,
}: ProjectPlantAssetsModalProps) {
  const [searchQuery, setSearchQuery] = useState("");

  const filteredPlant = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = [...plant].sort((left, right) =>
      left.unit_number.localeCompare(right.unit_number)
    );
    if (!query) return sorted;

    return sorted.filter((asset) => {
      const makeModel = `${asset.make ?? ""} ${asset.model ?? ""}`.toLowerCase();
      const workerName = resolveAssignedWorkerName(asset, workers).toLowerCase();
      return (
        asset.unit_number.toLowerCase().includes(query) ||
        makeModel.includes(query) ||
        (asset.serial_number ?? "").toLowerCase().includes(query) ||
        workerName.includes(query)
      );
    });
  }, [plant, searchQuery, workers]);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-6xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Plant Assets</h2>
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

        <label className="mb-4 block">
          <span className={labelClass}>Search equipment</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Unit number, make, model, serial, or operator…"
              className={cn(inputClass, "pl-9")}
            />
          </div>
        </label>

        {filteredPlant.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No plant assigned to this project.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Unit
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Make &amp; model
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Serial
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Current hours
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Next service
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Assigned worker
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Compliance
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredPlant.map((asset) => {
                  const metrics = getServiceMetrics(asset);
                  const compliance = getPlantComplianceStatusLabel(asset);
                  const complianceTone =
                    compliance.includes("Overdue") || compliance.includes("Due Soon")
                      ? "warning"
                      : "success";

                  return (
                    <tr key={asset.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {asset.unit_number}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {[asset.make, asset.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {asset.serial_number?.trim() || "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {metrics.current != null ? `${metrics.current} ${metrics.unit}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {metrics.next != null ? `${metrics.next} ${metrics.unit}` : "—"}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {resolveAssignedWorkerName(asset, workers)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            complianceTone === "warning"
                              ? "bg-amber-100 text-amber-900"
                              : "bg-emerald-100 text-emerald-800"
                          )}
                        >
                          {compliance}
                        </span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}

        <p className="mt-3 text-xs text-slate-500">
          {filteredPlant.length} asset{filteredPlant.length === 1 ? "" : "s"} on site
        </p>
      </div>
    </div>
  );
}
