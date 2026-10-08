import {
  A_PLUS_ORGANISATION_ID,
  ACTIVE_ORG_COOKIE,
  DEMO_ORGANISATION_ID,
  getActiveOrganisationId,
} from "./active-organisation";

export { A_PLUS_ORGANISATION_ID, DEMO_ORGANISATION_ID } from "./active-organisation";

/** Matches no real tenant. Used only when activeOrgId is missing (fail closed). */
const UNRESOLVED_ORGANISATION_SCOPE = "ffffffff-ffff-4fff-8fff-ffffffffffff";

export function isAPlusOrganisationId(orgId: string | null | undefined): boolean {
  return Boolean(orgId) && orgId === A_PLUS_ORGANISATION_ID;
}

export function isDemoOrganisationId(orgId: string | null | undefined): boolean {
  return Boolean(orgId) && orgId === DEMO_ORGANISATION_ID;
}

/** Cookie/localStorage workspace only. Never defaults to A Plus. */
export function resolveActiveOrganisationId(): string | null {
  const value = getActiveOrganisationId()?.trim();
  return value || null;
}

export function resolveActiveOrganisationIdFromRequest(request: Request): string | null {
  const header = request.headers.get("cookie") ?? "";
  const parts = header.split(";");
  for (const part of parts) {
    const trimmed = part.trim();
    if (!trimmed.startsWith(`${ACTIVE_ORG_COOKIE}=`)) continue;
    const value = decodeURIComponent(trimmed.slice(ACTIVE_ORG_COOKIE.length + 1)).trim();
    if (value) return value;
  }
  return null;
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
 * PostgREST `or()` filter for tenant isolation.
 * Missing orgId matches nothing. A Plus also includes legacy NULL rows.
 * Demo and every other tenant match only their own organisation_id.
 */
export function organisationScopeOrFilter(
  orgId: string | null = resolveActiveOrganisationId()
): string {
  if (!orgId) {
    return `organisation_id.eq.${UNRESOLVED_ORGANISATION_SCOPE}`;
  }
  if (isAPlusOrganisationId(orgId)) {
    return `organisation_id.eq.${A_PLUS_ORGANISATION_ID},organisation_id.is.null`;
  }
  return `organisation_id.eq.${orgId}`;
}

/**
 * Scope a query to the active organisation.
 * Missing activeOrgId matches nothing (never A Plus).
 * A Plus keeps legacy NULL rows via OR, and never returns other tenants.
 */
export function withOrganisationScope<T>(
  query: T,
  orgId: string | null = resolveActiveOrganisationId()
): T {
  const scoped = query as T & {
    eq: (column: string, value: string) => T;
    or: (filters: string) => T;
  };
  if (!orgId) {
    return scoped.eq("organisation_id", UNRESOLVED_ORGANISATION_SCOPE);
  }
  if (isAPlusOrganisationId(orgId)) {
    return scoped.or(organisationScopeOrFilter(orgId));
  }
  return scoped.eq("organisation_id", orgId);
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

/**
 * Client-side isolation. Missing/NULL organisation_id is A Plus legacy only.
 * Demo and other tenants never match rows that omit the column.
 */
export function recordMatchesActiveOrganisation(
  row: unknown,
  orgId: string | null = resolveActiveOrganisationId()
): boolean {
  return recordBelongsToOrganisationStrict(row, orgId);
}

export function filterRowsByOrganisation<T>(
  rows: T[],
  orgId: string | null = resolveActiveOrganisationId()
): T[] {
  return filterRowsByOrganisationStrict(rows, orgId);
}

export function recordBelongsToOrganisationStrict(
  row: unknown,
  orgId: string | null = resolveActiveOrganisationId()
): boolean {
  if (!orgId) return false;
  const value = getRecordOrganisationId(row);
  if (value === undefined || value === null) {
    return isAPlusOrganisationId(orgId);
  }
  return value === orgId;
}

export function filterRowsByOrganisationStrict<T>(
  rows: T[],
  orgId: string | null = resolveActiveOrganisationId()
): T[] {
  if (!orgId) return [];
  return rows.filter((row) => recordBelongsToOrganisationStrict(row, orgId));
}

export function isDemoOrganisationScopeBlocked(
  errorMessage: string,
  orgId: string | null
): boolean {
  return Boolean(orgId) && isOrganisationColumnMissing(errorMessage) && isDemoOrganisationId(orgId);
}

/** Stamp organisation_id on writes. Never invents A Plus when the workspace is missing. */
export function stampOrganisationId<T extends Record<string, unknown>>(
  payload: T,
  orgId: string | null = resolveActiveOrganisationId()
): T {
  if (!orgId) return payload;
  return { ...payload, organisation_id: orgId };
}

/** Demo/other tenants must not drop organisation_id and insert globally. */
export function shouldStripOrganisationIdOnWrite(
  errorMessage: string,
  orgId: string | null
): boolean {
  return isOrganisationColumnMissing(errorMessage) && isAPlusOrganisationId(orgId);
}

export function tenantCacheKey(prefix: string, orgId: string | null | undefined): string {
  return `${prefix}:${orgId?.trim() || "unresolved"}`;
}
