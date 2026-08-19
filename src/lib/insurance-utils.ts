import { WARNING_DAYS } from "./worker-utils";

function cleanInsuranceDateLocal(value: unknown): string | null {
  if (value && typeof value === "string" && value.trim() !== "") {
    return value.trim().split("T")[0] ?? null;
  }
  return null;
}
import {
  WORKER_STATE_REGION_OPTIONS,
  type WorkerStateRegion,
} from "./worker-state-region";

export const INSURANCE_REGION_OPTIONS = WORKER_STATE_REGION_OPTIONS;

export type InsuranceRegion = WorkerStateRegion;

export const ALL_INSURANCE_REGIONS: InsuranceRegion[] = [...INSURANCE_REGION_OPTIONS];

export function normalizeInsuranceRegions(
  values: string[] | null | undefined
): InsuranceRegion[] {
  if (!values?.length) return [];
  const allowed = new Set<string>(INSURANCE_REGION_OPTIONS);
  return values
    .map((value) => value.trim().toUpperCase())
    .filter((value): value is InsuranceRegion => allowed.has(value));
}

export function insuranceCoversAllRegions(input: {
  all_states?: boolean | null;
  states?: string[] | null;
}): boolean {
  if (input.all_states) return true;
  const normalized = normalizeInsuranceRegions(input.states);
  return ALL_INSURANCE_REGIONS.every((region) => normalized.includes(region));
}

export function formatInsuranceRegionLabel(input: {
  all_states?: boolean | null;
  states?: string[] | null;
}): string {
  if (insuranceCoversAllRegions(input)) {
    return "All Regions (ACT, NSW, WA, NZ)";
  }
  const regions = normalizeInsuranceRegions(input.states);
  return regions.length > 0 ? regions.join(", ") : "No regions selected";
}

export function formatInsuranceRegionBadges(input: {
  all_states?: boolean | null;
  states?: string[] | null;
}): string[] {
  if (insuranceCoversAllRegions(input)) {
    return ["All Regions (ACT, NSW, WA, NZ)"];
  }
  return normalizeInsuranceRegions(input.states);
}

export function buildInsuranceRegionSavePayload(input: {
  allStates: boolean;
  selectedStates: InsuranceRegion[];
}): { all_states: boolean; states: InsuranceRegion[] } {
  if (input.allStates) {
    return { all_states: true, states: [...ALL_INSURANCE_REGIONS] };
  }
  return {
    all_states: false,
    states: normalizeInsuranceRegions(input.selectedStates),
  };
}

export const INSURANCE_TYPES = [
  "Public Liability Insurance",
  "Worker Compensation Insurance",
  "Other Insurance",
] as const;

export const OTHER_INSURANCE_TYPE = "Other Insurance" as const;

export type InsuranceType = (typeof INSURANCE_TYPES)[number];

export interface InsuranceDocumentAttachment {
  name: string;
  url: string;
  uploaded_at: string;
  size?: number;
}

export function formatInsuranceFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export const INSURANCE_EXPIRY_ALERT_WINDOW_DAYS = WARNING_DAYS;

/** Parse an insurance expiry date safely; returns ISO date (YYYY-MM-DD) or null. */
export function parseInsuranceExpiryDate(value: unknown): string | null {
  const iso = cleanInsuranceDateLocal(value);
  if (!iso) return null;
  const parsed = new Date(iso);
  if (Number.isNaN(parsed.getTime())) return null;
  return iso;
}

/** Days until expiry with NaN guards; null when date is missing or invalid. */
export function calculateInsuranceDaysRemaining(
  expiryDate: string | null | undefined
): number | null {
  const iso = parseInsuranceExpiryDate(expiryDate);
  if (!iso) return null;
  const target = new Date(iso);
  if (Number.isNaN(target.getTime())) return null;
  target.setHours(0, 0, 0, 0);
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  return Math.ceil((target.getTime() - today.getTime()) / (1000 * 60 * 60 * 24));
}

export function isWithinInsuranceAlertWindow(
  expiryDate: string | null | undefined
): boolean {
  const days = calculateInsuranceDaysRemaining(expiryDate);
  if (days === null) return false;
  return days <= INSURANCE_EXPIRY_ALERT_WINDOW_DAYS;
}

export function resolveInsuranceCoverageDisplay(input: {
  all_states?: boolean | null;
  states?: string[] | null;
  coverage_amount?: unknown;
  sum_insured?: unknown;
  limit_amount?: unknown;
}): string {
  for (const key of ["coverage_amount", "sum_insured", "limit_amount"] as const) {
    const value = input[key];
    if (typeof value === "number" && Number.isFinite(value)) {
      return new Intl.NumberFormat("en-AU", {
        style: "currency",
        currency: "AUD",
        maximumFractionDigits: 0,
      }).format(value);
    }
    if (typeof value === "string" && value.trim()) {
      return value.trim();
    }
  }
  return formatInsuranceRegionLabel(input);
}

export function getInsuranceExpiryStatus(expiryDate: string | null | undefined) {
  const days = calculateInsuranceDaysRemaining(expiryDate);
  if (days === null) {
    return {
      status: "unknown" as const,
      label: "No Expiry Set",
      badgeClass: "bg-slate-100 text-slate-600",
      days: null,
    };
  }

  const status =
    days < 0 ? "expired" : days <= INSURANCE_EXPIRY_ALERT_WINDOW_DAYS ? "expires_soon" : "valid";
  const label =
    status === "valid"
      ? "Active"
      : status === "expires_soon"
        ? "Expiring Soon"
        : "Expired";

  return {
    status,
    label,
    badgeClass:
      status === "valid"
        ? "bg-emerald-100 text-emerald-800"
        : status === "expires_soon"
          ? "bg-amber-100 text-amber-800"
          : "bg-red-100 text-red-800",
    days,
  };
}
