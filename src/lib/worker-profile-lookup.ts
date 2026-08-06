import { isSupabaseConfigured, supabase } from "./supabase";

export type WorkerProfileRow = {
  id: string;
  full_name?: string | null;
  first_name?: string | null;
  last_name?: string | null;
  worker_name?: string | null;
  name?: string | null;
};

const WORKER_PROFILE_SELECT_VARIANTS = [
  "id, full_name, first_name, last_name, worker_name",
  "id, full_name, first_name, last_name",
  "id, first_name, last_name",
  "id, full_name",
  "id",
] as const;

function isMissingColumnError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes("column") &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

/** Resolve a display name from whichever worker profile name columns exist. */
export function resolveWorkerProfileDisplayName(
  profile: WorkerProfileRow,
  fallback = "Unknown Worker"
): string {
  return (
    profile.full_name?.trim() ||
    profile.worker_name?.trim() ||
    `${profile.first_name || ""} ${profile.last_name || ""}`.trim() ||
    profile.name?.trim() ||
    fallback
  );
}

async function queryWorkerProfiles(
  workerIds?: string[]
): Promise<WorkerProfileRow[]> {
  for (const select of WORKER_PROFILE_SELECT_VARIANTS) {
    let query = supabase.from("workers").select(select);
    if (workerIds?.length) {
      query = query.in("id", workerIds);
    }

    const { data, error } = await query;
    if (!error) {
      return (data ?? []) as unknown as WorkerProfileRow[];
    }

    if (!isMissingColumnError(error.message)) {
      console.warn("Failed to fetch worker profiles:", error.message);
      return [];
    }
  }

  return [];
}

/** In-memory worker id → display name map for reporting and lightweight lookups. */
export async function fetchWorkerProfileNameMap(
  workerIds?: string[]
): Promise<Map<string, string>> {
  if (!isSupabaseConfigured()) return new Map();

  const profiles = await queryWorkerProfiles(workerIds);
  return new Map(
    profiles.map((profile) => [
      profile.id,
      resolveWorkerProfileDisplayName(profile),
    ])
  );
}

export async function fetchWorkerProfileDisplayName(
  workerId: string,
  fallback = "Unknown Worker"
): Promise<string> {
  const profileMap = await fetchWorkerProfileNameMap([workerId]);
  return profileMap.get(workerId) ?? fallback;
}

export function enrichItemsWithWorkerNames<
  T extends { worker_id: string; worker_name?: string | null },
>(items: T[], profileMap: Map<string, string>, fallback = "Unknown Worker"): T[] {
  return items.map((item) => ({
    ...item,
    worker_name:
      item.worker_name?.trim() ||
      profileMap.get(item.worker_id) ||
      fallback,
  }));
}
