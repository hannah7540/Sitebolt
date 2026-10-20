import { isSupabaseConfigured, supabase } from "./supabase";
import {
  resolveActiveOrganisationId,
  stampOrganisationId,
  withOrganisationScope,
} from "./tenant-scope";

export const SUPPLIER_ACCOUNTS_TABLE = "supplier_accounts";

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
  organisation_id?: string | null;
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

const SELECT_COLUMNS =
  "id, name, contact_person, email, phone, description, state, credit_limit, created_at, organisation_id";

function isMissingRelationError(message: string): boolean {
  const lower = message.toLowerCase();
  return (
    lower.includes(SUPPLIER_ACCOUNTS_TABLE) &&
    (lower.includes("does not exist") ||
      lower.includes("schema cache") ||
      lower.includes("could not find"))
  );
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
    organisation_id:
      record.organisation_id == null ? null : String(record.organisation_id),
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
    },
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
    let query = supabase.from(SUPPLIER_ACCOUNTS_TABLE).select(SELECT_COLUMNS);
    query = withOrganisationScope(query, orgId);
    const { data, error } = await query.order("name");

    if (error) {
      if (isMissingRelationError(error.message)) {
        return {
          accounts: [],
          error: "Supplier accounts table is not available. Apply migration 192.",
        };
      }
      return { accounts: [], error: error.message };
    }

    return {
      accounts: (data ?? [])
        .map(mapSupplierAccount)
        .filter((row): row is SupplierAccount => Boolean(row)),
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

  const payload = stampOrganisationId(validated.payload, orgId);

  try {
    const { data, error } = await supabase
      .from(SUPPLIER_ACCOUNTS_TABLE)
      .insert(payload)
      .select(SELECT_COLUMNS)
      .single();

    if (error) {
      if (isMissingRelationError(error.message)) {
        return {
          account: null,
          error: "Supplier accounts table is not available. Apply migration 192.",
        };
      }
      return { account: null, error: error.message };
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
    let query = supabase
      .from(SUPPLIER_ACCOUNTS_TABLE)
      .update(validated.payload)
      .eq("id", id);
    query = withOrganisationScope(query, orgId);
    const { data, error } = await query.select(SELECT_COLUMNS).maybeSingle();

    if (error) {
      return { account: null, error: error.message };
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
    let query = supabase.from(SUPPLIER_ACCOUNTS_TABLE).delete().eq("id", id);
    query = withOrganisationScope(query, orgId);
    const { error } = await query;
    if (error) return { error: error.message };
    return { error: null };
  } catch (error) {
    return {
      error: error instanceof Error ? error.message : "Failed to delete supplier account.",
    };
  }
}
