"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AlertTriangle, Car, Loader2 } from "lucide-react";
import { fetchOrganizationFleet, type OrganizationFleetVehicle } from "@/lib/organization-fleet";
import {
  collectExpiringFleetAlerts,
  fleetDocumentTypeLabel,
  FLEET_WIDGET_EXPIRY_WINDOW_DAYS,
  getExpiringFleetAlertTone,
  getFleetDocumentExpiryLabel,
  type ExpiringFleetAlert,
} from "@/lib/fleet-utils";
import FleetDocumentsModal from "@/components/fleet/FleetDocumentsModal";
import { cn } from "@/lib/utils";
import { cardClass } from "@/lib/ui-classes";

interface ExpiringFleetWidgetProps {
  className?: string;
}

export default function ExpiringFleetWidget({ className }: ExpiringFleetWidgetProps) {
  const [vehicles, setVehicles] = useState<OrganizationFleetVehicle[]>([]);
  const [loading, setLoading] = useState(true);
  const [selectedAlert, setSelectedAlert] = useState<ExpiringFleetAlert | null>(null);

  const loadFleet = useCallback(async () => {
    setLoading(true);
    const rows = await fetchOrganizationFleet();
    setVehicles(rows);
    setLoading(false);
  }, []);

  useEffect(() => {
    void loadFleet();
  }, [loadFleet]);

  const alerts = useMemo(
    () => collectExpiringFleetAlerts(vehicles, FLEET_WIDGET_EXPIRY_WINDOW_DAYS),
    [vehicles]
  );

  return (
    <div className={cn(cardClass, "flex flex-col gap-4 p-4 sm:col-span-2", className)}>
      <div className="flex items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl border border-orange-200 bg-orange-50 text-orange-600">
          <Car className="h-6 w-6" />
        </div>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-slate-900">Documents Expiring Within 14 Days</p>
          <p className="mt-0.5 text-xs text-slate-500">
            Registration and insurance due within the next 14 days
          </p>
        </div>
      </div>

      {loading ? (
        <div className="flex items-center gap-2 text-sm text-slate-500">
          <Loader2 className="h-4 w-4 animate-spin text-orange-500" />
          Checking fleet compliance…
        </div>
      ) : alerts.length === 0 ? (
        <p className="rounded-lg border border-emerald-200 bg-emerald-50 px-3 py-2 text-sm text-emerald-800">
          All fleet documents are current beyond the next 14 days.
        </p>
      ) : (
        <div className="space-y-3">
          {alerts.map((alert) => {
            const tone = getExpiringFleetAlertTone(
              alert.daysRemaining,
              alert.isExpired
            );

            return (
              <div
                key={`${alert.vehicle.id}-${alert.documentType}`}
                className={cn("rounded-lg border p-3", tone.cardClass)}
              >
                <div className="flex flex-wrap items-start justify-between gap-3">
                  <div>
                    <div className="mb-2 flex flex-wrap items-center gap-2">
                      <span
                        className={cn(
                          "inline-flex rounded px-2 py-0.5 text-[10px] font-bold uppercase tracking-wide",
                          tone.badgeClass
                        )}
                      >
                        {tone.badgeLabel}
                      </span>
                    </div>
                    <p className="font-semibold text-slate-900">
                      {alert.vehicle.unit_number} · {alert.vehicle.make}{" "}
                      {alert.vehicle.model}
                    </p>
                    <p className="text-xs text-slate-600">
                      Rego {alert.vehicle.registration ?? "—"}
                    </p>
                    <p className="mt-2 text-sm font-medium text-slate-800">
                      {fleetDocumentTypeLabel(alert.documentType)}
                    </p>
                    <p className="text-xs text-slate-600">
                      Expiry{" "}
                      {new Date(`${alert.expiryDate}T12:00:00`).toLocaleDateString("en-AU")} ·{" "}
                      <span className={cn("font-semibold", tone.textClass)}>
                        {getFleetDocumentExpiryLabel(alert.expiryDate)}
                      </span>
                    </p>
                  </div>
                  <button
                    type="button"
                    onClick={() => setSelectedAlert(alert)}
                    className="rounded-lg bg-orange-500 px-3 py-1.5 text-xs font-semibold text-white hover:bg-orange-600"
                  >
                    {alert.documentType === "rego" ? "Update Rego" : "Update Insurance"}
                  </button>
                </div>
                {alert.isExpired ? (
                  <p className="mt-2 inline-flex items-center gap-1 text-xs font-semibold uppercase tracking-wide text-red-700">
                    <AlertTriangle className="h-3.5 w-3.5" />
                    Expired — action required
                  </p>
                ) : null}
              </div>
            );
          })}
        </div>
      )}

      {selectedAlert ? (
        <FleetDocumentsModal
          vehicle={selectedAlert.vehicle}
          documentType={selectedAlert.documentType}
          onClose={() => setSelectedAlert(null)}
          onSaved={() => {
            setSelectedAlert(null);
            void loadFleet();
          }}
        />
      ) : null}
    </div>
  );
}
