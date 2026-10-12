import type { SupabaseClient } from "@supabase/supabase-js";
import {
  A_PLUS_ORGANISATION_ID,
  getActiveOrganisationId,
} from "@/lib/active-organisation";

export type WorkerAuthLookupRow = {
  id: string;
  email?: string | null;
  security_role?: string | null;
  organisation_id?: string | null;
  auth_user_id?: string | null;
  user_id?: string | null;
  deleted_at?: string | null;
  status?: string | null;
};

export type WorkerAuthMatch = {
  workerId: string;
  securityRole: string | null;
  organisationId: string | null;
  authUserId: string | null;
  needsAuthLink: boolean;
};

const WORKER_AUTH_SELECT =
  "id, email, security_role, organisation_id, auth_user_id, user_id, deleted_at, status";
const WORKER_AUTH_SELECT_NO_USER_ID =
  "id, email, security_role, organisation_id, auth_user_id, deleted_at, status";
const WORKER_AUTH_SELECT_MINIMAL =
  "id, email, security_role, organisation_id, auth_user_id";

function isMissingColumnError(message: string, column: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(column) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
}

function isActiveWorkerRow(row: WorkerAuthLookupRow): boolean {
  const status = String(row.status ?? "").trim().toLowerCase();
  return !row.deleted_at && status !== "deleted" && status !== "revoked";
}

function logWorkerLookupFailure(reason: string, details: Record<string, unknown>) {
  console.warn("[worker-auth-lookup]", reason, details);
}

export function emailsMatchExactly(
  left: string | null | undefined,
  right: string | null | undefined
): boolean {
  const a = left?.trim().toLowerCase() ?? "";
  const b = right?.trim().toLowerCase() ?? "";
  return Boolean(a) && a === b;
}

export function pickWorkerAuthRow(
  rows: WorkerAuthLookupRow[],
  options: {
    userId: string;
    email?: string | null;
    activeOrgId?: string | null;
  }
): WorkerAuthLookupRow | null {
  if (rows.length === 0) return null;

  const active = rows.filter(isActiveWorkerRow);
  const pool = active.length > 0 ? active : rows;

  const linked = pool.find(
    (row) => row.auth_user_id === options.userId || row.user_id === options.userId
  );
  if (linked) return linked;

  const email = options.email?.trim().toLowerCase() ?? "";
  const emailMatches = (email
    ? pool.filter((row) => String(row.email ?? "").trim().toLowerCase() === email)
    : pool
  ).filter(
    (row) =>
      !row.auth_user_id ||
      row.auth_user_id === options.userId ||
      row.user_id === options.userId
  );

  if (emailMatches.length === 0) {
    logWorkerLookupFailure("no worker row matched auth user id or email", {
      userId: options.userId,
      email: options.email ?? null,
      candidateCount: rows.length,
      candidateOrgs: rows.map((row) => row.organisation_id ?? null),
    });
    return null;
  }

  if (options.activeOrgId) {
    const inOrg = emailMatches.filter((row) => row.organisation_id === options.activeOrgId);
    if (inOrg.length === 1) return inOrg[0];
    if (inOrg.length > 1) {
      logWorkerLookupFailure("multiple workers match email in the active organisation", {
        userId: options.userId,
        email: options.email ?? null,
        activeOrgId: options.activeOrgId,
        workerIds: inOrg.map((row) => row.id),
      });
      return inOrg[0];
    }

    logWorkerLookupFailure("email matched but organisation_id differed from the active workspace", {
      userId: options.userId,
      email: options.email ?? null,
      activeOrgId: options.activeOrgId,
      matchedOrgs: emailMatches.map((row) => row.organisation_id ?? null),
      matchedWorkerIds: emailMatches.map((row) => row.id),
    });
  }

  const aPlusMatches = emailMatches.filter(
    (row) => row.organisation_id === A_PLUS_ORGANISATION_ID
  );
  if (aPlusMatches.length === 1) return aPlusMatches[0];
  if (aPlusMatches.length > 1) {
    logWorkerLookupFailure("multiple A Plus workers match the authenticated email", {
      userId: options.userId,
      email: options.email ?? null,
      workerIds: aPlusMatches.map((row) => row.id),
    });
    return aPlusMatches[0];
  }

  if (emailMatches.length > 1) {
    logWorkerLookupFailure("multiple workers match email and no A Plus or active-org row won", {
      userId: options.userId,
      email: options.email ?? null,
      matchedOrgs: emailMatches.map((row) => row.organisation_id ?? null),
      matchedWorkerIds: emailMatches.map((row) => row.id),
    });
  }

  return emailMatches[0] ?? null;
}

function escapeIlikeLiteral(value: string): string {
  return value.replace(/[\\%_]/g, (character) => `\\${character}`);
}

function escapePosixRegex(value: string): string {
  return value.replace(/[\\.^$|?*+()[\]{}]/g, "\\$&");
}

type WorkerFilterQuery = {
  limit: (count: number) => PromiseLike<{
    data: unknown;
    error: { message: string } | null;
  }>;
};

async function selectWorkerRowsWithFilter(
  supabase: SupabaseClient,
  apply: (select: string) => WorkerFilterQuery
): Promise<{ rows: WorkerAuthLookupRow[]; error: string | null }> {
  let select = WORKER_AUTH_SELECT;
  let { data, error } = await apply(select).limit(20);
  if (error && isMissingColumnError(error.message, "user_id")) {
    select = WORKER_AUTH_SELECT_NO_USER_ID;
    ({ data, error } = await apply(select).limit(20));
  }
  if (
    error &&
    (isMissingColumnError(error.message, "deleted_at") ||
      isMissingColumnError(error.message, "status"))
  ) {
    select = WORKER_AUTH_SELECT_MINIMAL;
    ({ data, error } = await apply(select).limit(20));
  }
  if (error) {
    return { rows: [], error: error.message };
  }
  return { rows: (data ?? []) as unknown as WorkerAuthLookupRow[], error: null };
}

/**
 * Match public.workers.email with LOWER(TRIM(email)) = the normalized session email.
 * Exact ilike misses rows that still have surrounding whitespace.
 */
async function selectWorkersByNormalizedEmail(
  supabase: SupabaseClient,
  email: string
): Promise<WorkerAuthLookupRow[]> {
  const normalized = email.trim().toLowerCase();
  if (!normalized) return [];

  const exact = await selectWorkerRowsWithFilter(supabase, (select) =>
    supabase.from("workers").select(select).ilike("email", escapeIlikeLiteral(normalized))
  );
  if (exact.error) {
    logWorkerLookupFailure("worker lookup query failed", {
      column: "email",
      message: exact.error,
    });
  }
  const exactMatches = exact.rows.filter((row) => emailsMatchExactly(row.email, normalized));
  if (exactMatches.length > 0) return exactMatches;

  const pattern = `^[[:space:]]*${escapePosixRegex(normalized)}[[:space:]]*$`;
  const trimmed = await selectWorkerRowsWithFilter(supabase, (select) =>
    supabase.from("workers").select(select).filter("email", "imatch", pattern)
  );
  if (trimmed.error) {
    logWorkerLookupFailure("LOWER(TRIM(email)) worker lookup failed", {
      column: "email",
      message: trimmed.error,
    });
    return [];
  }

  return trimmed.rows.filter((row) => emailsMatchExactly(row.email, normalized));
}

async function selectWorkerRows(
  supabase: SupabaseClient,
  column: "auth_user_id" | "user_id" | "email",
  value: string
): Promise<WorkerAuthLookupRow[]> {
  if (column === "email") {
    return selectWorkersByNormalizedEmail(supabase, value);
  }

  const filtered = await selectWorkerRowsWithFilter(supabase, (select) =>
    supabase.from("workers").select(select).eq(column, value)
  );
  if (filtered.error && column === "user_id" && isMissingColumnError(filtered.error, "user_id")) {
    return [];
  }
  if (filtered.error) {
    logWorkerLookupFailure("worker lookup query failed", {
      column,
      message: filtered.error,
    });
    return [];
  }

  return filtered.rows;
}

export async function matchWorkerForAuthUser(
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
  options?: { activeOrgId?: string | null; skipEmailLookup?: boolean }
): Promise<WorkerAuthMatch | null> {
  const email = user.email?.trim() || "";
  const activeOrgId = options?.activeOrgId ?? (typeof window === "undefined" ? null : getActiveOrganisationId());

  const byAuthUserId = await selectWorkerRows(supabase, "auth_user_id", user.id);
  let row = pickWorkerAuthRow(byAuthUserId, { userId: user.id, email, activeOrgId });

  if (!row) {
    const byUserId = await selectWorkerRows(supabase, "user_id", user.id);
    row = pickWorkerAuthRow(byUserId, { userId: user.id, email, activeOrgId });
  }

  if (!row && email && !options?.skipEmailLookup) {
    const byEmail = await selectWorkerRows(supabase, "email", email);
    row = pickWorkerAuthRow(byEmail, { userId: user.id, email, activeOrgId });
    if (!row && byEmail.length === 0) {
      logWorkerLookupFailure("no public.workers row found for authenticated user", {
        userId: user.id,
        email,
        activeOrgId,
      });
    }
  }

  if (!row) return null;

  return {
    workerId: row.id,
    securityRole: row.security_role ?? null,
    organisationId: row.organisation_id ?? null,
    authUserId: row.auth_user_id ?? row.user_id ?? null,
    needsAuthLink: !row.auth_user_id || row.auth_user_id !== user.id,
  };
}
