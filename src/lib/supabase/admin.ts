import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  isSupabaseAdminConfigured,
  readSupabaseUrl,
} from "./env";

let adminClient: SupabaseClient | null = null;

/** Service-role Supabase client — server/API routes only. */
export function createSupabaseAdminClient(): SupabaseClient {
  if (!isSupabaseAdminConfigured()) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local (server-only)."
    );
  }

  if (!adminClient) {
    adminClient = createClient(readSupabaseUrl(), getServiceRoleKey(), {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
      },
    });
  }

  return adminClient;
}
