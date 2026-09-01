import { createClient, type SupabaseClient } from "@supabase/supabase-js";
import {
  getServiceRoleKey,
  isSupabaseAdminConfigured,
  readSupabaseUrl,
} from "./env";

let adminClient: SupabaseClient | null = null;

function readAdminCredentials(): { supabaseUrl: string; serviceRoleKey: string } {
  const supabaseUrl = readSupabaseUrl();
  const serviceRoleKey = getServiceRoleKey();

  if (!supabaseUrl || !serviceRoleKey) {
    console.error(
      "[Supabase Admin Init Error]: Missing SUPABASE_URL or SUPABASE_SERVICE_ROLE_KEY in environment variables."
    );
  }

  return { supabaseUrl, serviceRoleKey };
}

/** Service-role Supabase client — server/API routes only. Bypasses RLS. */
export function createSupabaseAdminClient(): SupabaseClient {
  const { supabaseUrl, serviceRoleKey } = readAdminCredentials();

  if (!isSupabaseAdminConfigured() || !supabaseUrl || !serviceRoleKey) {
    throw new Error(
      "SUPABASE_SERVICE_ROLE_KEY is not configured. Add it to .env.local or Vercel (server-only)."
    );
  }

  if (!adminClient) {
    adminClient = createClient(supabaseUrl, serviceRoleKey, {
      db: { schema: "public" },
      auth: {
        persistSession: false,
        autoRefreshToken: false,
        detectSessionInUrl: false,
      },
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

/** Lazy admin client for invite/recovery link generation. */
export const supabaseAdmin: SupabaseClient = new Proxy({} as SupabaseClient, {
  get(_target, property, receiver) {
    const client = createSupabaseAdminClient();
    const value = Reflect.get(client, property, receiver);
    return typeof value === "function" ? value.bind(client) : value;
  },
});

/** Drop the cached admin client (tests / key rotation). */
export function resetSupabaseAdminClient(): void {
  adminClient = null;
}
