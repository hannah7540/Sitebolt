/** Client-safe SWMS assignment notifications (no server email deps). */
import { notifyWorkerSwmsChanged } from "@/lib/worker-swms-auto-assign";

/**
 * Refresh worker dashboards / outstanding SWMS badges after assignments change.
 */
export function notifySwmsAssignmentsClientSide(workerIds: string[]): void {
  const unique = [...new Set(workerIds.map((id) => id.trim()).filter(Boolean))];
  for (const workerId of unique) {
    notifyWorkerSwmsChanged(workerId);
  }
  if (unique.length > 0) {
    notifyWorkerSwmsChanged(null);
  }
}
