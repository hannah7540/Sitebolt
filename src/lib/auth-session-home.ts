import { SUBCONTRACTOR_PORTAL_HOME_PATH } from "@/lib/user-session";

export type SessionHomePayload = {
  homePath: string;
  workerId: string | null;
  subcontractorId: string | null;
  role: string | null;
};

export async function fetchSessionHome(): Promise<SessionHomePayload | null> {
  try {
    const response = await fetch("/api/auth/session-home", {
      credentials: "include",
      cache: "no-store",
    });
    if (!response.ok) return null;
    const payload = (await response.json()) as Partial<SessionHomePayload>;
    const homePath = String(payload.homePath ?? "").trim();
    if (!homePath.startsWith("/") || homePath.startsWith("//")) return null;
    return {
      homePath,
      workerId: payload.workerId?.trim() || null,
      subcontractorId: payload.subcontractorId?.trim() || null,
      role: payload.role?.trim() || null,
    };
  } catch (cause) {
    console.warn("[auth] session-home lookup failed:", cause);
    return null;
  }
}

export function isSubcontractorHomePath(path: string | null | undefined): boolean {
  const pathname = String(path ?? "").split("?")[0];
  return (
    pathname === SUBCONTRACTOR_PORTAL_HOME_PATH ||
    pathname.startsWith(`${SUBCONTRACTOR_PORTAL_HOME_PATH}/`)
  );
}
