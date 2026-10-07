import {
  clearActiveOrganisationId,
  setActiveOrganisationId,
} from "@/lib/active-organisation";

const SET_ACTIVE_COMPANY_PATH = "/api/set-active-company";
const AFTER_SWITCH_PATH = "/projects";

export async function activateOrganisationWorkspace(organisationId: string): Promise<void> {
  const trimmed = organisationId.trim();
  if (!trimmed) return;

  setActiveOrganisationId(trimmed);

  try {
    await fetch(SET_ACTIVE_COMPANY_PATH, {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ organisation_id: trimmed }),
      credentials: "same-origin",
    });
  } catch {
    // Client cookie/localStorage still carry the workspace for the hard reload.
  }

  if (typeof window !== "undefined") {
    window.location.assign(AFTER_SWITCH_PATH);
  }
}

export async function clearOrganisationWorkspace(): Promise<void> {
  clearActiveOrganisationId();
  try {
    await fetch(SET_ACTIVE_COMPANY_PATH, {
      method: "DELETE",
      credentials: "same-origin",
    });
  } catch {
    // Client cookie/localStorage already cleared.
  }
}
