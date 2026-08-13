"use client";

import { useMemo, useState } from "react";
import { X, Search } from "lucide-react";
import type { LeaveRequest, Worker } from "@/lib/supabase";
import type { SiteFormSubmission } from "@/lib/site-forms";
import { getWorkerDisplayName } from "@/lib/worker-utils";
import { getWorkerOnsiteStatus } from "@/lib/dashboard-form-utils";
import { localIsoDate } from "@/lib/timesheet-utils";
import { cn } from "@/lib/utils";
import { modalOverlayClass, modalClass, inputClass, labelClass } from "@/lib/ui-classes";

interface ProjectActiveWorkersModalProps {
  workers: Worker[];
  siteForms: SiteFormSubmission[];
  leaveRequests: LeaveRequest[];
  projectName: string;
  onClose: () => void;
}

function workerTradeLabel(worker: Worker): string {
  return (
    worker.trade?.trim() ||
    worker.worker_type?.trim() ||
    worker.security_role?.replace(/_/g, " ") ||
    "—"
  );
}

function workerContactLabel(worker: Worker): string {
  const email = worker.email?.trim();
  const phone = worker.phone?.trim();
  if (email && phone) return `${email} · ${phone}`;
  return email || phone || "No contact on file";
}

function workerVehicleLabel(worker: Worker): string {
  if (!worker.has_company_vehicle) return "No";
  if (worker.assigned_vehicle_asset_id) return "Yes · Assigned";
  return "Yes";
}

export default function ProjectActiveWorkersModal({
  workers,
  siteForms,
  leaveRequests,
  projectName,
  onClose,
}: ProjectActiveWorkersModalProps) {
  const [searchQuery, setSearchQuery] = useState("");
  const todayIso = localIsoDate();

  const filteredWorkers = useMemo(() => {
    const query = searchQuery.trim().toLowerCase();
    const sorted = [...workers].sort((left, right) =>
      getWorkerDisplayName(left).localeCompare(getWorkerDisplayName(right))
    );
    if (!query) return sorted;

    return sorted.filter((worker) => {
      const name = getWorkerDisplayName(worker).toLowerCase();
      const trade = workerTradeLabel(worker).toLowerCase();
      const contact = workerContactLabel(worker).toLowerCase();
      return name.includes(query) || trade.includes(query) || contact.includes(query);
    });
  }, [workers, searchQuery]);

  return (
    <div className={modalOverlayClass} onClick={onClose}>
      <div
        className={`${modalClass} max-w-6xl`}
        onClick={(event) => event.stopPropagation()}
      >
        <div className="mb-4 flex items-start justify-between gap-3">
          <div>
            <h2 className="text-lg font-bold text-slate-900">Active Workers</h2>
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
          <span className={labelClass}>Search by name</span>
          <div className="relative mt-1">
            <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
            <input
              type="search"
              value={searchQuery}
              onChange={(event) => setSearchQuery(event.target.value)}
              placeholder="Worker name, trade, email, or phone…"
              className={cn(inputClass, "pl-9")}
            />
          </div>
        </label>

        {filteredWorkers.length === 0 ? (
          <p className="rounded-lg border border-slate-200 bg-slate-50 px-4 py-8 text-center text-sm text-slate-500">
            No workers assigned to this project.
          </p>
        ) : (
          <div className="overflow-x-auto rounded-xl border border-slate-200">
            <table className="min-w-full divide-y divide-slate-200 text-sm">
              <thead className="bg-slate-50">
                <tr>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Worker
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Trade / role
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Apprentice
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Contact
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Company vehicle
                  </th>
                  <th className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-slate-500">
                    Onsite status
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 bg-white">
                {filteredWorkers.map((worker) => {
                  const onsiteStatus = getWorkerOnsiteStatus(
                    worker.id,
                    siteForms,
                    leaveRequests,
                    todayIso
                  );

                  return (
                    <tr key={worker.id} className="hover:bg-slate-50/80">
                      <td className="whitespace-nowrap px-4 py-3 font-medium text-slate-900">
                        {getWorkerDisplayName(worker)}
                      </td>
                      <td className="px-4 py-3 text-slate-700">{workerTradeLabel(worker)}</td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {worker.is_apprentice ? "Apprentice" : "—"}
                      </td>
                      <td className="max-w-xs px-4 py-3 text-slate-700">
                        <span className="line-clamp-2">{workerContactLabel(worker)}</span>
                      </td>
                      <td className="whitespace-nowrap px-4 py-3 text-slate-700">
                        {workerVehicleLabel(worker)}
                      </td>
                      <td className="whitespace-nowrap px-4 py-3">
                        <span
                          className={cn(
                            "rounded-full px-2.5 py-0.5 text-xs font-semibold",
                            onsiteStatus === "On Site"
                              ? "bg-emerald-100 text-emerald-800"
                              : onsiteStatus === "On Leave"
                                ? "bg-amber-100 text-amber-900"
                                : "bg-slate-100 text-slate-700"
                          )}
                        >
                          {onsiteStatus}
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
          {filteredWorkers.length} worker{filteredWorkers.length === 1 ? "" : "s"} assigned
        </p>
      </div>
    </div>
  );
}
