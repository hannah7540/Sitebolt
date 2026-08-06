export const LEAVE_REQUESTS_UPDATED_EVENT = "sitebolt:leave-requests-updated";

export function broadcastLeaveRequestsUpdated(): void {
  if (typeof window === "undefined") return;
  window.dispatchEvent(new CustomEvent(LEAVE_REQUESTS_UPDATED_EVENT));
}

export function subscribeLeaveRequestsUpdated(callback: () => void): () => void {
  if (typeof window === "undefined") return () => undefined;

  const handler = () => callback();
  window.addEventListener(LEAVE_REQUESTS_UPDATED_EVENT, handler);
  return () => window.removeEventListener(LEAVE_REQUESTS_UPDATED_EVENT, handler);
}
