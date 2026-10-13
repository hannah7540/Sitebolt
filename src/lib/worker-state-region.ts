export const WORKER_STATE_REGION_OPTIONS = [
  "ACT",
  "NSW",
  "WA",
  "NZ",
] as const;

export type WorkerStateRegion = (typeof WORKER_STATE_REGION_OPTIONS)[number];

export function isWorkerStateRegion(
  value: string | null | undefined
): value is WorkerStateRegion {
  if (!value) return false;
  return (WORKER_STATE_REGION_OPTIONS as readonly string[]).includes(value);
}

export function normalizeWorkerStateRegion(
  value: string | null | undefined
): WorkerStateRegion | null {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return null;
  return isWorkerStateRegion(trimmed) ? trimmed : null;
}

const CALENDAR_STATE_CODES = [
  "ACT",
  "NSW",
  "QLD",
  "VIC",
  "SA",
  "TAS",
  "NT",
  "WA",
  "NZ",
] as const;

const CALENDAR_STATE_ALIASES: Record<string, string> = {
  "AUSTRALIAN CAPITAL TERRITORY": "ACT",
  "NEW SOUTH WALES": "NSW",
  QUEENSLAND: "QLD",
  VICTORIA: "VIC",
  "SOUTH AUSTRALIA": "SA",
  TASMANIA: "TAS",
  "NORTHERN TERRITORY": "NT",
  "WESTERN AUSTRALIA": "WA",
  "NEW ZEALAND": "NZ",
};

/** Canonical AU/NZ state code for calendar matching (not limited to pay-rule regions). */
export function normalizeCalendarStateCode(
  value: string | null | undefined
): string | null {
  const trimmed = value?.trim().toUpperCase();
  if (!trimmed) return null;
  if ((CALENDAR_STATE_CODES as readonly string[]).includes(trimmed)) {
    return trimmed;
  }
  if (CALENDAR_STATE_ALIASES[trimmed]) {
    return CALENDAR_STATE_ALIASES[trimmed];
  }
  for (const code of CALENDAR_STATE_CODES) {
    if (new RegExp(`\\b${code}\\b`).test(trimmed)) return code;
  }
  for (const [name, code] of Object.entries(CALENDAR_STATE_ALIASES)) {
    if (trimmed.includes(name)) return code;
  }
  return trimmed;
}
