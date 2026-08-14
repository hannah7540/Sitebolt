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
