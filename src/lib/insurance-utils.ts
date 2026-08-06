import { daysUntil, getTicketStatus, getTicketBadgeLabel } from "./worker-utils";

export const INSURANCE_TYPES = [
  "Workers Comp",
  "Public Liability",
  "Plant Insurance",
  "Other",
] as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[number];

export function getInsuranceExpiryStatus(expiryDate: string | null | undefined) {
  const status = getTicketStatus(expiryDate);
  return {
    status,
    label: getTicketBadgeLabel(status),
    badgeClass:
      status === "valid"
        ? "bg-emerald-100 text-emerald-800"
        : status === "expires_soon"
          ? "bg-amber-100 text-amber-800"
          : status === "expired"
            ? "bg-red-100 text-red-800"
            : "bg-slate-100 text-slate-600",
    days: daysUntil(expiryDate),
  };
}
