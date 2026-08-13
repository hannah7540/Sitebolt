import { supabase, isSupabaseConfigured, fetchWorkers, isWorkerRevoked, type Worker } from "./supabase";
import { getWorkerDisplayName } from "./worker-utils";

export async function fetchActiveWorkersForPlantAssignment(): Promise<Worker[]> {
  if (!isSupabaseConfigured()) return [];

  const workers = await fetchWorkers();
  return workers.filter((worker) => !isWorkerRevoked(worker));
}

export function resolvePlantWorkerOptionLabel(worker: Worker): string {
  const first = worker.first_name?.trim() ?? "";
  const last = worker.last_name?.trim() ?? "";
  const combined = `${first} ${last}`.trim();
  return combined || getWorkerDisplayName(worker);
}

export async function syncPlantWorkerAssignment(input: {
  plantId: string;
  previousWorkerId: string | null;
  nextWorkerId: string | null;
  nextWorkerName: string | null;
}): Promise<{ error: string | null }> {
  const nextId = input.nextWorkerId?.trim() || null;

  const { error } = await supabase
    .from("plant")
    .update({
      assigned_worker_id: nextId,
      assigned_worker_name: nextId ? input.nextWorkerName?.trim() || null : null,
      updated_at: new Date().toISOString(),
    })
    .eq("id", input.plantId);

  return { error: error?.message ?? null };
}
