import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  isSupabaseAdminConfigured,
  readSupabaseUrl,
} from "./env";

let adminClient: SupabaseClient | null = null;

/** Service-role Supabase client — server/API routes only. Bypasses RLS. */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (server-only)."
    );
  }

  const serviceRoleKey = getServiceRoleKey();

  if (!adminClient) {
    adminClient = createClient(readSupabaseUrl(), serviceRoleKey, {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
      // Force service_role on every request so RLS cannot filter admin lookups
      // (e.g. swms_documents SELECT during assignment validation).
      global: {
        headers: {
          Authorization: `Bearer ${serviceRoleKey}`,
          apikey: serviceRoleKey,
        },
      },
    });
  }

  return adminClient;
}

/** Drop the cached admin client (tests / key rotation). */
export function resetSupabaseAdminClient(): void {
  adminClient = null;
}
