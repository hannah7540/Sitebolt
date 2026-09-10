export async function requestWorkerSoftDelete(
  workerId: string
): Promise<{ error: string | null; message?: string }> {
  const response = await fetch("/api/workers/delete", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId }),
  });

  const payload = (await response.json().catch(() => null)) as
    | { error?: string; message?: string }
    | null;

  if (!response.ok) {
    return { error: payload?.error ?? "Failed to delete worker." };
  }

  return { error: null, message: payload?.message };
}
