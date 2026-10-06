export const ITC_PLAN_MIN_ZOOM = 0.5;
export const ITC_PLAN_MAX_ZOOM = 10;
export const ITC_PLAN_ZOOM_STEP = 0.2;

export function clampPlanZoom(value: number): number {
  if (!Number.isFinite(value)) return 1;
  return Math.min(ITC_PLAN_MAX_ZOOM, Math.max(ITC_PLAN_MIN_ZOOM, value));
}
