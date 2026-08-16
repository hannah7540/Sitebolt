export async function requestWorkerRevokeAccess(
  workerId: string,
  revoked: boolean
): Promise<{ error: string | null; message?: string }> {
  const response = await fetch("/api/workers/revoke", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, revoked }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    return { error: payload?.error ?? "Failed to update worker access." };
  }

  return { error: null, message: payload?.message };
}
