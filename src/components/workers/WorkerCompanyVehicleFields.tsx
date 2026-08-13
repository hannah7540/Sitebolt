"use client";

import { useEffect, useMemo, useState } from "react";
import {
  fetchOrganizationFleet,
  type OrganizationFleetVehicle,
} from "@/lib/organization-fleet";
import { inputClass, labelClass } from "@/lib/ui-classes";

function formatFleetVehicleLabel(vehicle: OrganizationFleetVehicle): string {
  const parts = [vehicle.unit_number.trim()];
  const makeModel = [vehicle.make, vehicle.model].filter(Boolean).join(" ").trim();
  if (makeModel) parts.push(makeModel);
  if (vehicle.registration?.trim()) parts.push(`(${vehicle.registration.trim()})`);
  return parts.join(" — ");
}

interface WorkerCompanyVehicleFieldsProps {
  hasCompanyVehicle: boolean;
  assignedVehicleId: string | null;
  onHasCompanyVehicleChange: (value: boolean) => void;
  onAssignedVehicleChange: (vehicleId: string | null) => void;
  disabled?: boolean;
  idPrefix?: string;
}

export default function WorkerCompanyVehicleFields({
  hasCompanyVehicle,
  assignedVehicleId,
  onHasCompanyVehicleChange,
  onAssignedVehicleChange,
  disabled = false,
  idPrefix = "worker-company-vehicle",
}: WorkerCompanyVehicleFieldsProps) {
  const [fleet, setFleet] = useState<OrganizationFleetVehicle[]>([]);
  const [loadingFleet, setLoadingFleet] = useState(true);

  useEffect(() => {
    let cancelled = false;

    void (async () => {
      setLoadingFleet(true);
      const vehicles = await fetchOrganizationFleet();
      if (!cancelled) {
        setFleet(vehicles);
        setLoadingFleet(false);
      }
    })();

    return () => {
      cancelled = true;
    };
  }, []);

  const vehicleOptions = useMemo(() => {
    const active = fleet.filter((vehicle) => vehicle.status === "Active");
    if (
      assignedVehicleId &&
      !active.some((vehicle) => vehicle.id === assignedVehicleId)
    ) {
      const current = fleet.find((vehicle) => vehicle.id === assignedVehicleId);
      if (current) return [current, ...active];
    }
    return active;
  }, [assignedVehicleId, fleet]);

  return (
    <div className="space-y-3">
      <label className="flex items-center gap-2">
        <input
          id={`${idPrefix}-toggle`}
          type="checkbox"
          checked={hasCompanyVehicle}
          onChange={(event) => {
            const checked = event.target.checked;
            onHasCompanyVehicleChange(checked);
            if (!checked) onAssignedVehicleChange(null);
          }}
          disabled={disabled}
          className="h-4 w-4 rounded border-slate-300 text-orange-600 focus:ring-orange-500"
        />
        <span className={labelClass}>Assigned a Company Vehicle? (Yes/No)</span>
      </label>

      {hasCompanyVehicle ? (
        <label className="block space-y-1">
          <span className={labelClass}>Company vehicle *</span>
          <select
            id={`${idPrefix}-select`}
            className={inputClass}
            value={assignedVehicleId ?? ""}
            onChange={(event) =>
              onAssignedVehicleChange(event.target.value.trim() || null)
            }
            disabled={disabled || loadingFleet}
            required
          >
            <option value="">
              {loadingFleet ? "Loading fleet vehicles…" : "Select active vehicle"}
            </option>
            {vehicleOptions.map((vehicle) => (
              <option key={vehicle.id} value={vehicle.id}>
                {formatFleetVehicleLabel(vehicle)}
                {vehicle.status !== "Active" ? ` — ${vehicle.status}` : ""}
              </option>
            ))}
          </select>
          {!loadingFleet && vehicleOptions.length === 0 ? (
            <p className="text-xs text-amber-700">
              No active fleet vehicles found. Add vehicles under Organisation → Fleet.
            </p>
          ) : null}
        </label>
      ) : null}
    </div>
  );
}
