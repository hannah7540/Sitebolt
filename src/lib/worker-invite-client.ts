export interface WorkerAuthInviteResponse {
  success?: boolean;
  authUserId?: string | null;
  inviteSent?: boolean;
  inviteSentAt?: string | null;
  message?: string;
  error?: string;
}

export async function requestWorkerAuthInvite(
  email: string,
  workerId?: string
): Promise<WorkerAuthInviteResponse> {
  const response = await fetch("/api/workers/invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ email, workerId }),
  });

  const data = (await response.json()) as WorkerAuthInviteResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to send worker invite.");
  }

  return data;
}

export async function requestWorkerInviteResend(
  workerId: string,
  email?: string
): Promise<WorkerAuthInviteResponse> {
  const response = await fetch("/api/workers/resend-invite", {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: JSON.stringify({ workerId, email }),
  });

  const data = (await response.json()) as WorkerAuthInviteResponse;

  if (!response.ok) {
    throw new Error(data.error ?? "Failed to resend worker invite.");
  }

  return data;
}
