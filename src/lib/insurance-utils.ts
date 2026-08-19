import { daysUntil, getTicketStatus } from "./worker-utils";
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
}

export function formatInsuranceFileSize(bytes: number): string {
  if (bytes < 1024) return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export function getInsuranceExpiryStatus(expiryDate: string | null | undefined) {
  const status = getTicketStatus(expiryDate);
  const label =
    status === "valid"
      ? "Active"
      : status === "expires_soon"
        ? "Expiring Soon"
        : status === "expired"
          ? "Expired"
          : "No Expiry Set";

  return {
    status,
    label,
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
