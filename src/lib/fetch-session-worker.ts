import { browserAuthHeaders } from "@/lib/browser-auth-headers";

/** Service-role profile link used when the WebView client cannot read workers under RLS. */
export async function fetchSessionWorkerRecord(): Promise<Record<string, unknown> | null> {
  if (typeof window === "undefined") return null;

  try {
    const headers = await browserAuthHeaders();
    const response = await fetch("/api/workers/link-profile", {
      method: "POST",
      cache: "no-store",
      credentials: "same-origin",
      headers,
      body: "{}",
    });
    if (!response.ok) return null;
    const payload = (await response.json().catch(() => null)) as {
      worker?: unknown;
    } | null;
    if (!payload?.worker || typeof payload.worker !== "object") return null;
    return payload.worker as Record<string, unknown>;
  } catch (error) {
    console.warn("[worker-profile] session profile fetch failed", error);
    return null;
  }
}
