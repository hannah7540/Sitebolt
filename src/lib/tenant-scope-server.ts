import { cookies } from "next/headers";
import { ACTIVE_ORG_COOKIE, A_PLUS_ORGANISATION_ID } from "./active-organisation";

export async function resolveActiveOrganisationIdFromCookies(): Promise<string> {
  try {
    const store = await cookies();
    const value = store.get(ACTIVE_ORG_COOKIE)?.value?.trim();
    if (value) return value;
  } catch {
    // Not in a request context (build, scripts).
  }
  return A_PLUS_ORGANISATION_ID;
}
