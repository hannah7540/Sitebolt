export const WORKER_STATE_REGION_OPTIONS = ["NSW", "ACT", "WA", "NZ"] as const;

export type WorkerStateRegion = (typeof WORKER_STATE_REGION_OPTIONS)[number];

export function isWorkerStateRegion(value: string | null | undefined): value is WorkerStateRegion {
  if (!value) return false;
  return (WORKER_STATE_REGION_OPTIONS as readonly string[]).includes(value);
}

export function normalizeWorkerStateRegion(
  value: string | null | undefined
): WorkerStateRegion | null {
  const trimmed = value?.trim();
  if (!trimmed) return null;
  return isWorkerStateRegion(trimmed) ? trimmed : null;
}
