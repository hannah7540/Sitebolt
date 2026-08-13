"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { Loader2, Plus, Search } from "lucide-react";
import {
  fetchOrganizationFleet,
  FLEET_STATUSES,
  type FleetStatus,
  type OrganizationFleetVehicle,
} from "@/lib/organization-fleet";
import {
  fleetStatusMeta,
  formatFleetAssignedWorker,
  getFleetRegoExpiryStatus,
  matchesFleetSearch,
} from "@/lib/fleet-utils";
import AddFleetModal from "@/components/fleet/AddFleetModal";
import FleetDocumentsModal from "@/components/fleet/FleetDocumentsModal";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

export default function FleetAdminPanel() {
  const [vehicles, setVehicles] = useState<OrganizationFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FleetStatus | "All">("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<OrganizationFleetVehicle | null>(null);
  const [documentsVehicle, setDocumentsVehicle] =
    useState<OrganizationFleetVehicle | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    const rows = await fetchOrganizationFleet();
    setVehicles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const matchesStatus =
        statusFilter === "All" || vehicle.status === statusFilter;
      const matchesSearch =
        !searchQuery.trim() || matchesFleetSearch(vehicle, searchQuery);
      return matchesStatus && matchesSearch;
    });
  }, [vehicles, searchQuery, statusFilter]);

  return (
    <div>
      <div className="mb-6 flex flex-col gap-4 lg:flex-row lg:items-end lg:justify-between">
        <div>
          <h1 className="text-2xl font-bold text-slate-900">
            Organisation <span className="text-orange-500">Fleet</span>
          </h1>
          <p className="mt-1 text-sm text-slate-500">
            Manage company vehicles, registration compliance, and insurance documents.
          </p>
        </div>
        <button
          type="button"
          onClick={() => setShowAddModal(true)}
          className="inline-flex items-center gap-2 rounded-lg bg-orange-500 px-4 py-2 text-sm font-semibold text-white shadow-sm hover:bg-orange-600"
        >
          <Plus className="h-4 w-4" />
          Add Vehicle
        </button>
      </div>

      <div className="mb-4 flex flex-col gap-3 lg:flex-row lg:items-center">
        <div className="relative max-w-md flex-1">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-slate-400" />
          <input
            type="search"
            value={searchQuery}
            onChange={(event) => setSearchQuery(event.target.value)}
            placeholder="Search unit number, make, model, rego, or status…"
            className={cn(inputClass, "pl-9")}
          />
        </div>
        <select
          className={cn(inputClass, "max-w-xs")}
          value={statusFilter}
          onChange={(event) =>
            setStatusFilter(event.target.value as FleetStatus | "All")
          }
        >
          <option value="All">All statuses</option>
          {FLEET_STATUSES.map((status) => (
            <option key={status} value={status}>
              {status}
            </option>
          ))}
        </select>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Loading fleet…
        </div>
      ) : (
        <div className={`overflow-x-auto ${cardClass}`}>
          <table className="min-w-full text-sm">
            <thead className="border-b border-slate-200 bg-slate-50 text-left text-xs uppercase tracking-wide text-slate-500">
              <tr>
                <th className="px-4 py-3">Unit Number</th>
                <th className="px-4 py-3">Make & Model</th>
                <th className="px-4 py-3">Registration</th>
                <th className="px-4 py-3">Rego Expiry</th>
                <th className="px-4 py-3">Current Hours</th>
                <th className="px-4 py-3">Assigned Worker</th>
                <th className="px-4 py-3">Status</th>
                <th className="px-4 py-3">Actions</th>
              </tr>
            </thead>
            <tbody>
              {filteredVehicles.length === 0 ? (
                <tr>
                  <td colSpan={8} className="px-4 py-8 text-center text-slate-500">
                    No fleet vehicles match your search.
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const regoStatus = getFleetRegoExpiryStatus(vehicle.rego_expiry_date);
                  const status = fleetStatusMeta(vehicle.status);

                  return (
                    <tr key={vehicle.id} className="border-b border-slate-100 last:border-0">
                      <td className="px-4 py-3 font-medium text-slate-900">
                        {vehicle.unit_number}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {[vehicle.make, vehicle.model].filter(Boolean).join(" ") || "—"}
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {vehicle.registration ?? "—"}
                      </td>
                      <td className="px-4 py-3">
                        <div className={regoStatus.cellClass}>
                          {vehicle.rego_expiry_date
                            ? new Date(`${vehicle.rego_expiry_date}T12:00:00`).toLocaleDateString(
                                "en-AU"
                              )
                            : "Not set"}
                        </div>
                        <p className={cn("text-xs", regoStatus.cellClass)}>
                          {regoStatus.label}
                        </p>
                      </td>
                      <td className="px-4 py-3 text-slate-700">
                        {Number(vehicle.current_hours).toLocaleString()} hrs
                      </td>
                      <td className="px-4 py-3 text-slate-600">
                        {formatFleetAssignedWorker(vehicle)}
                      </td>
                      <td className="px-4 py-3">
                        <span
                          className={cn(
                            "inline-flex rounded px-2 py-0.5 text-xs font-semibold",
                            status.badgeClass
                          )}
                        >
                          {status.label}
                        </span>
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex flex-wrap gap-2">
                          <button
                            type="button"
                            onClick={() => setEditVehicle(vehicle)}
                            className="rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                          >
                            Edit
                          </button>
                          <button
                            type="button"
                            onClick={() => setDocumentsVehicle(vehicle)}
                            className="rounded-md border border-orange-200 px-2.5 py-1 text-xs font-medium text-orange-600 hover:bg-orange-50"
                          >
                            Upload Documents
                          </button>
                        </div>
                      </td>
                    </tr>
                  );
                })
              )}
            </tbody>
          </table>
        </div>
      )}

      {showAddModal ? (
        <AddFleetModal
          onClose={() => setShowAddModal(false)}
          onSaved={() => void loadFleet()}
        />
      ) : null}

      {editVehicle ? (
        <AddFleetModal
          vehicle={editVehicle}
          onClose={() => setEditVehicle(null)}
          onSaved={() => void loadFleet()}
        />
      ) : null}

      {documentsVehicle ? (
        <FleetDocumentsModal
          vehicle={documentsVehicle}
          onClose={() => setDocumentsVehicle(null)}
          onSaved={() => void loadFleet()}
        />
      ) : null}
    </div>
  );
}
