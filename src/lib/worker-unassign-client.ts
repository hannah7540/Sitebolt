export async function requestWorkerUnassignAll(
  workerId: string
): Promise<{ error: string | null; message?: string }> {
  const response = await fetch("/api/workers/unassign", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    return { error: payload?.error ?? "Failed to unassign worker from projects." };
  }

  return { error: null, message: payload?.message };
}

export function applyUnassignedWorkerFields<T extends {
  assigned_project_id?: string | null;
  assigned_project_ids?: string[];
  project_id?: string | null;
  assigned_project_name?: string | null;
  project_name?: string | null;
}>(worker: T): T {
  return {
    ...worker,
    assigned_project_id: null,
    assigned_project_ids: [],
    project_id: null,
    assigned_project_name: null,
    project_name: null,
  };
}
