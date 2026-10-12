export const HIRED_LABOUR_STATUSES = [
  "invited",
  "pending_approval",
  "approved",
  "rejected",
  "revoked",
] as const;

export type HiredLabourStatus = (typeof HIRED_LABOUR_STATUSES)[number];

export function normalizeHiredLabourStatus(
  value: string | null | undefined
): HiredLabourStatus | null {
  const normalized = String(value ?? "").trim().toLowerCase();
  return (HIRED_LABOUR_STATUSES as readonly string[]).includes(normalized)
    ? (normalized as HiredLabourStatus)
    : null;
}

/**
 * Explicit status wins. Rows created before the column existed stay usable
 * when onboarding was already completed.
 */
export function resolveHiredLabourAccessStatus(
  status: string | null | undefined,
  onboardingCompleted?: boolean | null
): HiredLabourStatus {
  return (
    normalizeHiredLabourStatus(status) ??
    (onboardingCompleted ? "approved" : "invited")
  );
}

export function hiredLabourCanAccessApp(status: HiredLabourStatus): boolean {
  return status === "approved";
}
