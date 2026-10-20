/**
 * Database fragment for `public.supplier_accounts`.
 * Column keys match the remote Supabase table created in the dashboard
 * (id, name, contact_person, email, phone, description, state, credit_limit, created_at).
 * Queries should go through `fromSupplierAccounts()` so PostgREST table-name
 * types stay in sync without a full `supabase gen types` dump.
 */

export const SUPPLIER_ACCOUNTS_SCHEMA_COLUMNS = [
  "id",
  "name",
  "contact_person",
  "email",
  "phone",
  "description",
  "state",
  "credit_limit",
  "created_at",
] as const;

export type SupplierAccountsRow = {
  id: string;
  name: string;
  contact_person: string | null;
  email: string | null;
  phone: string | null;
  description: string | null;
  state: string;
  credit_limit: number | string | null;
  created_at: string;
};

export type SupplierAccountsInsert = Omit<SupplierAccountsRow, "id" | "created_at"> & {
  id?: string;
  created_at?: string;
};

export type SupplierAccountsUpdate = Partial<SupplierAccountsInsert>;

export type SupplierAccountsDatabase = {
  public: {
    Tables: {
      supplier_accounts: {
        Row: SupplierAccountsRow;
        Insert: SupplierAccountsInsert;
        Update: SupplierAccountsUpdate;
        Relationships: [];
      };
    };
  };
};

/** Compile-time assertion that the dashboard table is part of the local schema. */
export const SUPPLIER_ACCOUNTS_TABLE_NAME: keyof SupplierAccountsDatabase["public"]["Tables"] =
  "supplier_accounts";
