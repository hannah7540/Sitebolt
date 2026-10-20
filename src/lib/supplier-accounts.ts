import {
  isSupabaseMissingColumnError,
  isSupabaseRelationMissingError,
  isSupabaseSchemaCacheError,
  toSupabaseRequestError,
} from "./supabase-errors";
import { isSupabaseConfigured, supabase } from "./supabase";
import {
  SUPPLIER_ACCOUNTS_SCHEMA_COLUMNS,
  SUPPLIER_ACCOUNTS_TABLE_NAME,
  type SupplierAccountsInsert,
} from "./supabase/supplier-accounts.database";
import { resolveActiveOrganisationId } from "./tenant-scope";

export const SUPPLIER_ACCOUNTS_TABLE = SUPPLIER_ACCOUNTS_TABLE_NAME;

/**
 * Prefer this over `client.from("supplier_accounts")` so TypeScript recognizes
 * the dashboard table without a full generated Database dump.
 */
export function fromSupplierAccounts(client: {
  from: (relation: string) => unknown;
}) {
  // eslint-disable-next-line @typescript-eslint/no-explicit-any
  return (client as { from: (relation: any) => any }).from(SUPPLIER_ACCOUNTS_TABLE);
}

export const SUPPLIER_ACCOUNT_STATES = ["WA", "NZ", "ACT", "NSW"] as const;

export type SupplierAccountState = (typeof SUPPLIER_ACCOUNT_STATES)[number];

export type SupplierAccountStateFilter = "all" | SupplierAccountState;

export interface SupplierAccount {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  state: SupplierAccountState;
  credit_limit: number | null;
  created_at: string | null;
}

export interface SupplierAccountInput {
  name: string;
  contact_person?: string | null;
  email?: string | null;
  phone?: string | null;
  description?: string | null;
  state: string;
  credit_limit?: number | string | null;
}

const SELECT_COLUMNS = SUPPLIER_ACCOUNTS_SCHEMA_COLUMNS.join(", ");

function formatSupplierAccountsError(error: { message: string; code?: string } | string): string {
  const requestError = toSupabaseRequestError(error);
  if (!requestError) return "Could not load supplier accounts.";
  if (isSupabaseMissingColumnError(requestError)) {
    return requestError.message;
  }
  if (isSupabaseRelationMissingError(requestError) || isSupabaseSchemaCacheError(requestError)) {
    return "Could not load supplier accounts.";
  }
  return requestError.message;
}

function asRecord(value: unknown): Record<string, unknown> | null {
  return value && typeof value === "object" ? (value as Record<string, unknown>) : null;
}

function optionalText(value: unknown): string | null {
  if (value == null) return null;
  const trimmed = String(value).trim();
  return trimmed || null;
}

function parseCreditLimit(value: unknown): number | null | "invalid" {
  if (value == null) return null;
  if (typeof value === "number") {
    if (!Number.isFinite(value)) return "invalid";
    return value;
  }
  const trimmed = String(value).trim();
  if (!trimmed) return null;
  const parsed = Number(trimmed);
  if (!Number.isFinite(parsed)) return "invalid";
  return parsed;
}

export function isSupplierAccountState(
  value: string | null | undefined
): value is SupplierAccountState {
  if (!value) return false;
  return (SUPPLIER_ACCOUNT_STATES as readonly string[]).includes(value);
}

export function filterSupplierAccountsByState(
  accounts: readonly SupplierAccount[],
  state: SupplierAccountStateFilter
): SupplierAccount[] {
  if (state === "all") return [...accounts];
  return accounts.filter((row) => row.state === state);
}

export function mapSupplierAccount(row: unknown): SupplierAccount | null {
  const record = asRecord(row);
  if (!record?.id) return null;
  const name = String(record.name ?? "").trim();
  const state = String(record.state ?? "").trim().toUpperCase();
  if (!name || !isSupplierAccountState(state)) return null;
  const creditLimit = parseCreditLimit(record.credit_limit);
  return {
    id: String(record.id),
    name,
    contact_person: optionalText(record.contact_person),
    email: optionalText(record.email),
    phone: optionalText(record.phone),
    description: optionalText(record.description),
    state,
    credit_limit: creditLimit === "invalid" ? null : creditLimit,
    created_at: typeof record.created_at === "string" ? record.created_at : null,
  };
}

export function validateSupplierAccountInput(
  input: SupplierAccountInput
): { error: string } | { payload: Record<string, unknown> } {
  const name = input.name.trim();
  if (!name) {
    return { error: "Name is required." };
  }

  const state = input.state.trim().toUpperCase();
  if (!isSupplierAccountState(state)) {
    return { error: "State is required." };
  }

  const creditLimit = parseCreditLimit(input.credit_limit);
  if (creditLimit === "invalid") {
    return { error: "Credit limit must be a number." };
  }
  if (creditLimit != null && creditLimit < 0) {
    return { error: "Credit limit cannot be negative." };
  }

  const email = optionalText(input.email);
  if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
    return { error: "Enter a valid email address." };
  }

  return {
    payload: {
      name,
      contact_person: optionalText(input.contact_person),
      email,
      phone: optionalText(input.phone),
      description: optionalText(input.description),
      state,
      credit_limit: creditLimit,
    } satisfies SupplierAccountsInsert,
  };
}

export async function fetchSupplierAccounts(): Promise<{
  accounts: SupplierAccount[];
  error: string | null;
}> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { accounts: [], error: null };
  }
  if (!isSupabaseConfigured()) {
    return { accounts: [], error: "Supabase is not configured." };
  }

  try {
    const { data, error } = await fromSupplierAccounts(supabase)
      .select(SELECT_COLUMNS)
      .order("name");

    if (error) {
      return { accounts: [], error: formatSupplierAccountsError(error) };
    }

    return {
      accounts: (data ?? [])
        .map(mapSupplierAccount)
        .filter((row: SupplierAccount | null): row is SupplierAccount => Boolean(row)),
      error: null,
    };
  } catch (error) {
    return {
      accounts: [],
      error: error instanceof Error ? error.message : "Failed to load supplier accounts.",
    };
  }
}

export async function createSupplierAccount(
  input: SupplierAccountInput
): Promise<{ account: SupplierAccount | null; error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { account: null, error: "Select an organisation before adding suppliers." };
  }

  const validated = validateSupplierAccountInput(input);
  if ("error" in validated) {
    return { account: null, error: validated.error };
  }

  try {
    const { data, error } = await fromSupplierAccounts(supabase)
      .insert(validated.payload)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      return { account: null, error: formatSupplierAccountsError(error) };
    }

    return { account: mapSupplierAccount(data), error: null };
  } catch (error) {
    return {
      account: null,
      error: error instanceof Error ? error.message : "Failed to create supplier account.",
    };
  }
}

export async function updateSupplierAccount(
  id: string,
  input: SupplierAccountInput
): Promise<{ account: SupplierAccount | null; error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { account: null, error: "Select an organisation before editing suppliers." };
  }

  const validated = validateSupplierAccountInput(input);
  if ("error" in validated) {
    return { account: null, error: validated.error };
  }

  try {
    const { data, error } = await fromSupplierAccounts(supabase)
      .update(validated.payload)
      .eq("id", id)
      .select(SELECT_COLUMNS)
      .maybeSingle();

    if (error) {
      return { account: null, error: formatSupplierAccountsError(error.message) };
    }

    return { account: mapSupplierAccount(data), error: data ? null : "Supplier not found." };
  } catch (error) {
    return {
      account: null,
      error: error instanceof Error ? error.message : "Failed to update supplier account.",
    };
  }
}

export async function deleteSupplierAccount(id: string): Promise<{ error: string | null }> {
  const orgId = resolveActiveOrganisationId();
  if (!orgId) {
    return { error: "Select an organisation before deleting suppliers." };
  }

  try {
    const { error } = await fromSupplierAccounts(supabase).delete().eq("id", id);
    if (error) return { error: formatSupplierAccountsError(error) };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete supplier account.",
    };
  }
}
