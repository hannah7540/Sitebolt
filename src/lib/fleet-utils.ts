import { daysUntil } from "./worker-utils";
import type { FleetDocumentType, FleetStatus, OrganizationFleetVehicle } from "./organization-fleet";

export function getFleetRegoExpiryStatus(expiryDate: string | null | undefined): {
  days: number | null;
  tone: "none" | "valid" | "warning" | "danger";
  label: string;
  cellClass: string;
} {
  const days = daysUntil(expiryDate);
  if (days === null) {
    return {
      days: null,
      tone: "none",
      label: "Not set",
      cellClass: "text-slate-500",
    };
  }
  if (days < 0) {
    return {
      days,
      tone: "danger",
      label: "Expired",
      cellClass: "font-semibold text-red-700",
    };
  }
  if (days <= 30) {
    return {
      days,
      tone: "danger",
      label: `${days} day${days === 1 ? "" : "s"} remaining`,
      cellClass: "font-semibold text-red-700",
    };
  }
  if (days <= 60) {
    return {
      days,
      tone: "warning",
      label: `${days} days remaining`,
      cellClass: "font-semibold text-amber-700",
    };
  }
  return {
    days,
    tone: "valid",
    label: `${days} days remaining`,
    cellClass: "text-slate-700",
  };
}

export function getFleetDocumentExpiryLabel(
  expiryDate: string | null | undefined
): string {
  const days = daysUntil(expiryDate);
  if (days === null) return "No expiry set";
  if (days < 0) return "EXPIRED";
  if (days === 0) return "Expires today";
  if (days === 1) return "Expires in 1 day";
  return `Expires in ${days} days`;
}

export function fleetStatusMeta(status: FleetStatus): {
  label: string;
  badgeClass: string;
} {
  switch (status) {
    case "Maintenance":
      return {
        label: "Maintenance",
        badgeClass: "bg-amber-100 text-amber-800",
      };
    case "Out of Service":
      return {
        label: "Out of Service",
        badgeClass: "bg-red-100 text-red-800",
      };
    default:
      return {
        label: "Active",
        badgeClass: "bg-emerald-100 text-emerald-800",
      };
  }
}

export function formatFleetAssignment(vehicle: OrganizationFleetVehicle): string {
  const parts = [
    vehicle.assigned_worker_name,
    vehicle.assigned_project_name,
  ].filter(Boolean);
  return parts.length > 0 ? parts.join(" · ") : "Unassigned";
}

export function fleetDocumentTypeLabel(type: FleetDocumentType): string {
  return type === "rego" ? "Registration Expiry" : "Insurance Expiry";
}

export interface ExpiringFleetAlert {
  vehicle: OrganizationFleetVehicle;
  documentType: FleetDocumentType;
  expiryDate: string;
  daysRemaining: number;
  isExpired: boolean;
}

export const FLEET_WIDGET_EXPIRY_WINDOW_DAYS = 14;

export function getExpiringFleetAlertTone(daysRemaining: number, isExpired: boolean): {
  cardClass: string;
  textClass: string;
  badgeClass: string;
  badgeLabel: string;
} {
  if (isExpired || daysRemaining <= 7) {
    return {
      cardClass: "border-red-200 bg-red-50",
      textClass: "text-red-700",
      badgeClass: "bg-red-100 text-red-800",
      badgeLabel: isExpired ? "Expired" : "Critical",
    };
  }

  return {
    cardClass: "border-amber-200 bg-amber-50",
    textClass: "text-amber-700",
    badgeClass: "bg-amber-100 text-amber-800",
    badgeLabel: "Expiring Soon",
  };
}

export function collectExpiringFleetAlerts(
  vehicles: OrganizationFleetVehicle[],
  withinDays = FLEET_WIDGET_EXPIRY_WINDOW_DAYS
): ExpiringFleetAlert[] {
  const alerts: ExpiringFleetAlert[] = [];

  for (const vehicle of vehicles) {
    for (const documentType of ["rego", "insurance"] as const) {
      const expiryDate =
        documentType === "rego"
          ? vehicle.rego_expiry_date
          : vehicle.insurance_expiry_date;
      const days = daysUntil(expiryDate);
      if (days === null || !expiryDate) continue;
      if (days <= withinDays) {
        alerts.push({
          vehicle,
          documentType,
          expiryDate,
          daysRemaining: days,
          isExpired: days < 0,
        });
      }
    }
  }

  return alerts.sort((a, b) => a.daysRemaining - b.daysRemaining);
}

export function matchesFleetSearch(
  vehicle: OrganizationFleetVehicle,
  query: string
): boolean {
  const haystack = [
    vehicle.unit_number,
    vehicle.make,
    vehicle.model,
    vehicle.registration,
    vehicle.status,
    vehicle.assigned_worker_name,
    vehicle.assigned_project_name,
  ]
    .filter(Boolean)
    .join(" ")
    .toLowerCase();

  return haystack.includes(query.trim().toLowerCase());
}
