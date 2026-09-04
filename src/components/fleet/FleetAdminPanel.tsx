"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { Archive, ArchiveRestore, Loader2, Plus, Search, Trash2 } from "lucide-react";
import {
  fetchOrganizationFleet,
  FLEET_STATUSES,
  type FleetDocumentType,
  type FleetStatus,
  type OrganizationFleetVehicle,
} from "@/lib/organization-fleet";
import {
  archiveFleetVehicle,
  deleteFleetVehicle,
  fleetVehicleDisplayName,
  isFleetArchived,
  restoreFleetVehicle,
  applyOptimisticFleetArchive,
  applyOptimisticFleetRestore,
} from "@/lib/fleet-archive";
import {
  fleetStatusMeta,
  formatFleetAssignedWorker,
  getFleetRegoExpiryStatus,
  matchesFleetSearch,
} from "@/lib/fleet-utils";
import AddFleetModal from "@/components/fleet/AddFleetModal";
import FleetDocumentsModal from "@/components/fleet/FleetDocumentsModal";
import FleetArchiveModal from "@/components/fleet/FleetArchiveModal";
import FleetDeleteConfirmModal from "@/components/fleet/FleetDeleteConfirmModal";
import {
  organisationRowDomId,
  scrollToOrganisationRow,
  shouldOpenDeepLinkModal,
  useOrganisationEntityDeepLink,
} from "@/hooks/useOrganisationEntityDeepLink";
import { useFormToast } from "@/hooks/useFormToast";
import Toast from "@/components/ui/Toast";
import { cn } from "@/lib/utils";
import { cardClass, inputClass } from "@/lib/ui-classes";

type FleetListTab = "active" | "archived";

export default function FleetAdminPanel() {
  const { toast, showError, showSuccess, dismissToast } = useFormToast();
  const { target, hasDeepLink, clearDeepLink } = useOrganisationEntityDeepLink();
  const deepLinkHandledRef = useRef<string | null>(null);
  const [vehicles, setVehicles] = useState<OrganizationFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [searchQuery, setSearchQuery] = useState("");
  const [statusFilter, setStatusFilter] = useState<FleetStatus | "All">("All");
  const [showAddModal, setShowAddModal] = useState(false);
  const [editVehicle, setEditVehicle] = useState<OrganizationFleetVehicle | null>(null);
  const [documentsVehicle, setDocumentsVehicle] =
    useState<OrganizationFleetVehicle | null>(null);
  const [documentsDocumentType, setDocumentsDocumentType] =
    useState<FleetDocumentType>("rego");
  const [highlightId, setHighlightId] = useState<string | null>(null);
  const [listTab, setListTab] = useState<FleetListTab>("active");
  const [archiveTarget, setArchiveTarget] = useState<OrganizationFleetVehicle | null>(
    null
  );
  const [deleteTarget, setDeleteTarget] = useState<OrganizationFleetVehicle | null>(null);
  const [actionBusy, setActionBusy] = useState(false);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    const rows = await fetchOrganizationFleet();
    setVehicles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  useEffect(() => {
    if (!hasDeepLink || !target.id || loading) return;

    const deepLinkKey = `${target.id}:${target.documentType ?? ""}:${target.action ?? "edit"}`;
    if (deepLinkHandledRef.current === deepLinkKey) return;

    const vehicle = vehicles.find((row) => row?.id === target.id);
    if (!vehicle) {
      console.warn("Fleet deep link: vehicle not found", target.id);
      showError("Item not found or has been removed.");
      deepLinkHandledRef.current = deepLinkKey;
      clearDeepLink();
      return;
    }

    deepLinkHandledRef.current = deepLinkKey;
    setListTab(isFleetArchived(vehicle) ? "archived" : "active");
    setHighlightId(vehicle.id);
    scrollToOrganisationRow(organisationRowDomId("fleet", vehicle.id));

    if (!shouldOpenDeepLinkModal(target)) return;

    const documentType =
      target.documentType === "insurance" || target.documentType === "rego"
        ? target.documentType
        : null;

    if (documentType) {
      setDocumentsDocumentType(documentType);
      setDocumentsVehicle(vehicle);
      return;
    }

    setEditVehicle(vehicle);
  }, [clearDeepLink, hasDeepLink, loading, showError, target, vehicles]);

  const closeEditModal = () => {
    setEditVehicle(null);
    setHighlightId(null);
    clearDeepLink();
  };

  const closeDocumentsModal = () => {
    setDocumentsVehicle(null);
    setHighlightId(null);
    clearDeepLink();
  };

  const activeCount = useMemo(
    () => vehicles.filter((vehicle) => !isFleetArchived(vehicle)).length,
    [vehicles]
  );
  const archivedCount = useMemo(
    () => vehicles.filter((vehicle) => isFleetArchived(vehicle)).length,
    [vehicles]
  );

  const filteredVehicles = useMemo(() => {
    return vehicles.filter((vehicle) => {
      const archived = isFleetArchived(vehicle);
      const matchesTab = listTab === "archived" ? archived : !archived;
      const matchesStatus =
        listTab === "archived" ||
        statusFilter === "All" ||
        vehicle.status === statusFilter;
      const matchesSearch =
        !searchQuery.trim() || matchesFleetSearch(vehicle, searchQuery);
      return matchesTab && matchesStatus && matchesSearch;
    });
  }, [vehicles, searchQuery, statusFilter, listTab]);

  const patchVehicle = useCallback((updated: OrganizationFleetVehicle) => {
    setVehicles((prev) => prev.map((row) => (row.id === updated.id ? updated : row)));
  }, []);

  const handleArchive = async (reason: string) => {
    if (!archiveTarget) return;
    setActionBusy(true);
    const target = archiveTarget;
    const { error } = await archiveFleetVehicle(target.id, reason);
    setActionBusy(false);
    if (error) {
      showError(error);
      return;
    }
    patchVehicle(applyOptimisticFleetArchive(target, reason));
    setArchiveTarget(null);
    showSuccess("Fleet vehicle archived");
    void loadFleet();
  };

  const handleRestore = async (vehicle: OrganizationFleetVehicle) => {
    setActionBusy(true);
    const { error } = await restoreFleetVehicle(vehicle.id);
    setActionBusy(false);
    if (error) {
      showError(error);
      return;
    }
    patchVehicle(applyOptimisticFleetRestore(vehicle));
    showSuccess("Fleet vehicle restored");
    void loadFleet();
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setActionBusy(true);
    const target = deleteTarget;
    const { error } = await deleteFleetVehicle(target.id);
    setActionBusy(false);
    if (error) {
      showError(error);
      return;
    }
    setVehicles((prev) => prev.filter((row) => row.id !== target.id));
    if (editVehicle?.id === target.id) setEditVehicle(null);
    if (documentsVehicle?.id === target.id) setDocumentsVehicle(null);
    setDeleteTarget(null);
    showSuccess("Fleet vehicle deleted");
    void loadFleet();
  };

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
        {listTab === "active" ? (
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
        ) : null}
      </div>

      <div className="mb-4 flex flex-wrap gap-2">
        {(
          [
            { id: "active", label: "Active", count: activeCount },
            { id: "archived", label: "Archived", count: archivedCount },
          ] as const
        ).map((tab) => (
          <button
            key={tab.id}
            type="button"
            onClick={() => setListTab(tab.id)}
            className={cn(
              "rounded-lg px-4 py-2 text-sm font-semibold transition",
              listTab === tab.id
                ? "bg-orange-500 text-white shadow-sm"
                : "border border-slate-200 bg-white text-slate-600 hover:border-orange-300 hover:text-orange-600"
            )}
          >
            {tab.label} ({tab.count})
          </button>
        ))}
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
                    {searchQuery.trim()
                      ? "No fleet vehicles match your search."
                      : listTab === "archived"
                        ? "No archived fleet vehicles."
                        : "No active fleet vehicles."}
                  </td>
                </tr>
              ) : (
                filteredVehicles.map((vehicle) => {
                  const archived = isFleetArchived(vehicle);
                  const regoStatus = getFleetRegoExpiryStatus(vehicle.rego_expiry_date);
                  const status = fleetStatusMeta(
                    archived ? "archived" : vehicle.status
                  );

                  return (
                    <tr
                      key={vehicle.id}
                      id={organisationRowDomId("fleet", vehicle.id)}
                      className={cn(
                        "border-b border-slate-100 last:border-0",
                        highlightId === vehicle.id &&
                          "bg-orange-50 ring-2 ring-inset ring-orange-300"
                      )}
                    >
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
                          {!archived ? (
                            <button
                              type="button"
                              onClick={() => setArchiveTarget(vehicle)}
                              className="inline-flex items-center gap-1 rounded-md border border-slate-300 px-2.5 py-1 text-xs font-medium text-slate-700 hover:bg-slate-50"
                            >
                              <Archive className="h-3.5 w-3.5" />
                              Archive Vehicle
                            </button>
                          ) : (
                            <button
                              type="button"
                              disabled={actionBusy}
                              onClick={() => void handleRestore(vehicle)}
                              className="inline-flex items-center gap-1 rounded-md border border-emerald-200 bg-emerald-50 px-2.5 py-1 text-xs font-medium text-emerald-800 hover:bg-emerald-100 disabled:opacity-50"
                            >
                              <ArchiveRestore className="h-3.5 w-3.5" />
                              Restore Vehicle
                            </button>
                          )}
                          <button
                            type="button"
                            onClick={() => setDeleteTarget(vehicle)}
                            className="inline-flex items-center gap-1 rounded-md border border-red-200 bg-red-50 px-2.5 py-1 text-xs font-medium text-red-700 hover:bg-red-100"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                            Delete Vehicle
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
          onClose={closeEditModal}
          onSaved={() => void loadFleet()}
        />
      ) : null}

      {documentsVehicle ? (
        <FleetDocumentsModal
          vehicle={documentsVehicle}
          documentType={documentsDocumentType}
          onClose={closeDocumentsModal}
          onSaved={() => void loadFleet()}
        />
      ) : null}

      {archiveTarget ? (
        <FleetArchiveModal
          vehicleLabel={fleetVehicleDisplayName(archiveTarget)}
          saving={actionBusy}
          onClose={() => {
            if (!actionBusy) setArchiveTarget(null);
          }}
          onConfirm={handleArchive}
        />
      ) : null}

      {deleteTarget ? (
        <FleetDeleteConfirmModal
          vehicleLabel={fleetVehicleDisplayName(deleteTarget)}
          deleting={actionBusy}
          onClose={() => {
            if (!actionBusy) setDeleteTarget(null);
          }}
          onConfirm={handleDelete}
        />
      ) : null}

      {toast ? (
        <Toast message={toast.message} variant={toast.variant} onDismiss={dismissToast} />
      ) : null}
    </div>
  );
}
