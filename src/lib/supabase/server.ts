import { createServerClient } from "@supabase/ssr";
import { cookies } from "next/headers";
import { supabaseAnonKey, supabaseUrl } from "./env";

/**
 * Cookie-bound Supabase client for Server Components / Route Handlers.
 * Reading `cookies()` from `next/headers` opts the request into dynamic rendering
 * so authenticated user identity is never served from a static cache.
 */
export async function createSupabaseServerClient() {
  const cookieStore = await cookies();

  return createServerClient(supabaseUrl, supabaseAnonKey, {
    db: { schema: "public" },
    cookies: {
      getAll() {
        return cookieStore.getAll();
      },
      setAll(cookiesToSet) {
        try {
          cookiesToSet.forEach(({ name, value, options }) => {
            cookieStore.set(name, value, options);
          });
        } catch {
          // Server Components cannot always write cookies; proxy.ts handles refresh.
        }
      },
    },
  });
}
