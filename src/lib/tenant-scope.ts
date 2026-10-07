import {
  A_PLUS_ORGANISATION_ID,
  ACTIVE_ORG_COOKIE,
  DEMO_ORGANISATION_ID,
  getActiveOrganisationId,
} from "./active-organisation";

export { A_PLUS_ORGANISATION_ID, DEMO_ORGANISATION_ID } from "./active-organisation";

export function isAPlusOrganisationId(orgId: string): boolean {
  return orgId === A_PLUS_ORGANISATION_ID;
}

export function isDemoOrganisationId(orgId: string): boolean {
  return orgId === DEMO_ORGANISATION_ID;
}

/** Active workspace for queries. Cookie/localStorage, else A Plus (legacy default). */
export function resolveActiveOrganisationId(): string {
  return getActiveOrganisationId() || A_PLUS_ORGANISATION_ID;
}

export function resolveActiveOrganisationIdFromRequest(request: Request): string {
  const header = request.headers.get("cookie") ?? "";
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${ACTIVE_ORG_COOKIE}=`)) continue;
    const value = decodeURIComponent(trimmed.slice(ACTIVE_ORG_COOKIE.length + 1)).trim();
    if (value) return value;
  }
  return A_PLUS_ORGANISATION_ID;
}

export function isOrganisationColumnMissing(message: string): boolean {
  const lower = (message || "").toLowerCase();
  if (!lower.includes("organisation_id") && !lower.includes("organization_id")) {
    return false;
  }
  return (
    lower.includes("does not exist") ||
    lower.includes("schema cache") ||
    lower.includes("could not find") ||
    lower.includes("column")
  );
}

/**
 * Strict query filter for Demo and future tenants.
 * A Plus stays unscoped at the query layer so legacy NULL org rows remain visible;
 * client-side {@link filterRowsByOrganisation} then drops other tenants.
 */
export function withOrganisationScope<
  T extends {
    eq: (column: string, value: string) => T;
  },
>(query: T, orgId: string = resolveActiveOrganisationId()): T {
  if (isAPlusOrganisationId(orgId)) {
    return query;
  }
  return query.eq("organisation_id", orgId);
}

export function getRecordOrganisationId(row: unknown): string | null | undefined {
  if (!row || typeof row !== "object") return undefined;
  const rec = row as Record<string, unknown>;
  if ("organisation_id" in rec) {
    const value = rec.organisation_id;
    if (value == null || value === "") return null;
    return String(value);
  }
  if ("organization_id" in rec) {
    const value = rec.organization_id;
    if (value == null || value === "") return null;
    return String(value);
  }
  return undefined;
}

export function recordMatchesActiveOrganisation(
  row: unknown,
  orgId: string = resolveActiveOrganisationId()
): boolean {
  const value = getRecordOrganisationId(row);
  if (value === undefined) {
    return true;
  }
  if (value === null) {
    return isAPlusOrganisationId(orgId);
  }
  return value === orgId;
}

export function filterRowsByOrganisation<T>(
  rows: T[],
  orgId: string = resolveActiveOrganisationId()
): T[] {
  return rows.filter((row) => recordMatchesActiveOrganisation(row, orgId));
}

/** Use when the query was unscoped (admin `select("*")`). Untagged rows stay on A Plus only. */
export function recordBelongsToOrganisationStrict(
  row: unknown,
  orgId: string = resolveActiveOrganisationId()
): boolean {
  const value = getRecordOrganisationId(row);
  if (value === undefined || value === null) {
    return isAPlusOrganisationId(orgId);
  }
  return value === orgId;
}

export function filterRowsByOrganisationStrict<T>(
  rows: T[],
  orgId: string = resolveActiveOrganisationId()
): T[] {
  return rows.filter((row) => recordBelongsToOrganisationStrict(row, orgId));
}

/** Demo must never fall back to an unscoped query. */
export function isDemoOrganisationScopeBlocked(errorMessage: string, orgId: string): boolean {
  return isOrganisationColumnMissing(errorMessage) && isDemoOrganisationId(orgId);
}
